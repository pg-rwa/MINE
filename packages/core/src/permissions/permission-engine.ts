import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import {
  Permission,
  PermissionRequest,
  PermissionCheck,
  PermissionLevel,
} from './permission-types';
import { DataCategory } from '../types';

interface PermissionEvents {
  'permission:granted': (permission: Permission) => void;
  'permission:revoked': (permissionId: string, agentId: string) => void;
  'permission:expired': (permissionId: string, agentId: string) => void;
  'permission:requested': (request: PermissionRequest) => void;
}

const LEVEL_HIERARCHY: PermissionLevel[] = [
  'observe',
  'suggest',
  'act_with_approval',
  'act_autonomously',
];

export class PermissionEngine extends EventEmitter<PermissionEvents> {
  private permissions: Map<string, Permission> = new Map(); // keyed by permission.id
  private expiryTimers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Check if an agent has a specific permission.
   */
  check(
    userId: string,
    agentId: string,
    resource: DataCategory,
    action: 'read' | 'write' | 'delete' | 'execute',
    requiredLevel: PermissionLevel = 'observe'
  ): PermissionCheck {
    const permission = this.findActivePermission(userId, agentId, resource);

    if (!permission) {
      return { granted: false, reason: `No permission for ${agentId} to access ${resource}` };
    }

    if (!permission.actions.includes(action)) {
      return { granted: false, reason: `Permission does not include '${action}' action` };
    }

    const hasLevel = LEVEL_HIERARCHY.indexOf(permission.level) >= LEVEL_HIERARCHY.indexOf(requiredLevel);
    if (!hasLevel) {
      return {
        granted: false,
        reason: `Permission level '${permission.level}' is below required '${requiredLevel}'`,
      };
    }

    return { granted: true, permission };
  }

  /**
   * Grant a permission. Returns the created Permission.
   */
  grant(userId: string, request: PermissionRequest): Permission {
    const now = new Date();
    const expiresAt = this.calcExpiry(request.duration ?? '30d', now);

    const permission: Permission = {
      id: uuid(),
      userId,
      agentId: request.agentId,
      resource: request.resource,
      level: request.level,
      actions: request.actions,
      scope: request.scope ?? {},
      grantedAt: now,
      expiresAt: expiresAt ?? undefined,
      autoRenew: false,
    };

    // Revoke any existing permission for same agent+resource
    this.revokeForResource(userId, request.agentId, request.resource);

    this.permissions.set(permission.id, permission);
    this.scheduleExpiry(permission);
    this.emit('permission:granted', permission);

    return permission;
  }

  /**
   * Revoke a specific permission.
   */
  revoke(permissionId: string): boolean {
    const perm = this.permissions.get(permissionId);
    if (!perm || perm.revokedAt) return false;

    perm.revokedAt = new Date();
    this.clearExpiryTimer(permissionId);
    this.emit('permission:revoked', permissionId, perm.agentId);
    return true;
  }

  /**
   * Revoke all permissions for an agent.
   */
  revokeAll(userId: string, agentId: string): number {
    let count = 0;
    for (const [id, perm] of this.permissions) {
      if (perm.userId === userId && perm.agentId === agentId && !perm.revokedAt) {
        this.revoke(id);
        count++;
      }
    }
    return count;
  }

  /**
   * List all active permissions for a user, optionally filtered by agent.
   */
  list(userId: string, agentId?: string): Permission[] {
    const now = new Date();
    return Array.from(this.permissions.values()).filter(
      (p) =>
        p.userId === userId &&
        (!agentId || p.agentId === agentId) &&
        !p.revokedAt &&
        (!p.expiresAt || p.expiresAt > now)
    );
  }

  /**
   * Request a permission (emits event for UI to handle).
   */
  request(req: PermissionRequest): void {
    this.emit('permission:requested', req);
  }

  // ─── Private ────────────────────────────────────────

  private findActivePermission(
    userId: string,
    agentId: string,
    resource: DataCategory
  ): Permission | undefined {
    const now = new Date();
    return Array.from(this.permissions.values()).find(
      (p) =>
        p.userId === userId &&
        p.agentId === agentId &&
        p.resource === resource &&
        !p.revokedAt &&
        (!p.expiresAt || p.expiresAt > now)
    );
  }

  private revokeForResource(userId: string, agentId: string, resource: DataCategory): void {
    for (const [id, perm] of this.permissions) {
      if (perm.userId === userId && perm.agentId === agentId && perm.resource === resource && !perm.revokedAt) {
        this.revoke(id);
      }
    }
  }

  private calcExpiry(duration: string, from: Date): Date | null {
    const ms = {
      session: 0,
      '24h': 86400000,
      '7d': 604800000,
      '30d': 2592000000,
      '90d': 7776000000,
      '1y': 31536000000,
      permanent: 0,
    }[duration];

    if (ms === undefined || ms === 0) return null;
    return new Date(from.getTime() + ms);
  }

  private scheduleExpiry(permission: Permission): void {
    if (!permission.expiresAt) return;

    const delay = permission.expiresAt.getTime() - Date.now();
    if (delay <= 0) return;

    const timer = setTimeout(() => {
      if (permission.autoRenew) {
        permission.expiresAt = this.calcExpiry('30d', new Date()) ?? undefined;
        this.scheduleExpiry(permission);
      } else {
        this.emit('permission:expired', permission.id, permission.agentId);
      }
    }, delay);

    this.expiryTimers.set(permission.id, timer);
  }

  private clearExpiryTimer(permissionId: string): void {
    const timer = this.expiryTimers.get(permissionId);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(permissionId);
    }
  }
}

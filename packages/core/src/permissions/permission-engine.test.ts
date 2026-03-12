import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionEngine } from './permission-engine';
import { PermissionRequest } from './permission-types';

describe('PermissionEngine', () => {
  let engine: PermissionEngine;
  const userId = '00000000-0000-0000-0000-000000000001';
  const agentId = 'finance-agent';

  beforeEach(() => {
    engine = new PermissionEngine();
  });

  function grantBasic(overrides: Partial<PermissionRequest> = {}) {
    return engine.grant(userId, {
      agentId,
      resource: 'transactions',
      level: 'observe',
      actions: ['read'],
      reason: 'test',
      ...overrides,
    });
  }

  describe('grant', () => {
    it('creates a permission and emits event', () => {
      const listener = vi.fn();
      engine.on('permission:granted', listener);

      const perm = grantBasic();

      expect(perm.id).toBeDefined();
      expect(perm.userId).toBe(userId);
      expect(perm.agentId).toBe(agentId);
      expect(perm.resource).toBe('transactions');
      expect(perm.level).toBe('observe');
      expect(perm.actions).toEqual(['read']);
      expect(listener).toHaveBeenCalledWith(perm);
    });

    it('replaces existing permission for same agent+resource', () => {
      const first = grantBasic();
      const second = grantBasic({ level: 'suggest' });

      expect(second.id).not.toBe(first.id);
      // First should be revoked
      const active = engine.list(userId, agentId);
      expect(active).toHaveLength(1);
      expect(active[0].level).toBe('suggest');
    });

    it('sets expiry based on duration', () => {
      const perm = grantBasic({ duration: '24h' });
      expect(perm.expiresAt).toBeDefined();
      const diff = perm.expiresAt!.getTime() - perm.grantedAt.getTime();
      expect(diff).toBe(86400000);
    });

    it('does not set expiry for permanent duration', () => {
      const perm = grantBasic({ duration: 'permanent' });
      expect(perm.expiresAt).toBeUndefined();
    });
  });

  describe('check', () => {
    it('grants access when permission exists', () => {
      grantBasic();
      const result = engine.check(userId, agentId, 'transactions', 'read');
      expect(result.granted).toBe(true);
      expect(result.permission).toBeDefined();
    });

    it('denies when no permission exists', () => {
      const result = engine.check(userId, agentId, 'transactions', 'read');
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('No permission');
    });

    it('denies when action is not included', () => {
      grantBasic({ actions: ['read'] });
      const result = engine.check(userId, agentId, 'transactions', 'write');
      expect(result.granted).toBe(false);
      expect(result.reason).toContain("'write' action");
    });

    it('denies when level is insufficient', () => {
      grantBasic({ level: 'observe' });
      const result = engine.check(userId, agentId, 'transactions', 'read', 'act_autonomously');
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('below required');
    });

    it('grants when level exceeds requirement', () => {
      grantBasic({ level: 'act_autonomously', actions: ['read', 'write'] });
      const result = engine.check(userId, agentId, 'transactions', 'read', 'suggest');
      expect(result.granted).toBe(true);
    });

    it('denies access after permission is revoked', () => {
      const perm = grantBasic();
      engine.revoke(perm.id);
      const result = engine.check(userId, agentId, 'transactions', 'read');
      expect(result.granted).toBe(false);
    });
  });

  describe('revoke', () => {
    it('revokes an active permission', () => {
      const listener = vi.fn();
      engine.on('permission:revoked', listener);

      const perm = grantBasic();
      const result = engine.revoke(perm.id);

      expect(result).toBe(true);
      expect(listener).toHaveBeenCalledWith(perm.id, agentId);
    });

    it('returns false for already-revoked permission', () => {
      const perm = grantBasic();
      engine.revoke(perm.id);
      expect(engine.revoke(perm.id)).toBe(false);
    });

    it('returns false for nonexistent id', () => {
      expect(engine.revoke('nonexistent')).toBe(false);
    });
  });

  describe('revokeAll', () => {
    it('revokes all permissions for a given agent', () => {
      grantBasic({ resource: 'transactions' });
      grantBasic({ resource: 'bank_accounts' });

      const count = engine.revokeAll(userId, agentId);
      expect(count).toBe(2);
      expect(engine.list(userId, agentId)).toHaveLength(0);
    });
  });

  describe('list', () => {
    it('lists active permissions for a user', () => {
      grantBasic({ resource: 'transactions' });
      grantBasic({ resource: 'bank_accounts' });

      const perms = engine.list(userId);
      expect(perms).toHaveLength(2);
    });

    it('filters by agentId', () => {
      grantBasic({ agentId: 'agent-a', resource: 'transactions' });
      grantBasic({ agentId: 'agent-b', resource: 'bank_accounts' });

      expect(engine.list(userId, 'agent-a')).toHaveLength(1);
    });

    it('excludes revoked permissions', () => {
      const perm = grantBasic();
      engine.revoke(perm.id);
      expect(engine.list(userId)).toHaveLength(0);
    });
  });

  describe('request', () => {
    it('emits permission:requested event', () => {
      const listener = vi.fn();
      engine.on('permission:requested', listener);

      const req: PermissionRequest = {
        agentId,
        resource: 'transactions',
        level: 'observe',
        actions: ['read'],
        reason: 'Need to show balance',
      };
      engine.request(req);
      expect(listener).toHaveBeenCalledWith(req);
    });
  });
});

import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import { DataCategory } from '../types';
import { VaultEntry, VaultQuery } from './vault-types';
import { PermissionEngine } from '../permissions/permission-engine';

interface VaultEvents {
  'data:created': (entry: VaultEntry) => void;
  'data:updated': (entry: VaultEntry) => void;
  'data:deleted': (entryId: string) => void;
}

/**
 * DataVault is the encrypted data store at the heart of MINE.
 * All user data flows through here. Agents access it only with permissions.
 *
 * In production, this backs to SQLite (local) + PostgreSQL (cloud sync).
 * This implementation uses an in-memory store for the architecture scaffold.
 */
export class DataVault extends EventEmitter<VaultEvents> {
  private store: Map<string, VaultEntry> = new Map();
  private permissions: PermissionEngine;

  constructor(permissions: PermissionEngine) {
    super();
    this.permissions = permissions;
  }

  /**
   * Store data (direct user action or integration — no permission check needed).
   */
  put(
    userId: string,
    category: DataCategory,
    key: string,
    data: Record<string, unknown>,
    source: VaultEntry['source'] = 'manual',
    sourceId?: string
  ): VaultEntry {
    const existing = this.findByKey(userId, category, key);
    const now = new Date();

    if (existing) {
      existing.data = { ...existing.data, ...data };
      existing.updatedAt = now;
      this.store.set(existing.id, existing);
      this.emit('data:updated', existing);
      return existing;
    }

    const entry: VaultEntry = {
      id: uuid(),
      userId,
      category,
      key,
      data,
      source,
      sourceId,
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };

    this.store.set(entry.id, entry);
    this.emit('data:created', entry);
    return entry;
  }

  /**
   * Read data as an agent (permission-checked).
   */
  getForAgent(
    userId: string,
    agentId: string,
    category: DataCategory,
    query?: Partial<VaultQuery>
  ): VaultEntry[] {
    const check = this.permissions.check(userId, agentId, category, 'read');
    if (!check.granted) {
      throw new Error(`Permission denied: ${check.reason}`);
    }

    return this.query({ userId, category, ...query });
  }

  /**
   * Write data as an agent (permission-checked).
   */
  putForAgent(
    userId: string,
    agentId: string,
    category: DataCategory,
    key: string,
    data: Record<string, unknown>
  ): VaultEntry {
    const check = this.permissions.check(userId, agentId, category, 'write');
    if (!check.granted) {
      throw new Error(`Permission denied: ${check.reason}`);
    }

    return this.put(userId, category, key, data, 'agent', agentId);
  }

  /**
   * Query the vault.
   */
  query(q: VaultQuery): VaultEntry[] {
    let results = Array.from(this.store.values()).filter((e) => e.userId === q.userId);

    if (q.category) results = results.filter((e) => e.category === q.category);
    if (q.key) results = results.filter((e) => e.key === q.key);
    if (q.source) results = results.filter((e) => e.source === q.source);
    if (q.fromDate) results = results.filter((e) => e.createdAt >= q.fromDate!);
    if (q.toDate) results = results.filter((e) => e.createdAt <= q.toDate!);

    results.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    if (q.offset) results = results.slice(q.offset);
    if (q.limit) results = results.slice(0, q.limit);

    return results;
  }

  /**
   * Delete an entry.
   */
  delete(entryId: string): boolean {
    const existed = this.store.delete(entryId);
    if (existed) this.emit('data:deleted', entryId);
    return existed;
  }

  /**
   * Export all user data (GDPR-style data portability).
   */
  exportAll(userId: string): VaultEntry[] {
    return Array.from(this.store.values()).filter((e) => e.userId === userId);
  }

  /**
   * Delete all user data.
   */
  purgeUser(userId: string): number {
    let count = 0;
    for (const [id, entry] of this.store) {
      if (entry.userId === userId) {
        this.store.delete(id);
        count++;
      }
    }
    return count;
  }

  // ─── Private ────────────────────────────────────────

  private findByKey(userId: string, category: DataCategory, key: string): VaultEntry | undefined {
    return Array.from(this.store.values()).find(
      (e) => e.userId === userId && e.category === category && e.key === key
    );
  }
}

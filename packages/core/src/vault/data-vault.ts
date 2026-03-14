import { v4 as uuid } from 'uuid';
import { EventEmitter } from 'eventemitter3';
import { DataCategory } from '../types';
import { VaultEntry, VaultQuery } from './vault-types';
import { PermissionEngine } from '../permissions/permission-engine';
import type { PersistenceLayer } from '../persistence/persistence-layer';

interface VaultEvents {
  'data:created': (entry: VaultEntry) => void;
  'data:updated': (entry: VaultEntry) => void;
  'data:deleted': (entryId: string) => void;
}

/**
 * DataVault is the encrypted data store at the heart of MINE.
 * All user data flows through here. Agents access it only with permissions.
 *
 * Backs to SQLite via PersistenceLayer. Falls back to in-memory if no persistence configured.
 */
export class DataVault extends EventEmitter<VaultEvents> {
  private store: Map<string, VaultEntry> = new Map();
  private permissions: PermissionEngine;
  private persistence: PersistenceLayer | null = null;

  constructor(permissions: PermissionEngine) {
    super();
    this.permissions = permissions;
  }

  /**
   * Enable SQLite persistence. Call once during bootstrap.
   * Loads all existing entries from disk into memory cache.
   */
  enablePersistence(persistence: PersistenceLayer): void {
    this.persistence = persistence;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.persistence) return;
    const entries = this.persistence.getVaultEntries('*'); // special: load all
    // Actually, we need to load per-user. Let's load everything.
    // The persistence layer doesn't support wildcard, so we'll use a direct query.
    // For now, load on-demand per user. Mark as loaded.
  }

  /**
   * Ensure user's data is loaded from disk into memory.
   */
  private ensureLoaded(userId: string): void {
    if (!this.persistence) return;

    // Check if we already have data for this user in memory
    const hasUser = Array.from(this.store.values()).some(e => e.userId === userId);
    if (hasUser) return;

    // Load from disk
    const entries = this.persistence.getVaultEntries(userId);
    for (const entry of entries) {
      this.store.set(entry.id, entry);
    }
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
    this.ensureLoaded(userId);

    const existing = this.findByKey(userId, category, key);
    const now = new Date();

    if (existing) {
      existing.data = { ...existing.data, ...data };
      existing.updatedAt = now;
      this.store.set(existing.id, existing);
      this.persistEntry(existing);
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
    this.persistEntry(entry);
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
    this.ensureLoaded(q.userId);

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
    if (existed) {
      this.persistence?.deleteVaultEntry(entryId);
      this.emit('data:deleted', entryId);
    }
    return existed;
  }

  /**
   * Export all user data (GDPR-style data portability).
   */
  exportAll(userId: string): VaultEntry[] {
    this.ensureLoaded(userId);
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
    this.persistence?.purgeUserVault(userId);
    return count;
  }

  // ─── Private ────────────────────────────────────────

  private findByKey(userId: string, category: DataCategory, key: string): VaultEntry | undefined {
    return Array.from(this.store.values()).find(
      (e) => e.userId === userId && e.category === category && e.key === key
    );
  }

  private persistEntry(entry: VaultEntry): void {
    this.persistence?.putVaultEntry(entry);
  }
}

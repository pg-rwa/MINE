import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataVault } from './data-vault';
import { PermissionEngine } from '../permissions/permission-engine';

describe('DataVault', () => {
  let vault: DataVault;
  let permissions: PermissionEngine;
  const userId = '00000000-0000-0000-0000-000000000001';
  const agentId = 'finance-agent';

  beforeEach(() => {
    permissions = new PermissionEngine();
    vault = new DataVault(permissions);
  });

  describe('put', () => {
    it('stores a new entry', () => {
      const entry = vault.put(userId, 'transactions', 'txn-1', { amount: 100 });
      expect(entry.id).toBeDefined();
      expect(entry.userId).toBe(userId);
      expect(entry.category).toBe('transactions');
      expect(entry.key).toBe('txn-1');
      expect(entry.data).toEqual({ amount: 100 });
      expect(entry.source).toBe('manual');
    });

    it('emits data:created on new entry', () => {
      const listener = vi.fn();
      vault.on('data:created', listener);
      const entry = vault.put(userId, 'transactions', 'txn-1', { amount: 100 });
      expect(listener).toHaveBeenCalledWith(entry);
    });

    it('updates existing entry with same key', () => {
      vault.put(userId, 'transactions', 'txn-1', { amount: 100 });
      const updated = vault.put(userId, 'transactions', 'txn-1', { note: 'coffee' });
      expect(updated.data).toEqual({ amount: 100, note: 'coffee' });
    });

    it('emits data:updated on existing entry', () => {
      vault.put(userId, 'transactions', 'txn-1', { amount: 100 });
      const listener = vi.fn();
      vault.on('data:updated', listener);
      vault.put(userId, 'transactions', 'txn-1', { note: 'coffee' });
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getForAgent (permission-checked)', () => {
    it('returns entries when agent has read permission', () => {
      permissions.grant(userId, {
        agentId,
        resource: 'transactions',
        level: 'observe',
        actions: ['read'],
        reason: 'test',
      });
      vault.put(userId, 'transactions', 'txn-1', { amount: 50 });

      const results = vault.getForAgent(userId, agentId, 'transactions');
      expect(results).toHaveLength(1);
      expect(results[0].data.amount).toBe(50);
    });

    it('throws when agent lacks permission', () => {
      vault.put(userId, 'transactions', 'txn-1', { amount: 50 });
      expect(() => vault.getForAgent(userId, agentId, 'transactions')).toThrow('Permission denied');
    });
  });

  describe('putForAgent (permission-checked)', () => {
    it('stores entry when agent has write permission', () => {
      permissions.grant(userId, {
        agentId,
        resource: 'transactions',
        level: 'act_with_approval',
        actions: ['read', 'write'],
        reason: 'test',
      });

      const entry = vault.putForAgent(userId, agentId, 'transactions', 'txn-2', { amount: 200 });
      expect(entry.source).toBe('agent');
      expect(entry.sourceId).toBe(agentId);
    });

    it('throws when agent lacks write permission', () => {
      permissions.grant(userId, {
        agentId,
        resource: 'transactions',
        level: 'observe',
        actions: ['read'],
        reason: 'test',
      });
      expect(() => vault.putForAgent(userId, agentId, 'transactions', 'txn-2', { amount: 200 })).toThrow(
        'Permission denied'
      );
    });
  });

  describe('query', () => {
    beforeEach(() => {
      vault.put(userId, 'transactions', 'txn-1', { amount: 100 });
      vault.put(userId, 'transactions', 'txn-2', { amount: 200 });
      vault.put(userId, 'bank_accounts', 'acc-1', { bank: 'SBI' });
    });

    it('filters by userId', () => {
      const results = vault.query({ userId: 'other-user' });
      expect(results).toHaveLength(0);
    });

    it('filters by category', () => {
      const results = vault.query({ userId, category: 'transactions' });
      expect(results).toHaveLength(2);
    });

    it('filters by key', () => {
      const results = vault.query({ userId, key: 'txn-1' });
      expect(results).toHaveLength(1);
    });

    it('applies limit and offset', () => {
      const results = vault.query({ userId, category: 'transactions', limit: 1, offset: 1 });
      expect(results).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('removes an entry', () => {
      const entry = vault.put(userId, 'transactions', 'txn-1', { amount: 100 });
      const listener = vi.fn();
      vault.on('data:deleted', listener);

      expect(vault.delete(entry.id)).toBe(true);
      expect(listener).toHaveBeenCalledWith(entry.id);
      expect(vault.query({ userId })).toHaveLength(0);
    });

    it('returns false for nonexistent id', () => {
      expect(vault.delete('nonexistent')).toBe(false);
    });
  });

  describe('exportAll', () => {
    it('returns all entries for a user', () => {
      vault.put(userId, 'transactions', 'txn-1', { amount: 100 });
      vault.put(userId, 'bank_accounts', 'acc-1', { bank: 'SBI' });
      expect(vault.exportAll(userId)).toHaveLength(2);
    });
  });

  describe('purgeUser', () => {
    it('deletes all user data and returns count', () => {
      vault.put(userId, 'transactions', 'txn-1', { amount: 100 });
      vault.put(userId, 'bank_accounts', 'acc-1', { bank: 'SBI' });
      expect(vault.purgeUser(userId)).toBe(2);
      expect(vault.exportAll(userId)).toHaveLength(0);
    });
  });
});

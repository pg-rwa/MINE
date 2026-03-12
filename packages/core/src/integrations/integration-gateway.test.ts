import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IntegrationGateway, IntegrationConfig } from './integration-gateway';

describe('IntegrationGateway', () => {
  let gateway: IntegrationGateway;
  const userId = '00000000-0000-0000-0000-000000000001';

  const gmailConfig: IntegrationConfig = {
    id: 'gmail',
    name: 'Gmail',
    type: 'oauth2',
    provider: 'gmail',
    dataCategory: 'emails',
    syncInterval: 15,
    config: {},
  };

  beforeEach(() => {
    gateway = new IntegrationGateway();
  });

  describe('registerIntegration', () => {
    it('registers an integration', () => {
      gateway.registerIntegration(gmailConfig);
      expect(gateway.listAvailable()).toHaveLength(1);
      expect(gateway.listAvailable()[0].id).toBe('gmail');
    });
  });

  describe('connect', () => {
    it('creates a connection', async () => {
      gateway.registerIntegration(gmailConfig);
      const listener = vi.fn();
      gateway.on('connection:created', listener);

      const conn = await gateway.connect(userId, 'gmail', { token: 'abc' });

      expect(conn.status).toBe('connected');
      expect(conn.userId).toBe(userId);
      expect(conn.integrationId).toBe('gmail');
      expect(listener).toHaveBeenCalledWith(conn);
    });

    it('throws for unknown integration', async () => {
      await expect(gateway.connect(userId, 'unknown', {})).rejects.toThrow('Unknown integration');
    });
  });

  describe('sync', () => {
    it('syncs a connection', async () => {
      gateway.registerIntegration(gmailConfig);
      const conn = await gateway.connect(userId, 'gmail', { token: 'abc' });

      const started = vi.fn();
      const completed = vi.fn();
      gateway.on('sync:started', started);
      gateway.on('sync:completed', completed);

      await gateway.sync(conn.id);

      expect(started).toHaveBeenCalledWith(conn.id);
      expect(completed).toHaveBeenCalledWith(conn.id, 0);
    });

    it('throws for nonexistent connection', async () => {
      await expect(gateway.sync('nonexistent')).rejects.toThrow('Connection not found');
    });
  });

  describe('disconnect', () => {
    it('disconnects and wipes credentials', async () => {
      gateway.registerIntegration(gmailConfig);
      const conn = await gateway.connect(userId, 'gmail', { token: 'abc' });

      gateway.disconnect(conn.id);

      const connections = gateway.listConnections(userId);
      expect(connections[0].status).toBe('disconnected');
      expect(connections[0].credentials).toEqual({});
    });
  });

  describe('listConnections', () => {
    it('filters by userId', async () => {
      gateway.registerIntegration(gmailConfig);
      await gateway.connect(userId, 'gmail', { token: 'abc' });
      await gateway.connect('other-user', 'gmail', { token: 'xyz' });

      expect(gateway.listConnections(userId)).toHaveLength(1);
    });
  });
});

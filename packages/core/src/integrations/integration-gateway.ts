import { EventEmitter } from 'eventemitter3';
import { DataCategory } from '../types';

export interface IntegrationConfig {
  id: string;
  name: string;
  type: 'oauth2' | 'api_key' | 'imap' | 'webhook' | 'scraper';
  provider: string; // e.g., "gmail", "plaid", "zerodha"
  dataCategory: DataCategory;
  syncInterval: number; // minutes, 0 = manual only
  config: Record<string, unknown>;
}

export interface IntegrationConnection {
  id: string;
  userId: string;
  integrationId: string;
  status: 'connected' | 'disconnected' | 'error' | 'syncing';
  credentials: Record<string, unknown>; // encrypted in production
  lastSync?: Date;
  errorMessage?: string;
  createdAt: Date;
}

interface GatewayEvents {
  'sync:started': (connectionId: string) => void;
  'sync:completed': (connectionId: string, recordCount: number) => void;
  'sync:failed': (connectionId: string, error: string) => void;
  'connection:created': (connection: IntegrationConnection) => void;
}

/**
 * IntegrationGateway manages external app connections.
 * Handles OAuth flows, API sync, IMAP, webhooks, etc.
 */
export class IntegrationGateway extends EventEmitter<GatewayEvents> {
  private integrations: Map<string, IntegrationConfig> = new Map();
  private connections: Map<string, IntegrationConnection> = new Map();

  /**
   * Register an available integration.
   */
  registerIntegration(config: IntegrationConfig): void {
    this.integrations.set(config.id, config);
  }

  /**
   * Connect a user to an integration.
   */
  async connect(userId: string, integrationId: string, credentials: Record<string, unknown>): Promise<IntegrationConnection> {
    const integration = this.integrations.get(integrationId);
    if (!integration) throw new Error(`Unknown integration: ${integrationId}`);

    const connection: IntegrationConnection = {
      id: crypto.randomUUID(),
      userId,
      integrationId,
      status: 'connected',
      credentials, // encrypted in production
      createdAt: new Date(),
    };

    this.connections.set(connection.id, connection);
    this.emit('connection:created', connection);
    return connection;
  }

  /**
   * Trigger a sync for a connection.
   */
  async sync(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Connection not found: ${connectionId}`);

    connection.status = 'syncing';
    this.emit('sync:started', connectionId);

    try {
      // In production: fetch data from external service, store in vault
      connection.status = 'connected';
      connection.lastSync = new Date();
      this.emit('sync:completed', connectionId, 0);
    } catch (error) {
      connection.status = 'error';
      connection.errorMessage = (error as Error).message;
      this.emit('sync:failed', connectionId, connection.errorMessage);
    }
  }

  /**
   * Disconnect an integration.
   */
  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'disconnected';
      connection.credentials = {}; // wipe credentials
    }
  }

  /**
   * List available integrations.
   */
  listAvailable(): IntegrationConfig[] {
    return Array.from(this.integrations.values());
  }

  /**
   * List user's connections.
   */
  listConnections(userId: string): IntegrationConnection[] {
    return Array.from(this.connections.values()).filter((c) => c.userId === userId);
  }
}

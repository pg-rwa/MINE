import { EventEmitter } from 'eventemitter3';
import { DataCategory } from '../types';
import { IntegrationAdapter, OAuthTokens, NormalizedEntry } from './adapter-types';
import { DataVault } from '../vault/data-vault';
import type { PersistenceLayer } from '../persistence/persistence-layer';

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
  tokens?: OAuthTokens;
  lastSync?: Date;
  lastSyncCount?: number;
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
 * Now wired to real adapters — sync() actually fetches data and stores it in the vault.
 */
export class IntegrationGateway extends EventEmitter<GatewayEvents> {
  private integrations: Map<string, IntegrationConfig> = new Map();
  private connections: Map<string, IntegrationConnection> = new Map();
  private adapters: Map<string, IntegrationAdapter> = new Map();
  private vault: DataVault | null = null;
  private persistence: PersistenceLayer | null = null;

  /**
   * Set the adapter registry and data vault for real sync operations.
   */
  configure(adapters: Map<string, IntegrationAdapter>, vault: DataVault): void {
    this.adapters = adapters;
    this.vault = vault;
  }

  /**
   * Enable persistence — restores connections from disk on startup.
   */
  enablePersistence(persistence: PersistenceLayer): void {
    this.persistence = persistence;
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    if (!this.persistence) return;
    const saved = this.persistence.getConnections();
    for (const conn of saved) {
      // Restore tokens with proper Date objects
      if (conn.tokens?.expiresAt && typeof conn.tokens.expiresAt === 'string') {
        conn.tokens.expiresAt = new Date(conn.tokens.expiresAt);
      }
      this.connections.set(conn.id, conn);
    }
    if (saved.length > 0) {
      console.log(`Integrations: Restored ${saved.length} connection(s) from disk`);
    }
  }

  /**
   * Register an available integration.
   */
  registerIntegration(config: IntegrationConfig): void {
    this.integrations.set(config.id, config);
  }

  /**
   * Get the adapter for an integration (for OAuth flows).
   */
  getAdapter(integrationId: string): IntegrationAdapter | undefined {
    return this.adapters.get(integrationId);
  }

  /**
   * Connect a user to an integration with OAuth tokens.
   */
  async connect(
    userId: string,
    integrationId: string,
    credentials: Record<string, unknown>,
    tokens?: OAuthTokens
  ): Promise<IntegrationConnection> {
    const integration = this.integrations.get(integrationId);
    if (!integration) throw new Error(`Unknown integration: ${integrationId}`);

    // Check if user already has a connection to this integration
    const existing = Array.from(this.connections.values()).find(
      c => c.userId === userId && c.integrationId === integrationId && c.status !== 'disconnected'
    );
    if (existing) {
      // Update existing connection
      existing.credentials = credentials;
      existing.tokens = tokens;
      existing.status = 'connected';
      existing.errorMessage = undefined;
      this.persistConnection(existing);
      return existing;
    }

    const connection: IntegrationConnection = {
      id: crypto.randomUUID(),
      userId,
      integrationId,
      status: 'connected',
      credentials,
      tokens,
      createdAt: new Date(),
    };

    this.connections.set(connection.id, connection);
    this.persistConnection(connection);
    this.emit('connection:created', connection);
    return connection;
  }

  /**
   * Trigger a sync for a connection.
   * Now actually fetches data from the adapter and stores it in the vault.
   */
  async sync(connectionId: string): Promise<NormalizedEntry[]> {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Connection not found: ${connectionId}`);

    const adapter = this.adapters.get(connection.integrationId);

    connection.status = 'syncing';
    this.emit('sync:started', connectionId);

    try {
      let entries: NormalizedEntry[] = [];

      if (adapter && connection.tokens) {
        // Real sync: check if token needs refresh
        const tokens = await this.ensureFreshTokens(connection, adapter);

        // Fetch data from the external service
        entries = await adapter.fetchData(tokens, {
          since: connection.lastSync, // only fetch new data since last sync
          limit: 100,
        });

        // Store each entry in the vault
        if (this.vault) {
          for (const entry of entries) {
            this.vault.put(
              connection.userId,
              entry.category,
              entry.key,
              entry.data,
              'integration',
              connection.integrationId
            );
          }
        }
      }

      connection.status = 'connected';
      connection.lastSync = new Date();
      connection.lastSyncCount = entries.length;
      this.persistConnection(connection);
      this.emit('sync:completed', connectionId, entries.length);
      return entries;
    } catch (error) {
      connection.status = 'error';
      connection.errorMessage = (error as Error).message;
      this.emit('sync:failed', connectionId, connection.errorMessage);
      throw error;
    }
  }

  /**
   * Refresh tokens if expired.
   */
  private async ensureFreshTokens(
    connection: IntegrationConnection,
    adapter: IntegrationAdapter
  ): Promise<OAuthTokens> {
    const tokens = connection.tokens!;

    if (tokens.expiresAt && tokens.expiresAt.getTime() < Date.now() + 60_000) {
      // Token expires within 1 minute — refresh it
      if (tokens.refreshToken) {
        const refreshed = await adapter.refreshToken(tokens.refreshToken);
        connection.tokens = refreshed;
        return refreshed;
      }
    }

    return tokens;
  }

  /**
   * Search an integration for specific keywords (on-demand agent search).
   * Unlike sync() which uses the default broad query, this targets specific terms.
   */
  async search(connectionId: string, keywords: string[]): Promise<NormalizedEntry[]> {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error(`Connection not found: ${connectionId}`);

    const adapter = this.adapters.get(connection.integrationId);
    if (!adapter || !connection.tokens) return [];

    const tokens = await this.ensureFreshTokens(connection, adapter);
    const entries = await adapter.fetchData(tokens, {
      keywords,
      limit: 25,
    });

    // Store results in vault
    if (this.vault) {
      for (const entry of entries) {
        this.vault.put(
          connection.userId,
          entry.category,
          entry.key,
          entry.data,
          'integration',
          connection.integrationId
        );
      }
    }

    return entries;
  }

  /**
   * Download an attachment from a connected integration (e.g., Gmail PDF).
   */
  async downloadAttachment(connectionId: string, messageId: string, attachmentId: string): Promise<Buffer | null> {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;

    const adapter = this.adapters.get(connection.integrationId);
    if (!adapter || !connection.tokens) return null;

    // Currently only Gmail adapter supports attachment downloads
    if ('downloadAttachment' in adapter && typeof (adapter as any).downloadAttachment === 'function') {
      const tokens = await this.ensureFreshTokens(connection, adapter);
      return (adapter as any).downloadAttachment(tokens.accessToken, messageId, attachmentId);
    }

    return null;
  }

  /**
   * Fetch email body text and password hint for a specific message.
   */
  async fetchEmailBody(connectionId: string, messageId: string): Promise<{ body: string; passwordHint: string | null } | null> {
    const connection = this.connections.get(connectionId);
    if (!connection) return null;

    const adapter = this.adapters.get(connection.integrationId);
    if (!adapter || !connection.tokens) return null;

    if ('fetchEmailBody' in adapter && typeof (adapter as any).fetchEmailBody === 'function') {
      const tokens = await this.ensureFreshTokens(connection, adapter);
      return (adapter as any).fetchEmailBody(tokens.accessToken, messageId);
    }

    return null;
  }

  /**
   * Disconnect an integration.
   */
  disconnect(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'disconnected';
      connection.credentials = {};
      connection.tokens = undefined;
      this.persistConnection(connection);
    }
  }

  private persistConnection(connection: IntegrationConnection): void {
    this.persistence?.saveConnection(connection);
  }

  /**
   * Get a specific connection.
   */
  getConnection(connectionId: string): IntegrationConnection | undefined {
    return this.connections.get(connectionId);
  }

  /**
   * Find a user's connection to a specific integration.
   */
  findUserConnection(userId: string, integrationId: string): IntegrationConnection | undefined {
    return Array.from(this.connections.values()).find(
      c => c.userId === userId && c.integrationId === integrationId && c.status !== 'disconnected'
    );
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
    return Array.from(this.connections.values()).filter(
      (c) => c.userId === userId && c.status !== 'disconnected'
    );
  }
}

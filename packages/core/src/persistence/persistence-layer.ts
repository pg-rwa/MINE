import Database from 'better-sqlite3';
import path from 'path';

/**
 * SQLite-backed persistence layer for MINE.
 * Single file database — survives restarts, upgrades, redeployments.
 *
 * Tables:
 * - vault_entries: All user data (transactions, orders, bills, etc.)
 * - chat_history: Conversation messages and responses
 * - agent_memory: Cross-agent shared memory and context
 * - connections: Integration connections and tokens
 * - permissions: Granted permissions
 */
export class PersistenceLayer {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || process.env.MINE_DB_PATH || path.join(process.cwd(), 'mine-data.db');
    this.db = new Database(resolvedPath);

    // Enable WAL mode for better concurrent read/write
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.migrate();
    console.log(`Persistence: SQLite database at ${resolvedPath}`);
  }

  // ─── Schema Migration ───────────────────────────────

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault_entries (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        data TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        source_id TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_vault_user_cat ON vault_entries(user_id, category);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_user_cat_key ON vault_entries(user_id, category, key);

      CREATE TABLE IF NOT EXISTS chat_history (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        agent_id TEXT,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id, conversation_id);
      CREATE INDEX IF NOT EXISTS idx_chat_agent ON chat_history(agent_id);

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT,
        agent_id TEXT,
        last_message_at TEXT NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, last_message_at);

      CREATE TABLE IF NOT EXISTS agent_memory (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        ttl_seconds INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_agent_key ON agent_memory(user_id, agent_id, memory_type, key);
      CREATE INDEX IF NOT EXISTS idx_memory_user ON agent_memory(user_id);

      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        integration_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'connected',
        credentials TEXT NOT NULL DEFAULT '{}',
        tokens TEXT,
        last_sync TEXT,
        last_sync_count INTEGER,
        error_message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_conn_user ON connections(user_id, integration_id);

      CREATE TABLE IF NOT EXISTS permissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        resource TEXT NOT NULL,
        level TEXT NOT NULL,
        actions TEXT NOT NULL,
        scope TEXT NOT NULL DEFAULT '{}',
        granted_at TEXT NOT NULL,
        expires_at TEXT,
        auto_renew INTEGER NOT NULL DEFAULT 0,
        revoked_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_perm_user_agent ON permissions(user_id, agent_id);

      CREATE TABLE IF NOT EXISTS installed_agents (
        user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        installed_at TEXT NOT NULL,
        PRIMARY KEY (user_id, agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_installed_user ON installed_agents(user_id);
    `);
  }

  // ─── Vault Operations ───────────────────────────────

  putVaultEntry(entry: {
    id: string;
    userId: string;
    category: string;
    key: string;
    data: Record<string, unknown>;
    source: string;
    sourceId?: string;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO vault_entries (id, user_id, category, key, data, source, source_id, metadata, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, category, key) DO UPDATE SET
        data = excluded.data,
        source = excluded.source,
        source_id = excluded.source_id,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
    `);
    stmt.run(
      entry.id, entry.userId, entry.category, entry.key,
      JSON.stringify(entry.data), entry.source, entry.sourceId || null,
      JSON.stringify(entry.metadata),
      entry.createdAt.toISOString(), entry.updatedAt.toISOString()
    );
  }

  getVaultEntries(userId: string, category?: string, limit?: number, offset?: number): any[] {
    let sql = 'SELECT * FROM vault_entries WHERE user_id = ?';
    const params: any[] = [userId];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    sql += ' ORDER BY updated_at DESC';
    if (limit) {
      sql += ' LIMIT ?';
      params.push(limit);
    }
    if (offset) {
      sql += ' OFFSET ?';
      params.push(offset);
    }

    return this.db.prepare(sql).all(...params).map(this.deserializeVaultEntry);
  }

  deleteVaultEntry(entryId: string): boolean {
    const result = this.db.prepare('DELETE FROM vault_entries WHERE id = ?').run(entryId);
    return result.changes > 0;
  }

  purgeUserVault(userId: string): number {
    const result = this.db.prepare('DELETE FROM vault_entries WHERE user_id = ?').run(userId);
    return result.changes;
  }

  private deserializeVaultEntry(row: any): any {
    return {
      id: row.id,
      userId: row.user_id,
      category: row.category,
      key: row.key,
      data: JSON.parse(row.data),
      source: row.source,
      sourceId: row.source_id,
      metadata: JSON.parse(row.metadata),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  // ─── Chat History ───────────────────────────────────

  saveMessage(msg: {
    id: string;
    userId: string;
    conversationId: string;
    agentId?: string;
    role: 'user' | 'assistant';
    content: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
  }): void {
    this.db.prepare(`
      INSERT INTO chat_history (id, user_id, conversation_id, agent_id, role, content, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      msg.id, msg.userId, msg.conversationId, msg.agentId || null,
      msg.role, msg.content, JSON.stringify(msg.metadata || {}),
      msg.createdAt.toISOString()
    );

    // Upsert conversation
    this.db.prepare(`
      INSERT INTO conversations (id, user_id, title, agent_id, last_message_at, message_count, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        last_message_at = excluded.last_message_at,
        message_count = message_count + 1,
        agent_id = COALESCE(excluded.agent_id, agent_id)
    `).run(
      msg.conversationId, msg.userId,
      msg.content.slice(0, 80), // Auto-title from first message
      msg.agentId || null,
      msg.createdAt.toISOString(),
      msg.createdAt.toISOString()
    );
  }

  getConversations(userId: string, limit = 50, offset = 0): any[] {
    return this.db.prepare(`
      SELECT * FROM conversations
      WHERE user_id = ?
      ORDER BY last_message_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, limit, offset).map(row => ({
      id: (row as any).id,
      userId: (row as any).user_id,
      title: (row as any).title,
      agentId: (row as any).agent_id,
      lastMessageAt: new Date((row as any).last_message_at),
      messageCount: (row as any).message_count,
      createdAt: new Date((row as any).created_at),
    }));
  }

  getConversationMessages(conversationId: string, limit = 100, offset = 0): any[] {
    return this.db.prepare(`
      SELECT * FROM chat_history
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `).all(conversationId, limit, offset).map(row => ({
      id: (row as any).id,
      userId: (row as any).user_id,
      conversationId: (row as any).conversation_id,
      agentId: (row as any).agent_id,
      role: (row as any).role,
      content: (row as any).content,
      metadata: JSON.parse((row as any).metadata),
      createdAt: new Date((row as any).created_at),
    }));
  }

  updateConversationTitle(conversationId: string, title: string): void {
    this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(title, conversationId);
  }

  deleteConversation(conversationId: string): void {
    this.db.prepare('DELETE FROM chat_history WHERE conversation_id = ?').run(conversationId);
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(conversationId);
  }

  // ─── Agent Memory (Cross-Agent Shared Context) ──────

  setMemory(entry: {
    userId: string;
    agentId: string;
    memoryType: 'fact' | 'preference' | 'context' | 'cross_ref';
    key: string;
    value: unknown;
    ttlSeconds?: number;
  }): void {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO agent_memory (id, user_id, agent_id, memory_type, key, value, ttl_seconds, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, agent_id, memory_type, key) DO UPDATE SET
        value = excluded.value,
        ttl_seconds = excluded.ttl_seconds,
        updated_at = excluded.updated_at
    `).run(
      id, entry.userId, entry.agentId, entry.memoryType,
      entry.key, JSON.stringify(entry.value),
      entry.ttlSeconds || null, now, now
    );
  }

  getMemory(userId: string, agentId: string, memoryType?: string): any[] {
    let sql = 'SELECT * FROM agent_memory WHERE user_id = ? AND agent_id = ?';
    const params: any[] = [userId, agentId];

    if (memoryType) {
      sql += ' AND memory_type = ?';
      params.push(memoryType);
    }

    return this.db.prepare(sql).all(...params).map(row => ({
      id: (row as any).id,
      userId: (row as any).user_id,
      agentId: (row as any).agent_id,
      memoryType: (row as any).memory_type,
      key: (row as any).key,
      value: JSON.parse((row as any).value),
      ttlSeconds: (row as any).ttl_seconds,
      createdAt: new Date((row as any).created_at),
      updatedAt: new Date((row as any).updated_at),
    }));
  }

  /**
   * Get shared memory — memory from ALL agents for a user.
   * This is how agents cross-reference each other's knowledge.
   */
  getSharedMemory(userId: string, memoryType?: string): any[] {
    let sql = 'SELECT * FROM agent_memory WHERE user_id = ?';
    const params: any[] = [userId];

    if (memoryType) {
      sql += ' AND memory_type = ?';
      params.push(memoryType);
    }
    sql += ' ORDER BY updated_at DESC';

    return this.db.prepare(sql).all(...params).map(row => ({
      id: (row as any).id,
      userId: (row as any).user_id,
      agentId: (row as any).agent_id,
      memoryType: (row as any).memory_type,
      key: (row as any).key,
      value: JSON.parse((row as any).value),
      createdAt: new Date((row as any).created_at),
      updatedAt: new Date((row as any).updated_at),
    }));
  }

  /**
   * Search across all agents' memories and recent chat history for context.
   * Used when an agent needs to know what other agents have learned.
   */
  searchContext(userId: string, keywords: string[], limit = 20): {
    memories: any[];
    recentChats: any[];
  } {
    const pattern = keywords.map(k => `%${k}%`);

    // Search memories
    const memClauses = pattern.map(() => 'value LIKE ?').join(' OR ');
    const memories = this.db.prepare(`
      SELECT * FROM agent_memory
      WHERE user_id = ? AND (${memClauses})
      ORDER BY updated_at DESC LIMIT ?
    `).all(userId, ...pattern, limit).map(row => ({
      agentId: (row as any).agent_id,
      memoryType: (row as any).memory_type,
      key: (row as any).key,
      value: JSON.parse((row as any).value),
    }));

    // Search recent chats
    const chatClauses = pattern.map(() => 'content LIKE ?').join(' OR ');
    const recentChats = this.db.prepare(`
      SELECT * FROM chat_history
      WHERE user_id = ? AND (${chatClauses})
      ORDER BY created_at DESC LIMIT ?
    `).all(userId, ...pattern, limit).map(row => ({
      agentId: (row as any).agent_id,
      role: (row as any).role,
      content: (row as any).content,
      createdAt: new Date((row as any).created_at),
    }));

    return { memories, recentChats };
  }

  /**
   * Get recent conversation context for an agent — what was discussed recently.
   */
  getRecentAgentContext(userId: string, agentId: string, messageLimit = 10): any[] {
    return this.db.prepare(`
      SELECT * FROM chat_history
      WHERE user_id = ? AND agent_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(userId, agentId, messageLimit).map(row => ({
      role: (row as any).role,
      content: (row as any).content,
      createdAt: new Date((row as any).created_at),
    })).reverse(); // Return in chronological order
  }

  // ─── Connection Persistence ─────────────────────────

  saveConnection(conn: {
    id: string;
    userId: string;
    integrationId: string;
    status: string;
    credentials: Record<string, unknown>;
    tokens?: any;
    lastSync?: Date;
    lastSyncCount?: number;
    errorMessage?: string;
    createdAt: Date;
  }): void {
    this.db.prepare(`
      INSERT INTO connections (id, user_id, integration_id, status, credentials, tokens, last_sync, last_sync_count, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        credentials = excluded.credentials,
        tokens = excluded.tokens,
        last_sync = excluded.last_sync,
        last_sync_count = excluded.last_sync_count,
        error_message = excluded.error_message
    `).run(
      conn.id, conn.userId, conn.integrationId, conn.status,
      JSON.stringify(conn.credentials),
      conn.tokens ? JSON.stringify(conn.tokens) : null,
      conn.lastSync?.toISOString() || null,
      conn.lastSyncCount || null,
      conn.errorMessage || null,
      conn.createdAt.toISOString()
    );
  }

  getConnections(userId?: string): any[] {
    let sql = 'SELECT * FROM connections WHERE status != ?';
    const params: any[] = ['disconnected'];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    return this.db.prepare(sql).all(...params).map(row => ({
      id: (row as any).id,
      userId: (row as any).user_id,
      integrationId: (row as any).integration_id,
      status: (row as any).status,
      credentials: JSON.parse((row as any).credentials),
      tokens: (row as any).tokens ? JSON.parse((row as any).tokens) : undefined,
      lastSync: (row as any).last_sync ? new Date((row as any).last_sync) : undefined,
      lastSyncCount: (row as any).last_sync_count,
      errorMessage: (row as any).error_message,
      createdAt: new Date((row as any).created_at),
    }));
  }

  // ─── Permission Persistence ─────────────────────────

  savePermission(perm: {
    id: string;
    userId: string;
    agentId: string;
    resource: string;
    level: string;
    actions: string[];
    scope: Record<string, unknown>;
    grantedAt: Date;
    expiresAt?: Date;
    autoRenew: boolean;
    revokedAt?: Date;
  }): void {
    this.db.prepare(`
      INSERT INTO permissions (id, user_id, agent_id, resource, level, actions, scope, granted_at, expires_at, auto_renew, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        level = excluded.level,
        actions = excluded.actions,
        scope = excluded.scope,
        expires_at = excluded.expires_at,
        auto_renew = excluded.auto_renew,
        revoked_at = excluded.revoked_at
    `).run(
      perm.id, perm.userId, perm.agentId, perm.resource,
      perm.level, JSON.stringify(perm.actions), JSON.stringify(perm.scope),
      perm.grantedAt.toISOString(),
      perm.expiresAt?.toISOString() || null,
      perm.autoRenew ? 1 : 0,
      perm.revokedAt?.toISOString() || null
    );
  }

  getPermissions(userId?: string): any[] {
    let sql = 'SELECT * FROM permissions WHERE revoked_at IS NULL';
    const params: any[] = [];

    if (userId) {
      sql += ' AND user_id = ?';
      params.push(userId);
    }

    return this.db.prepare(sql).all(...params).map(row => ({
      id: (row as any).id,
      userId: (row as any).user_id,
      agentId: (row as any).agent_id,
      resource: (row as any).resource,
      level: (row as any).level,
      actions: JSON.parse((row as any).actions),
      scope: JSON.parse((row as any).scope),
      grantedAt: new Date((row as any).granted_at),
      expiresAt: (row as any).expires_at ? new Date((row as any).expires_at) : undefined,
      autoRenew: !!(row as any).auto_renew,
      revokedAt: (row as any).revoked_at ? new Date((row as any).revoked_at) : undefined,
    }));
  }

  // ─── Installed Agents ──────────────────────────────

  saveInstalledAgent(userId: string, agentId: string, active: boolean): void {
    this.db.prepare(`
      INSERT INTO installed_agents (user_id, agent_id, active, installed_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, agent_id) DO UPDATE SET active = excluded.active
    `).run(userId, agentId, active ? 1 : 0, new Date().toISOString());
  }

  removeInstalledAgent(userId: string, agentId: string): void {
    this.db.prepare('DELETE FROM installed_agents WHERE user_id = ? AND agent_id = ?').run(userId, agentId);
  }

  getInstalledAgents(userId: string): Array<{ agentId: string; active: boolean; installedAt: string }> {
    return this.db.prepare(
      'SELECT agent_id, active, installed_at FROM installed_agents WHERE user_id = ?'
    ).all(userId).map((row: any) => ({
      agentId: row.agent_id,
      active: !!row.active,
      installedAt: row.installed_at,
    }));
  }

  updateAgentActive(userId: string, agentId: string, active: boolean): void {
    this.db.prepare(
      'UPDATE installed_agents SET active = ? WHERE user_id = ? AND agent_id = ?'
    ).run(active ? 1 : 0, userId, agentId);
  }

  // ─── Lifecycle ──────────────────────────────────────

  close(): void {
    this.db.close();
  }
}

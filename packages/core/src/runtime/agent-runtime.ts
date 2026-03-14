import { EventEmitter } from 'eventemitter3';
import { AgentManifest, Message, AgentResponse, SystemEvent, Insight } from '../types';
import { PermissionEngine } from '../permissions/permission-engine';
import { DataVault } from '../vault/data-vault';
import { AuditLog } from '../audit/audit-log';
import { AIEngine } from '../ai/ai-engine';
import type { PersistenceLayer } from '../persistence/persistence-layer';
import type { ActivityBus } from '../activity/activity-bus';
import type { IntegrationGateway } from '../integrations/integration-gateway';

/**
 * The interface every agent must implement.
 */
export interface IAgent {
  readonly manifest: AgentManifest;

  /** Called when agent is first installed */
  onInstall(context: AgentContext): Promise<void>;

  /** Called each time agent is activated (app start or re-enable) */
  onActivate(context: AgentContext): Promise<void>;

  /** Called when agent is disabled */
  onDeactivate(): Promise<void>;

  /** Called when agent is uninstalled (cleanup) */
  onUninstall(): Promise<void>;

  /** Handle a user message routed to this agent */
  handleMessage(message: Message, context: AgentContext): Promise<AgentResponse>;

  /** Handle a system event (scheduled trigger, data change, etc.) */
  handleEvent(event: SystemEvent, context: AgentContext): Promise<void>;

  /** Return current insights for the dashboard */
  getInsights(context: AgentContext): Promise<Insight[]>;
}

/**
 * Context provided to agents — their sandboxed view of the system.
 */
export interface AgentContext {
  userId: string;
  agentId: string;
  permissions: PermissionEngine;
  vault: DataVault;
  audit: AuditLog;
  aiEngine: AIEngine;

  /** Send a message to another agent (requires inter-agent permission) */
  sendToAgent(targetAgentId: string, message: string): Promise<AgentResponse | null>;

  /** Request a new permission from the user */
  requestPermission(resource: string, reason: string): Promise<boolean>;

  /** Schedule a future event for this agent */
  schedule(cronExpression: string, eventType: string, payload: Record<string, unknown>): Promise<string>;

  /** Send a notification to the user */
  notify(title: string, body: string, priority?: 'low' | 'medium' | 'high' | 'urgent'): Promise<void>;

  /** List all active agent IDs and names */
  listActiveAgents(): Array<{ id: string; name: string; description: string }>;

  /** Store a memory (persisted across restarts, shared with other agents) */
  remember(key: string, value: unknown, type?: 'fact' | 'preference' | 'context' | 'cross_ref'): void;

  /** Recall this agent's memories */
  recall(type?: 'fact' | 'preference' | 'context' | 'cross_ref'): Array<{ key: string; value: unknown }>;

  /** Get shared context — memories from ALL agents (cross-agent knowledge) */
  getSharedContext(type?: string): Array<{ agentId: string; key: string; value: unknown }>;

  /** Search across all agents' memories and recent chats for keywords */
  searchContext(keywords: string[]): { memories: any[]; recentChats: any[] };

  /** Get recent conversation history with this agent */
  getRecentHistory(limit?: number): Array<{ role: string; content: string }>;

  /** Check if an integration is connected for this user */
  checkIntegration(integrationId: string): { connected: boolean; status?: string; lastSync?: Date };

  /** Search a connected integration for specific keywords (on-demand) */
  searchIntegration(integrationId: string, keywords: string[]): Promise<Array<{ category: string; key: string; data: Record<string, unknown> }>>;
}

interface RuntimeEvents {
  'agent:installed': (agentId: string) => void;
  'agent:activated': (agentId: string) => void;
  'agent:deactivated': (agentId: string) => void;
  'agent:uninstalled': (agentId: string) => void;
  'agent:error': (agentId: string, error: Error) => void;
}

/**
 * AgentRuntime manages the lifecycle and execution of all agents.
 */
export class AgentRuntime extends EventEmitter<RuntimeEvents> {
  private agents: Map<string, IAgent> = new Map();
  private activeAgents: Set<string> = new Set();
  private permissions: PermissionEngine;
  private vault: DataVault;
  private auditLog: AuditLog;
  private aiEngine: AIEngine;
  private persistence: PersistenceLayer | null = null;
  private activity: ActivityBus | null = null;
  private integrations: IntegrationGateway | null = null;

  constructor(permissions: PermissionEngine, vault: DataVault, auditLog: AuditLog, aiEngine?: AIEngine) {
    super();
    this.permissions = permissions;
    this.vault = vault;
    this.auditLog = auditLog;
    this.aiEngine = aiEngine ?? new AIEngine({ provider: 'claude', model: 'claude-sonnet-4-6' });
  }

  /**
   * Enable persistence for agent memory and chat history.
   */
  enablePersistence(persistence: PersistenceLayer): void {
    this.persistence = persistence;
  }

  /**
   * Attach integration gateway so agents can check connection status.
   */
  setIntegrationGateway(gateway: IntegrationGateway): void {
    this.integrations = gateway;
  }

  /**
   * Attach activity bus for live progress streaming.
   */
  setActivityBus(bus: ActivityBus): void {
    this.activity = bus;
  }

  /**
   * Install and activate an agent.
   */
  async install(agent: IAgent, userId: string): Promise<void> {
    const { id } = agent.manifest;

    if (this.agents.has(id)) {
      throw new Error(`Agent '${id}' is already installed`);
    }

    this.agents.set(id, agent);
    const context = this.createContext(userId, id);

    await agent.onInstall(context);
    this.emit('agent:installed', id);

    // Persist installation to survive restarts
    this.persistence?.saveInstalledAgent(userId, id, true);

    await this.activate(id, userId);
  }

  /**
   * Activate an installed agent.
   */
  async activate(agentId: string, userId: string): Promise<void> {
    const agent = this.getAgent(agentId);
    const context = this.createContext(userId, agentId);

    await agent.onActivate(context);
    this.activeAgents.add(agentId);
    this.emit('agent:activated', agentId);

    this.persistence?.updateAgentActive(userId, agentId, true);
    this.auditLog.log(userId, agentId, 'agent_activated', {});
  }

  /**
   * Deactivate an agent (keep installed but stop running).
   */
  async deactivate(agentId: string, userId: string): Promise<void> {
    const agent = this.getAgent(agentId);

    await agent.onDeactivate();
    this.activeAgents.delete(agentId);
    this.emit('agent:deactivated', agentId);

    this.persistence?.updateAgentActive(userId, agentId, false);
    this.auditLog.log(userId, agentId, 'agent_deactivated', {});
  }

  /**
   * Uninstall an agent completely.
   */
  async uninstall(agentId: string, userId: string): Promise<void> {
    const agent = this.getAgent(agentId);

    if (this.activeAgents.has(agentId)) {
      await this.deactivate(agentId, userId);
    }

    await agent.onUninstall();
    this.agents.delete(agentId);
    this.permissions.revokeAll(userId, agentId);
    this.persistence?.removeInstalledAgent(userId, agentId);
    this.emit('agent:uninstalled', agentId);

    this.auditLog.log(userId, agentId, 'agent_uninstalled', {});
  }

  /**
   * Route a message to an agent and get a response.
   */
  async handleMessage(agentId: string, message: Message): Promise<AgentResponse> {
    const agent = this.getActiveAgent(agentId);
    const context = this.createContext(message.userId, agentId);

    this.auditLog.log(message.userId, agentId, 'message_received', {
      messageId: message.id,
      contentPreview: message.content.slice(0, 100),
    });

    try {
      const response = await agent.handleMessage(message, context);

      this.auditLog.log(message.userId, agentId, 'message_responded', {
        messageId: message.id,
        actionsCount: response.actions.length,
      });

      return response;
    } catch (error) {
      this.emit('agent:error', agentId, error as Error);
      throw error;
    }
  }

  /**
   * Dispatch a system event to all active agents.
   */
  async dispatchEvent(event: SystemEvent, userId: string): Promise<void> {
    const promises = Array.from(this.activeAgents).map(async (agentId) => {
      const agent = this.agents.get(agentId)!;
      const context = this.createContext(userId, agentId);

      try {
        await agent.handleEvent(event, context);
      } catch (error) {
        this.emit('agent:error', agentId, error as Error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Collect insights from all active agents for the dashboard.
   */
  async collectInsights(userId: string): Promise<Insight[]> {
    const allInsights: Insight[] = [];

    for (const agentId of this.activeAgents) {
      const agent = this.agents.get(agentId)!;
      const context = this.createContext(userId, agentId);

      try {
        const insights = await agent.getInsights(context);
        allInsights.push(...insights);
      } catch (error) {
        this.emit('agent:error', agentId, error as Error);
      }
    }

    // Sort by priority (urgent first) then by creation date (newest first)
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return allInsights.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Get list of all installed agents and their status.
   */
  listAgents(): Array<{ manifest: AgentManifest; active: boolean }> {
    return Array.from(this.agents.entries()).map(([id, agent]) => ({
      manifest: agent.manifest,
      active: this.activeAgents.has(id),
    }));
  }

  /**
   * Restore previously installed agents from persistence.
   * Called on startup to recover agent state across restarts/redeployments.
   */
  async restoreAgents(userId: string, registry: { create: (agentId: string) => IAgent }): Promise<number> {
    if (!this.persistence) return 0;

    const saved = this.persistence.getInstalledAgents(userId);
    let restored = 0;

    for (const entry of saved) {
      try {
        if (this.agents.has(entry.agentId)) continue; // Already loaded

        const agent = registry.create(entry.agentId);
        this.agents.set(entry.agentId, agent);
        const context = this.createContext(userId, entry.agentId);
        await agent.onInstall(context);

        if (entry.active) {
          await agent.onActivate(context);
          this.activeAgents.add(entry.agentId);
        }

        restored++;
      } catch (err) {
        console.warn(`Failed to restore agent '${entry.agentId}':`, err);
      }
    }

    return restored;
  }

  // ─── Private ────────────────────────────────────────

  private getAgent(agentId: string): IAgent {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent '${agentId}' is not installed`);
    return agent;
  }

  private getActiveAgent(agentId: string): IAgent {
    const agent = this.getAgent(agentId);
    if (!this.activeAgents.has(agentId)) {
      throw new Error(`Agent '${agentId}' is not active`);
    }
    return agent;
  }

  private createContext(userId: string, agentId: string): AgentContext {
    const persistence = this.persistence;

    return {
      userId,
      agentId,
      permissions: this.permissions,
      vault: this.vault,
      audit: this.auditLog,
      aiEngine: this.aiEngine,

      listActiveAgents: () => {
        return Array.from(this.activeAgents)
          .map(id => this.agents.get(id))
          .filter((a): a is IAgent => !!a)
          .map(a => ({ id: a.manifest.id, name: a.manifest.name, description: a.manifest.description }));
      },

      sendToAgent: async (targetAgentId: string, message: string) => {
        // Active agents can communicate with each other — this is core to MINE's
        // inter-agent coordination. Permission check is soft: we try it but allow
        // the call if both agents are active (user installed and activated them).
        if (!this.activeAgents.has(targetAgentId)) return null;
        if (!this.activeAgents.has(agentId)) return null;

        this.activity?.push('agent_delegation', `${agentId} delegating to ${targetAgentId}`, {
          agentId,
          detail: message.slice(0, 100),
        });

        // Audit the inter-agent communication
        this.auditLog.log(userId, agentId, 'agent_delegation', {
          from: agentId,
          to: targetAgentId,
          messagePreview: message.slice(0, 100),
        });

        const msg: Message = {
          id: crypto.randomUUID(),
          userId,
          agentId: targetAgentId,
          content: message,
          attachments: [],
          timestamp: new Date(),
        };

        this.activity?.push('agent_processing', `${targetAgentId} processing delegated task...`, {
          agentId: targetAgentId,
        });

        return this.handleMessage(targetAgentId, msg);
      },

      requestPermission: async (resource: string, reason: string) => {
        this.permissions.request({
          agentId,
          resource: resource as any,
          level: 'observe',
          actions: ['read'],
          reason,
        });
        return false;
      },

      schedule: async (_cron: string, _eventType: string, _payload: Record<string, unknown>) => {
        return crypto.randomUUID();
      },

      notify: async (title: string, body: string, priority = 'medium' as const) => {
        this.auditLog.log(userId, agentId, 'notification_sent', { title, priority });
      },

      // ─── Memory & Cross-Agent Context ──────────────

      remember: (key: string, value: unknown, type: 'fact' | 'preference' | 'context' | 'cross_ref' = 'fact') => {
        persistence?.setMemory({ userId, agentId, memoryType: type, key, value });
      },

      recall: (type?: 'fact' | 'preference' | 'context' | 'cross_ref') => {
        if (!persistence) return [];
        return persistence.getMemory(userId, agentId, type).map(m => ({
          key: m.key,
          value: m.value,
        }));
      },

      getSharedContext: (type?: string) => {
        if (!persistence) return [];
        return persistence.getSharedMemory(userId, type).map(m => ({
          agentId: m.agentId,
          key: m.key,
          value: m.value,
        }));
      },

      searchContext: (keywords: string[]) => {
        if (!persistence) return { memories: [], recentChats: [] };
        return persistence.searchContext(userId, keywords);
      },

      getRecentHistory: (limit = 10) => {
        if (!persistence) return [];
        return persistence.getRecentAgentContext(userId, agentId, limit);
      },

      checkIntegration: (integrationId: string) => {
        if (!this.integrations) return { connected: false };
        const conn = this.integrations.findUserConnection(userId, integrationId);
        if (!conn) return { connected: false };
        return {
          connected: conn.status === 'connected' || conn.status === 'syncing',
          status: conn.status,
          lastSync: conn.lastSync,
        };
      },

      searchIntegration: async (integrationId: string, keywords: string[]) => {
        if (!this.integrations) return [];
        const conn = this.integrations.findUserConnection(userId, integrationId);
        if (!conn) return [];
        try {
          const entries = await this.integrations.search(conn.id, keywords);
          return entries.map(e => ({ category: e.category, key: e.key, data: e.data }));
        } catch {
          return [];
        }
      },
    };
  }
}

import {
  IAgent,
  AgentContext,
  AgentManifest,
  Message,
  AgentResponse,
  SystemEvent,
  Insight,
} from '@mine/core';

/**
 * BaseAgent provides common functionality for all MINE agents.
 * Domain agents extend this and implement their specific logic.
 */
export abstract class BaseAgent implements IAgent {
  abstract readonly manifest: AgentManifest;

  protected context?: AgentContext;

  async onInstall(context: AgentContext): Promise<void> {
    this.context = context;
  }

  async onActivate(context: AgentContext): Promise<void> {
    this.context = context;
  }

  async onDeactivate(): Promise<void> {
    this.context = undefined;
  }

  async onUninstall(): Promise<void> {
    this.context = undefined;
  }

  abstract handleMessage(message: Message, context: AgentContext): Promise<AgentResponse>;

  async handleEvent(_event: SystemEvent, _context: AgentContext): Promise<void> {
    // Override in subclass if needed
  }

  async getInsights(_context: AgentContext): Promise<Insight[]> {
    return [];
  }

  // ─── Helpers ──────────────────────────────────────────

  protected respond(content: string, options?: Partial<Omit<AgentResponse, 'agentId' | 'timestamp'>>): AgentResponse {
    return {
      agentId: this.manifest.id,
      content,
      actions: options?.actions ?? [],
      suggestions: options?.suggestions ?? [],
      timestamp: new Date(),
    };
  }

  protected insight(
    title: string,
    summary: string,
    priority: Insight['priority'] = 'medium',
    action?: Insight['action']
  ): Insight {
    return {
      id: crypto.randomUUID(),
      agentId: this.manifest.id,
      title,
      summary,
      priority,
      actionable: !!action,
      action,
      createdAt: new Date(),
    };
  }
}

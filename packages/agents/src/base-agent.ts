import {
  IAgent,
  AgentContext,
  AgentManifest,
  Message,
  AgentResponse,
  SystemEvent,
  Insight,
  UserIntent,
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

  // ─── Intent Analysis ────────────────────────────────

  /**
   * Analyze the user's message to understand what they actually want.
   */
  protected analyzeIntent(message: Message, context: AgentContext): UserIntent {
    return context.aiEngine.analyzeIntent(message.content);
  }

  /**
   * Check if the user's message references capabilities outside this agent's domain.
   * Returns a contextual prefix acknowledging cross-agent needs.
   */
  protected getCrossAgentContext(intent: UserIntent, context: AgentContext): string | null {
    if (intent.crossAgentRefs.length === 0 && intent.dataSources.length === 0) {
      return null;
    }

    const activeAgents = context.listActiveAgents();
    const parts: string[] = [];

    // Check data sources the user mentioned
    for (const source of intent.dataSources) {
      const sourceAgent = activeAgents.find(a =>
        a.id === source || a.description.toLowerCase().includes(source)
      );
      if (sourceAgent && sourceAgent.id !== this.manifest.id) {
        parts.push(`I'll coordinate with **${sourceAgent.name}** to ${source === 'email' ? 'scan your emails' : `check your ${source} data`}.`);
      } else if (!sourceAgent) {
        const agentName = source === 'email' ? 'Email Manager' : `${source.charAt(0).toUpperCase() + source.slice(1)} agent`;
        parts.push(`To ${source === 'email' ? 'scan your emails' : `access ${source} data`}, you'd need the **${agentName}** installed.`);
      }
    }

    // Check cross-agent domain references
    for (const ref of intent.crossAgentRefs) {
      if (intent.dataSources.includes(ref)) continue; // already handled
      const refAgent = activeAgents.find(a => a.id === ref);
      if (refAgent && refAgent.id !== this.manifest.id) {
        parts.push(`For ${ref}-related queries, **${refAgent.name}** can also help.`);
      }
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /**
   * Build a response that acknowledges the full context of the user's message,
   * including any cross-agent needs, before providing the actual answer.
   */
  protected respondWithContext(
    intent: UserIntent,
    context: AgentContext,
    mainContent: string,
    options?: Partial<Omit<AgentResponse, 'agentId' | 'timestamp'>>
  ): AgentResponse {
    const crossAgentNote = this.getCrossAgentContext(intent, context);
    const suggestions = options?.suggestions ?? [];

    let content = mainContent;
    if (crossAgentNote) {
      content = `${crossAgentNote}\n\nIn the meantime, here's what I have:\n\n${mainContent}`;
    }

    return {
      agentId: this.manifest.id,
      content,
      actions: options?.actions ?? [],
      suggestions,
      timestamp: new Date(),
    };
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

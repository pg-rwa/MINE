import {
  IAgent,
  AgentContext,
  AgentManifest,
  Message,
  AgentResponse,
  SystemEvent,
  Insight,
  UserIntent,
  DataCategory,
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

  // ─── AI-Powered Response Generation ─────────────────

  /**
   * Generate a smart AI response for the user's message.
   * Uses Claude API when available, with domain-specific system prompt.
   *
   * @param message - The user's message
   * @param context - Agent context with AI engine
   * @param extraContext - Additional context to include (e.g., user's data from vault)
   * @returns AI-generated response text, or empty string if AI unavailable
   */
  protected async generateAIResponse(
    message: Message,
    context: AgentContext,
    extraContext?: string
  ): Promise<string> {
    if (!context.aiEngine.isAvailable) return '';

    const systemPrompt = this.buildSystemPrompt(context, extraContext);

    // Include recent conversation history for continuity
    const history = context.getRecentHistory(6);
    let userMessage = message.content;
    if (history.length > 0) {
      const historyText = history
        .map(h => `${h.role === 'user' ? 'User' : 'You'}: ${h.content.slice(0, 200)}`)
        .join('\n');
      userMessage = `[Recent conversation]\n${historyText}\n\n[Current message]\n${message.content}`;
    }

    return context.aiEngine.chat(systemPrompt, userMessage, {
      maxTokens: 512,
    });
  }

  /**
   * Build the system prompt for this agent, including its role, capabilities,
   * and any user data context.
   */
  protected buildSystemPrompt(context: AgentContext, extraContext?: string): string {
    const capabilities = this.manifest.capabilities
      .map(c => `- ${c.name}: ${c.description}`)
      .join('\n');

    const activeAgents = context.listActiveAgents()
      .filter(a => a.id !== this.manifest.id)
      .map(a => `- ${a.name}: ${a.description}`)
      .join('\n');

    let prompt = `You are "${this.manifest.name}", an AI agent inside MINE (My Intelligent Network of Everything), a personal assistant super app.

Your role: ${this.manifest.description}

Your capabilities:
${capabilities}

Guidelines:
- Be concise but helpful. Keep responses under 150 words.
- Directly address what the user is asking. Don't give generic introductions.
- If the user asks something outside your domain, acknowledge it and suggest which other agent can help.
- Use markdown formatting sparingly (bold for key info, numbered lists for data).
- Be conversational and friendly, not robotic.
- If you can take action (like tracking a price, logging an expense, etc.), tell the user you're doing it.
- Never say "I'm just an AI" or "I can't actually do that" — you ARE the agent, act like it.`;

    if (activeAgents) {
      prompt += `\n\nOther active agents the user has installed:\n${activeAgents}\nYou can suggest these agents when queries fall outside your domain.`;
    }

    if (extraContext) {
      prompt += `\n\nUser's data context:\n${extraContext}`;
    }

    // Include cross-agent shared memory so agents know what others have learned
    const sharedContext = context.getSharedContext();
    if (sharedContext.length > 0) {
      const sharedText = sharedContext
        .filter(m => m.agentId !== this.manifest.id)
        .slice(0, 10)
        .map(m => `[${m.agentId}] ${m.key}: ${typeof m.value === 'string' ? m.value : JSON.stringify(m.value)}`)
        .join('\n');
      if (sharedText) {
        prompt += `\n\nKnowledge from other agents (use to avoid asking the user again):\n${sharedText}`;
      }
    }

    // Include this agent's own memories
    const ownMemories = context.recall();
    if (ownMemories.length > 0) {
      const memText = ownMemories
        .slice(0, 10)
        .map(m => `${m.key}: ${typeof m.value === 'string' ? m.value : JSON.stringify(m.value)}`)
        .join('\n');
      prompt += `\n\nYour remembered facts about this user:\n${memText}`;
    }

    return prompt;
  }

  // ─── Intent Analysis ────────────────────────────────

  protected analyzeIntent(message: Message, context: AgentContext): UserIntent {
    return context.aiEngine.analyzeIntent(message.content);
  }

  protected getCrossAgentContext(intent: UserIntent, context: AgentContext): string | null {
    if (intent.crossAgentRefs.length === 0 && intent.dataSources.length === 0) return null;

    const activeAgents = context.listActiveAgents();
    const parts: string[] = [];

    for (const source of intent.dataSources) {
      const sourceAgent = activeAgents.find(a => a.id === source || a.description.toLowerCase().includes(source));
      if (sourceAgent && sourceAgent.id !== this.manifest.id) {
        parts.push(`I'll coordinate with **${sourceAgent.name}** to ${source === 'email' ? 'scan your emails' : `check your ${source} data`}.`);
      } else if (!sourceAgent) {
        const agentName = source === 'email' ? 'Email Manager' : `${source.charAt(0).toUpperCase() + source.slice(1)} agent`;
        parts.push(`To ${source === 'email' ? 'scan your emails' : `access ${source} data`}, you'd need the **${agentName}** installed.`);
      }
    }

    for (const ref of intent.crossAgentRefs) {
      if (intent.dataSources.includes(ref)) continue;
      const refAgent = activeAgents.find(a => a.id === ref);
      if (refAgent && refAgent.id !== this.manifest.id) {
        parts.push(`For ${ref}-related queries, **${refAgent.name}** can also help.`);
      }
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  protected respondWithContext(
    intent: UserIntent,
    context: AgentContext,
    mainContent: string,
    options?: Partial<Omit<AgentResponse, 'agentId' | 'timestamp'>>
  ): AgentResponse {
    const crossAgentNote = this.getCrossAgentContext(intent, context);

    let content = mainContent;
    if (crossAgentNote) {
      content = `${crossAgentNote}\n\nIn the meantime, here's what I have:\n\n${mainContent}`;
    }

    return {
      agentId: this.manifest.id,
      content,
      actions: options?.actions ?? [],
      suggestions: options?.suggestions ?? [],
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

  /**
   * Helper to get user data from vault as a formatted string for AI context.
   */
  protected getVaultDataSummary(context: AgentContext, categories: DataCategory[]): string {
    const parts: string[] = [];
    for (const category of categories) {
      try {
        const entries = context.vault.getForAgent(context.userId, context.agentId, category);
        if (entries.length > 0) {
          parts.push(`${category} (${entries.length} entries): ${JSON.stringify(entries.map(e => e.data).slice(0, 5))}`);
        }
      } catch {
        // No permission for this category
      }
    }
    return parts.join('\n');
  }
}

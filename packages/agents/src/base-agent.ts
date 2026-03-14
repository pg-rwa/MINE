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
  MessageAttachment,
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

    // Use multimodal if message has attachments
    const aiAttachments = this.resolveAttachments(message);
    if (aiAttachments.length > 0) {
      return context.aiEngine.chatWithAttachments(systemPrompt, userMessage, aiAttachments, {
        maxTokens: 1024, // More tokens for document analysis
      });
    }

    return context.aiEngine.chat(systemPrompt, userMessage, {
      maxTokens: 512,
    });
  }

  /**
   * Resolve message attachments into AI-ready format.
   * Reads file contents from disk for images (base64) and documents (text extraction).
   */
  protected resolveAttachments(message: Message): MessageAttachment[] {
    if (!message.attachments || message.attachments.length === 0) return [];

    const resolved: MessageAttachment[] = [];

    for (const att of message.attachments) {
      const meta = att.metadata as Record<string, string> | undefined;
      const mimeType = meta?.mimeType || 'application/octet-stream';
      const filename = meta?.filename || 'file';

      try {
        // Resolve file path from URI
        const filePath = this.resolveFilePath(att.uri);
        if (!filePath) continue;

        const fs = require('fs');
        if (!fs.existsSync(filePath)) continue;

        if (att.type === 'image' || mimeType.startsWith('image/')) {
          // Images: read as base64 for vision models
          const buffer = fs.readFileSync(filePath);
          resolved.push({
            type: 'image',
            mimeType,
            data: buffer.toString('base64'),
            filename,
          });
        } else {
          // Documents: extract text content
          const textContent = this.extractTextFromFile(filePath, mimeType, filename);
          if (textContent) {
            resolved.push({
              type: 'file',
              mimeType,
              textContent,
              filename,
            });
          }
        }
      } catch {
        // Skip unreadable attachments
      }
    }

    return resolved;
  }

  private resolveFilePath(uri: string): string | null {
    // URI format: /api/uploads/filename.ext
    const match = uri.match(/\/api\/uploads\/(.+)$/);
    if (!match) return null;
    const path = require('path');
    return path.join(process.cwd(), 'uploads', match[1]);
  }

  private extractTextFromFile(filePath: string, mimeType: string, filename: string): string | null {
    const fs = require('fs');

    if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/json') {
      const text = fs.readFileSync(filePath, 'utf-8');
      return text.slice(0, 50000); // Cap at 50k chars
    }

    if (mimeType === 'application/pdf') {
      // For PDFs we return a placeholder — full PDF parsing would require a library
      // The AI will still get the filename context and user's question
      return `[PDF document: ${filename}]\n(PDF text extraction requires the user to copy-paste content or use OCR. The file has been uploaded successfully.)`;
    }

    // Excel files — return a note about the file
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return `[Excel file: ${filename}]\n(Spreadsheet uploaded. For best results, export as CSV and re-upload, or describe what data you need extracted.)`;
    }

    return null;
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
- If the user asks something that needs data from another agent's domain, DO NOT tell the user to "go ask" that agent. Instead, coordinate with the other agent directly — you have inter-agent communication. The user should never be a middleman between agents.
- Use markdown formatting sparingly (bold for key info, numbered lists for data).
- Be conversational and friendly, not robotic.
- If you can take action (like tracking a price, logging an expense, etc.), tell the user you're doing it.
- Never say "I'm just an AI" or "I can't actually do that" — you ARE the agent, act like it.
- When you receive data from another agent via delegation, incorporate it naturally into your response. Present a unified answer, not separate agent outputs.`;

    if (activeAgents) {
      prompt += `\n\nOther active agents (you can delegate to them automatically — never ask the user to relay messages):\n${activeAgents}`;
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

  /**
   * Delegate a task to another agent and get its response.
   * This enables true inter-agent communication — agents talk to each other
   * instead of asking the user to relay messages.
   *
   * @param targetAgentId - The agent to delegate to (e.g., 'email', 'finance')
   * @param request - Natural language request for the target agent
   * @param context - Current agent context
   * @returns The target agent's response, or null if delegation failed
   */
  protected async delegateToAgent(
    targetAgentId: string,
    request: string,
    context: AgentContext
  ): Promise<AgentResponse | null> {
    try {
      const result = await context.sendToAgent(targetAgentId, request);
      if (result) {
        // Store the delegation result in shared memory so other agents can also benefit
        context.remember(
          `delegation_${targetAgentId}_${Date.now()}`,
          { from: this.manifest.id, to: targetAgentId, request, summary: result.content.slice(0, 300) },
          'cross_ref'
        );
      }
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Automatically resolve cross-agent data needs.
   * Instead of telling the user "go ask Email Manager", this method
   * actually delegates to the other agent and incorporates the result.
   */
  protected async resolveWithDelegation(
    intent: UserIntent,
    context: AgentContext,
    mainContent: string,
    options?: Partial<Omit<AgentResponse, 'agentId' | 'timestamp'>>
  ): Promise<AgentResponse> {
    const activeAgents = context.listActiveAgents();
    const delegationResults: string[] = [];

    // For each data source that maps to another agent, delegate to it
    for (const source of intent.dataSources) {
      const sourceAgent = activeAgents.find(
        a => a.id === source || a.description.toLowerCase().includes(source)
      );
      if (sourceAgent && sourceAgent.id !== this.manifest.id) {
        const delegateRequest = this.buildDelegationRequest(intent, source);
        const result = await this.delegateToAgent(sourceAgent.id, delegateRequest, context);
        if (result) {
          delegationResults.push(`**Data from ${sourceAgent.name}:**\n${result.content}`);
        }
      }
    }

    // For cross-agent references, also try delegation
    for (const ref of intent.crossAgentRefs) {
      if (intent.dataSources.includes(ref)) continue; // Already handled
      const refAgent = activeAgents.find(a => a.id === ref);
      if (refAgent && refAgent.id !== this.manifest.id) {
        const delegateRequest = this.buildDelegationRequest(intent, ref);
        const result = await this.delegateToAgent(refAgent.id, delegateRequest, context);
        if (result) {
          delegationResults.push(`**Data from ${refAgent.name}:**\n${result.content}`);
        }
      }
    }

    let content = mainContent;
    if (delegationResults.length > 0) {
      content = `${delegationResults.join('\n\n')}\n\n---\n\n${mainContent}`;
    }

    return {
      agentId: this.manifest.id,
      content,
      actions: options?.actions ?? [],
      suggestions: options?.suggestions ?? [],
      timestamp: new Date(),
    };
  }

  /**
   * Build a natural language delegation request based on the intent and data source.
   */
  private buildDelegationRequest(intent: UserIntent, source: string): string {
    const topic = intent.primaryTopic;
    const action = intent.primaryAction;

    if (source === 'email') {
      return `Search emails for anything related to: ${topic}. Show transactions, bills, or statements if found.`;
    }
    if (source === 'finance') {
      return `Show financial data related to: ${topic}. Include expenses, EMIs, or income if relevant.`;
    }
    return `${action || 'Find'} data related to: ${topic}`;
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

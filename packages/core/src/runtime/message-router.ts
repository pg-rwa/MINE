import { Message, AgentResponse } from '../types';
import { AgentRuntime } from './agent-runtime';
import { AIEngine } from '../ai/ai-engine';

/**
 * Routes natural language messages to the correct agent.
 *
 * "Pay my electricity bill" → utility agent
 * "How's my portfolio doing?" → trading agent
 * "Plan dinner for 4" → cooking agent
 * "Check my mails and find my EMIs" → routes to finance, with cross-agent context
 */
export class MessageRouter {
  private runtime: AgentRuntime;
  private aiEngine: AIEngine;

  constructor(runtime: AgentRuntime, aiEngine: AIEngine) {
    this.runtime = runtime;
    this.aiEngine = aiEngine;
  }

  /**
   * Route a message to the appropriate agent and return its response.
   * If agentId is specified in the message, routes directly.
   * Otherwise, uses intent analysis to determine the best agent.
   */
  async route(message: Message): Promise<AgentResponse> {
    let targetAgentId = message.agentId;

    if (!targetAgentId) {
      targetAgentId = await this.resolveAgent(message);
    }

    if (!targetAgentId) {
      return {
        agentId: 'system',
        content: "I'm not sure which agent should handle that. Could you be more specific, or tell me which area this relates to?",
        actions: [],
        suggestions: this.getSuggestions(),
        timestamp: new Date(),
      };
    }

    return this.runtime.handleMessage(targetAgentId, {
      ...message,
      agentId: targetAgentId,
    });
  }

  /**
   * Use intent analysis to determine which agent should handle a message.
   * Considers compound requests that span multiple domains.
   */
  private async resolveAgent(message: Message): Promise<string | undefined> {
    const activeAgents = this.runtime.listAgents().filter((a) => a.active);

    if (activeAgents.length === 0) return undefined;

    // Use intent analysis for smarter routing
    const intent = this.aiEngine.analyzeIntent(message.content);

    // If the intent clearly maps to a domain, use that
    if (intent.confidence > 0.5) {
      // Check sub-requests to find the primary domain
      const primaryDomain = this.findPrimaryDomain(intent, activeAgents);
      if (primaryDomain) return primaryDomain;
    }

    // Fall back to keyword matching against agent capabilities
    const scored = activeAgents.map(a => {
      const keywords = a.manifest.capabilities.flatMap(c => c.keywords);
      const lower = message.content.toLowerCase();
      const matchCount = keywords.filter(kw => lower.includes(kw)).length;
      return { id: a.manifest.id, score: matchCount };
    }).filter(a => a.score > 0).sort((a, b) => b.score - a.score);

    if (scored.length > 0) return scored[0].id;

    // Last resort: use AI completion for routing
    const agentDescriptions = activeAgents
      .map((a) => `- ${a.manifest.id}: ${a.manifest.description} [keywords: ${a.manifest.capabilities.flatMap((c) => c.keywords).join(', ')}]`)
      .join('\n');

    const prompt = `Given the user message and available agents, return ONLY the agent ID that should handle this message. If no agent fits, return "none".

Available agents:
${agentDescriptions}

User message: "${message.content}"

Agent ID:`;

    const result = await this.aiEngine.complete(prompt);
    const agentId = result.trim().toLowerCase().replace(/['"]/g, '');

    if (agentId === 'none') return undefined;

    const exists = activeAgents.some((a) => a.manifest.id === agentId);
    return exists ? agentId : undefined;
  }

  /**
   * For compound requests, find the most actionable domain.
   * E.g., "check my mails and find EMIs" → primary is finance (the actionable part),
   * email is a data source (noted in cross-agent context).
   */
  private findPrimaryDomain(
    intent: ReturnType<AIEngine['analyzeIntent']>,
    activeAgents: Array<{ manifest: { id: string; capabilities: Array<{ keywords: string[] }> } }>
  ): string | undefined {
    const activeIds = new Set(activeAgents.map(a => a.manifest.id));

    // If there are multiple sub-requests, find the one with the most actionable domain
    if (intent.subRequests.length > 1) {
      // Prioritize the sub-request whose domain is active and has data-oriented action
      const actionable = intent.subRequests
        .filter(sr => sr.agentDomain && activeIds.has(sr.agentDomain))
        .sort((a, b) => {
          // Prefer 'view', 'check', 'analyze' over 'add', 'delete' for routing
          const actionPriority: Record<string, number> = { view: 3, check: 2, analyze: 2, add: 1, delete: 0 };
          return (actionPriority[b.action] ?? 1) - (actionPriority[a.action] ?? 1);
        });

      if (actionable.length > 0) return actionable[0].agentDomain;
    }

    // Single request — match primary topic to agent
    for (const agent of activeAgents) {
      const keywords = agent.manifest.capabilities.flatMap(c => c.keywords);
      if (keywords.some(kw => intent.primaryTopic.includes(kw) || kw.includes(intent.primaryTopic))) {
        return agent.manifest.id;
      }
    }

    return undefined;
  }

  private getSuggestions(): string[] {
    return this.runtime
      .listAgents()
      .filter((a) => a.active)
      .slice(0, 5)
      .map((a) => a.manifest.name);
  }
}

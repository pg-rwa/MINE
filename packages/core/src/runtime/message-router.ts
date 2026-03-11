import { Message, AgentResponse } from '../types';
import { AgentRuntime } from './agent-runtime';
import { AIEngine } from '../ai/ai-engine';

/**
 * Routes natural language messages to the correct agent.
 *
 * "Pay my electricity bill" → utility agent
 * "How's my portfolio doing?" → trading agent
 * "Plan dinner for 4" → cooking agent
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
   * Otherwise, uses AI to determine the best agent.
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
   * Use AI to determine which agent should handle a message.
   */
  private async resolveAgent(message: Message): Promise<string | null> {
    const activeAgents = this.runtime.listAgents().filter((a) => a.active);

    if (activeAgents.length === 0) return null;

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

    if (agentId === 'none') return null;

    const exists = activeAgents.some((a) => a.manifest.id === agentId);
    return exists ? agentId : null;
  }

  private getSuggestions(): string[] {
    return this.runtime
      .listAgents()
      .filter((a) => a.active)
      .slice(0, 5)
      .map((a) => a.manifest.name);
  }
}

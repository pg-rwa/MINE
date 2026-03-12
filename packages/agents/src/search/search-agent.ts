import { AgentManifest, Message, AgentContext, AgentResponse } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class SearchAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'search',
    name: 'Universal Search',
    description: 'Search across all your data, the web, and connected apps. Your personal knowledge engine.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'search',
    category: 'utility',
    capabilities: [
      { id: 'search_data', name: 'Data Search', description: 'Search across all your MINE data', keywords: ['search', 'find', 'where', 'look up', 'locate'] },
      { id: 'web_search', name: 'Web Search', description: 'Search the web with AI summaries', keywords: ['google', 'search web', 'look up online'] },
      { id: 'knowledge', name: 'Knowledge Base', description: 'Build personal knowledge from your data', keywords: ['remember', 'recall', 'what did I', 'history'] },
    ],
    widgets: [
      { id: 'recent_searches', name: 'Recent Searches', size: 'small' },
    ],
    requiredPermissions: ['bookmarks', 'notes'],
    optionalPermissions: ['documents', 'emails', 'contacts'],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const intent = this.analyzeIntent(message, context);

    // Try AI first for contextual responses
    const aiResponse = await this.generateAIResponse(message, context);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Search my data only', 'Search web only', 'Search documents', 'Search contacts'] });
    }

    // If the query relates to a specific agent domain, suggest that agent
    if (intent.crossAgentRefs.length > 0 || intent.subRequests.some(sr => sr.agentDomain)) {
      const domains = intent.crossAgentRefs.length > 0
        ? intent.crossAgentRefs
        : intent.subRequests.filter(sr => sr.agentDomain).map(sr => sr.agentDomain!);

      const activeAgents = context.listActiveAgents();
      const relevantAgents = activeAgents.filter(a => domains.includes(a.id));

      if (relevantAgents.length > 0) {
        const agentNames = relevantAgents.map(a => `**${a.name}**`).join(', ');
        return this.respond(
          `I'll search your data for: "${message.content}"\n\nTip: ${agentNames} can give you more detailed, specialized results for this query.`,
          {
            suggestions: [
              ...relevantAgents.map(a => `Ask ${a.name}`),
              'Search my data only',
              'Search web',
            ],
          }
        );
      }
    }

    return this.respond(`Searching across your data and the web for: "${message.content}"`, {
      suggestions: ['Search my data only', 'Search web only', 'Search documents', 'Search contacts'],
    });
  }
}

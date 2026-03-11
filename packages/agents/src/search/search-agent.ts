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
    // Search agent handles anything that doesn't match other agents
    return this.respond(`Searching across your data and the web for: "${message.content}"`, {
      suggestions: ['Search my data only', 'Search web only', 'Search documents', 'Search contacts'],
    });
  }
}

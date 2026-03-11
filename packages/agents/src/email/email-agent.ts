import { AgentManifest, Message, AgentContext, AgentResponse, Insight } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class EmailAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'email',
    name: 'Email Manager',
    description: 'Summarize emails, draft replies, manage subscriptions, flag important messages, and declutter your inbox.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'mail',
    category: 'productivity',
    capabilities: [
      { id: 'summarize', name: 'Email Summary', description: 'AI summary of unread emails', keywords: ['email', 'inbox', 'unread', 'mail', 'summary'] },
      { id: 'draft', name: 'Draft Replies', description: 'AI-drafted email responses', keywords: ['reply', 'respond', 'draft', 'write email'] },
      { id: 'unsubscribe', name: 'Subscription Manager', description: 'Find and unsubscribe from newsletters', keywords: ['unsubscribe', 'spam', 'newsletter', 'cleanup'] },
    ],
    widgets: [
      { id: 'inbox_summary', name: 'Inbox Summary', size: 'small' },
    ],
    requiredPermissions: ['emails'],
    optionalPermissions: ['contacts'],
    requiredPlan: 'premium',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    if (content.includes('summarize') || content.includes('unread')) {
      return this.respond("Here's a summary of your unread emails, grouped by priority.", {
        suggestions: ['Show urgent only', 'Reply to top email', 'Mark all as read'],
      });
    }
    if (content.includes('draft') || content.includes('reply') || content.includes('write')) {
      return this.respond("I'll draft a reply. Which email should I respond to, and what's the gist?");
    }
    if (content.includes('unsubscribe') || content.includes('cleanup')) {
      return this.respond("I found 23 newsletter subscriptions. Want me to show them so you can pick which to unsubscribe from?", {
        suggestions: ['Show all', 'Auto-detect junk', 'Keep important only'],
      });
    }

    return this.respond("I help manage your email — summaries, drafts, and inbox cleanup.", {
      suggestions: ['Summarize inbox', 'Draft an email', 'Cleanup subscriptions'],
    });
  }
}

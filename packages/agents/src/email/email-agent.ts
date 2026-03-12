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
      { id: 'search_emails', name: 'Email Search', description: 'Find specific emails by topic or sender', keywords: ['find email', 'search mail', 'look for', 'check mail'] },
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
    const intent = this.analyzeIntent(message, context);

    // Try AI first for contextual responses
    const aiResponse = await this.generateAIResponse(message, context);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Summarize inbox', 'Find specific emails', 'Draft an email', 'Cleanup subscriptions'] });
    }

    // User wants to find specific types of emails (e.g., "find EMI-related mails")
    if (intent.crossAgentRefs.length > 0 || this.isTopicSearch(content)) {
      return this.handleTopicSearch(message, context, intent);
    }

    if (content.includes('summarize') || content.includes('unread') || content.includes('summary')) {
      return this.handleSummarize(message, context, intent);
    }
    if (content.includes('draft') || content.includes('reply') || content.includes('write')) {
      return this.respond("I'll draft a reply. Which email should I respond to, and what's the gist?", {
        suggestions: ['Reply to latest', 'New email', 'Follow up'],
      });
    }
    if (content.includes('unsubscribe') || content.includes('cleanup')) {
      return this.respond("I found 23 newsletter subscriptions. Want me to show them so you can pick which to unsubscribe from?", {
        suggestions: ['Show all', 'Auto-detect junk', 'Keep important only'],
      });
    }

    return this.respondWithContext(intent, context,
      "I help manage your email — summaries, drafts, email search, and inbox cleanup.", {
        suggestions: ['Summarize inbox', 'Find specific emails', 'Draft an email', 'Cleanup subscriptions'],
      });
  }

  /**
   * Check if the user wants to search emails for a specific topic.
   */
  private isTopicSearch(content: string): boolean {
    const searchPatterns = ['find', 'search', 'look for', 'check', 'scan', 'any mail about', 'emails about', 'mails about', 'mail from'];
    return searchPatterns.some(p => content.includes(p));
  }

  /**
   * Handle topic-based email search, e.g., "find EMI-related emails" or "check mails about loans".
   */
  private handleTopicSearch(message: Message, context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): AgentResponse {
    const topics = intent.crossAgentRefs;
    const topicNames = topics.length > 0 ? topics.join(', ') : intent.primaryTopic;

    // Acknowledge the cross-domain search
    const crossNote = this.getCrossAgentContext(intent, context);
    let responseText = `I'll scan your inbox for emails related to **${topicNames}**.\n\n`;
    responseText += `Found 3 relevant emails:\n\n`;
    responseText += `1. **Bank EMI Statement** — from noreply@bank.com (2 days ago)\n`;
    responseText += `   _"Your EMI of $1,200 has been debited..."_\n\n`;
    responseText += `2. **Loan Approval Confirmation** — from loans@bank.com (1 week ago)\n`;
    responseText += `   _"Congratulations! Your car loan has been approved..."_\n\n`;
    responseText += `3. **EMI Due Reminder** — from alerts@bank.com (3 weeks ago)\n`;
    responseText += `   _"Reminder: Your next EMI payment of $1,200 is due on the 5th..."_`;

    if (crossNote) {
      responseText += `\n\n${crossNote}`;
    }

    return this.respond(responseText, {
      suggestions: ['Show full email', 'Forward to Finance agent', 'Search for more', 'Summarize inbox'],
    });
  }

  private handleSummarize(message: Message, context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): AgentResponse {
    return this.respondWithContext(intent, context,
      "Here's a summary of your unread emails:\n\n" +
      "**Urgent (2)**\n" +
      "- Bank alert: EMI payment processed\n" +
      "- Work: Meeting rescheduled to 3 PM\n\n" +
      "**Regular (5)**\n" +
      "- Amazon: Order shipped\n" +
      "- Newsletter: Weekly tech digest\n" +
      "- Reminder: Doctor appointment tomorrow\n" +
      "- 2 more promotional emails", {
        suggestions: ['Show urgent only', 'Reply to top email', 'Mark all as read'],
      });
  }
}

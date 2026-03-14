import { AgentManifest, Message, AgentContext, AgentResponse, Insight, VaultEntry } from '@mine/core';
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
      { id: 'summarize', name: 'Email Summary', description: 'AI summary of recent email-derived data', keywords: ['email', 'inbox', 'unread', 'mail', 'summary'] },
      { id: 'draft', name: 'Draft Replies', description: 'AI-drafted email responses', keywords: ['reply', 'respond', 'draft', 'write email'] },
      { id: 'unsubscribe', name: 'Subscription Manager', description: 'Find and unsubscribe from newsletters', keywords: ['unsubscribe', 'spam', 'newsletter', 'cleanup'] },
      { id: 'search_emails', name: 'Email Search', description: 'Find specific emails by topic or sender', keywords: ['find email', 'search mail', 'look for', 'check mail'] },
      { id: 'transactions', name: 'Transaction Alerts', description: 'Show bank transactions detected from emails', keywords: ['transaction', 'bank', 'debit', 'credit', 'payment'] },
      { id: 'orders', name: 'Order Tracking', description: 'Show orders and deliveries detected from emails', keywords: ['order', 'delivery', 'shipped', 'amazon', 'flipkart'] },
    ],
    widgets: [
      { id: 'inbox_summary', name: 'Inbox Summary', size: 'small' },
    ],
    requiredPermissions: ['emails'],
    optionalPermissions: ['contacts', 'transactions', 'orders', 'bills', 'income'],
    requiredPlan: 'premium',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();
    const intent = this.analyzeIntent(message, context);

    // Route to specific handlers based on intent
    if (content.includes('transaction') || content.includes('bank') || content.includes('debit') || content.includes('credit')) {
      return this.handleTransactions(context, intent);
    }
    if (content.includes('order') || content.includes('delivery') || content.includes('shipped')) {
      return this.handleOrders(context, intent);
    }
    if (content.includes('bill') || content.includes('invoice')) {
      return this.handleBills(context, intent);
    }
    if (content.includes('salary') || content.includes('income')) {
      return this.handleIncome(context, intent);
    }
    if (content.includes('summarize') || content.includes('unread') || content.includes('summary') || content.includes('inbox')) {
      return this.handleSummarize(message, context);
    }
    if (content.includes('draft') || content.includes('reply') || content.includes('write')) {
      return this.respond("I'll draft a reply. Which email should I respond to, and what's the gist?", {
        suggestions: ['Reply to latest', 'New email', 'Follow up'],
      });
    }
    if (content.includes('unsubscribe') || content.includes('cleanup')) {
      return this.respond("I can scan your synced emails for newsletter patterns. Want me to check?", {
        suggestions: ['Scan for newsletters', 'Show all subscriptions'],
      });
    }

    // Cross-domain search
    if (intent.crossAgentRefs.length > 0 || this.isTopicSearch(content)) {
      return this.handleTopicSearch(message, context, intent);
    }

    // Try AI for anything else
    const vaultSummary = this.getEmailDataSummary(context);
    const aiResponse = await this.generateAIResponse(message, context, vaultSummary);
    if (aiResponse) {
      return this.respond(aiResponse, {
        suggestions: ['Summarize inbox', 'Show transactions', 'Show orders', 'Check bills'],
      });
    }

    return this.respondWithContext(intent, context,
      "I help manage your email — summaries, transaction tracking, order updates, and more.\n\n" +
      "Connect Gmail first via **Settings → Integrations** to get real data.", {
        suggestions: ['Summarize inbox', 'Show transactions', 'Show orders', 'Check bills'],
      });
  }

  // ─── Transaction Alerts ──────────────────────────────

  private handleTransactions(context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): AgentResponse {
    const entries = this.safeGetVault(context, 'transactions');

    if (entries.length === 0) {
      return this.respond(
        "No transactions found from email sync yet.\n\n" +
        "Connect Gmail via **Settings → Integrations** to auto-detect bank alerts.",
        { suggestions: ['Connect Gmail', 'Summarize inbox'] }
      );
    }

    const recent = entries.slice(0, 10);
    let text = `**${entries.length} transaction(s) detected from emails:**\n\n`;

    for (const entry of recent) {
      const d = entry.data;
      const emoji = d.type === 'credit' ? '🟢' : '🔴';
      const amount = typeof d.amount === 'number' ? d.amount.toLocaleString() : d.amount;
      text += `${emoji} **${d.type === 'credit' ? '+' : '-'}₹${amount}** — ${d.description || 'Transaction'}\n`;
      text += `   ${d.date ? new Date(d.date as string).toLocaleDateString() : ''} • ${d.source || ''}\n\n`;
    }

    if (entries.length > 10) {
      text += `_...and ${entries.length - 10} more_`;
    }

    return this.respondWithContext(intent, context, text, {
      suggestions: ['Show credits only', 'Show debits only', 'Total this month', 'Summarize inbox'],
    });
  }

  // ─── Order Tracking ──────────────────────────────────

  private handleOrders(context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): AgentResponse {
    const entries = this.safeGetVault(context, 'orders');

    if (entries.length === 0) {
      return this.respond(
        "No orders found from email sync yet.\n\nConnect Gmail to auto-detect Amazon, Flipkart, Swiggy orders.",
        { suggestions: ['Connect Gmail', 'Summarize inbox'] }
      );
    }

    const recent = entries.slice(0, 8);
    let text = `**${entries.length} order(s) detected from emails:**\n\n`;

    for (const entry of recent) {
      const d = entry.data;
      const statusEmoji = d.status === 'shipped' ? '🚚' : '📦';
      text += `${statusEmoji} **${d.platform || 'Online'}** — Order #${d.orderId || 'N/A'}\n`;
      text += `   ₹${typeof d.amount === 'number' ? d.amount.toLocaleString() : d.amount || '?'} • ${d.status || 'confirmed'}\n\n`;
    }

    return this.respondWithContext(intent, context, text, {
      suggestions: ['Track deliveries', 'Show this month', 'Total spending'],
    });
  }

  // ─── Bills ───────────────────────────────────────────

  private handleBills(context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): AgentResponse {
    const entries = this.safeGetVault(context, 'bills');

    if (entries.length === 0) {
      return this.respond(
        "No bills detected from emails yet.\nConnect Gmail to auto-detect utility bills, invoices, and reminders.",
        { suggestions: ['Connect Gmail'] }
      );
    }

    let text = `**${entries.length} bill(s) detected from emails:**\n\n`;
    for (const entry of entries.slice(0, 8)) {
      const d = entry.data;
      text += `📄 **${d.name}** — ₹${typeof d.amount === 'number' ? d.amount.toLocaleString() : d.amount || '?'}\n`;
      text += `   ${d.provider || ''} • ${d.date ? new Date(d.date as string).toLocaleDateString() : ''}\n\n`;
    }

    return this.respondWithContext(intent, context, text, {
      suggestions: ['Total bills this month', 'Upcoming due dates'],
    });
  }

  // ─── Income ──────────────────────────────────────────

  private handleIncome(context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): AgentResponse {
    const entries = this.safeGetVault(context, 'income');

    if (entries.length === 0) {
      return this.respond(
        "No salary/income data detected from emails yet.\nConnect Gmail to auto-detect salary credit alerts.",
        { suggestions: ['Connect Gmail'] }
      );
    }

    let text = `**${entries.length} income entry/entries detected from emails:**\n\n`;
    for (const entry of entries.slice(0, 5)) {
      const d = entry.data;
      text += `💰 **₹${typeof d.amount === 'number' ? d.amount.toLocaleString() : d.amount}** — ${d.type || 'Income'}\n`;
      text += `   ${d.recurring || ''} • ${d.date ? new Date(d.date as string).toLocaleDateString() : ''}\n\n`;
    }

    return this.respondWithContext(intent, context, text, {
      suggestions: ['Income trend', 'Compare months'],
    });
  }

  // ─── AI-Powered Summarize ────────────────────────────

  private async handleSummarize(message: Message, context: AgentContext): Promise<AgentResponse> {
    const vaultSummary = this.getEmailDataSummary(context);

    if (!vaultSummary) {
      return this.respond(
        "No email data synced yet. Connect Gmail first to get AI-powered summaries.\n\n" +
        "Go to **Settings → Integrations → Gmail** to connect.",
        { suggestions: ['Connect Gmail'] }
      );
    }

    // Use AI to summarize the vault data
    if (context.aiEngine.isAvailable) {
      const aiSummary = await context.aiEngine.chat(
        `You are the Email Manager agent inside MINE, a personal assistant app.
The user wants a summary of their email-derived data. Summarize the following data concisely.
Group by category (transactions, orders, bills, income). Highlight anything urgent or notable.
Use markdown formatting. Keep it under 200 words.`,
        `Here is the user's email-synced data:\n\n${vaultSummary}`,
        { maxTokens: 512, tier: 'smart' }
      );

      if (aiSummary) {
        return this.respond(aiSummary, {
          suggestions: ['Show transactions', 'Show orders', 'Check bills', 'Show income'],
        });
      }
    }

    // Fallback: structured summary without AI
    return this.respond(
      `**Email Data Summary**\n\n${vaultSummary}`,
      { suggestions: ['Show transactions', 'Show orders', 'Check bills', 'Show income'] }
    );
  }

  // ─── Topic Search ────────────────────────────────────

  private isTopicSearch(content: string): boolean {
    const searchPatterns = ['find', 'search', 'look for', 'check', 'scan', 'any mail about', 'emails about', 'mails about', 'mail from'];
    return searchPatterns.some(p => content.includes(p));
  }

  private handleTopicSearch(
    message: Message,
    context: AgentContext,
    intent: ReturnType<typeof this.analyzeIntent>
  ): AgentResponse {
    const topics = intent.crossAgentRefs;
    const topicNames = topics.length > 0 ? topics.join(', ') : intent.primaryTopic;

    // Search across all email-derived categories
    const allEntries: VaultEntry[] = [];
    for (const category of ['transactions', 'orders', 'bills', 'income', 'expenses'] as const) {
      const entries = this.safeGetVault(context, category);
      allEntries.push(...entries);
    }

    if (allEntries.length === 0) {
      return this.respond(
        `No email data found to search for "${topicNames}". Connect Gmail to start syncing.`,
        { suggestions: ['Connect Gmail'] }
      );
    }

    // Filter entries by keyword match
    const keyword = topicNames.toLowerCase();
    const matched = allEntries.filter(e => {
      const text = JSON.stringify(e.data).toLowerCase();
      return text.includes(keyword);
    });

    const crossNote = this.getCrossAgentContext(intent, context);
    let responseText: string;

    if (matched.length === 0) {
      responseText = `No results for "${topicNames}" in your synced email data (${allEntries.length} total entries).`;
    } else {
      responseText = `Found **${matched.length}** result(s) for "${topicNames}":\n\n`;
      for (const entry of matched.slice(0, 5)) {
        responseText += `- **[${entry.category}]** ${entry.data.description || entry.data.name || entry.data.subject || entry.key}\n`;
      }
    }

    if (crossNote) {
      responseText += `\n\n${crossNote}`;
    }

    return this.respond(responseText, {
      suggestions: ['Search for more', 'Summarize inbox', 'Show all transactions'],
    });
  }

  // ─── Insights ────────────────────────────────────────

  async getInsights(context: AgentContext): Promise<Insight[]> {
    const insights: Insight[] = [];

    const transactions = this.safeGetVault(context, 'transactions');
    const recentDebits = transactions.filter(
      e => e.data.type === 'debit' && e.createdAt.getTime() > Date.now() - 24 * 60 * 60 * 1000
    );

    if (recentDebits.length > 0) {
      const total = recentDebits.reduce((sum, e) => sum + (typeof e.data.amount === 'number' ? e.data.amount : 0), 0);
      insights.push(this.insight(
        'Recent Debits',
        `${recentDebits.length} debit(s) totaling ₹${total.toLocaleString()} in the last 24 hours.`,
        total > 10000 ? 'high' : 'medium'
      ));
    }

    const orders = this.safeGetVault(context, 'orders');
    const shipped = orders.filter(e => e.data.status === 'shipped');
    if (shipped.length > 0) {
      insights.push(this.insight(
        'Deliveries In Transit',
        `${shipped.length} order(s) currently shipping.`,
        'low'
      ));
    }

    return insights;
  }

  // ─── Vault Helpers ───────────────────────────────────

  /**
   * Safely read from vault — returns empty array if no permission or no data.
   */
  private safeGetVault(context: AgentContext, category: string): VaultEntry[] {
    try {
      return context.vault.getForAgent(context.userId, context.agentId, category as any);
    } catch {
      return [];
    }
  }

  /**
   * Build a text summary of all email-derived data in the vault.
   */
  private getEmailDataSummary(context: AgentContext): string {
    const categories = ['transactions', 'orders', 'bills', 'income', 'expenses'] as const;
    const parts: string[] = [];

    for (const category of categories) {
      const entries = this.safeGetVault(context, category);
      if (entries.length > 0) {
        const preview = entries.slice(0, 5).map(e => JSON.stringify(e.data)).join('\n');
        parts.push(`**${category}** (${entries.length} entries):\n${preview}`);
      }
    }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }
}

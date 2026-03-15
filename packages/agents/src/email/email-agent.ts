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

  // ─── Bank / Institution Aliases ─────────────────────
  private static readonly BANK_ALIASES: Record<string, string[]> = {
    'sharjah islamic bank': ['sib', 'sharjah islamic', 'sib.ae'],
    'emirates nbd': ['enbd', 'emirates nbd', 'emiratesnbd'],
    'adcb': ['abu dhabi commercial', 'adcb'],
    'mashreq': ['mashreq', 'mashreqbank'],
    'dib': ['dubai islamic', 'dib'],
    'fab': ['first abu dhabi', 'fab'],
    'rakbank': ['rak bank', 'rakbank'],
    'hdfc': ['hdfc bank', 'hdfcbank'],
    'icici': ['icici bank', 'icicibank'],
    'sbi': ['state bank', 'sbi'],
    'axis': ['axis bank', 'axisbank'],
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();
    const intent = this.analyzeIntent(message, context);

    // ─── Handle user clicking a search result ("open:KEY") ───
    const openMatch = message.content.match(/^open:(.+)$/);
    if (openMatch) {
      const key = openMatch[1];
      return this.handleResultSelection(key, context);
    }

    // ─── Handle password input for a pending statement ───
    const pendingStmt = context.recall('context').find(m => m.key === 'pending_statement' && (m.value as any)?.waitingForPassword);
    if (pendingStmt) {
      const pendingData = pendingStmt.value as { statementKey: string; bankName?: string; keywords: string[]; messageId?: string; attachmentId?: string; filename?: string };
      // User might be providing a password (short input, not a question/command)
      const looksLikePassword = content.length <= 30 && !content.includes('skip') && !content.includes('show') &&
        !content.includes('search') && !content.includes('help') && !/^(yes|no|ok|cancel)$/i.test(content.trim());
      if (looksLikePassword) {
        return this.handleStatementPasswordAttempt(message.content.trim(), pendingData, context);
      }
      // Clear the pending state if user moved on
      context.remember('pending_statement', { ...pendingData, waitingForPassword: false }, 'context');
    }

    // Route to specific handlers based on intent
    if (content.includes('statement') || content.includes('loan') || content.includes('emi')) {
      return this.handleStatementRequest(message, context, intent);
    }
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

    // Smart keyword search — extract entity names and search Gmail directly
    const keywords = this.extractSearchKeywords(content);
    if (keywords.length > 0) {
      const gmail = context.checkIntegration('gmail');
      if (gmail.connected) {
        return this.handleSmartSearch(keywords, context, intent);
      }
    }

    // Cross-domain search — delegate to other agents if needed
    if (intent.crossAgentRefs.length > 0 || this.isTopicSearch(content)) {
      if (intent.dataSources.length > 0 || intent.crossAgentRefs.length > 0) {
        return this.handleTopicSearchWithDelegation(message, context, intent);
      }
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

    const gmail = context.checkIntegration('gmail');
    if (gmail.connected) {
      return this.respondWithContext(intent, context,
        "I help manage your email — summaries, transaction tracking, order updates, and more.\n\n" +
        "Gmail is connected. Try asking me about transactions, orders, or bills!", {
          suggestions: ['Summarize inbox', 'Show transactions', 'Show orders', 'Check bills'],
        });
    }
    return this.respondWithContext(intent, context,
      "I help manage your email — summaries, transaction tracking, order updates, and more.\n\n" +
      "Connect Gmail first via **Settings → Integrations** to get real data.", {
        suggestions: ['Summarize inbox', 'Show transactions', 'Show orders', 'Check bills'],
      });
  }

  // ─── Smart Keyword Search ───────────────────────────

  /**
   * Extract meaningful search keywords from user's message.
   * Recognizes bank names, financial terms, and entity names.
   */
  private extractSearchKeywords(content: string): string[] {
    const keywords: string[] = [];

    // Check for known bank aliases — these are entity keywords
    for (const [fullName, aliases] of Object.entries(EmailAgent.BANK_ALIASES)) {
      if (aliases.some(a => content.includes(a)) || content.includes(fullName)) {
        keywords.push(fullName);
        // Also add the short alias forms for better Gmail matching
        // e.g. "sib" emails might not say "sharjah islamic bank"
        for (const alias of aliases) {
          if (content.includes(alias)) keywords.push(alias);
        }
      }
    }

    // Extract quoted phrases like "Sharjah Islamic Bank"
    const quoted = content.match(/"([^"]+)"/g);
    if (quoted) {
      keywords.push(...quoted.map(q => q.replace(/"/g, '')));
    }

    // Financial / document type terms — these are type keywords
    // The Gmail adapter will AND these with entity keywords above
    const financialTerms = [
      'statement', 'e-statement', 'loan', 'mortgage', 'emi', 'insurance',
      'investment', 'mutual fund', 'fixed deposit', 'fd', 'rd',
      'credit card', 'balance', 'account summary',
    ];
    for (const term of financialTerms) {
      if (content.includes(term)) keywords.push(term);
    }

    return [...new Set(keywords)];
  }

  /**
   * Split keywords into entity names (banks/companies) vs document types.
   * Used for AND-based filtering: entry must match entity AND type.
   */
  private splitKeywordsByRole(keywords: string[]): { entityKws: string[]; typeKws: string[] } {
    const typeTerms = new Set([
      'statement', 'e-statement', 'loan', 'mortgage', 'emi', 'insurance',
      'investment', 'mutual fund', 'fixed deposit', 'fd', 'rd',
      'credit card', 'balance', 'account summary', 'transaction',
      'bill', 'invoice',
    ]);

    const entityKws: string[] = [];
    const typeKws: string[] = [];

    for (const kw of keywords) {
      if (typeTerms.has(kw.toLowerCase())) {
        typeKws.push(kw);
      } else {
        entityKws.push(kw);
      }
    }

    return { entityKws, typeKws };
  }

  /**
   * Perform on-demand search against Gmail when vault data doesn't have what user needs.
   */
  private async handleSmartSearch(
    keywords: string[],
    context: AgentContext,
    intent: ReturnType<typeof this.analyzeIntent>
  ): Promise<AgentResponse> {
    // First check vault for existing matches
    const allEntries: VaultEntry[] = [];
    for (const category of ['transactions', 'orders', 'bills', 'income', 'expenses'] as const) {
      const entries = this.safeGetVault(context, category);
      allEntries.push(...entries);
    }

    // Use AND logic: entry must match at least one entity keyword AND one type keyword
    // This prevents "SIB statement" from matching random statements from other banks
    const { entityKws, typeKws } = this.splitKeywordsByRole(keywords);
    const vaultMatches = allEntries.filter(e => {
      const text = JSON.stringify(e.data).toLowerCase();
      const matchesEntity = entityKws.length === 0 || entityKws.some(k => text.includes(k.toLowerCase()));
      const matchesType = typeKws.length === 0 || typeKws.some(k => text.includes(k.toLowerCase()));
      return matchesEntity && matchesType;
    });

    // If vault has matches, return those
    if (vaultMatches.length > 0) {
      return this.formatSearchResults(vaultMatches, keywords, intent, context);
    }

    // Otherwise, do a live Gmail search with these keywords
    const liveResults = await context.searchIntegration('gmail', keywords);

    if (liveResults.length > 0) {
      // Store results for later selection
      context.remember('search_results', {
        results: liveResults.slice(0, 15),
        keywords,
        bankName: this.extractBankNameFromKeywords(keywords),
      }, 'context');

      // Build clickable result items
      const actions: Array<{ type: 'select_item'; payload: Record<string, unknown> }> = [];
      for (let i = 0; i < Math.min(liveResults.length, 15); i++) {
        const r = liveResults[i];
        const d = r.data;
        const dateStr = d.date ? new Date(d.date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const hasPdf = d.hasAttachment && (d.attachments as any[])?.some((a: any) =>
          a.name?.toLowerCase().endsWith('.pdf') || a.mimeType === 'application/pdf');
        const icon = d.type === 'credit' ? '🟢' : d.type === 'debit' ? '🔴' : hasPdf ? '📄' : '📧';
        const label = (d.description || d.name || d.subject || r.key) as string;
        const amountStr = d.amount ? `₹${typeof d.amount === 'number' ? (d.amount as number).toLocaleString() : d.amount}` : '';
        const subtitle = [dateStr, amountStr, d.source as string].filter(Boolean).join(' · ');

        actions.push({
          type: 'select_item',
          payload: { key: r.key, label, subtitle, icon, message: `open:${r.key}` },
        });
      }

      const text = `Found **${liveResults.length} result(s)** for "${keywords.join(', ')}". Tap to open:`;
      return this.respond(text, { actions });
    }

    return this.respond(
      `No results found in Gmail for "${keywords.join(', ')}". Try different keywords or check if those emails are in a different account.`,
      { suggestions: ['Try different search', 'Summarize inbox'] }
    );
  }

  private formatSearchResults(
    matches: VaultEntry[],
    keywords: string[],
    intent: ReturnType<typeof this.analyzeIntent>,
    context: AgentContext
  ): AgentResponse {
    // Store results for later selection
    const results = matches.slice(0, 15).map(e => ({ category: e.category, key: e.key, data: e.data }));
    context.remember('search_results', {
      results,
      keywords,
      bankName: this.extractBankNameFromKeywords(keywords),
    }, 'context');

    // Build clickable result items
    const actions: Array<{ type: 'select_item'; payload: Record<string, unknown> }> = [];
    for (const r of results) {
      const d = r.data;
      const dateStr = d.date ? new Date(d.date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const hasPdf = d.hasAttachment && (d.attachments as any[])?.some((a: any) =>
        a.name?.toLowerCase().endsWith('.pdf') || a.mimeType === 'application/pdf');
      const icon = d.type === 'credit' ? '🟢' : d.type === 'debit' ? '🔴' : hasPdf ? '📄' : '📧';
      const label = (d.description || d.name || d.subject || r.key) as string;
      const amountStr = d.amount ? `₹${typeof d.amount === 'number' ? (d.amount as number).toLocaleString() : d.amount}` : '';
      const subtitle = [dateStr, amountStr, `[${r.category}]`].filter(Boolean).join(' · ');

      actions.push({
        type: 'select_item',
        payload: { key: r.key, label, subtitle, icon, message: `open:${r.key}` },
      });
    }

    const text = `Found **${matches.length} result(s)** for "${keywords.join(', ')}". Tap to open:`;
    return this.respond(text, { actions });
  }

  // ─── Statement & Password Handling ──────────────────

  private async handleStatementRequest(
    message: Message,
    context: AgentContext,
    intent: ReturnType<typeof this.analyzeIntent>
  ): Promise<AgentResponse> {
    const content = message.content.toLowerCase();
    const gmail = context.checkIntegration('gmail');

    if (!gmail.connected) {
      return this.respond(
        "Connect Gmail via **Settings → Integrations** to search for bank statements.",
        { suggestions: ['Connect Gmail'] }
      );
    }

    // Extract bank-specific keywords
    const keywords = this.extractSearchKeywords(content);
    keywords.push('statement');

    // Always search Gmail fresh for statements — vault entries may be stale
    // (e.g., missing passwordHint, attachmentIds from older parsing code)
    const liveResults = await context.searchIntegration('gmail', keywords);
    let allResults: Array<{ category: string; key: string; data: Record<string, unknown> }> = liveResults;

    // Fall back to vault only if Gmail returns nothing
    if (allResults.length === 0) {
      const vaultEntries = this.safeGetVault(context, 'transactions');
      const { entityKws } = this.splitKeywordsByRole(keywords);
      const statementEntries = vaultEntries.filter(e => {
        if (e.data.type !== 'statement') return false;
        const text = JSON.stringify(e.data).toLowerCase();
        return entityKws.length === 0 || entityKws.some(k => text.includes(k.toLowerCase()));
      });
      allResults = statementEntries.map(e => ({ category: e.category, key: e.key, data: e.data }));
    }

    if (allResults.length === 0) {
      return this.respond(
        `No statements found for "${keywords.join(', ')}". Make sure the statement emails are in your inbox (not trash/spam).`,
        { suggestions: ['Try different search', 'Show transactions'] }
      );
    }

    // Store results in memory so we can look them up when user clicks one
    context.remember('search_results', {
      results: allResults.slice(0, 15),
      keywords,
      bankName: this.extractBankNameFromKeywords(keywords),
    }, 'context');

    const bankName = this.extractBankNameFromKeywords(keywords);

    // Build clickable result items
    const actions: Array<{ type: 'select_item'; payload: Record<string, unknown> }> = [];
    for (let i = 0; i < Math.min(allResults.length, 15); i++) {
      const r = allResults[i];
      const d = r.data;
      const dateStr = d.date ? new Date(d.date as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      const hasPdf = d.hasAttachment && (d.attachments as any[])?.some((a: any) =>
        a.name?.toLowerCase().endsWith('.pdf') || a.mimeType === 'application/pdf');
      const label = (d.description || d.subject || 'Statement') as string;
      const subtitle = [dateStr, d.source ? `From: ${d.source}` : '', hasPdf ? '📎 PDF attached' : ''].filter(Boolean).join(' · ');

      actions.push({
        type: 'select_item',
        payload: {
          key: r.key,
          label,
          subtitle,
          icon: hasPdf ? '📄' : '📧',
          message: `open:${r.key}`,
        },
      });
    }

    let text = `Found **${allResults.length}${bankName ? ' ' + bankName : ''} statement(s)**. Tap one to open it:`;

    return this.respond(text, { actions });
  }

  /**
   * Handle user clicking on a specific search result.
   * Fetches the email from Gmail, downloads PDF attachment, tries to open it.
   * Only asks for password if the PDF is actually encrypted.
   */
  private async handleResultSelection(key: string, context: AgentContext): Promise<AgentResponse> {
    // Look up the selected result from stored search results
    const stored = context.recall('context').find(m => m.key === 'search_results');
    const searchData = stored?.value as { results: Array<{ key: string; data: Record<string, unknown> }>; keywords: string[]; bankName?: string } | undefined;

    if (!searchData) {
      return this.respond("I don't have those search results anymore. Let me search again.", {
        suggestions: ['Search statements'],
      });
    }

    const selectedResult = searchData.results.find(r => r.key === key);
    if (!selectedResult) {
      return this.respond("Couldn't find that result. It may have expired. Let me search again.", {
        suggestions: ['Search statements'],
      });
    }

    const d = selectedResult.data;
    const bankName = searchData.bankName || '';
    const label = (d.description || d.subject || 'Statement') as string;
    const dateStr = d.date ? new Date(d.date as string).toLocaleDateString() : '';

    const gmail = context.checkIntegration('gmail');
    if (!gmail.connected) {
      return this.respond("Gmail is disconnected. Please reconnect first.", { suggestions: ['Reconnect Gmail'] });
    }

    // Get messageId — either from stored data, or re-search Gmail to find it
    let messageId = d.messageId as string | undefined;
    let attachmentIds = d.attachmentIds as Array<{ id: string; filename: string; mimeType: string }> | undefined;

    // Always re-fetch from Gmail to get fresh data (messageId, attachmentIds, passwordHint)
    // Vault entries may be stale from older parsing code
    {
      const freshResults = await context.searchIntegration('gmail', searchData.keywords);
      const freshMatch = freshResults.find(r => r.key === key);
      if (freshMatch) {
        messageId = freshMatch.data.messageId as string | undefined;
        attachmentIds = freshMatch.data.attachmentIds as Array<{ id: string; filename: string; mimeType: string }> | undefined;
        // Update passwordHint from fresh data
        if (freshMatch.data.passwordHint) {
          d.passwordHint = freshMatch.data.passwordHint;
        }
      }
    }

    const pdfAttachment = attachmentIds?.find(a =>
      a.mimeType === 'application/pdf' || a.filename.toLowerCase().endsWith('.pdf')
    );

    if (!messageId || !pdfAttachment) {
      // No downloadable PDF — show the email content we have
      let text = `**${label}**\n`;
      if (dateStr) text += `Date: ${dateStr}\n`;
      if (d.source) text += `From: ${d.source}\n`;
      text += '\nThis email doesn\'t have a PDF attachment. Here\'s the email content:\n\n';
      const bodyPreview = (d.body as string) || (d.description as string) || 'No content available';
      text += bodyPreview.slice(0, 1000);
      return this.respond(text, { suggestions: ['Search for more', 'Show transactions'] });
    }

    // Download the PDF from Gmail
    try {
      const pdfBuffer = await context.downloadAttachment('gmail', messageId, pdfAttachment.id);
      if (!pdfBuffer) {
        return this.respond(`Failed to download **${pdfAttachment.filename}** from Gmail. Please try again.`, {
          suggestions: ['Try again'],
        });
      }

      // Try to open the PDF WITHOUT a password first
      const parseResult = await this.extractPdfAsync(pdfBuffer, undefined);

      if (parseResult.error === 'password_required') {
        // PDF is encrypted — detect password hint
        let hint = d.passwordHint as string | undefined;

        // If we don't have a hint yet, fetch the email body directly and detect it
        if (!hint && messageId) {
          try {
            const emailData = await context.fetchEmailBody('gmail', messageId);
            if (emailData?.passwordHint) {
              hint = emailData.passwordHint;
            }
          } catch { /* ignore — we'll show generic hints */ }
        }

        context.remember('pending_statement', {
          statementKey: key,
          bankName,
          keywords: searchData.keywords,
          messageId,
          attachmentId: pdfAttachment.id,
          filename: pdfAttachment.filename,
          passwordHint: hint || undefined,
          waitingForPassword: true,
        }, 'context');

        let pwText = `**${label}**\n📎 ${pdfAttachment.filename}\n\n`;
        pwText += `🔒 **This PDF is password-protected.**\n\n`;
        if (hint) {
          pwText += `From the email: **${hint}**\n\n`;
        } else {
          // Only show generic hints if we couldn't extract the actual one
          pwText += `Common passwords for bank statements:\n`;
          pwText += `• Date of birth (DDMMYY or DDMMYYYY)\n`;
          pwText += `• PAN number (e.g., ABCDE1234F)\n`;
          pwText += `• Last 4 digits of account number\n\n`;
        }
        pwText += `**Type the password below** and I'll open it for you.`;

        return this.respond(pwText, {
          suggestions: ['Skip this one', 'Show other results'],
        });
      }

      if (parseResult.error) {
        return this.respond(`Error reading **${pdfAttachment.filename}**: ${parseResult.error}`, {
          suggestions: ['Try again', 'Show other results'],
        });
      }

      // Success — PDF opened without password
      const preview = parseResult.text.length > 2000 ? parseResult.text.slice(0, 2000) + '\n\n_...truncated_' : parseResult.text;

      let successText = `**${bankName ? bankName + ' ' : ''}Statement Opened** (${parseResult.pages} page${parseResult.pages !== 1 ? 's' : ''})\n\n`;
      successText += `📄 **${pdfAttachment.filename}**\n\n`;
      successText += '```\n' + preview + '\n```\n\n';
      successText += 'I can analyze this statement — transactions, balances, or any specific details.';

      context.remember(`statement_text_${key}`, {
        text: parseResult.text,
        pages: parseResult.pages,
        bankName,
        filename: pdfAttachment.filename,
      }, 'context');

      return this.respond(successText, {
        suggestions: ['Summarize transactions', 'Show closing balance', 'List all debits', 'Show monthly summary'],
      });

    } catch (err: any) {
      return this.respond(`Something went wrong downloading the PDF: ${err?.message || 'Unknown error'}`, {
        suggestions: ['Try again', 'Show other results'],
      });
    }
  }

  /**
   * Extract a readable bank name from search keywords for display.
   */
  private extractBankNameFromKeywords(keywords: string[]): string | null {
    for (const [fullName] of Object.entries(EmailAgent.BANK_ALIASES)) {
      if (keywords.some(k => k.toLowerCase() === fullName)) {
        return fullName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }
    return null;
  }

  /**
   * Handle password submission for a pending statement.
   * Downloads the PDF attachment from Gmail and attempts decryption.
   */
  private async handleStatementPasswordAttempt(
    password: string,
    pendingData: { statementKey: string; bankName?: string; keywords: string[]; messageId?: string; attachmentId?: string; filename?: string; passwordHint?: string },
    context: AgentContext
  ): Promise<AgentResponse> {
    // Use stored messageId/attachmentId from context, or fall back to vault
    let messageId = pendingData.messageId;
    let attachmentId = pendingData.attachmentId;
    let filename = pendingData.filename || 'statement.pdf';

    if (!messageId || !attachmentId) {
      const vaultEntries = this.safeGetVault(context, 'transactions');
      const stmt = vaultEntries.find(e => e.key === pendingData.statementKey);
      if (stmt?.data.messageId) {
        messageId = stmt.data.messageId as string;
        const attIds = stmt.data.attachmentIds as Array<{ id: string; filename: string; mimeType: string }> | undefined;
        const pdf = attIds?.find(a => a.mimeType === 'application/pdf' || a.filename.toLowerCase().endsWith('.pdf'));
        attachmentId = pdf?.id;
        filename = pdf?.filename || filename;
      }
    }

    if (!messageId || !attachmentId) {
      context.remember('pending_statement', { ...pendingData, waitingForPassword: false }, 'context');
      return this.respond(
        "I couldn't find the statement to open. Let me search again.",
        { suggestions: ['Search statements again'] }
      );
    }

    const gmail = context.checkIntegration('gmail');
    if (!gmail.connected) {
      return this.respond("Gmail is disconnected. Please reconnect.", { suggestions: ['Reconnect Gmail'] });
    }

    try {
      const pdfBuffer = await context.downloadAttachment('gmail', messageId, attachmentId);
      if (!pdfBuffer) {
        return this.respond("Failed to download the PDF. Please try again.", { suggestions: ['Try again', 'Skip'] });
      }

      const result = await this.extractPdfAsync(pdfBuffer, password);

      if (result.error === 'password_required' || result.error === 'incorrect_password') {
        // Try to get the hint if we don't have one yet
        let hint = pendingData.passwordHint;
        if (!hint && messageId) {
          try {
            const emailData = await context.fetchEmailBody('gmail', messageId);
            if (emailData?.passwordHint) {
              hint = emailData.passwordHint;
              context.remember('pending_statement', { ...pendingData, passwordHint: hint }, 'context');
            }
          } catch { /* ignore */ }
        }

        let retryText = `**Incorrect password.** The PDF couldn't be opened with that password.\n\n`;
        retryText += `_Debug: error="${result.error}", password length=${password.length}_\n\n`;
        if (hint) {
          retryText += `From the email: **${hint}**\n\n`;
          retryText += `Please try again with the correct format.`;
        } else {
          retryText += `Try a different format:\n`;
          retryText += `• Date of birth (DDMMYY or DDMMYYYY)\n`;
          retryText += `• PAN number (e.g., ABCDE1234F)\n`;
          retryText += `• Last 4 digits of account number`;
        }
        return this.respond(retryText, { suggestions: ['Skip this statement'] });
      }

      if (result.error) {
        context.remember('pending_statement', { ...pendingData, waitingForPassword: false }, 'context');
        return this.respond(`Error reading the PDF: ${result.error}`, { suggestions: ['Search for more'] });
      }

      // Success
      context.remember('pending_statement', { ...pendingData, waitingForPassword: false }, 'context');

      const bankLabel = pendingData.bankName || 'Bank';
      const preview = result.text.length > 2000 ? result.text.slice(0, 2000) + '\n\n_...truncated_' : result.text;

      let text = `**${bankLabel} Statement Opened** (${result.pages} page${result.pages !== 1 ? 's' : ''})\n\n`;
      text += `📄 **${filename}**\n\n`;
      text += '```\n' + preview + '\n```\n\n';
      text += 'I can analyze this statement — transactions, balances, or any specific details.';

      context.remember(`statement_text_${pendingData.statementKey}`, {
        text: result.text, pages: result.pages, bankName: pendingData.bankName, filename,
      }, 'context');

      return this.respond(text, {
        suggestions: ['Summarize transactions', 'Show closing balance', 'List all debits', 'Show monthly summary'],
      });
    } catch (err: any) {
      context.remember('pending_statement', { ...pendingData, waitingForPassword: false }, 'context');
      return this.respond(`Something went wrong: ${err?.message || 'Unknown error'}`, { suggestions: ['Try again'] });
    }
  }

  // ─── Transaction Alerts ──────────────────────────────

  private handleTransactions(context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): AgentResponse {
    const entries = this.safeGetVault(context, 'transactions');

    if (entries.length === 0) {
      const gmail = context.checkIntegration('gmail');
      if (gmail.connected) {
        return this.respond(
          "Gmail is connected but no transactions detected from emails yet.\n\n" +
          "Try syncing again or wait for new bank alert emails to arrive.",
          { suggestions: ['Sync Now', 'Summarize inbox'] }
        );
      }
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
      const gmail = context.checkIntegration('gmail');
      if (gmail.connected) {
        return this.respond(
          "Gmail is connected but no orders detected from emails yet.\n\nTry syncing again or wait for new order confirmation emails.",
          { suggestions: ['Sync Now', 'Summarize inbox'] }
        );
      }
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
      const gmail = context.checkIntegration('gmail');
      if (gmail.connected) {
        return this.respond(
          "Gmail is connected but no bills detected from emails yet.\nTry syncing again or wait for new bill/invoice emails.",
          { suggestions: ['Sync Now'] }
        );
      }
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
      const gmail = context.checkIntegration('gmail');
      if (gmail.connected) {
        return this.respond(
          "Gmail is connected but no salary/income data detected from emails yet.\nTry syncing again or wait for new salary credit emails.",
          { suggestions: ['Sync Now'] }
        );
      }
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
      const gmail = context.checkIntegration('gmail');
      if (gmail.connected) {
        return this.respond(
          "Gmail is connected but no email data synced yet. Try clicking **Sync Now** on the Integrations page.",
          { suggestions: ['Sync Now', 'Show transactions'] }
        );
      }
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
      const gmail = context.checkIntegration('gmail');
      if (gmail.connected) {
        return this.respond(
          `No email data found to search for "${topicNames}". Gmail is connected — try syncing first.`,
          { suggestions: ['Sync Now'] }
        );
      }
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

  // ─── Topic Search with Delegation ───────────────────

  private async handleTopicSearchWithDelegation(
    message: Message,
    context: AgentContext,
    intent: ReturnType<typeof this.analyzeIntent>
  ): Promise<AgentResponse> {
    // First, get our own email data
    const localResult = this.handleTopicSearch(message, context, intent);

    // Then delegate to other agents for their domain data
    const activeAgents = context.listActiveAgents();
    const delegationResults: string[] = [];
    const sources = [...new Set([...intent.dataSources, ...intent.crossAgentRefs])];

    for (const source of sources) {
      const sourceAgent = activeAgents.find(
        a => a.id === source || a.description.toLowerCase().includes(source)
      );
      if (sourceAgent && sourceAgent.id !== this.manifest.id) {
        const result = await this.delegateToAgent(
          sourceAgent.id,
          `Show data related to: ${intent.primaryTopic}`,
          context
        );
        if (result) {
          delegationResults.push(`**From ${sourceAgent.name}:**\n${result.content}`);
        }
      }
    }

    if (delegationResults.length > 0) {
      return this.respond(
        `${localResult.content}\n\n---\n\n${delegationResults.join('\n\n')}`,
        {
          suggestions: localResult.suggestions,
        }
      );
    }

    return localResult;
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

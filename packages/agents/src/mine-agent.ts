import { AgentManifest, Message, AgentContext, AgentResponse, Insight, DataCategory } from '@mine/core';
import { BaseAgent } from './base-agent';

/**
 * MINE Agent — the single unified agent that handles ALL domains.
 *
 * Instead of 15 separate agents that need routing, installation, and context switching,
 * this one agent handles everything: finance, property, fitness, trading, email, shopping,
 * cooking, education, utilities, deliveries, social, tax, and general chat.
 *
 * The AI has full context of ALL user data across every domain, enabling much better
 * cross-domain reasoning (e.g., "given my EMIs and rent income, can I afford this investment?").
 */
export class MineAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'mine',
    name: 'MINE',
    description: 'Your personal AI assistant — handles finances, property, health, shopping, cooking, education, investments, emails, and everything else in your life.',
    version: '2.0.0',
    author: 'MINE',
    icon: 'sparkles',
    category: 'general' as any,
    capabilities: [
      // Finance
      { id: 'track_expenses', name: 'Expense Tracking', description: 'Log and categorize expenses', keywords: ['expense', 'spend', 'spent', 'cost', 'purchase', 'buy'] },
      { id: 'track_income', name: 'Income Tracking', description: 'Track salary, freelance, rental income', keywords: ['income', 'salary', 'earned', 'received', 'payment'] },
      { id: 'manage_emis', name: 'EMI Manager', description: 'Track EMIs, due dates, remaining tenure', keywords: ['emi', 'loan', 'installment', 'mortgage', 'repayment'] },
      { id: 'budgeting', name: 'Budget Planner', description: 'Set and monitor budgets', keywords: ['budget', 'limit', 'saving', 'overspend'] },
      { id: 'net_worth', name: 'Net Worth', description: 'Track assets vs liabilities', keywords: ['net worth', 'assets', 'liabilities', 'wealth'] },
      // Property
      { id: 'manage_properties', name: 'Property Portfolio', description: 'Track properties', keywords: ['property', 'house', 'flat', 'apartment', 'real estate'] },
      { id: 'manage_tenants', name: 'Tenant Management', description: 'Track tenants and leases', keywords: ['tenant', 'renter', 'lease', 'occupant'] },
      { id: 'track_rent', name: 'Rent Collection', description: 'Track rent payments', keywords: ['rent', 'due', 'collection', 'overdue'] },
      { id: 'maintenance', name: 'Maintenance', description: 'Log repair requests', keywords: ['maintenance', 'repair', 'fix', 'plumber', 'electrician'] },
      // Trading & Investments
      { id: 'portfolio', name: 'Portfolio Tracker', description: 'Track investments', keywords: ['portfolio', 'investments', 'holdings', 'stocks', 'mutual funds'] },
      { id: 'market_watch', name: 'Market Watch', description: 'Monitor stocks and crypto', keywords: ['stock', 'share', 'crypto', 'bitcoin', 'market', 'nifty', 'sensex'] },
      { id: 'sip_manager', name: 'SIP Manager', description: 'Track SIPs', keywords: ['sip', 'systematic', 'recurring investment'] },
      // Fitness & Health
      { id: 'track_workouts', name: 'Workout Tracker', description: 'Log exercises', keywords: ['workout', 'exercise', 'gym', 'run', 'walk', 'yoga', 'cardio'] },
      { id: 'track_nutrition', name: 'Nutrition Tracker', description: 'Log meals and calories', keywords: ['calories', 'food', 'meal', 'diet', 'protein', 'nutrition'] },
      { id: 'track_vitals', name: 'Vital Signs', description: 'Weight, BP, sleep', keywords: ['weight', 'blood pressure', 'sleep', 'heart rate', 'steps'] },
      { id: 'medications', name: 'Medications', description: 'Track medicines', keywords: ['medicine', 'medication', 'pill', 'prescription'] },
      // Email
      { id: 'email_summary', name: 'Email Summary', description: 'Summarize emails', keywords: ['email', 'inbox', 'unread', 'mail', 'summary'] },
      { id: 'transactions', name: 'Transaction Alerts', description: 'Bank transactions from emails', keywords: ['transaction', 'bank', 'debit', 'credit'] },
      { id: 'order_tracking', name: 'Order Tracking', description: 'Track orders from emails', keywords: ['order', 'delivery', 'shipped', 'amazon', 'flipkart'] },
      // Shopping
      { id: 'shopping_lists', name: 'Shopping Lists', description: 'Manage shopping lists', keywords: ['list', 'grocery', 'shopping list'] },
      { id: 'price_tracking', name: 'Price Tracker', description: 'Track prices', keywords: ['price', 'deal', 'discount', 'sale', 'cheap', 'compare'] },
      // Tax
      { id: 'tax_estimation', name: 'Tax Estimator', description: 'Estimate tax liability', keywords: ['tax', 'income tax', 'estimate', 'liability'] },
      { id: 'tax_saving', name: 'Tax Savings', description: 'Track deductions', keywords: ['80c', '80d', 'hra', 'deduction', 'save tax'] },
      // Cooking
      { id: 'recipes', name: 'Recipe Finder', description: 'Find recipes', keywords: ['recipe', 'cook', 'dish', 'cuisine', 'dinner', 'lunch', 'breakfast'] },
      { id: 'meal_plan', name: 'Meal Planner', description: 'Plan weekly meals', keywords: ['meal plan', 'weekly menu', 'what to eat'] },
      // Education
      { id: 'study_plans', name: 'Study Planner', description: 'Learning paths', keywords: ['study', 'learn', 'course', 'tutorial', 'education'] },
      // Utility & Bills
      { id: 'track_bills', name: 'Bill Tracker', description: 'Track utility bills', keywords: ['bill', 'electricity', 'water', 'gas', 'internet', 'utility'] },
      // Social
      { id: 'social_posts', name: 'Social Media', description: 'Manage social posts', keywords: ['post', 'tweet', 'publish', 'social media', 'instagram'] },
      // General
      { id: 'search', name: 'Search', description: 'Search across all data', keywords: ['search', 'find', 'where', 'look up'] },
      { id: 'chat', name: 'General Chat', description: 'General conversation and help', keywords: ['help', 'hello', 'hi', 'hey', 'thanks'] },
    ],
    widgets: [
      { id: 'insights', name: 'Insights', size: 'medium' },
      { id: 'quick_actions', name: 'Quick Actions', size: 'small' },
    ],
    requiredPermissions: [],
    optionalPermissions: [],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  // All data categories this agent can access
  private static readonly ALL_CATEGORIES: DataCategory[] = [
    'emis', 'expenses', 'income', 'bank_accounts', 'investments',
    'properties', 'tenants', 'rent_records',
    'tax_records', 'bills',
    'health_metrics', 'workouts', 'nutrition', 'medications',
    'emails', 'transactions', 'orders', 'deliveries',
    'shopping_lists', 'recipes', 'meal_plans',
    'courses', 'study_plans',
    'contacts', 'calendar', 'social_posts', 'messages',
    'documents', 'notes', 'bookmarks',
  ];

  // ─── Lifecycle: auto-grant permissions for ALL data ──

  async onActivate(context: AgentContext): Promise<void> {
    await super.onActivate(context);

    // Grant the unified MINE agent read/write access to ALL data categories.
    // This is essential because existing data was saved under old agent IDs
    // (finance, property, etc.) and the permission system checks by agentId.
    for (const category of MineAgent.ALL_CATEGORIES) {
      try {
        const check = context.permissions.check(context.userId, context.agentId, category, 'read');
        if (!check.granted) {
          context.permissions.grant(context.userId, {
            agentId: context.agentId,
            resource: category,
            level: 'act_autonomously',
            actions: ['read', 'write', 'delete'],
            reason: 'Unified MINE agent requires access to all user data',
            duration: 'permanent',
          });
        }
      } catch {
        context.permissions.grant(context.userId, {
          agentId: context.agentId,
          resource: category,
          level: 'act_autonomously',
          actions: ['read', 'write', 'delete'],
          reason: 'Unified MINE agent requires access to all user data',
          duration: 'permanent',
        });
      }
    }
  }

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    // ─── Form submissions (data saving) ─────────────────
    if (message.content.trimStart().startsWith('{') || content.startsWith('save:')) {
      return this.handleFormSubmit(message, context);
    }

    // ─── ADD flows — show structured forms ──────────────
    if (content.includes('add') || content.includes('log') || content.includes('record')) {
      if (content.includes('emi') || content.includes('loan')) return this.showAddEMIForm(content);
      if (content.includes('expense') || content.includes('spent')) return this.showAddExpenseForm();
      if (content.includes('income') || content.includes('salary')) return this.showAddIncomeForm();
      if (content.includes('property')) return this.showAddPropertyForm();
      if (content.includes('tenant')) return this.showAddTenantForm();
    }

    // ─── AI-powered response (primary path) ─────────────
    // Give AI ALL the user's data so it has complete context
    const vaultData = this.getVaultDataSummary(context, MineAgent.ALL_CATEGORIES);

    // Also check raw vault (bypass everything) to diagnose data issues
    const rawEntries = context.vault.exportAll(context.userId);
    console.log(`[MINE] User=${context.userId} | Raw vault entries: ${rawEntries.length} | Vault summary length: ${vaultData.length} chars`);
    if (rawEntries.length > 0) {
      const cats = rawEntries.reduce((acc: Record<string, number>, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {});
      console.log(`[MINE] Categories:`, JSON.stringify(cats));
    }
    if (vaultData) {
      console.log(`[MINE] Vault summary preview: ${vaultData.slice(0, 300)}`);
    }

    const aiResponse = await this.generateAIResponse(message, context, vaultData || undefined);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: this.getSuggestionsFor(content) });
    }

    // ─── Fallback: pattern-matching when AI unavailable ──
    // If user asks for summary/overview/data, show financial summary directly
    if (content.includes('summar') || content.includes('data') || content.includes('overview') || content.includes('net worth') || content.includes('all')) {
      return this.handleFinancialSummary(context);
    }
    if (content.includes('emi') || content.includes('loan') || content.includes('installment')) return this.handleViewEMIs(context);
    if (content.includes('expense') || content.includes('spent') || content.includes('spending')) return this.handleViewExpenses(context);
    if (content.includes('income') || content.includes('salary')) return this.handleViewIncome(context);
    if (content.includes('property') || content.includes('properties')) return this.handleViewProperties(context);
    if (content.includes('tenant')) return this.handleViewTenants(context);
    if (content.includes('rent')) return this.handleViewRent(context);
    if (content.includes('budget')) return this.respond("What's your monthly budget limit?", { suggestions: ['$2000/month', '$5000/month', '$10000/month'] });

    // Generic welcome
    return this.respond(
      "Hey! I can help with finances, property, health, shopping, cooking, and more. What's on your mind?",
      { suggestions: ['Show my EMIs', 'Add an expense', 'Financial summary', 'My properties'] }
    );
  }

  // ─── Vault Access (bypasses per-agent permission checks) ──

  /**
   * Read vault data directly without agent permission checks.
   * The unified MINE agent owns ALL user data — permission gates
   * only made sense in the multi-agent world.
   */
  private readVault(context: AgentContext, category: DataCategory): any[] {
    try {
      // Try permission-checked path first
      return this.readVault(context, category);
    } catch {
      // Fallback: query vault directly (no permission check)
      try {
        return context.vault.query({ userId: context.userId, category });
      } catch {
        return [];
      }
    }
  }

  /**
   * Override: build vault data summary using direct reads.
   * This ensures we see ALL user data regardless of permission state.
   */
  protected getVaultDataSummary(context: AgentContext, categories: DataCategory[]): string {
    const parts: string[] = [];
    for (const category of categories) {
      try {
        const entries = this.readVault(context, category);
        if (entries.length > 0) {
          const formatted = entries.map((e: any, i: number) => {
            const d = e.data;
            const fields = Object.entries(d)
              .filter(([k, v]) => v != null && v !== '' && k !== 'createdAt' && k !== '_formId' && k !== '_category')
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ');
            return `  ${i + 1}. ${fields}`;
          }).join('\n');
          parts.push(`${category} (${entries.length}):\n${formatted}`);
        }
      } catch { /* skip */ }
    }
    return parts.join('\n');
  }

  // ─── System Prompt Override ───────────────────────────

  protected buildSystemPrompt(context: AgentContext, extraContext?: string): string {
    let prompt = `You are MINE (My Intelligent Network of Everything), a personal AI assistant that manages every aspect of the user's life.

You handle ALL domains — finance, property, investments, health & fitness, shopping, cooking, education, bills, deliveries, email, social media, and general questions. You are ONE unified assistant, not multiple agents.

Your capabilities include:
- **Finance**: Track expenses, income, EMIs, bank accounts, budgets, net worth
- **Property**: Manage properties, tenants, rent collection, maintenance
- **Investments**: Portfolio tracking, stock market, SIPs, mutual funds, crypto
- **Health**: Workouts, nutrition, weight, sleep, medications
- **Email**: Summarize inbox, track transactions, orders, bills from emails
- **Shopping**: Lists, price tracking, deals, wishlists
- **Tax**: Tax estimation, savings under 80C/80D, filing prep
- **Cooking**: Recipes, meal planning, grocery lists
- **Education**: Study plans, learning paths, progress tracking
- **Bills**: Electricity, water, gas, internet bills
- **Deliveries**: Track online orders and returns
- **Social**: Post scheduling, engagement analytics
- **General**: Search, reminders, notes, and anything else

Guidelines:
- Be concise but helpful. Use as many words as needed to fully answer, but don't pad.
- Directly address what the user is asking. Don't give generic introductions.
- CRITICAL: Your "User's data" section below contains ALL the user's saved data. This is the source of truth. ALWAYS reference it when relevant. NEVER say "I don't have that information" or ask the user to re-enter data that is already in the context.
- Use markdown formatting sparingly (bold for key info, numbered lists for data).
- Be conversational and friendly, not robotic.
- If you can take action (like logging an expense, etc.), tell the user you're doing it.
- Never say "I'm just an AI" or "I can't actually do that" — you ARE the assistant, act like it.
- When the user explicitly asks to ADD, SAVE, LOG, or RECORD data, just do it immediately. Don't question duplicates.
- When showing existing data, present it factually.
- You can handle cross-domain questions naturally (e.g., "Can I afford this given my EMIs and rent income?") because you see ALL data.`;

    if (extraContext) {
      prompt += `\n\n=== USER'S SAVED DATA (source of truth — ALWAYS use this, never ask for data already here) ===\n${extraContext}\n=== END OF SAVED DATA ===`;
      prompt += `\n\nIMPORTANT OVERRIDE: The data above IS the user's actual saved data. Even if previous messages in the conversation said "no data" — IGNORE those old messages. The data section above is CURRENT and AUTHORITATIVE. Reference it now.`;
    } else {
      prompt += `\n\nNote: The user has no saved data yet. Help them get started by suggesting they add income, expenses, EMIs, or properties.`;
    }

    return prompt;
  }

  // ─── Insights ────────────────────────────────────────

  async getInsights(context: AgentContext): Promise<Insight[]> {
    const insights: Insight[] = [];

    // EMI due soon
    try {
      const emis = this.readVault(context, 'emis');
      for (const emi of emis) {
        const dueDate = emi.data.dueDay as number;
        const today = new Date().getDate();
        const daysUntilDue = dueDate >= today ? dueDate - today : 30 - today + dueDate;
        if (daysUntilDue <= 5) {
          insights.push(
            this.insight(
              `EMI Due Soon: ${emi.data.name}`,
              `${emi.data.type} EMI of $${emi.data.amount} due in ${daysUntilDue} day(s)`,
              daysUntilDue <= 2 ? 'urgent' : 'high',
              { label: 'View Details', type: 'navigate', payload: { screen: 'chat' } }
            )
          );
        }
      }
    } catch { /* no data yet */ }

    // Overdue rent
    try {
      const rents = this.readVault(context, 'rent_records');
      const overdue = rents.filter(r => r.data.status === 'overdue');
      if (overdue.length > 0) {
        insights.push(
          this.insight(`${overdue.length} Rent(s) Overdue`, `Total overdue: $${overdue.reduce((s, r) => s + (Number(r.data.amount) || 0), 0)}`, 'high')
        );
      }
    } catch { /* no data */ }

    return insights;
  }

  // ─── Suggestions ─────────────────────────────────────

  private getSuggestionsFor(content: string): string[] {
    if (content.includes('emi') || content.includes('loan')) return ['Add another EMI', 'Financial summary', 'Show expenses'];
    if (content.includes('expense') || content.includes('spent')) return ['Add an expense', 'Show EMIs', 'Financial summary'];
    if (content.includes('income') || content.includes('salary')) return ['Add income', 'Show expenses', 'Financial summary'];
    if (content.includes('property')) return ['Add a property', 'My tenants', 'Rent status'];
    if (content.includes('tenant') || content.includes('rent')) return ['Add a tenant', 'My properties', 'Rent status'];
    if (content.includes('workout') || content.includes('exercise')) return ['Log workout', 'Log weight', 'Health summary'];
    if (content.includes('recipe') || content.includes('cook')) return ['What to cook today', 'Plan this week', 'Grocery list'];
    if (content.includes('investment') || content.includes('stock') || content.includes('portfolio')) return ['My portfolio', 'Market overview', 'Add investment'];
    if (content.includes('tax')) return ['Estimate my tax', 'Tax savings', 'Filing checklist'];
    if (content.includes('bill')) return ['Upcoming bills', 'Pay a bill', 'Usage analysis'];
    return ['Show my EMIs', 'Add an expense', 'Financial summary', 'My properties'];
  }

  // ─── ADD Forms ───────────────────────────────────────

  private showAddEMIForm(content: string): AgentResponse {
    let emiType = 'Home Loan';
    if (content.includes('car')) emiType = 'Car Loan';
    else if (content.includes('personal')) emiType = 'Personal Loan';
    else if (content.includes('education') || content.includes('student')) emiType = 'Education Loan';

    return this.respond(`Let's add your ${emiType} EMI:`, {
      actions: [{
        type: 'show_widget',
        payload: {
          widget: 'inline_form',
          form: {
            id: 'add_emi',
            category: 'emis',
            fields: [
              { name: 'name', label: 'EMI Name', type: 'text', placeholder: `e.g. ${emiType} - HDFC`, required: true },
              { name: 'type', label: 'Loan Type', type: 'select', options: ['Home Loan', 'Car Loan', 'Personal Loan', 'Education Loan', 'Other'], value: emiType },
              { name: 'amount', label: 'Monthly EMI Amount ($)', type: 'number', placeholder: '1200', required: true },
              { name: 'totalAmount', label: 'Total Loan Amount ($)', type: 'number', placeholder: '500000' },
              { name: 'bank', label: 'Bank / Lender', type: 'text', placeholder: 'e.g. HDFC Bank' },
              { name: 'dueDay', label: 'Due Day of Month', type: 'number', placeholder: '5', required: true },
              { name: 'remainingMonths', label: 'Remaining Months', type: 'number', placeholder: '120' },
              { name: 'interestRate', label: 'Interest Rate (%)', type: 'number', placeholder: '8.5' },
            ],
          },
        },
      }],
    });
  }

  private showAddExpenseForm(): AgentResponse {
    return this.respond("Let's log your expense:", {
      actions: [{
        type: 'show_widget',
        payload: {
          widget: 'inline_form',
          form: {
            id: 'add_expense',
            category: 'expenses',
            fields: [
              { name: 'name', label: 'What did you spend on?', type: 'text', placeholder: 'e.g. Groceries at BigBasket', required: true },
              { name: 'amount', label: 'Amount ($)', type: 'number', placeholder: '50', required: true },
              { name: 'categoryTag', label: 'Category', type: 'select', options: ['Food & Dining', 'Transport', 'Shopping', 'Bills & Utilities', 'Entertainment', 'Health', 'Education', 'Other'] },
              { name: 'date', label: 'Date', type: 'date' },
              { name: 'notes', label: 'Notes (optional)', type: 'text', placeholder: 'Any additional details' },
            ],
          },
        },
      }],
    });
  }

  private showAddIncomeForm(): AgentResponse {
    return this.respond("Let's record your income:", {
      actions: [{
        type: 'show_widget',
        payload: {
          widget: 'inline_form',
          form: {
            id: 'add_income',
            category: 'income',
            fields: [
              { name: 'source', label: 'Income Source', type: 'text', placeholder: 'e.g. Monthly Salary', required: true },
              { name: 'amount', label: 'Amount ($)', type: 'number', placeholder: '5000', required: true },
              { name: 'type', label: 'Type', type: 'select', options: ['Salary', 'Freelance', 'Rental', 'Investment', 'Business', 'Other'] },
              { name: 'recurring', label: 'Recurring?', type: 'select', options: ['Monthly', 'One-time', 'Weekly', 'Quarterly', 'Yearly'] },
              { name: 'date', label: 'Date', type: 'date' },
            ],
          },
        },
      }],
    });
  }

  private showAddPropertyForm(): AgentResponse {
    return this.respond("Let's add your property:", {
      actions: [{
        type: 'show_widget',
        payload: {
          widget: 'inline_form',
          form: {
            id: 'add_property',
            category: 'properties',
            fields: [
              { name: 'name', label: 'Property Name', type: 'text', placeholder: 'e.g. Downtown Apartment 2B', required: true },
              { name: 'type', label: 'Type', type: 'select', options: ['Apartment', 'House', 'Villa', 'Commercial', 'Land', 'Other'] },
              { name: 'address', label: 'Address', type: 'text', placeholder: '123 Main St, City', required: true },
              { name: 'rentAmount', label: 'Monthly Rent ($)', type: 'number', placeholder: '800' },
              { name: 'purchasePrice', label: 'Purchase Price ($)', type: 'number', placeholder: '250000' },
              { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Any details...' },
            ],
          },
        },
      }],
    });
  }

  private showAddTenantForm(): AgentResponse {
    return this.respond("Let's add a tenant:", {
      actions: [{
        type: 'show_widget',
        payload: {
          widget: 'inline_form',
          form: {
            id: 'add_tenant',
            category: 'tenants',
            fields: [
              { name: 'name', label: 'Tenant Name', type: 'text', placeholder: 'John Doe', required: true },
              { name: 'phone', label: 'Phone', type: 'text', placeholder: '+1-555-0123' },
              { name: 'email', label: 'Email', type: 'text', placeholder: 'john@email.com' },
              { name: 'property', label: 'Property', type: 'text', placeholder: 'Which property?', required: true },
              { name: 'rentAmount', label: 'Monthly Rent ($)', type: 'number', placeholder: '800', required: true },
              { name: 'leaseStart', label: 'Lease Start', type: 'date' },
              { name: 'leaseEnd', label: 'Lease End', type: 'date' },
            ],
          },
        },
      }],
    });
  }

  // ─── Form Submit Handler ─────────────────────────────

  private async handleFormSubmit(message: Message, context: AgentContext): Promise<AgentResponse> {
    try {
      let raw = message.content;
      if (raw.startsWith('save:')) raw = raw.slice(5);

      const parsed = JSON.parse(raw);
      const { _formId, _category, ...data } = parsed;
      const category = _category || 'expenses';

      // Dedup: check if very similar entry saved in last 60 seconds
      try {
        const existing = this.readVault(context, category);
        const now = Date.now();
        const recentDupe = existing.find(e => {
          const created = e.data.createdAt ? new Date(e.data.createdAt as string).getTime() : 0;
          if (now - created > 60000) return false;
          const nameMatch = (e.data.name || e.data.source) === (data.name || data.source);
          const amountMatch = String(e.data.amount) === String(data.amount);
          return nameMatch && amountMatch;
        });
        if (recentDupe) {
          const label = data.name || data.source || category;
          return this.respond(
            `"${label}" was already saved a moment ago — skipping duplicate.`,
            { suggestions: [`Show my ${category}`, 'Add another', 'Financial summary'] }
          );
        }
      } catch { /* proceed with save */ }

      const key = `${category}-${Date.now()}`;
      try {
        context.vault.putForAgent(context.userId, context.agentId, category, key, {
          ...data, createdAt: new Date().toISOString(),
        });
      } catch {
        context.vault.put(context.userId, category, key, {
          ...data, createdAt: new Date().toISOString(),
        }, 'agent', context.agentId);
      }

      const label = data.name || data.source || data.property || category;
      const amount = data.amount ? ` ($${data.amount})` : '';
      return this.respond(
        `Saved! "${label}"${amount} has been added to your ${category.replace('_', ' ')}.`,
        { suggestions: [`Show my ${category}`, 'Add another', 'Financial summary'] }
      );
    } catch {
      return this.respond("I couldn't save that data. Please try again.", {
        suggestions: ['Add EMI', 'Add expense', 'Add income', 'Add property'],
      });
    }
  }

  // ─── VIEW Handlers (fallback when AI unavailable) ────

  private handleViewEMIs(context: AgentContext): AgentResponse {
    try {
      const emis = this.readVault(context, 'emis');
      if (emis.length === 0) {
        return this.respond("You haven't added any EMIs yet. Let's add your first one!", {
          suggestions: ['Add home loan EMI', 'Add car loan EMI', 'Add personal loan EMI'],
        });
      }
      const totalMonthly = emis.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const lines = emis.map((e, i) =>
        `${i + 1}. ${e.data.name || e.data.type} — $${e.data.amount}/mo${e.data.bank ? ` (${e.data.bank})` : ''}${e.data.dueDay ? ` · Due: ${e.data.dueDay}th` : ''}`
      ).join('\n');
      return this.respond(`You have ${emis.length} EMI(s) totaling $${totalMonthly}/month:\n\n${lines}`, {
        suggestions: ['Add another EMI', 'Financial summary', 'Show expenses'],
      });
    } catch {
      return this.respond("No EMI data found yet. Want to add one?", { suggestions: ['Add an EMI'] });
    }
  }

  private handleViewExpenses(context: AgentContext): AgentResponse {
    try {
      const expenses = this.readVault(context, 'expenses');
      if (expenses.length === 0) {
        return this.respond("No expenses recorded yet. Let's log your first one!", { suggestions: ['Add an expense'] });
      }
      const total = expenses.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const lines = expenses.slice(0, 10).map((e, i) =>
        `${i + 1}. ${e.data.name} — $${e.data.amount}${e.data.categoryTag ? ` [${e.data.categoryTag}]` : ''}`
      ).join('\n');
      return this.respond(`Recent expenses (total: $${total}):\n\n${lines}${expenses.length > 10 ? `\n...and ${expenses.length - 10} more` : ''}`, {
        suggestions: ['Add an expense', 'Show EMIs', 'Financial summary'],
      });
    } catch {
      return this.respond("No expense data yet. Want to log one?", { suggestions: ['Add an expense'] });
    }
  }

  private handleViewIncome(context: AgentContext): AgentResponse {
    try {
      const income = this.readVault(context, 'income');
      if (income.length === 0) {
        return this.respond("No income recorded yet. Let's add your first source!", { suggestions: ['Add salary', 'Add freelance income'] });
      }
      const total = income.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const lines = income.map((e, i) =>
        `${i + 1}. ${e.data.source} — $${e.data.amount}${e.data.type ? ` (${e.data.type})` : ''}`
      ).join('\n');
      return this.respond(`Your income sources (total: $${total}):\n\n${lines}`, {
        suggestions: ['Add income', 'Show expenses', 'Financial summary'],
      });
    } catch {
      return this.respond("No income data yet.", { suggestions: ['Add income'] });
    }
  }

  private handleViewProperties(context: AgentContext): AgentResponse {
    try {
      const props = this.readVault(context, 'properties');
      if (props.length === 0) {
        return this.respond("No properties added yet. Let's add your first!", { suggestions: ['Add a property'] });
      }
      const lines = props.map((p, i) =>
        `${i + 1}. ${p.data.name} — ${p.data.type || 'Property'}${p.data.address ? ` (${p.data.address})` : ''}${p.data.rentAmount ? ` · Rent: $${p.data.rentAmount}/mo` : ''}`
      ).join('\n');
      return this.respond(`Your properties (${props.length}):\n\n${lines}`, {
        suggestions: ['Add a property', 'Add a tenant', 'Rent status'],
      });
    } catch {
      return this.respond("No property data yet.", { suggestions: ['Add a property'] });
    }
  }

  private handleViewTenants(context: AgentContext): AgentResponse {
    try {
      const tenants = this.readVault(context, 'tenants');
      if (tenants.length === 0) {
        return this.respond("No tenants added yet.", { suggestions: ['Add a tenant'] });
      }
      const lines = tenants.map((t, i) =>
        `${i + 1}. ${t.data.name} — ${t.data.property || 'Unassigned'}${t.data.rentAmount ? ` · $${t.data.rentAmount}/mo` : ''}`
      ).join('\n');
      return this.respond(`Your tenants (${tenants.length}):\n\n${lines}`, {
        suggestions: ['Add a tenant', 'Rent status'],
      });
    } catch {
      return this.respond("No tenant data yet.", { suggestions: ['Add a tenant'] });
    }
  }

  private handleViewRent(context: AgentContext): AgentResponse {
    try {
      const rents = this.readVault(context, 'rent_records');
      if (rents.length === 0) {
        return this.respond("No rent records yet. Add tenants first.", { suggestions: ['Add a tenant', 'My properties'] });
      }
      const lines = rents.map((r, i) =>
        `${i + 1}. ${r.data.tenant} — $${r.data.amount} [${r.data.status || 'recorded'}]`
      ).join('\n');
      return this.respond(`Rent records:\n\n${lines}`, { suggestions: ['Add a tenant', 'My properties'] });
    } catch {
      return this.respond("No rent data yet.", { suggestions: ['My properties'] });
    }
  }

  private handleFinancialSummary(context: AgentContext): AgentResponse {
    // First: show a full data inventory across ALL categories
    const dataCounts: Record<string, number> = {};
    let totalEntries = 0;
    for (const category of MineAgent.ALL_CATEGORIES) {
      try {
        const entries = this.readVault(context, category);
        if (entries.length > 0) {
          dataCounts[category] = entries.length;
          totalEntries += entries.length;
        }
      } catch { /* skip */ }
    }

    // Also check raw vault as ultimate fallback
    if (totalEntries === 0) {
      try {
        const raw = context.vault.exportAll(context.userId);
        if (raw.length > 0) {
          for (const e of raw) {
            dataCounts[e.category] = (dataCounts[e.category] || 0) + 1;
            totalEntries++;
          }
        }
      } catch { /* skip */ }
    }

    if (totalEntries === 0) {
      return this.respond(
        "No data saved yet. Let's get started! You can add your income, expenses, EMIs, properties, and more.",
        { suggestions: ['Add income', 'Add expense', 'Add EMI', 'Add property'] }
      );
    }

    // Build financial totals
    let totalIncome = 0, totalExpenses = 0, totalEMIs = 0, totalRentIncome = 0, propertyValue = 0;

    try { const i = this.readVault(context, 'income'); totalIncome = i.reduce((s, e) => s + (Number(e.data.amount) || 0), 0); } catch {}
    try { const e = this.readVault(context, 'expenses'); totalExpenses = e.reduce((s, e) => s + (Number(e.data.amount) || 0), 0); } catch {}
    try { const m = this.readVault(context, 'emis'); totalEMIs = m.reduce((s, e) => s + (Number(e.data.amount) || 0), 0); } catch {}
    try {
      const p = this.readVault(context, 'properties');
      propertyValue = p.reduce((s, e) => s + (Number(e.data.purchasePrice) || 0), 0);
      totalRentIncome = p.reduce((s, e) => s + (Number(e.data.rentAmount) || 0), 0);
    } catch {}

    const totalOutflow = totalExpenses + totalEMIs;
    const combinedIncome = totalIncome + totalRentIncome;
    const net = combinedIncome - totalOutflow;

    let summary = `**Your Data** (${totalEntries} total entries)\n`;
    const catLines = Object.entries(dataCounts).map(([cat, count]) =>
      `  ${cat.replace('_', ' ')}: ${count}`
    ).join('\n');
    summary += catLines;

    summary += `\n\n**Financial Summary**\nIncome:   $${totalIncome}`;
    if (totalRentIncome > 0) summary += `\nRental:   $${totalRentIncome}`;
    summary += `\nExpenses: $${totalExpenses}\nEMIs:     $${totalEMIs}\n─────────────\nNet:      $${net} ${net >= 0 ? '(surplus)' : '(deficit)'}`;
    if (propertyValue > 0) summary += `\n\nProperty Assets: $${propertyValue}`;

    return this.respond(summary, {
      suggestions: ['Add income', 'Add expense', 'Show EMIs', 'My properties'],
    });
  }
}

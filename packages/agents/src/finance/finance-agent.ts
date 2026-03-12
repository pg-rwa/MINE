import { AgentManifest, Message, AgentContext, AgentResponse, Insight } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class FinanceAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'finance',
    name: 'Finance Manager',
    description: 'Track income, expenses, bank accounts, EMIs, and budgets. Get spending insights and financial health scores.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'wallet',
    category: 'finance',
    capabilities: [
      { id: 'track_expenses', name: 'Expense Tracking', description: 'Log and categorize expenses', keywords: ['expense', 'spend', 'spent', 'cost', 'purchase', 'buy'] },
      { id: 'track_income', name: 'Income Tracking', description: 'Track salary, freelance, rental income', keywords: ['income', 'salary', 'earned', 'received', 'payment'] },
      { id: 'manage_emis', name: 'EMI Manager', description: 'Track EMIs, due dates, remaining tenure', keywords: ['emi', 'loan', 'installment', 'mortgage', 'repayment'] },
      { id: 'budgeting', name: 'Budget Planner', description: 'Set and monitor budgets by category', keywords: ['budget', 'limit', 'saving', 'overspend'] },
      { id: 'net_worth', name: 'Net Worth Tracker', description: 'Track assets vs liabilities', keywords: ['net worth', 'assets', 'liabilities', 'wealth'] },
    ],
    widgets: [
      { id: 'monthly_summary', name: 'Monthly Summary', size: 'medium' },
      { id: 'upcoming_emis', name: 'Upcoming EMIs', size: 'small' },
      { id: 'spending_chart', name: 'Spending Breakdown', size: 'large' },
    ],
    requiredPermissions: ['transactions', 'income', 'expenses'],
    optionalPermissions: ['bank_accounts', 'emis', 'investments'],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    // ─── Form submissions (from inline forms) — must be first ───
    if (message.content.trimStart().startsWith('{') || content.startsWith('save:')) {
      return this.handleFormSubmit(message, context);
    }

    // Analyze the user's actual intent
    const intent = this.analyzeIntent(message, context);

    // ─── ADD flows (data collection) ────────────────
    if (intent.primaryAction === 'add' || (content.includes('add') && this.isFinanceTopic(content))) {
      if (content.includes('emi') || content.includes('loan')) {
        return this.handleAddEMI(message, context);
      }
      if (content.includes('expense') || content.includes('spent')) {
        return this.handleAddExpense(message, context);
      }
      if (content.includes('income') || content.includes('salary')) {
        return this.handleAddIncome(message, context);
      }
    }

    // ─── VIEW / CHECK flows — now context-aware ─────
    if (content.includes('expense') || content.includes('spent') || content.includes('spending')) {
      return this.handleViewExpenses(message, context, intent);
    }
    if (content.includes('emi') || content.includes('loan') || content.includes('installment')) {
      return this.handleViewEMIs(message, context, intent);
    }
    if (content.includes('income') || content.includes('salary')) {
      return this.handleViewIncome(message, context, intent);
    }
    if (content.includes('balance') || content.includes('net worth') || content.includes('summary')) {
      return this.handleSummary(message, context, intent);
    }
    if (content.includes('budget')) {
      return this.handleBudget(message, context);
    }

    // ─── Fallback — use intent to give a more helpful response ───
    return this.handleGenericFinanceQuery(message, context, intent);
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    const insights: Insight[] = [];
    try {
      const emis = context.vault.getForAgent(context.userId, context.agentId, 'emis');
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
              { label: 'View Details', type: 'navigate', payload: { screen: 'emi_details' } }
            )
          );
        }
      }
    } catch { /* no permission yet */ }
    return insights;
  }

  private isFinanceTopic(content: string): boolean {
    const topics = ['emi', 'loan', 'expense', 'income', 'salary', 'budget', 'spent'];
    return topics.some(t => content.includes(t));
  }

  // ─── ADD Handlers ──────────────────────────────────

  private async handleAddEMI(_message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = _message.content.toLowerCase();
    let emiType = 'Home Loan';
    if (content.includes('car')) emiType = 'Car Loan';
    else if (content.includes('personal')) emiType = 'Personal Loan';
    else if (content.includes('education') || content.includes('student')) emiType = 'Education Loan';

    return this.respond(
      `Let's add your ${emiType} EMI. Please fill in the details:`,
      {
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
      }
    );
  }

  private async handleAddExpense(_message: Message, _context: AgentContext): Promise<AgentResponse> {
    return this.respond(
      "Let's log your expense:",
      {
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
      }
    );
  }

  private async handleAddIncome(_message: Message, _context: AgentContext): Promise<AgentResponse> {
    return this.respond(
      "Let's record your income:",
      {
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
      }
    );
  }

  // ─── Form Submit Handler ───────────────────────────

  private async handleFormSubmit(message: Message, context: AgentContext): Promise<AgentResponse> {
    try {
      let raw = message.content;
      if (raw.startsWith('save:')) raw = raw.slice(5);

      const parsed = JSON.parse(raw);
      const { _formId, _category, ...data } = parsed;

      const category = _category || 'expenses';
      const key = `${category}-${Date.now()}`;

      try {
        context.vault.putForAgent(context.userId, context.agentId, category, key, {
          ...data,
          createdAt: new Date().toISOString(),
        });
      } catch {
        context.vault.put(context.userId, category, key, {
          ...data,
          createdAt: new Date().toISOString(),
        }, 'agent', context.agentId);
      }

      const label = data.name || data.source || category;
      const amount = data.amount ? ` ($${data.amount})` : '';

      return this.respond(
        `Saved! "${label}"${amount} has been added to your ${category.replace('_', ' ')}.`,
        { suggestions: [`Show my ${category}`, 'Add another', 'Monthly summary'] }
      );
    } catch (err) {
      return this.respond(
        "I couldn't save that data. Please try again using the form.",
        { suggestions: ['Add EMI', 'Add expense', 'Add income'] }
      );
    }
  }

  // ─── VIEW Handlers (now context-aware) ────────────

  private async handleViewEMIs(_message: Message, context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): Promise<AgentResponse> {
    try {
      const emis = context.vault.getForAgent(context.userId, context.agentId, 'emis');
      if (emis.length === 0) {
        // Still acknowledge cross-agent context even when no data
        const crossNote = this.getCrossAgentContext(intent, context);
        let noDataMsg = "You haven't added any EMIs yet. Let's add your first one!";
        if (crossNote) {
          noDataMsg = `${crossNote}\n\nYou haven't added any EMIs here yet. Let's add your first one!`;
        }
        return this.respond(noDataMsg, {
          suggestions: ['Add home loan EMI', 'Add car loan EMI', 'Add personal loan EMI'],
          actions: [{
            type: 'show_widget',
            payload: {
              widget: 'inline_form',
              form: {
                id: 'add_emi',
                category: 'emis',
                fields: [
                  { name: 'name', label: 'EMI Name', type: 'text', placeholder: 'e.g. Home Loan - HDFC', required: true },
                  { name: 'type', label: 'Loan Type', type: 'select', options: ['Home Loan', 'Car Loan', 'Personal Loan', 'Education Loan', 'Other'] },
                  { name: 'amount', label: 'Monthly EMI ($)', type: 'number', placeholder: '1200', required: true },
                  { name: 'bank', label: 'Bank / Lender', type: 'text', placeholder: 'e.g. HDFC Bank' },
                  { name: 'dueDay', label: 'Due Day of Month', type: 'number', placeholder: '5', required: true },
                  { name: 'remainingMonths', label: 'Remaining Months', type: 'number', placeholder: '120' },
                ],
              },
            },
          }],
        });
      }

      const totalMonthly = emis.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const lines = emis.map((e, i) =>
        `${i + 1}. ${e.data.name || e.data.type} — $${e.data.amount}/mo${e.data.bank ? ` (${e.data.bank})` : ''}${e.data.dueDay ? ` · Due: ${e.data.dueDay}th` : ''}`
      ).join('\n');

      const mainContent = `You have ${emis.length} EMI(s) totaling $${totalMonthly}/month:\n\n${lines}`;

      return this.respondWithContext(intent, context, mainContent, {
        suggestions: ['Add another EMI', 'Monthly summary', 'Show expenses'],
      });
    } catch {
      return this.respond("I need permission to access your EMI data.", {
        actions: [{ type: 'request_permission', payload: { resource: 'emis', reason: 'To track and remind you about EMI payments' } }],
      });
    }
  }

  private async handleViewExpenses(_message: Message, context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): Promise<AgentResponse> {
    try {
      const expenses = context.vault.getForAgent(context.userId, context.agentId, 'expenses');
      if (expenses.length === 0) {
        return this.respond("No expenses recorded yet. Let's log your first one!", {
          suggestions: ['Add an expense'],
          actions: [{
            type: 'show_widget',
            payload: {
              widget: 'inline_form',
              form: {
                id: 'add_expense',
                category: 'expenses',
                fields: [
                  { name: 'name', label: 'What did you spend on?', type: 'text', placeholder: 'e.g. Groceries', required: true },
                  { name: 'amount', label: 'Amount ($)', type: 'number', placeholder: '50', required: true },
                  { name: 'categoryTag', label: 'Category', type: 'select', options: ['Food & Dining', 'Transport', 'Shopping', 'Bills & Utilities', 'Entertainment', 'Health', 'Other'] },
                ],
              },
            },
          }],
        });
      }

      const total = expenses.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const lines = expenses.slice(0, 10).map((e, i) =>
        `${i + 1}. ${e.data.name} — $${e.data.amount}${e.data.categoryTag ? ` [${e.data.categoryTag}]` : ''}`
      ).join('\n');

      const mainContent = `Recent expenses (total: $${total}):\n\n${lines}${expenses.length > 10 ? `\n...and ${expenses.length - 10} more` : ''}`;

      return this.respondWithContext(intent, context, mainContent, {
        suggestions: ['Add an expense', 'Show EMIs', 'Monthly summary'],
      });
    } catch {
      return this.respond("I need permission to access your expense data.", {
        actions: [{ type: 'request_permission', payload: { resource: 'expenses', reason: 'To track and categorize your spending' } }],
      });
    }
  }

  private async handleViewIncome(_message: Message, context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): Promise<AgentResponse> {
    try {
      const income = context.vault.getForAgent(context.userId, context.agentId, 'income');
      if (income.length === 0) {
        return this.respond("No income recorded yet. Let's add your first source!", {
          suggestions: ['Add salary', 'Add freelance income', 'Add rental income'],
        });
      }

      const total = income.reduce((sum, e) => sum + (Number(e.data.amount) || 0), 0);
      const lines = income.map((e, i) =>
        `${i + 1}. ${e.data.source} — $${e.data.amount}${e.data.type ? ` (${e.data.type})` : ''}`
      ).join('\n');

      const mainContent = `Your income sources (total: $${total}):\n\n${lines}`;

      return this.respondWithContext(intent, context, mainContent, {
        suggestions: ['Add income', 'Show expenses', 'Monthly summary'],
      });
    } catch {
      return this.respond("I need permission to access your income data.", {
        actions: [{ type: 'request_permission', payload: { resource: 'income', reason: 'To track your income sources' } }],
      });
    }
  }

  private async handleSummary(_message: Message, context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): Promise<AgentResponse> {
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalEMIs = 0;

    try {
      const income = context.vault.getForAgent(context.userId, context.agentId, 'income');
      totalIncome = income.reduce((s, e) => s + (Number(e.data.amount) || 0), 0);
    } catch { /* no permission */ }

    try {
      const expenses = context.vault.getForAgent(context.userId, context.agentId, 'expenses');
      totalExpenses = expenses.reduce((s, e) => s + (Number(e.data.amount) || 0), 0);
    } catch { /* no permission */ }

    try {
      const emis = context.vault.getForAgent(context.userId, context.agentId, 'emis');
      totalEMIs = emis.reduce((s, e) => s + (Number(e.data.amount) || 0), 0);
    } catch { /* no permission */ }

    const totalOutflow = totalExpenses + totalEMIs;
    const net = totalIncome - totalOutflow;

    const mainContent =
      `Financial Summary:\n\n` +
      `Income:   $${totalIncome}\n` +
      `Expenses: $${totalExpenses}\n` +
      `EMIs:     $${totalEMIs}\n` +
      `─────────────\n` +
      `Net:      $${net} ${net >= 0 ? '(surplus)' : '(deficit)'}`;

    return this.respondWithContext(intent, context, mainContent, {
      suggestions: ['Add income', 'Add expense', 'Show EMIs'],
    });
  }

  private async handleBudget(_message: Message, _context: AgentContext): Promise<AgentResponse> {
    return this.respond("I can help set up a budget. What's your monthly budget limit?", {
      suggestions: ['$2000/month', '$5000/month', '$10000/month', 'Custom amount'],
    });
  }

  private async handleGenericFinanceQuery(_message: Message, context: AgentContext, intent: ReturnType<typeof this.analyzeIntent>): Promise<AgentResponse> {
    // If the user asked something that doesn't match our keywords but we can still be helpful
    const crossNote = this.getCrossAgentContext(intent, context);

    if (crossNote) {
      // User is asking about something that involves other agents
      return this.respond(
        `${crossNote}\n\nAs your Finance Manager, I can help with EMIs, expenses, income, budgets, and net worth tracking. What would you like to do?`,
        { suggestions: ['Show my EMIs', 'Add an expense', 'Monthly summary', 'Add income'] }
      );
    }

    return this.respond(
      "I can help you manage your finances. What would you like to do?",
      { suggestions: ['Show my EMIs', 'Add an expense', 'Add EMI', 'Monthly summary'] }
    );
  }
}

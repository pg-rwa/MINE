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

    if (content.includes('expense') || content.includes('spent')) {
      return this.handleExpense(message, context);
    }
    if (content.includes('emi') || content.includes('loan')) {
      return this.handleEMI(message, context);
    }
    if (content.includes('balance') || content.includes('net worth')) {
      return this.handleBalance(message, context);
    }
    if (content.includes('budget')) {
      return this.handleBudget(message, context);
    }

    return this.respond(
      "I can help you with expenses, income, EMIs, budgets, and your overall financial health. What would you like to do?",
      { suggestions: ['Log an expense', 'Show my EMIs', 'Monthly spending summary', 'Set a budget'] }
    );
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    const insights: Insight[] = [];

    // In production: analyze actual data from vault
    insights.push(
      this.insight('EMI Due Soon', 'Home loan EMI of $1,200 due in 3 days', 'high', {
        label: 'View EMI Details',
        type: 'navigate',
        payload: { screen: 'emi_details' },
      })
    );

    return insights;
  }

  private async handleExpense(message: Message, context: AgentContext): Promise<AgentResponse> {
    return this.respond(
      "I'll help you track that expense. What's the amount and category?",
      {
        actions: [{ type: 'show_widget', payload: { widget: 'expense_form' } }],
        suggestions: ['Food & Dining', 'Transport', 'Shopping', 'Bills'],
      }
    );
  }

  private async handleEMI(message: Message, context: AgentContext): Promise<AgentResponse> {
    try {
      const emis = context.vault.getForAgent(context.userId, context.agentId, 'emis');
      if (emis.length === 0) {
        return this.respond("You haven't added any EMIs yet. Would you like to add one?", {
          suggestions: ['Add home loan EMI', 'Add car loan EMI', 'Add personal loan EMI'],
        });
      }
      return this.respond(`You have ${emis.length} active EMI(s). Here's a summary of your upcoming payments.`);
    } catch {
      return this.respond("I need permission to access your EMI data.", {
        actions: [{ type: 'request_permission', payload: { resource: 'emis', reason: 'To track and remind you about EMI payments' } }],
      });
    }
  }

  private async handleBalance(message: Message, context: AgentContext): Promise<AgentResponse> {
    return this.respond("Let me calculate your net worth from your linked accounts and recorded assets.");
  }

  private async handleBudget(message: Message, context: AgentContext): Promise<AgentResponse> {
    return this.respond("I can help you set up a budget. Which categories would you like to set limits for?", {
      suggestions: ['Overall monthly budget', 'Food budget', 'Entertainment budget', 'Custom category'],
    });
  }
}

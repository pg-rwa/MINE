import { AgentManifest, Message, AgentContext, AgentResponse, Insight } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class UtilityAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'utility',
    name: 'Utility & Bills',
    description: 'Track electricity, water, gas, internet, and phone bills. Set reminders and auto-pay.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'zap',
    category: 'utility',
    capabilities: [
      { id: 'track_bills', name: 'Bill Tracker', description: 'Track all utility bills', keywords: ['bill', 'electricity', 'water', 'gas', 'internet', 'phone', 'utility'] },
      { id: 'payment_reminders', name: 'Payment Reminders', description: 'Never miss a due date', keywords: ['due', 'pay', 'reminder', 'overdue'] },
      { id: 'usage_analysis', name: 'Usage Analysis', description: 'Track consumption patterns', keywords: ['usage', 'consumption', 'units', 'compare'] },
    ],
    widgets: [
      { id: 'upcoming_bills', name: 'Upcoming Bills', size: 'small' },
    ],
    requiredPermissions: ['bills'],
    optionalPermissions: ['expenses', 'bank_accounts'],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    // Try AI first for contextual responses
    const vaultData = this.getVaultDataSummary(context, ['bills']);
    const aiResponse = await this.generateAIResponse(message, context, vaultData || undefined);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Upcoming bills', 'Pay a bill', 'Usage analysis', 'Set reminders'] });
    }

    if (content.includes('electricity') || content.includes('power')) {
      return this.respond("I'll check your electricity bill status. Would you like to view or pay?", {
        suggestions: ['View current bill', 'Pay now', 'Usage history', 'Compare months'],
      });
    }
    if (content.includes('pay') || content.includes('bill')) {
      return this.respond("Here are your upcoming bills. Which one would you like to handle?", {
        suggestions: ['Pay all due', 'View details', 'Set auto-pay'],
      });
    }

    return this.respond("I track all your utility bills — electricity, water, gas, internet, and phone.", {
      suggestions: ['Upcoming bills', 'Pay a bill', 'Usage analysis', 'Set reminders'],
    });
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    return [
      this.insight('Electricity Bill Due', 'Electricity bill of $85 due in 2 days', 'high', {
        label: 'Pay Now',
        type: 'confirm_action',
        payload: { action: 'pay_bill', billType: 'electricity' },
      }),
    ];
  }
}

import { AgentManifest, Message, AgentContext, AgentResponse, Insight } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class TaxAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'tax',
    name: 'Tax Planner',
    description: 'Track tax-saving investments, compute estimated taxes, manage documents, and prepare for filing season.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'receipt',
    category: 'finance',
    capabilities: [
      { id: 'tax_estimation', name: 'Tax Estimator', description: 'Estimate current year tax liability', keywords: ['tax', 'income tax', 'estimate', 'liability', 'owe'] },
      { id: 'tax_saving', name: 'Tax Savings', description: 'Track 80C, 80D, HRA and other deductions', keywords: ['80c', '80d', 'hra', 'deduction', 'save tax', 'section'] },
      { id: 'document_manager', name: 'Tax Documents', description: 'Store and organize tax documents', keywords: ['form 16', 'ais', 'itr', 'document', 'receipt'] },
    ],
    widgets: [
      { id: 'tax_summary', name: 'Tax Summary', size: 'medium' },
      { id: 'savings_tracker', name: 'Tax Savings Progress', size: 'small' },
    ],
    requiredPermissions: ['tax_records', 'income'],
    optionalPermissions: ['investments', 'expenses', 'documents'],
    requiredPlan: 'premium',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    // Try AI first for contextual responses
    const vaultData = this.getVaultDataSummary(context, ['tax_records', 'income']);
    const aiResponse = await this.generateAIResponse(message, context, vaultData || undefined);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Estimate my tax', 'Tax saving options', 'Upload tax document', 'Filing checklist'] });
    }

    if (content.includes('estimate') || content.includes('how much tax')) {
      return this.respond("I'll calculate your estimated tax. I'll need your income details and deductions. Let me check what I have.", {
        suggestions: ['Use last year\'s data', 'Enter new income', 'Update deductions'],
      });
    }
    if (content.includes('save') || content.includes('deduction') || content.includes('80c')) {
      return this.respond("Here's your tax savings progress. You can still save more under various sections.", {
        suggestions: ['80C investments', '80D health insurance', 'HRA exemption', 'All deductions'],
      });
    }

    return this.respond("I help with tax planning, estimation, and document management. What do you need?", {
      suggestions: ['Estimate my tax', 'Tax saving options', 'Upload tax document', 'Filing checklist'],
    });
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    return [
      this.insight('Tax Filing Deadline', 'ITR filing deadline is in 45 days. Start preparing.', 'high', {
        label: 'Start Filing Prep',
        type: 'navigate',
        payload: { screen: 'tax_filing' },
      }),
    ];
  }
}

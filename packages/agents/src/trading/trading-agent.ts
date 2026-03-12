import { AgentManifest, Message, AgentContext, AgentResponse, Insight } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class TradingAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'trading',
    name: 'Investment & Trading',
    description: 'Track portfolio, monitor stocks/crypto/mutual funds, get market insights, and manage SIPs.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'trending-up',
    category: 'finance',
    capabilities: [
      { id: 'portfolio', name: 'Portfolio Tracker', description: 'Track all investments in one place', keywords: ['portfolio', 'investments', 'holdings', 'stocks', 'mutual funds'] },
      { id: 'market_watch', name: 'Market Watch', description: 'Monitor stocks and crypto', keywords: ['stock', 'share', 'crypto', 'bitcoin', 'market', 'nifty', 'sensex'] },
      { id: 'sip_manager', name: 'SIP Manager', description: 'Track and manage SIPs', keywords: ['sip', 'systematic', 'recurring investment'] },
    ],
    widgets: [
      { id: 'portfolio_value', name: 'Portfolio Value', size: 'medium' },
      { id: 'market_movers', name: 'Market Movers', size: 'small' },
    ],
    requiredPermissions: ['investments'],
    optionalPermissions: ['transactions', 'bank_accounts'],
    requiredPlan: 'premium',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();
    const intent = this.analyzeIntent(message, context);

    // Try AI first for contextual responses
    const vaultData = this.getVaultDataSummary(context, ['investments']);
    const aiResponse = await this.generateAIResponse(message, context, vaultData || undefined);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['My portfolio', 'Market overview', 'SIP status', 'Add investment'] });
    }

    if (content.includes('portfolio') || content.includes('holding')) {
      return this.respondWithContext(intent, context,
        "Let me pull up your portfolio. Here's your current allocation and P&L.", {
          suggestions: ['Detailed breakdown', 'Sector allocation', 'Rebalance suggestions'],
        });
    }
    if (content.includes('stock') || content.includes('share') || content.includes('market')) {
      return this.respondWithContext(intent, context,
        "What stock or market are you interested in?", {
          suggestions: ['My watchlist', 'Market overview', 'Top gainers today', 'Search stock'],
        });
    }

    const crossNote = this.getCrossAgentContext(intent, context);
    if (crossNote) {
      return this.respond(
        `${crossNote}\n\nI track your investments — stocks, mutual funds, crypto, and SIPs. What would you like to know?`, {
          suggestions: ['My portfolio', 'Market overview', 'SIP status', 'Add investment'],
        });
    }

    return this.respond("I track your investments — stocks, mutual funds, crypto, and SIPs.", {
      suggestions: ['My portfolio', 'Market overview', 'SIP status', 'Add investment'],
    });
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    return [
      this.insight('SIP Due Tomorrow', 'Monthly SIP of $500 in Index Fund scheduled for tomorrow', 'medium'),
    ];
  }
}

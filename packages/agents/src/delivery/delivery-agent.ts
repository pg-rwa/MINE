import { AgentManifest, Message, AgentContext, AgentResponse } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class DeliveryAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'delivery',
    name: 'Delivery Tracker',
    description: 'Track all your online orders and deliveries across platforms in one place.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'package',
    category: 'shopping',
    capabilities: [
      { id: 'track_orders', name: 'Order Tracking', description: 'Track all deliveries', keywords: ['order', 'delivery', 'package', 'tracking', 'shipment', 'courier'] },
      { id: 'returns', name: 'Returns Manager', description: 'Manage returns and refunds', keywords: ['return', 'refund', 'exchange', 'replace'] },
    ],
    widgets: [
      { id: 'active_deliveries', name: 'Active Deliveries', size: 'small' },
    ],
    requiredPermissions: ['deliveries', 'orders'],
    optionalPermissions: ['emails'],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    if (content.includes('where') || content.includes('track') || content.includes('status')) {
      return this.respond("Let me check the status of your orders. Which delivery are you looking for?", {
        suggestions: ['All active orders', 'Latest order', 'Arriving today'],
      });
    }
    if (content.includes('return') || content.includes('refund')) {
      return this.respond("I'll help with returns. Which order do you want to return?");
    }

    return this.respond("I track all your deliveries across Amazon, Flipkart, Swiggy, and more.", {
      suggestions: ['Active deliveries', 'Arriving today', 'Order history', 'Initiate return'],
    });
  }
}

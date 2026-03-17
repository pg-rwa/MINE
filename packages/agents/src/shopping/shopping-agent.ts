import { AgentManifest, Message, AgentContext, AgentResponse } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class ShoppingAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'shopping',
    name: 'Shopping Assistant',
    description: 'Manage shopping lists, track prices, find deals, compare products, and manage wishlists.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'shopping-cart',
    category: 'shopping',
    capabilities: [
      { id: 'shopping_lists', name: 'Shopping Lists', description: 'Create and manage lists', keywords: ['list', 'buy', 'need', 'grocery', 'shopping list'] },
      { id: 'price_tracking', name: 'Price Tracker', description: 'Track prices and get alerts', keywords: ['price', 'deal', 'discount', 'sale', 'cheap', 'compare'] },
      { id: 'wishlists', name: 'Wishlist', description: 'Save items for later', keywords: ['wishlist', 'want', 'save for later', 'bookmark'] },
    ],
    widgets: [
      { id: 'active_lists', name: 'Shopping Lists', size: 'small' },
      { id: 'price_alerts', name: 'Price Drops', size: 'small' },
    ],
    requiredPermissions: ['shopping_lists', 'orders'],
    optionalPermissions: ['expenses'],
    requiredPlan: 'free',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const handoff = this.tryCrossAgentHandoff(message, context);
    if (handoff) return handoff;

    const vaultData = this.getVaultDataSummary(context, ['shopping_lists', 'orders']);
    const aiResponse = await this.generateAIResponse(message, context, vaultData || undefined);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Track a price', 'My shopping lists', 'Recent price drops', 'Wishlist'] });
    }

    const content = message.content.toLowerCase();
    if (content.includes('list') || content.includes('grocery')) {
      return this.respond("I'll manage your shopping list. What do you need to add?", { suggestions: ['View current list', 'New list', 'Share list'] });
    }
    if (content.includes('price') || content.includes('deal') || content.includes('compare') || content.includes('discount')) {
      return this.respond("I can track prices and find deals. What product are you looking for?", { suggestions: ['My price alerts', 'Search deals', 'Compare products'] });
    }
    return this.respond("I help with shopping lists, price tracking, and finding the best deals. What are you looking for?", {
      suggestions: ['My shopping lists', 'Track a price', 'Recent price drops', 'Wishlist'],
    });
  }
}

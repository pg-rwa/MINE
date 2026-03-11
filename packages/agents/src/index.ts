// MINE Agents - All built-in domain agents
export { BaseAgent } from './base-agent';
export { FinanceAgent } from './finance/finance-agent';
export { PropertyAgent } from './property/property-agent';
export { FitnessAgent } from './fitness/fitness-agent';
export { TaxAgent } from './tax/tax-agent';
export { ShoppingAgent } from './shopping/shopping-agent';
export { TradingAgent } from './trading/trading-agent';
export { EmailAgent } from './email/email-agent';
export { SocialAgent } from './social/social-agent';
export { UtilityAgent } from './utility/utility-agent';
export { DeliveryAgent } from './delivery/delivery-agent';
export { CookingAgent } from './cooking/cooking-agent';
export { EducationAgent } from './education/education-agent';
export { SearchAgent } from './search/search-agent';
export { ChatAgent } from './chat/chat-agent';
export { AdHocAgent } from './adhoc/adhoc-agent';

import { AgentRegistry } from '@mine/core';
import { FinanceAgent } from './finance/finance-agent';
import { PropertyAgent } from './property/property-agent';
import { FitnessAgent } from './fitness/fitness-agent';
import { TaxAgent } from './tax/tax-agent';
import { ShoppingAgent } from './shopping/shopping-agent';
import { TradingAgent } from './trading/trading-agent';
import { EmailAgent } from './email/email-agent';
import { SocialAgent } from './social/social-agent';
import { UtilityAgent } from './utility/utility-agent';
import { DeliveryAgent } from './delivery/delivery-agent';
import { CookingAgent } from './cooking/cooking-agent';
import { EducationAgent } from './education/education-agent';
import { SearchAgent } from './search/search-agent';
import { ChatAgent } from './chat/chat-agent';
import { AdHocAgent } from './adhoc/adhoc-agent';

/**
 * Register all built-in agents with the registry.
 */
export function registerBuiltInAgents(registry: AgentRegistry): void {
  const agents = [
    () => new FinanceAgent(),
    () => new PropertyAgent(),
    () => new FitnessAgent(),
    () => new TaxAgent(),
    () => new ShoppingAgent(),
    () => new TradingAgent(),
    () => new EmailAgent(),
    () => new SocialAgent(),
    () => new UtilityAgent(),
    () => new DeliveryAgent(),
    () => new CookingAgent(),
    () => new EducationAgent(),
    () => new SearchAgent(),
    () => new ChatAgent(),
    () => new AdHocAgent(),
  ];

  for (const factory of agents) {
    const instance = factory();
    registry.register(instance.manifest, factory);
  }
}

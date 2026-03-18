// MINE Agents — unified single agent
export { BaseAgent } from './base-agent';
export { MineAgent } from './mine-agent';

// Legacy agent exports (kept for backward compatibility with existing data)
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
import { MineAgent } from './mine-agent';

/**
 * Register the unified MINE agent.
 */
export function registerBuiltInAgents(registry: AgentRegistry): void {
  const agent = new MineAgent();
  registry.register(agent.manifest, () => new MineAgent());
}

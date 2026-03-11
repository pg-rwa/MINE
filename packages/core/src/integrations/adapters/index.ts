export { GmailAdapter } from './gmail-adapter';
export { PlaidAdapter } from './plaid-adapter';
export { GoogleCalendarAdapter } from './google-calendar-adapter';
export { TelegramAdapter } from './telegram-adapter';

import { IntegrationAdapter } from '../adapter-types';
import { GmailAdapter } from './gmail-adapter';
import { PlaidAdapter } from './plaid-adapter';
import { GoogleCalendarAdapter } from './google-calendar-adapter';
import { TelegramAdapter } from './telegram-adapter';

/**
 * Registry of all available integration adapters.
 */
export function createAdapterRegistry(): Map<string, IntegrationAdapter> {
  const registry = new Map<string, IntegrationAdapter>();

  const adapters: IntegrationAdapter[] = [
    new GmailAdapter(),
    new PlaidAdapter(),
    new GoogleCalendarAdapter(),
    new TelegramAdapter(),
  ];

  for (const adapter of adapters) {
    registry.set(adapter.id, adapter);
  }

  return registry;
}

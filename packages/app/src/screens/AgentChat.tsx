/**
 * AgentChat — Conversational interface with a specific agent.
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │  ← Finance Manager          [⋯ Menu]   │
 * ├─────────────────────────────────────────┤
 * │                                         │
 * │  [Agent] How can I help with finances?  │
 * │                                         │
 * │         [You] Show my EMIs              │
 * │                                         │
 * │  [Agent] You have 2 active EMIs:        │
 * │  • Home Loan: $1,200/mo (18 remaining)  │
 * │  • Car Loan: $450/mo (6 remaining)      │
 * │                                         │
 * │  ┌─────────────────────────────────┐    │
 * │  │ EMI Summary Widget              │    │
 * │  │ Total: $1,650/mo                │    │
 * │  │ Next due: March 15              │    │
 * │  └─────────────────────────────────┘    │
 * │                                         │
 * │  [Pay next EMI]  [Prepay]  [Details]   │
 * │                                         │
 * ├─────────────────────────────────────────┤
 * │  [📎] Type a message...        [Send]   │
 * └─────────────────────────────────────────┘
 *
 * Features:
 * - Rich message bubbles with inline widgets
 * - Suggestion chips below agent messages
 * - Action confirmation modals
 * - File/image attachment support
 * - Voice input
 */

import React from 'react';

export function AgentChat() {
  return null; // Placeholder
}

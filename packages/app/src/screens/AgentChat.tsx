/**
 * Chat — Interactive conversation screen (the core of MINE).
 *
 * Each conversation is a topic-based chat thread. The single MINE agent
 * handles all domains — finance, property, health, etc.
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │  ← EMI Discussion          [⋯ Menu]    │
 * ├─────────────────────────────────────────┤
 * │                                         │
 * │  [MINE] Hey! What would you like to     │
 * │         know about your finances?       │
 * │                                         │
 * │         [You] Show my EMIs              │
 * │                                         │
 * │  [MINE] You have 2 active EMIs:         │
 * │  • Home Loan: $1,200/mo (18 remaining)  │
 * │  • Car Loan: $450/mo (6 remaining)      │
 * │                                         │
 * │  [Add EMI]  [Summary]  [Expenses]       │
 * │                                         │
 * │         [You] What about my rent?       │
 * │                                         │
 * │  [MINE] Your properties earn $2,400/mo  │
 * │  in rent. Combined with your salary of  │
 * │  $8,000/mo, your total income is        │
 * │  $10,400/mo against $3,650 in outflows. │
 * │                                         │
 * ├─────────────────────────────────────────┤
 * │  [📎] Type a message...        [Send]   │
 * └─────────────────────────────────────────┘
 *
 * Features:
 * - Rich message bubbles with inline forms/widgets
 * - Suggestion chips below MINE's messages
 * - Cross-domain context (ask about finances in a property chat)
 * - File/image attachment support
 * - Inline forms for data entry (EMI, expense, property, etc.)
 */

import React from 'react';

export function Chat() {
  return null; // Placeholder for RN component tree
}

/**
 * Screen architecture notes:
 *
 * Data flow:
 *   GET /api/chat/conversations/:id → Load conversation messages
 *   POST /api/messages { conversationId, content } → Send message
 *   GET /api/activity/sse → Live progress streaming
 *
 * Key interactions:
 *   - Send message → MINE responds with full cross-domain context
 *   - Suggestion chips → Quick message shortcuts
 *   - Inline forms → Data entry (EMI, expense, property, tenant)
 *   - Attachments → Upload files/images for AI analysis
 *   - Menu → Rename conversation, export, delete
 */

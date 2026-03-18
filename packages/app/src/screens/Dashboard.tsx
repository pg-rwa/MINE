/**
 * Dashboard — Home screen of MINE.
 *
 * Shows insights and recent conversations, with a universal chat input.
 *
 * Layout:
 * ┌─────────────────────────────────────────┐
 * │  Good morning, Piyush          [Bell]   │
 * ├─────────────────────────────────────────┤
 * │  Insights                               │
 * │  ┌─────────┐ ┌─────────┐ ┌─────────┐  │
 * │  │ EMI Due │ │ Rent    │ │ Bill    │  │
 * │  │ in 3d   │ │ Overdue │ │ Due     │  │
 * │  └─────────┘ └─────────┘ └─────────┘  │
 * ├─────────────────────────────────────────┤
 * │  Recent Chats                           │
 * │  ┌───────────────────────────────────┐  │
 * │  │ EMI Discussion        2h ago     │  │
 * │  │ Property Overview     Yesterday  │  │
 * │  │ Monthly Budget        3d ago     │  │
 * │  └───────────────────────────────────┘  │
 * ├─────────────────────────────────────────┤
 * │  [+ New Chat]                           │
 * │  [💬 Ask MINE anything...]              │
 * └─────────────────────────────────────────┘
 */

import React from 'react';

interface DashboardProps {
  userName: string;
}

export function Dashboard({ userName }: DashboardProps) {
  // This is the architectural skeleton — actual React Native implementation
  // will hydrate with real data via the API.
  return null; // Placeholder for RN component tree
}

/**
 * Screen architecture notes:
 *
 * Data flow:
 *   GET /api/insights → InsightCards (sorted by priority)
 *   GET /api/chat/conversations → Recent chat list
 *   POST /api/messages → Universal chat input (creates new conversation)
 *
 * Key interactions:
 *   - Tap insight card → Open relevant chat or confirm action
 *   - Tap conversation → Open chat view
 *   - "+ New Chat" → Start new conversation
 *   - Chat input → Send message, auto-creates conversation
 *   - Bell icon → Notification center
 */

import { AgentManifest, Message, AgentContext, AgentResponse } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class ChatAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'chat',
    name: 'Chat & Messaging Hub',
    description: 'Unified inbox for WhatsApp, Telegram, Slack, and SMS. AI-suggested replies and message scheduling.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'message-circle',
    category: 'social',
    capabilities: [
      { id: 'unified_inbox', name: 'Unified Inbox', description: 'All chats in one place', keywords: ['chat', 'message', 'whatsapp', 'telegram', 'slack', 'sms', 'text'] },
      { id: 'smart_reply', name: 'Smart Reply', description: 'AI-suggested responses', keywords: ['reply', 'respond', 'quick reply'] },
      { id: 'schedule_message', name: 'Scheduled Messages', description: 'Send messages at a specific time', keywords: ['schedule message', 'send later', 'timed message'] },
    ],
    widgets: [
      { id: 'unread_messages', name: 'Unread Messages', size: 'small' },
    ],
    requiredPermissions: ['messages', 'contacts'],
    optionalPermissions: [],
    requiredPlan: 'premium',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    const handoff = this.tryCrossAgentHandoff(message, context);
    if (handoff) return handoff;

    // Try AI first for contextual responses
    const aiResponse = await this.generateAIResponse(message, context);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['Unread messages', 'Send a message', 'Scheduled messages'] });
    }

    if (content.includes('unread') || content.includes('messages')) {
      return this.respond("Here's a summary of your unread messages across platforms.", {
        suggestions: ['WhatsApp', 'Telegram', 'Slack', 'All platforms'],
      });
    }
    if (content.includes('send') || content.includes('text') || content.includes('message')) {
      return this.respond("Who would you like to message and on which platform?", {
        suggestions: ['WhatsApp', 'Telegram', 'SMS', 'Schedule for later'],
      });
    }

    return this.respond("I unify all your chats — WhatsApp, Telegram, Slack, and SMS in one inbox.", {
      suggestions: ['Unread messages', 'Send a message', 'Scheduled messages'],
    });
  }
}

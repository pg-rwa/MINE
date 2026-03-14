import { FastifyPluginCallback } from 'fastify';
import { Message } from '@mine/core';
import { AppContext } from '../app';

export function messageRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // Send a message (auto-routed or to specific agent)
    // Now persists both the user message and agent response to chat history.
    app.post<{ Body: { content: string; agentId?: string; conversationId?: string } }>('/', async (request) => {
      const userId = (request as any).userId;
      const { content, agentId, conversationId: existingConvId } = request.body;

      // Use existing conversation or start a new one
      const conversationId = existingConvId || crypto.randomUUID();

      const message: Message = {
        id: crypto.randomUUID(),
        userId,
        agentId,
        content,
        attachments: [],
        timestamp: new Date(),
      };

      // Save user message to history
      ctx.persistence?.saveMessage({
        id: message.id,
        userId,
        conversationId,
        agentId,
        role: 'user',
        content,
        createdAt: message.timestamp,
      });

      // Route and get response
      const response = await ctx.router.route(message);

      // Save agent response to history
      ctx.persistence?.saveMessage({
        id: crypto.randomUUID(),
        userId,
        conversationId,
        agentId: response.agentId,
        role: 'assistant',
        content: response.content,
        metadata: {
          actions: response.actions,
          suggestions: response.suggestions,
        },
        createdAt: response.timestamp,
      });

      // Auto-generate conversation title from first AI response
      if (!existingConvId && ctx.persistence) {
        const title = await generateTitle(ctx, content, response.content);
        ctx.persistence.updateConversationTitle(conversationId, title);
      }

      return {
        ...response,
        conversationId,
      };
    });

    done();
  };
}

/**
 * Generate a short title for a new conversation using AI.
 * Falls back to first 60 chars of user message.
 */
async function generateTitle(ctx: AppContext, userMessage: string, _agentResponse: string): Promise<string> {
  if (!ctx.aiEngine.isAvailable) {
    return userMessage.slice(0, 60);
  }

  try {
    const title = await ctx.aiEngine.complete(
      `Generate a very short title (max 6 words) for this conversation:\nUser: "${userMessage.slice(0, 200)}"\nRespond with ONLY the title, no quotes.`,
      { tier: 'fast', maxTokens: 20 }
    );
    return title.trim().slice(0, 80) || userMessage.slice(0, 60);
  } catch {
    return userMessage.slice(0, 60);
  }
}

import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

/**
 * Chat/conversation routes — the core of the interactive chat platform.
 * Conversations are topic-based, not agent-based.
 */
export function chatRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {

    // List user's conversations (most recent first)
    app.get<{ Querystring: { limit?: string; offset?: string } }>(
      '/conversations',
      async (request) => {
        const userId = (request as any).userId;
        const limit = parseInt(request.query.limit || '50', 10);
        const offset = parseInt(request.query.offset || '0', 10);

        if (!ctx.persistence) return [];
        return ctx.persistence.getConversations(userId, limit, offset);
      }
    );

    // Get messages in a conversation
    app.get<{ Params: { conversationId: string }; Querystring: { limit?: string; offset?: string } }>(
      '/conversations/:conversationId',
      async (request) => {
        const { conversationId } = request.params;
        const limit = parseInt(request.query.limit || '100', 10);
        const offset = parseInt(request.query.offset || '0', 10);

        if (!ctx.persistence) return [];
        return ctx.persistence.getConversationMessages(conversationId, limit, offset);
      }
    );

    // Rename a conversation
    app.patch<{ Params: { conversationId: string }; Body: { title: string } }>(
      '/conversations/:conversationId',
      async (request) => {
        const { conversationId } = request.params;
        const { title } = request.body;
        ctx.persistence?.updateConversationTitle(conversationId, title);
        return { success: true };
      }
    );

    // Delete a conversation
    app.delete<{ Params: { conversationId: string } }>(
      '/conversations/:conversationId',
      async (request) => {
        ctx.persistence?.deleteConversation(request.params.conversationId);
        return { success: true };
      }
    );

    done();
  };
}

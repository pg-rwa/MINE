import { FastifyPluginCallback } from 'fastify';
import { Message } from '@mine/core';
import { AppContext } from '../app';

export function messageRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // Send a message (auto-routed or to specific agent)
    app.post<{ Body: { content: string; agentId?: string } }>('/', async (request) => {
      const userId = (request as any).userId;
      const { content, agentId } = request.body;

      const message: Message = {
        id: crypto.randomUUID(),
        userId,
        agentId,
        content,
        attachments: [],
        timestamp: new Date(),
      };

      const response = await ctx.router.route(message);
      return response;
    });

    done();
  };
}

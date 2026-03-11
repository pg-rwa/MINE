import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

export function insightRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // Get all insights from active agents (powers the dashboard)
    app.get('/', async (request) => {
      const userId = (request as any).userId;
      return ctx.runtime.collectInsights(userId);
    });

    // Get audit log
    app.get<{ Querystring: { agentId?: string; limit?: string } }>('/audit', async (request) => {
      const userId = (request as any).userId;
      const { agentId, limit } = request.query;
      return ctx.auditLog.query(userId, {
        agentId,
        limit: limit ? parseInt(limit) : 100,
      });
    });

    done();
  };
}

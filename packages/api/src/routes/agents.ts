import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

export function agentRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // List all available agents (from registry)
    app.get('/available', async () => {
      return ctx.registry.listAvailable();
    });

    // List installed agents for current user
    app.get('/installed', async () => {
      return ctx.runtime.listAgents();
    });

    // Install an agent
    app.post<{ Params: { agentId: string } }>('/install/:agentId', async (request) => {
      const { agentId } = request.params;
      const userId = (request as any).userId;
      const agent = ctx.registry.create(agentId);
      await ctx.runtime.install(agent, userId);
      return { success: true, agentId };
    });

    // Uninstall an agent
    app.post<{ Params: { agentId: string } }>('/uninstall/:agentId', async (request) => {
      const { agentId } = request.params;
      const userId = (request as any).userId;
      await ctx.runtime.uninstall(agentId, userId);
      return { success: true, agentId };
    });

    // Activate/deactivate
    app.post<{ Params: { agentId: string } }>('/activate/:agentId', async (request) => {
      const userId = (request as any).userId;
      await ctx.runtime.activate(request.params.agentId, userId);
      return { success: true };
    });

    app.post<{ Params: { agentId: string } }>('/deactivate/:agentId', async (request) => {
      const userId = (request as any).userId;
      await ctx.runtime.deactivate(request.params.agentId, userId);
      return { success: true };
    });

    // Search marketplace
    app.get<{ Querystring: { q?: string; category?: string } }>('/marketplace', async (request) => {
      const { q = '', category } = request.query;
      if (category) {
        return ctx.marketplace.search(q, category as any);
      }
      return q ? ctx.marketplace.search(q) : ctx.marketplace.getFeatured();
    });

    done();
  };
}

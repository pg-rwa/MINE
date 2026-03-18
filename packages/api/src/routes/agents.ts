import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

export function agentRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // Get agent status (the unified MINE agent)
    app.get('/status', async () => {
      const agents = ctx.runtime.listAgents();
      const mine = agents.find(a => a.manifest.id === 'mine');
      return {
        agent: mine ? { id: mine.manifest.id, name: mine.manifest.name, active: mine.active } : null,
        capabilities: mine?.manifest.capabilities.length ?? 0,
      };
    });

    // List installed agents (backward compat for existing frontend code)
    app.get('/installed', async () => {
      return ctx.runtime.listAgents();
    });

    // List available agents (backward compat)
    app.get('/available', async () => {
      return ctx.registry.listAvailable();
    });

    done();
  };
}

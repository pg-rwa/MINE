import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

export function integrationRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // List available integrations
    app.get('/available', async () => {
      return ctx.integrations.listAvailable();
    });

    // List user's connections
    app.get('/connections', async (request) => {
      const userId = (request as any).userId;
      return ctx.integrations.listConnections(userId);
    });

    // Connect to an integration
    app.post<{ Body: { integrationId: string; credentials: Record<string, unknown> } }>(
      '/connect',
      async (request) => {
        const userId = (request as any).userId;
        const { integrationId, credentials } = request.body;
        return ctx.integrations.connect(userId, integrationId, credentials);
      }
    );

    // Trigger sync
    app.post<{ Params: { connectionId: string } }>('/sync/:connectionId', async (request) => {
      await ctx.integrations.sync(request.params.connectionId);
      return { success: true };
    });

    // Disconnect
    app.post<{ Params: { connectionId: string } }>('/disconnect/:connectionId', async (request) => {
      ctx.integrations.disconnect(request.params.connectionId);
      return { success: true };
    });

    done();
  };
}

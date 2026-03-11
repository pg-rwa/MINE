import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

export function vaultRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // Store data manually
    app.post<{ Body: { category: string; key: string; data: Record<string, unknown> } }>(
      '/',
      async (request) => {
        const userId = (request as any).userId;
        const { category, key, data } = request.body;
        return ctx.vault.put(userId, category as any, key, data, 'manual');
      }
    );

    // Query vault data
    app.get<{ Querystring: { category?: string; limit?: string } }>('/', async (request) => {
      const userId = (request as any).userId;
      const { category, limit } = request.query;
      return ctx.vault.query({
        userId,
        category: category as any,
        limit: limit ? parseInt(limit) : 50,
      });
    });

    // Export all data (GDPR)
    app.get('/export', async (request) => {
      const userId = (request as any).userId;
      return ctx.vault.exportAll(userId);
    });

    // Delete all data
    app.delete('/purge', async (request) => {
      const userId = (request as any).userId;
      const count = ctx.vault.purgeUser(userId);
      return { deleted: count };
    });

    done();
  };
}

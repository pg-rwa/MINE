import { FastifyPluginCallback } from 'fastify';
import { DATA_CATEGORIES } from '@mine/core';
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

    // Debug: show what the MINE agent can see across all categories
    app.get('/debug', async (request) => {
      const userId = (request as any).userId;

      // Raw vault entries (bypasses permissions)
      const allEntries = ctx.vault.exportAll(userId);
      const byCat: Record<string, number> = {};
      for (const e of allEntries) {
        byCat[e.category] = (byCat[e.category] || 0) + 1;
      }

      // What the mine agent sees (with permissions)
      const agentView: Record<string, number> = {};
      const agentErrors: Record<string, string> = {};
      for (const cat of DATA_CATEGORIES) {
        try {
          const entries = ctx.vault.getForAgent(userId, 'mine', cat as any);
          if (entries.length > 0) agentView[cat] = entries.length;
        } catch (err: any) {
          agentErrors[cat] = err.message;
        }
      }

      // Permission status
      const perms = ctx.permissions.list(userId, 'mine');

      return {
        userId,
        rawVaultTotal: allEntries.length,
        rawVaultByCategory: byCat,
        mineAgentView: agentView,
        mineAgentErrors: agentErrors,
        minePermissions: perms.length,
        minePermCategories: perms.map(p => p.resource),
        agentInstalled: ctx.runtime.listAgents().map(a => ({ id: a.manifest.id, active: a.active })),
      };
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

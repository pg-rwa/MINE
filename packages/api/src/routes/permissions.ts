import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

export function permissionRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // List all permissions for user
    app.get('/', async (request) => {
      const userId = (request as any).userId;
      return ctx.permissions.list(userId);
    });

    // List permissions for specific agent
    app.get<{ Params: { agentId: string } }>('/agent/:agentId', async (request) => {
      const userId = (request as any).userId;
      return ctx.permissions.list(userId, request.params.agentId);
    });

    // Grant a permission
    app.post<{ Body: { agentId: string; resource: string; level: string; actions: string[]; duration?: string } }>(
      '/grant',
      async (request) => {
        const userId = (request as any).userId;
        const { agentId, resource, level, actions, duration } = request.body;
        return ctx.permissions.grant(userId, {
          agentId,
          resource: resource as any,
          level: level as any,
          actions: actions as any,
          reason: 'User granted via API',
          duration: (duration as any) ?? '30d',
        });
      }
    );

    // Revoke a permission
    app.post<{ Params: { permissionId: string } }>('/revoke/:permissionId', async (request) => {
      const success = ctx.permissions.revoke(request.params.permissionId);
      return { success };
    });

    // Revoke all for an agent
    app.post<{ Params: { agentId: string } }>('/revoke-all/:agentId', async (request) => {
      const userId = (request as any).userId;
      const count = ctx.permissions.revokeAll(userId, request.params.agentId);
      return { revoked: count };
    });

    done();
  };
}

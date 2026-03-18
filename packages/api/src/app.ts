import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import {
  AgentRuntime,
  AgentRegistry,
  MessageRouter,
  PermissionEngine,
  DataVault,
  AuditLog,
  AIEngine,
  Scheduler,
  Notifier,
  IntegrationGateway,
  WorkflowEngine,
  PersistenceLayer,
  ActivityBus,
} from '@mine/core';
import { agentRoutes } from './routes/agents';
import { messageRoutes } from './routes/messages';
import { permissionRoutes } from './routes/permissions';
import { vaultRoutes } from './routes/vault';
import { insightRoutes } from './routes/insights';
import { integrationRoutes } from './routes/integrations';
import { chatRoutes } from './routes/chat';
import { activityRoutes } from './routes/activity';
import { uploadRoutes } from './routes/uploads';

export interface AppContext {
  runtime: AgentRuntime;
  registry: AgentRegistry;
  router: MessageRouter;
  permissions: PermissionEngine;
  vault: DataVault;
  auditLog: AuditLog;
  aiEngine: AIEngine;
  scheduler: Scheduler;
  notifier: Notifier;
  integrations: IntegrationGateway;
  workflows: WorkflowEngine;
  persistence: PersistenceLayer | null;
  activityBus: ActivityBus | null;
}

export async function createApp(ctx: AppContext) {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  await app.register(cors, { origin: true });

  // Decorate request with user context (simplified — production uses JWT)
  app.decorateRequest('userId', '');
  const restoredUsers = new Set<string>();
  app.addHook('onRequest', async (request) => {
    const userId = request.headers['x-user-id'] as string || 'demo-user';
    (request as any).userId = userId;

    // Lazily install + activate the MINE agent on first request per user
    if (!restoredUsers.has(userId)) {
      restoredUsers.add(userId);
      try {
        // Try restoring agents from persistence
        await ctx.runtime.restoreAgents(userId, ctx.registry);

        // Always ensure the unified MINE agent is installed and active
        const agents = ctx.runtime.listAgents();
        const hasMine = agents.some(a => a.manifest.id === 'mine' && a.active);
        if (!hasMine) {
          const agent = ctx.registry.create('mine');
          if (agent) {
            await ctx.runtime.install(agent, userId);
            await ctx.runtime.activate('mine', userId);
            request.log.info(`Installed MINE agent for user ${userId}`);
          }
        }
      } catch (err) {
        request.log.warn(`Failed to setup agents for user ${userId}: ${err}`);
      }
    }
  });

  // Register route modules
  await app.register(agentRoutes(ctx), { prefix: '/api/agents' });
  await app.register(messageRoutes(ctx), { prefix: '/api/messages' });
  await app.register(permissionRoutes(ctx), { prefix: '/api/permissions' });
  await app.register(vaultRoutes(ctx), { prefix: '/api/vault' });
  await app.register(insightRoutes(ctx), { prefix: '/api/insights' });
  await app.register(integrationRoutes(ctx), { prefix: '/api/integrations' });
  await app.register(chatRoutes(ctx), { prefix: '/api/chat' });
  await app.register(activityRoutes(ctx), { prefix: '/api/activity' });
  await app.register(uploadRoutes(ctx), { prefix: '/api/uploads' });

  // Serve frontend static files
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: '2.0.0',
    ai: {
      available: ctx.aiEngine.isAvailable,
      providers: ctx.aiEngine.getProviderStatus(),
    },
    persistence: ctx.persistence ? 'sqlite' : 'memory',
  }));

  return app;
}

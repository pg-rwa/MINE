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
  AgentMarketplace,
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
  marketplace: AgentMarketplace;
  persistence: PersistenceLayer | null;
  activityBus: ActivityBus | null;
}

export async function createApp(ctx: AppContext) {
  const app = Fastify({
    logger: true,
    trustProxy: true,  // Required behind Railway/cloud reverse proxies for correct protocol detection
  });

  await app.register(cors, { origin: true });

  // Decorate request with user context (simplified — production uses JWT)
  app.decorateRequest('userId', '');
  const restoredUsers = new Set<string>();
  app.addHook('onRequest', async (request) => {
    // In production: verify JWT, extract userId
    const userId = request.headers['x-user-id'] as string || 'demo-user';
    (request as any).userId = userId;

    // Lazily restore installed agents on first request per user.
    // This ensures agents survive redeployments regardless of which userId is used.
    if (!restoredUsers.has(userId)) {
      restoredUsers.add(userId);
      try {
        const count = await ctx.runtime.restoreAgents(userId, ctx.registry);
        if (count > 0) {
          request.log.info(`Restored ${count} agent(s) for user ${userId}`);
        }
      } catch (err) {
        request.log.warn(`Failed to restore agents for user ${userId}: ${err}`);
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

  // Serve frontend static files
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  await app.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/',
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    version: '0.1.0',
    ai: {
      available: ctx.aiEngine.isAvailable,
      providers: ctx.aiEngine.getProviderStatus(),
    },
    persistence: ctx.persistence ? 'sqlite' : 'memory',
  }));

  return app;
}

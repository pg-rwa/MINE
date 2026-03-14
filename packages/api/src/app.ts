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
} from '@mine/core';
import { agentRoutes } from './routes/agents';
import { messageRoutes } from './routes/messages';
import { permissionRoutes } from './routes/permissions';
import { vaultRoutes } from './routes/vault';
import { insightRoutes } from './routes/insights';
import { integrationRoutes } from './routes/integrations';
import { chatRoutes } from './routes/chat';

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
}

export async function createApp(ctx: AppContext) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  // Decorate request with user context (simplified — production uses JWT)
  app.decorateRequest('userId', '');
  app.addHook('onRequest', async (request) => {
    // In production: verify JWT, extract userId
    (request as any).userId = request.headers['x-user-id'] as string || 'demo-user';
  });

  // Register route modules
  await app.register(agentRoutes(ctx), { prefix: '/api/agents' });
  await app.register(messageRoutes(ctx), { prefix: '/api/messages' });
  await app.register(permissionRoutes(ctx), { prefix: '/api/permissions' });
  await app.register(vaultRoutes(ctx), { prefix: '/api/vault' });
  await app.register(insightRoutes(ctx), { prefix: '/api/insights' });
  await app.register(integrationRoutes(ctx), { prefix: '/api/integrations' });
  await app.register(chatRoutes(ctx), { prefix: '/api/chat' });

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

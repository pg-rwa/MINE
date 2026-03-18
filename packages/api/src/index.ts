import {
  PermissionEngine,
  DataVault,
  AuditLog,
  AIEngine,
  AgentRuntime,
  AgentRegistry,
  MessageRouter,
  Scheduler,
  Notifier,
  IntegrationGateway,
  WorkflowEngine,
  createAdapterRegistry,
  PersistenceLayer,
  ActivityBus,
} from '@mine/core';
import { registerBuiltInAgents } from '@mine/agents';
import { createApp } from './app';

/**
 * Bootstrap the MINE backend.
 */
async function main() {
  // ─── Persistence (SQLite) ───────────────────────────
  const persistence = new PersistenceLayer();

  // ─── Initialize Core Services ──────────────────────
  const permissions = new PermissionEngine();
  const vault = new DataVault(permissions);
  const auditLog = new AuditLog();
  const aiEngine = new AIEngine({
    providers: [
      {
        name: 'claude',
        enabled: true,
        priority: 1,
        models: {
          fast: 'claude-haiku-4-5-20251001',
          smart: 'claude-sonnet-4-6',
        },
      },
      {
        name: 'openai',
        enabled: true,
        priority: 2,
        models: {
          fast: 'gpt-4o-mini',
          smart: 'gpt-4o',
        },
      },
    ],
  });
  const scheduler = new Scheduler();
  const notifier = new Notifier();
  const integrations = new IntegrationGateway();
  const workflows = new WorkflowEngine();

  // ─── Wire Persistence Into Services ─────────────────
  vault.enablePersistence(persistence);
  integrations.enablePersistence(persistence);

  // ─── Register Integrations & Adapters ──────────────
  const adapters = createAdapterRegistry();
  integrations.configure(adapters, vault);

  const integrationConfigs = [
    { id: 'gmail', name: 'Gmail', type: 'oauth2' as const, provider: 'google', dataCategory: 'transactions' as const, syncInterval: 30, config: {} },
    { id: 'google-calendar', name: 'Google Calendar', type: 'oauth2' as const, provider: 'google', dataCategory: 'calendar' as const, syncInterval: 15, config: {} },
    { id: 'plaid', name: 'Bank Accounts', type: 'oauth2' as const, provider: 'plaid', dataCategory: 'bank_accounts' as const, syncInterval: 60, config: {} },
    { id: 'telegram', name: 'Telegram', type: 'webhook' as const, provider: 'telegram', dataCategory: 'messages' as const, syncInterval: 0, config: {} },
  ];
  for (const cfg of integrationConfigs) {
    integrations.registerIntegration(cfg);
  }

  // ─── Initialize Agent System ───────────────────────
  const activityBus = new ActivityBus();

  const runtime = new AgentRuntime(permissions, vault, auditLog, aiEngine);
  runtime.enablePersistence(persistence);
  runtime.setActivityBus(activityBus);
  runtime.setIntegrationGateway(integrations);

  const registry = new AgentRegistry();
  const router = new MessageRouter(runtime, aiEngine);
  router.setActivityBus(activityBus);

  // Register the unified MINE agent
  registerBuiltInAgents(registry);

  // ─── Create API Server ─────────────────────────────
  const app = await createApp({
    runtime,
    registry,
    router,
    permissions,
    vault,
    auditLog,
    aiEngine,
    scheduler,
    notifier,
    integrations,
    workflows,
    persistence,
    activityBus,
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  await app.listen({ port, host });
  console.log(`MINE API running at http://${host}:${port}`);
  console.log(`Registered ${registry.listAvailable().length} agent(s)`);
  const providerStatus = aiEngine.getProviderStatus();
  if (providerStatus.some(p => p.available)) {
    const active = providerStatus.filter(p => p.available).map(p => p.name).join(' + ');
    console.log(`AI Engine: Connected (${active}) — auto-failover ${providerStatus.filter(p => p.available).length > 1 ? 'enabled' : 'disabled'}`);
  } else {
    console.log('AI Engine: Not configured — set ANTHROPIC_API_KEY and/or OPENAI_API_KEY for smart responses');
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await app.close();
      persistence.close();
      console.log('MINE shut down cleanly.');
    } catch (err) {
      console.error('Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start MINE:', err);
  process.exit(1);
});

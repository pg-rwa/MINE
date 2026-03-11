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
  AgentMarketplace,
} from '@mine/core';
import { registerBuiltInAgents } from '@mine/agents';
import { createApp } from './app';

/**
 * Bootstrap the MINE backend.
 */
async function main() {
  // ─── Initialize Core Services ──────────────────────
  const permissions = new PermissionEngine();
  const vault = new DataVault(permissions);
  const auditLog = new AuditLog();
  const aiEngine = new AIEngine({ provider: 'claude', model: 'claude-sonnet-4-6' });
  const scheduler = new Scheduler();
  const notifier = new Notifier();
  const integrations = new IntegrationGateway();
  const workflows = new WorkflowEngine();
  const marketplace = new AgentMarketplace();

  // ─── Initialize Agent System ───────────────────────
  const runtime = new AgentRuntime(permissions, vault, auditLog);
  const registry = new AgentRegistry();
  const router = new MessageRouter(runtime, aiEngine);

  // Register all built-in agents
  registerBuiltInAgents(registry);

  // ─── Create API Server ─────────────────────────────
  const app = await createApp({
    runtime,
    registry,
    router,
    permissions,
    vault,
    auditLog,
    scheduler,
    notifier,
    integrations,
    workflows,
    marketplace,
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  await app.listen({ port, host });
  console.log(`MINE API running at http://${host}:${port}`);
  console.log(`Registered ${registry.listAvailable().length} agents`);
}

main().catch((err) => {
  console.error('Failed to start MINE:', err);
  process.exit(1);
});

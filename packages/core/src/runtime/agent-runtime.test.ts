import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRuntime, IAgent, AgentContext } from './agent-runtime';
import { PermissionEngine } from '../permissions/permission-engine';
import { DataVault } from '../vault/data-vault';
import { AuditLog } from '../audit/audit-log';
import { AgentManifest, Message, AgentResponse, SystemEvent, Insight } from '../types';

function createMockAgent(id: string, overrides: Partial<IAgent> = {}): IAgent {
  const manifest: AgentManifest = {
    id,
    name: `Test Agent ${id}`,
    description: 'A test agent',
    version: '1.0.0',
    author: 'test',
    icon: 'test',
    category: 'utility',
    capabilities: [],
    widgets: [],
    requiredPermissions: [],
    optionalPermissions: [],
    requiredPlan: 'free',
    pricing: { type: 'free', currency: 'USD' },
  };

  return {
    manifest,
    onInstall: vi.fn().mockResolvedValue(undefined),
    onActivate: vi.fn().mockResolvedValue(undefined),
    onDeactivate: vi.fn().mockResolvedValue(undefined),
    onUninstall: vi.fn().mockResolvedValue(undefined),
    handleMessage: vi.fn().mockResolvedValue({
      agentId: id,
      content: 'response',
      actions: [],
      suggestions: [],
      timestamp: new Date(),
    } satisfies AgentResponse),
    handleEvent: vi.fn().mockResolvedValue(undefined),
    getInsights: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('AgentRuntime', () => {
  let runtime: AgentRuntime;
  let permissions: PermissionEngine;
  let vault: DataVault;
  let auditLog: AuditLog;
  const userId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    permissions = new PermissionEngine();
    vault = new DataVault(permissions);
    auditLog = new AuditLog();
    runtime = new AgentRuntime(permissions, vault, auditLog);
  });

  describe('install', () => {
    it('installs and activates an agent', async () => {
      const agent = createMockAgent('test-agent');
      await runtime.install(agent, userId);

      expect(agent.onInstall).toHaveBeenCalled();
      expect(agent.onActivate).toHaveBeenCalled();

      const agents = runtime.listAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].active).toBe(true);
    });

    it('emits install and activate events', async () => {
      const installed = vi.fn();
      const activated = vi.fn();
      runtime.on('agent:installed', installed);
      runtime.on('agent:activated', activated);

      await runtime.install(createMockAgent('test-agent'), userId);

      expect(installed).toHaveBeenCalledWith('test-agent');
      expect(activated).toHaveBeenCalledWith('test-agent');
    });

    it('throws when agent already installed', async () => {
      const agent = createMockAgent('test-agent');
      await runtime.install(agent, userId);
      await expect(runtime.install(agent, userId)).rejects.toThrow('already installed');
    });
  });

  describe('deactivate / activate', () => {
    it('deactivates an active agent', async () => {
      const agent = createMockAgent('test-agent');
      await runtime.install(agent, userId);
      await runtime.deactivate('test-agent', userId);

      const agents = runtime.listAgents();
      expect(agents[0].active).toBe(false);
      expect(agent.onDeactivate).toHaveBeenCalled();
    });

    it('reactivates a deactivated agent', async () => {
      const agent = createMockAgent('test-agent');
      await runtime.install(agent, userId);
      await runtime.deactivate('test-agent', userId);
      await runtime.activate('test-agent', userId);

      expect(runtime.listAgents()[0].active).toBe(true);
    });
  });

  describe('uninstall', () => {
    it('deactivates, cleans up, and removes agent', async () => {
      const agent = createMockAgent('test-agent');
      await runtime.install(agent, userId);

      // Grant a permission that should be revoked on uninstall
      permissions.grant(userId, {
        agentId: 'test-agent',
        resource: 'transactions',
        level: 'observe',
        actions: ['read'],
        reason: 'test',
      });

      await runtime.uninstall('test-agent', userId);

      expect(agent.onDeactivate).toHaveBeenCalled();
      expect(agent.onUninstall).toHaveBeenCalled();
      expect(runtime.listAgents()).toHaveLength(0);
      expect(permissions.list(userId, 'test-agent')).toHaveLength(0);
    });
  });

  describe('handleMessage', () => {
    it('routes message to active agent', async () => {
      const agent = createMockAgent('test-agent');
      await runtime.install(agent, userId);

      const message: Message = {
        id: '00000000-0000-0000-0000-000000000099',
        userId,
        content: 'Hello',
        attachments: [],
        timestamp: new Date(),
      };

      const response = await runtime.handleMessage('test-agent', message);
      expect(response.content).toBe('response');
      expect(agent.handleMessage).toHaveBeenCalled();
    });

    it('throws when agent is not active', async () => {
      const agent = createMockAgent('test-agent');
      await runtime.install(agent, userId);
      await runtime.deactivate('test-agent', userId);

      const message: Message = {
        id: '00000000-0000-0000-0000-000000000099',
        userId,
        content: 'Hello',
        attachments: [],
        timestamp: new Date(),
      };

      await expect(runtime.handleMessage('test-agent', message)).rejects.toThrow('not active');
    });

    it('throws when agent not installed', async () => {
      const message: Message = {
        id: '00000000-0000-0000-0000-000000000099',
        userId,
        content: 'Hello',
        attachments: [],
        timestamp: new Date(),
      };

      await expect(runtime.handleMessage('ghost', message)).rejects.toThrow('not installed');
    });
  });

  describe('dispatchEvent', () => {
    it('dispatches event to all active agents', async () => {
      const agent1 = createMockAgent('agent-1');
      const agent2 = createMockAgent('agent-2');
      await runtime.install(agent1, userId);
      await runtime.install(agent2, userId);

      const event: SystemEvent = {
        type: 'data_updated',
        source: 'system',
        payload: {},
        timestamp: new Date(),
      };

      await runtime.dispatchEvent(event, userId);

      expect(agent1.handleEvent).toHaveBeenCalled();
      expect(agent2.handleEvent).toHaveBeenCalled();
    });

    it('continues if one agent throws', async () => {
      const agent1 = createMockAgent('agent-1', {
        handleEvent: vi.fn().mockRejectedValue(new Error('boom')),
      });
      const agent2 = createMockAgent('agent-2');
      await runtime.install(agent1, userId);
      await runtime.install(agent2, userId);

      const event: SystemEvent = {
        type: 'data_updated',
        source: 'system',
        payload: {},
        timestamp: new Date(),
      };

      // Should not throw
      await runtime.dispatchEvent(event, userId);
      expect(agent2.handleEvent).toHaveBeenCalled();
    });
  });

  describe('collectInsights', () => {
    it('collects and sorts insights by priority', async () => {
      const now = new Date();
      const agent1 = createMockAgent('agent-1', {
        getInsights: vi.fn().mockResolvedValue([
          { id: 'i1', agentId: 'agent-1', title: 'Low', summary: '', priority: 'low', actionable: false, createdAt: now },
        ] satisfies Insight[]),
      });
      const agent2 = createMockAgent('agent-2', {
        getInsights: vi.fn().mockResolvedValue([
          { id: 'i2', agentId: 'agent-2', title: 'Urgent', summary: '', priority: 'urgent', actionable: true, createdAt: now },
        ] satisfies Insight[]),
      });

      await runtime.install(agent1, userId);
      await runtime.install(agent2, userId);

      const insights = await runtime.collectInsights(userId);
      expect(insights).toHaveLength(2);
      expect(insights[0].priority).toBe('urgent');
      expect(insights[1].priority).toBe('low');
    });
  });
});

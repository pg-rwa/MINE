import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowEngine, WorkflowStep } from './workflow-engine';

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;
  const userId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    engine = new WorkflowEngine();
  });

  const steps: Array<WorkflowStep & { id: string }> = [
    { id: 'step-1', agentId: 'finance-agent', action: 'check_balance', params: {}, onSuccess: 'step-2' },
    { id: 'step-2', agentId: 'tax-agent', action: 'generate_receipt', params: {} },
  ];

  describe('create', () => {
    it('creates a workflow', () => {
      const wf = engine.create(userId, 'Rent Flow', 'Auto-process rent', { type: 'event', config: {} }, steps);

      expect(wf.id).toBeDefined();
      expect(wf.name).toBe('Rent Flow');
      expect(wf.entryStepId).toBe('step-1');
      expect(wf.steps.size).toBe(2);
      expect(wf.enabled).toBe(true);
    });
  });

  describe('execute', () => {
    it('runs a workflow to completion', async () => {
      const wf = engine.create(userId, 'Test', 'Test', { type: 'manual', config: {} }, steps);
      const run = await engine.execute(wf.id);

      expect(run.status).toBe('completed');
      expect(run.completedAt).toBeDefined();
    });

    it('throws for unknown workflow', async () => {
      await expect(engine.execute('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('list', () => {
    it('lists workflows for a user', () => {
      engine.create(userId, 'W1', 'desc', { type: 'manual', config: {} }, steps);
      engine.create(userId, 'W2', 'desc', { type: 'manual', config: {} }, steps);
      engine.create('other-user', 'W3', 'desc', { type: 'manual', config: {} }, steps);

      expect(engine.list(userId)).toHaveLength(2);
    });
  });

  describe('getRuns', () => {
    it('returns runs for a workflow', async () => {
      const wf = engine.create(userId, 'Test', 'Test', { type: 'manual', config: {} }, steps);
      await engine.execute(wf.id);
      await engine.execute(wf.id);

      expect(engine.getRuns(wf.id)).toHaveLength(2);
    });
  });
});

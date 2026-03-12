import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Scheduler } from './scheduler';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  const userId = '00000000-0000-0000-0000-000000000001';
  const agentId = 'finance-agent';

  beforeEach(() => {
    scheduler = new Scheduler();
  });

  describe('schedule', () => {
    it('creates a job', () => {
      const listener = vi.fn();
      scheduler.on('job:created', listener);

      const job = scheduler.schedule(userId, agentId, '0 9 * * *', 'daily_balance_check', { account: 'main' });

      expect(job.id).toBeDefined();
      expect(job.userId).toBe(userId);
      expect(job.agentId).toBe(agentId);
      expect(job.cronExpression).toBe('0 9 * * *');
      expect(job.eventType).toBe('daily_balance_check');
      expect(job.payload).toEqual({ account: 'main' });
      expect(job.enabled).toBe(true);
      expect(listener).toHaveBeenCalledWith(job);
    });
  });

  describe('cancel', () => {
    it('disables a job', () => {
      const listener = vi.fn();
      scheduler.on('job:cancelled', listener);

      const job = scheduler.schedule(userId, agentId, '0 9 * * *', 'check', {});
      expect(scheduler.cancel(job.id)).toBe(true);
      expect(listener).toHaveBeenCalledWith(job.id);

      // Cancelled jobs don't appear in list
      expect(scheduler.list(userId)).toHaveLength(0);
    });

    it('returns false for unknown job', () => {
      expect(scheduler.cancel('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('lists enabled jobs for a user', () => {
      scheduler.schedule(userId, agentId, '0 9 * * *', 'check1', {});
      scheduler.schedule(userId, 'other-agent', '0 10 * * *', 'check2', {});
      scheduler.schedule('other-user', agentId, '0 11 * * *', 'check3', {});

      expect(scheduler.list(userId)).toHaveLength(2);
    });

    it('filters by agentId', () => {
      scheduler.schedule(userId, agentId, '0 9 * * *', 'check1', {});
      scheduler.schedule(userId, 'other-agent', '0 10 * * *', 'check2', {});

      expect(scheduler.list(userId, agentId)).toHaveLength(1);
    });
  });

  describe('createEvent', () => {
    it('creates a SystemEvent from a job', () => {
      const job = scheduler.schedule(userId, agentId, '0 9 * * *', 'daily_check', { x: 1 });
      const event = scheduler.createEvent(job);

      expect(event.type).toBe('scheduled_trigger');
      expect(event.source).toBe(agentId);
      expect(event.payload).toMatchObject({ jobId: job.id, eventType: 'daily_check', x: 1 });
    });
  });
});

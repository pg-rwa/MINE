import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLog } from './audit-log';

describe('AuditLog', () => {
  let log: AuditLog;
  const userId = '00000000-0000-0000-0000-000000000001';

  beforeEach(() => {
    log = new AuditLog();
  });

  it('logs and queries entries', () => {
    log.log(userId, 'agent-1', 'message_received', { text: 'hello' });
    log.log(userId, 'agent-2', 'notification_sent', { title: 'Test' });

    const all = log.query(userId);
    expect(all).toHaveLength(2);
  });

  it('filters by agentId', () => {
    log.log(userId, 'agent-1', 'a', {});
    log.log(userId, 'agent-2', 'b', {});

    expect(log.query(userId, { agentId: 'agent-1' })).toHaveLength(1);
  });

  it('filters by action', () => {
    log.log(userId, 'agent-1', 'message_received', {});
    log.log(userId, 'agent-1', 'notification_sent', {});

    expect(log.query(userId, { action: 'notification_sent' })).toHaveLength(1);
  });

  it('applies limit', () => {
    log.log(userId, 'agent-1', 'a', {});
    log.log(userId, 'agent-1', 'b', {});
    log.log(userId, 'agent-1', 'c', {});

    expect(log.query(userId, { limit: 2 })).toHaveLength(2);
  });

  it('sorts newest first', () => {
    log.log(userId, 'agent-1', 'first', {});
    // Manually adjust timestamp so 'second' is newer
    const entries = log.query(userId);
    entries[0].timestamp = new Date(Date.now() - 1000);

    log.log(userId, 'agent-1', 'second', {});

    const results = log.query(userId);
    expect(results[0].action).toBe('second');
  });

  it('getAgentActivity is a shortcut for query', () => {
    log.log(userId, 'agent-1', 'a', {});
    log.log(userId, 'agent-2', 'b', {});

    expect(log.getAgentActivity(userId, 'agent-1')).toHaveLength(1);
  });
});

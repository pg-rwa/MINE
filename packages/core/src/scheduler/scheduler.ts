import { EventEmitter } from 'eventemitter3';
import { SystemEvent } from '../types';

export interface ScheduledJob {
  id: string;
  userId: string;
  agentId: string;
  cronExpression: string;
  eventType: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  createdAt: Date;
}

interface SchedulerEvents {
  'job:triggered': (job: ScheduledJob) => void;
  'job:created': (job: ScheduledJob) => void;
  'job:cancelled': (jobId: string) => void;
}

/**
 * Scheduler handles cron-based and one-off future events for agents.
 * Examples: "Check bank balance every morning", "Remind about EMI on 5th of month"
 */
export class Scheduler extends EventEmitter<SchedulerEvents> {
  private jobs: Map<string, ScheduledJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Schedule a recurring job.
   */
  schedule(
    userId: string,
    agentId: string,
    cronExpression: string,
    eventType: string,
    payload: Record<string, unknown> = {}
  ): ScheduledJob {
    const job: ScheduledJob = {
      id: crypto.randomUUID(),
      userId,
      agentId,
      cronExpression,
      eventType,
      payload,
      enabled: true,
      createdAt: new Date(),
    };

    this.jobs.set(job.id, job);
    this.emit('job:created', job);
    // In production: parse cron and set up actual scheduling
    return job;
  }

  /**
   * Cancel a scheduled job.
   */
  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.enabled = false;
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
    this.emit('job:cancelled', jobId);
    return true;
  }

  /**
   * List all jobs for a user, optionally filtered by agent.
   */
  list(userId: string, agentId?: string): ScheduledJob[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.userId === userId && (!agentId || j.agentId === agentId) && j.enabled
    );
  }

  /**
   * Create the SystemEvent that a triggered job produces.
   */
  createEvent(job: ScheduledJob): SystemEvent {
    return {
      type: 'scheduled_trigger',
      source: job.agentId,
      payload: { jobId: job.id, eventType: job.eventType, ...job.payload },
      timestamp: new Date(),
    };
  }
}

import { EventEmitter } from 'eventemitter3';

/**
 * Activity event types emitted during agent message processing.
 */
export interface ActivityEvent {
  id: string;
  timestamp: Date;
  type:
    | 'routing_started'
    | 'agent_selected'
    | 'agent_processing'
    | 'ai_call_started'
    | 'ai_call_completed'
    | 'agent_delegation'
    | 'agent_responded'
    | 'error'
    | 'info';
  agentId?: string;
  message: string;
  detail?: string;
  conversationId?: string;
  status: 'running' | 'completed' | 'error';
}

interface ActivityBusEvents {
  activity: (event: ActivityEvent) => void;
}

/**
 * Central event bus for agent activity.
 * The message router and agent runtime emit events here;
 * the SSE endpoint forwards them to the frontend.
 */
export class ActivityBus extends EventEmitter<ActivityBusEvents> {
  private recentEvents: ActivityEvent[] = [];
  private maxRecent = 50;

  emit(event: 'activity', ...args: [ActivityEvent]): boolean {
    const actEvent = args[0];
    this.recentEvents.push(actEvent);
    if (this.recentEvents.length > this.maxRecent) {
      this.recentEvents.shift();
    }
    return super.emit(event, ...args);
  }

  /**
   * Get recent activity events (for initial panel load).
   */
  getRecent(limit = 20): ActivityEvent[] {
    return this.recentEvents.slice(-limit);
  }

  /**
   * Helper to emit a typed activity event.
   */
  push(
    type: ActivityEvent['type'],
    message: string,
    opts: Partial<Pick<ActivityEvent, 'agentId' | 'detail' | 'conversationId' | 'status'>> = {}
  ): void {
    this.emit('activity', {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      message,
      status: opts.status || (type === 'error' ? 'error' : type.endsWith('ed') || type.endsWith('completed') ? 'completed' : 'running'),
      ...opts,
    });
  }
}

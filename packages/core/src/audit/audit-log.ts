/**
 * AuditLog records every action taken by every agent.
 * The user can review exactly what each agent did and when.
 * This is critical for trust and transparency.
 */
export interface AuditEntry {
  id: string;
  userId: string;
  agentId: string;
  action: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

export class AuditLog {
  private entries: AuditEntry[] = [];

  log(userId: string, agentId: string, action: string, details: Record<string, unknown>): void {
    this.entries.push({
      id: crypto.randomUUID(),
      userId,
      agentId,
      action,
      details,
      timestamp: new Date(),
    });
  }

  query(userId: string, filters?: { agentId?: string; action?: string; from?: Date; to?: Date; limit?: number }): AuditEntry[] {
    let results = this.entries.filter((e) => e.userId === userId);

    if (filters?.agentId) results = results.filter((e) => e.agentId === filters.agentId);
    if (filters?.action) results = results.filter((e) => e.action === filters.action);
    if (filters?.from) results = results.filter((e) => e.timestamp >= filters.from!);
    if (filters?.to) results = results.filter((e) => e.timestamp <= filters.to!);

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (filters?.limit) results = results.slice(0, filters.limit);

    return results;
  }

  getAgentActivity(userId: string, agentId: string): AuditEntry[] {
    return this.query(userId, { agentId });
  }
}

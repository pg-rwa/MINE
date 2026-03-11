/**
 * WorkflowEngine enables multi-agent workflows.
 * Example: "When rent is received → update finance → generate tax receipt → notify me"
 */
export interface WorkflowStep {
  agentId: string;
  action: string;
  params: Record<string, unknown>;
  onSuccess?: string; // next step ID
  onFailure?: string; // fallback step ID
}

export interface Workflow {
  id: string;
  userId: string;
  name: string;
  description: string;
  trigger: {
    type: 'manual' | 'event' | 'schedule';
    config: Record<string, unknown>;
  };
  steps: Map<string, WorkflowStep>;
  entryStepId: string;
  enabled: boolean;
  createdAt: Date;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'failed' | 'paused_for_approval';
  currentStepId: string;
  results: Map<string, { status: string; output: unknown }>;
  startedAt: Date;
  completedAt?: Date;
}

export class WorkflowEngine {
  private workflows: Map<string, Workflow> = new Map();
  private runs: Map<string, WorkflowRun> = new Map();

  create(
    userId: string,
    name: string,
    description: string,
    trigger: Workflow['trigger'],
    steps: Array<WorkflowStep & { id: string }>
  ): Workflow {
    const stepMap = new Map<string, WorkflowStep>();
    for (const step of steps) {
      stepMap.set(step.id, step);
    }

    const workflow: Workflow = {
      id: crypto.randomUUID(),
      userId,
      name,
      description,
      trigger,
      steps: stepMap,
      entryStepId: steps[0]?.id ?? '',
      enabled: true,
      createdAt: new Date(),
    };

    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  async execute(workflowId: string): Promise<WorkflowRun> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow '${workflowId}' not found`);

    const run: WorkflowRun = {
      id: crypto.randomUUID(),
      workflowId,
      status: 'running',
      currentStepId: workflow.entryStepId,
      results: new Map(),
      startedAt: new Date(),
    };

    this.runs.set(run.id, run);

    // In production: execute steps in sequence, handling success/failure routing
    run.status = 'completed';
    run.completedAt = new Date();

    return run;
  }

  list(userId: string): Workflow[] {
    return Array.from(this.workflows.values()).filter((w) => w.userId === userId);
  }

  getRuns(workflowId: string): WorkflowRun[] {
    return Array.from(this.runs.values()).filter((r) => r.workflowId === workflowId);
  }
}

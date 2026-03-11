import { AgentManifest, Message, AgentContext, AgentResponse, SystemEvent, Insight } from '@mine/core';
import { BaseAgent } from '../base-agent';

/**
 * The Ad-Hoc Agent is the most powerful agent in MINE.
 * It can be dynamically created by the user via natural language to handle
 * any task that doesn't fit existing agents.
 *
 * "Create an agent that monitors flight prices to NYC for December"
 * "I need an agent to track my kid's school deadlines"
 * "Make me an agent that reminds me to water plants every 3 days"
 *
 * This is a Pro-only feature — it's the killer differentiator.
 */
export class AdHocAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'adhoc',
    name: 'Custom Agent Creator',
    description: 'Create custom agents on the fly using natural language. Define what it does, what data it accesses, and how it helps you.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'wand',
    category: 'custom',
    capabilities: [
      { id: 'create_agent', name: 'Create Agent', description: 'Design a custom agent via conversation', keywords: ['create agent', 'custom agent', 'new agent', 'build agent', 'make agent'] },
      { id: 'manage_custom', name: 'Manage Custom Agents', description: 'Edit, pause, or delete custom agents', keywords: ['edit agent', 'delete agent', 'my agents', 'custom agents'] },
    ],
    widgets: [
      { id: 'custom_agents', name: 'My Custom Agents', size: 'medium' },
    ],
    requiredPermissions: [],
    optionalPermissions: [],
    requiredPlan: 'pro',
    pricing: { type: 'free' },
  };

  private customAgents: Map<string, CustomAgentDefinition> = new Map();

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();

    if (content.includes('create') || content.includes('make') || content.includes('build')) {
      return this.handleCreate(message, context);
    }
    if (content.includes('list') || content.includes('my agents') || content.includes('show')) {
      return this.handleList(context);
    }

    return this.respond(
      "I can create custom agents for any task. Describe what you need and I'll set it up!",
      {
        suggestions: [
          'Create a flight price tracker',
          'Create a plant watering reminder',
          'Create a deadline tracker',
          'Show my custom agents',
        ],
      }
    );
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    const insights: Insight[] = [];
    for (const [_id, agent] of this.customAgents) {
      if (agent.lastInsight) {
        insights.push(
          this.insight(agent.name, agent.lastInsight, 'medium')
        );
      }
    }
    return insights;
  }

  private async handleCreate(message: Message, context: AgentContext): Promise<AgentResponse> {
    // In production: use AI to parse the user's request and create a structured agent definition
    return this.respond(
      "I'll help you create a custom agent. Let me understand what you need:\n\n" +
      "1. **What should it do?** (e.g., track flight prices)\n" +
      "2. **What data does it need?** (e.g., destination, dates, budget)\n" +
      "3. **How often should it check?** (e.g., daily, hourly)\n" +
      "4. **When should it alert you?** (e.g., price drops below $500)\n\n" +
      "Tell me more and I'll configure it!",
      {
        actions: [{ type: 'show_widget', payload: { widget: 'agent_builder' } }],
      }
    );
  }

  private async handleList(context: AgentContext): Promise<AgentResponse> {
    if (this.customAgents.size === 0) {
      return this.respond("You haven't created any custom agents yet. Want to create one?", {
        suggestions: ['Create a new agent', 'Show examples'],
      });
    }

    const list = Array.from(this.customAgents.values())
      .map((a) => `- **${a.name}**: ${a.description} (${a.enabled ? 'Active' : 'Paused'})`)
      .join('\n');

    return this.respond(`Here are your custom agents:\n\n${list}`);
  }
}

interface CustomAgentDefinition {
  id: string;
  name: string;
  description: string;
  instructions: string; // Natural language instructions
  dataNeeded: string[];
  schedule?: string; // cron expression
  alertConditions: string; // Natural language conditions
  enabled: boolean;
  lastInsight?: string;
  createdAt: Date;
}

import { AgentManifest } from '../types';
import { IAgent } from './agent-runtime';

type AgentFactory = () => IAgent;

/**
 * Registry of all known agent types. Agents register themselves here,
 * and the runtime uses this to instantiate them.
 */
export class AgentRegistry {
  private factories: Map<string, AgentFactory> = new Map();
  private manifests: Map<string, AgentManifest> = new Map();

  /**
   * Register an agent factory.
   */
  register(manifest: AgentManifest, factory: AgentFactory): void {
    this.factories.set(manifest.id, factory);
    this.manifests.set(manifest.id, manifest);
  }

  /**
   * Create an instance of a registered agent.
   */
  create(agentId: string): IAgent {
    const factory = this.factories.get(agentId);
    if (!factory) {
      throw new Error(`Unknown agent: '${agentId}'. Available: ${Array.from(this.factories.keys()).join(', ')}`);
    }
    return factory();
  }

  /**
   * Get manifest for a registered agent.
   */
  getManifest(agentId: string): AgentManifest | undefined {
    return this.manifests.get(agentId);
  }

  /**
   * List all registered agent manifests.
   */
  listAvailable(): AgentManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * Filter agents by category.
   */
  findByCategory(category: AgentManifest['category']): AgentManifest[] {
    return this.listAvailable().filter((m) => m.category === category);
  }

  /**
   * Search agents by keyword (matches name, description, capabilities).
   */
  search(query: string): AgentManifest[] {
    const q = query.toLowerCase();
    return this.listAvailable().filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.capabilities.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.keywords.some((k) => k.toLowerCase().includes(q))
        )
    );
  }
}

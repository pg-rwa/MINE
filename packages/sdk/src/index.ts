/**
 * MINE Agent SDK
 *
 * Build custom agents for the MINE platform.
 *
 * @example
 * ```typescript
 * import { defineAgent } from '@mine/sdk';
 *
 * const myAgent = defineAgent({
 *   id: 'my-weather-agent',
 *   name: 'Weather Agent',
 *   description: 'Get weather forecasts and clothing suggestions',
 *   version: '1.0.0',
 *   author: 'Your Name',
 *   icon: 'cloud-sun',
 *   category: 'lifestyle',
 *
 *   capabilities: [
 *     {
 *       id: 'forecast',
 *       name: 'Weather Forecast',
 *       description: 'Get weather for any location',
 *       keywords: ['weather', 'forecast', 'rain', 'temperature', 'sunny'],
 *     },
 *   ],
 *
 *   permissions: {
 *     required: ['calendar'],  // To suggest weather-appropriate plans
 *     optional: ['contacts'],  // To check friends' locations
 *   },
 *
 *   handlers: {
 *     onMessage: async (message, context) => {
 *       // Your agent logic here
 *       return {
 *         content: "It's going to be sunny today! Perfect for outdoor plans.",
 *         suggestions: ['Weekly forecast', 'What to wear', 'Plan outdoor activity'],
 *       };
 *     },
 *
 *     onEvent: async (event, context) => {
 *       // Handle scheduled events, data changes, etc.
 *     },
 *
 *     getInsights: async (context) => {
 *       return [
 *         {
 *           title: 'Rain Expected Tomorrow',
 *           summary: 'Pack an umbrella! 80% chance of rain.',
 *           priority: 'medium',
 *         },
 *       ];
 *     },
 *   },
 *
 *   widgets: [
 *     { id: 'current_weather', name: 'Current Weather', size: 'small' },
 *   ],
 * });
 *
 * export default myAgent;
 * ```
 */

import {
  IAgent,
  AgentContext,
  AgentManifest,
  Message,
  AgentResponse,
  SystemEvent,
  Insight,
} from '@mine/core';

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string;
  category: AgentManifest['category'];
  capabilities: AgentManifest['capabilities'];
  widgets?: AgentManifest['widgets'];
  permissions?: {
    required?: string[];
    optional?: string[];
  };
  pricing?: AgentManifest['pricing'];
  handlers: {
    onInstall?: (context: AgentContext) => Promise<void>;
    onActivate?: (context: AgentContext) => Promise<void>;
    onDeactivate?: () => Promise<void>;
    onUninstall?: () => Promise<void>;
    onMessage: (
      message: Message,
      context: AgentContext
    ) => Promise<{ content: string; actions?: AgentResponse['actions']; suggestions?: string[] }>;
    onEvent?: (event: SystemEvent, context: AgentContext) => Promise<void>;
    getInsights?: (
      context: AgentContext
    ) => Promise<Array<{ title: string; summary: string; priority: Insight['priority']; action?: Insight['action'] }>>;
  };
}

/**
 * Define a MINE agent using the SDK.
 */
export function defineAgent(definition: AgentDefinition): IAgent {
  const manifest: AgentManifest = {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    version: definition.version,
    author: definition.author,
    icon: definition.icon,
    category: definition.category,
    capabilities: definition.capabilities,
    widgets: definition.widgets ?? [],
    requiredPermissions: definition.permissions?.required ?? [],
    optionalPermissions: definition.permissions?.optional ?? [],
    requiredPlan: 'free',
    pricing: definition.pricing ?? { type: 'free' },
  };

  return {
    manifest,

    onInstall: async (ctx) => definition.handlers.onInstall?.(ctx),
    onActivate: async (ctx) => definition.handlers.onActivate?.(ctx),
    onDeactivate: async () => definition.handlers.onDeactivate?.(),
    onUninstall: async () => definition.handlers.onUninstall?.(),

    handleMessage: async (message, context) => {
      const result = await definition.handlers.onMessage(message, context);
      return {
        agentId: manifest.id,
        content: result.content,
        actions: result.actions ?? [],
        suggestions: result.suggestions ?? [],
        timestamp: new Date(),
      };
    },

    handleEvent: async (event, context) => {
      await definition.handlers.onEvent?.(event, context);
    },

    getInsights: async (context) => {
      if (!definition.handlers.getInsights) return [];
      const raw = await definition.handlers.getInsights(context);
      return raw.map((r) => ({
        id: crypto.randomUUID(),
        agentId: manifest.id,
        title: r.title,
        summary: r.summary,
        priority: r.priority,
        actionable: !!r.action,
        action: r.action,
        createdAt: new Date(),
      }));
    },
  };
}

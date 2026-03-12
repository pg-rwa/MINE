import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from './agent-registry';
import { AgentManifest } from '../types';
import { IAgent } from './agent-runtime';

function makeManifest(id: string, overrides: Partial<AgentManifest> = {}): AgentManifest {
  return {
    id,
    name: `Agent ${id}`,
    description: `Description for ${id}`,
    version: '1.0.0',
    author: 'test',
    icon: 'icon',
    category: 'utility',
    capabilities: [
      { id: 'cap-1', name: 'Track expenses', description: 'Tracks expenses', keywords: ['money', 'budget'] },
    ],
    widgets: [],
    requiredPermissions: [],
    optionalPermissions: [],
    requiredPlan: 'free',
    pricing: { type: 'free', currency: 'USD' },
    ...overrides,
  };
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('registers and creates agents', () => {
    const manifest = makeManifest('test-agent');
    const mockAgent = { manifest } as IAgent;
    registry.register(manifest, () => mockAgent);

    const created = registry.create('test-agent');
    expect(created.manifest.id).toBe('test-agent');
  });

  it('throws for unknown agent', () => {
    expect(() => registry.create('ghost')).toThrow('Unknown agent');
  });

  it('returns manifest by id', () => {
    const manifest = makeManifest('test-agent');
    registry.register(manifest, () => ({ manifest } as IAgent));
    expect(registry.getManifest('test-agent')).toEqual(manifest);
  });

  it('returns undefined for unknown manifest', () => {
    expect(registry.getManifest('ghost')).toBeUndefined();
  });

  it('lists all available manifests', () => {
    registry.register(makeManifest('a'), () => ({} as IAgent));
    registry.register(makeManifest('b'), () => ({} as IAgent));
    expect(registry.listAvailable()).toHaveLength(2);
  });

  it('filters by category', () => {
    registry.register(makeManifest('a', { category: 'finance' }), () => ({} as IAgent));
    registry.register(makeManifest('b', { category: 'health' }), () => ({} as IAgent));
    expect(registry.findByCategory('finance')).toHaveLength(1);
  });

  it('searches by name', () => {
    registry.register(makeManifest('a', { name: 'Finance Tracker' }), () => ({} as IAgent));
    registry.register(makeManifest('b', { name: 'Fitness Coach' }), () => ({} as IAgent));
    expect(registry.search('finance')).toHaveLength(1);
  });

  it('searches by keyword', () => {
    registry.register(makeManifest('a'), () => ({} as IAgent));
    expect(registry.search('budget')).toHaveLength(1);
    expect(registry.search('nonexistent')).toHaveLength(0);
  });
});

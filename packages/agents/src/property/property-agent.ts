import { AgentManifest, Message, AgentContext, AgentResponse, Insight } from '@mine/core';
import { BaseAgent } from '../base-agent';

export class PropertyAgent extends BaseAgent {
  readonly manifest: AgentManifest = {
    id: 'property',
    name: 'Property & Tenant Manager',
    description: 'Manage properties, track rent collection, handle tenant communications, maintenance requests, and lease agreements.',
    version: '1.0.0',
    author: 'MINE',
    icon: 'home',
    category: 'property',
    capabilities: [
      { id: 'manage_properties', name: 'Property Portfolio', description: 'Track all owned properties', keywords: ['property', 'house', 'flat', 'apartment', 'real estate'] },
      { id: 'manage_tenants', name: 'Tenant Management', description: 'Track tenants, leases, contacts', keywords: ['tenant', 'renter', 'lease', 'occupant'] },
      { id: 'track_rent', name: 'Rent Collection', description: 'Track rent payments and dues', keywords: ['rent', 'due', 'payment', 'collection', 'overdue'] },
      { id: 'maintenance', name: 'Maintenance Tracker', description: 'Log and track repair requests', keywords: ['maintenance', 'repair', 'fix', 'plumber', 'electrician'] },
    ],
    widgets: [
      { id: 'rent_overview', name: 'Rent Overview', size: 'medium' },
      { id: 'maintenance_queue', name: 'Maintenance Queue', size: 'small' },
    ],
    requiredPermissions: ['properties', 'tenants', 'rent_records'],
    optionalPermissions: ['contacts', 'documents'],
    requiredPlan: 'premium',
    pricing: { type: 'free' },
  };

  async handleMessage(message: Message, context: AgentContext): Promise<AgentResponse> {
    const content = message.content.toLowerCase();
    const intent = this.analyzeIntent(message, context);

    // Form submissions
    if (message.content.trimStart().startsWith('{') || content.startsWith('save:')) {
      return this.handleFormSubmit(message, context);
    }

    // ADD flows
    if (content.includes('add') && content.includes('property')) {
      return this.handleAddProperty(context);
    }
    if (content.includes('add') && content.includes('tenant')) {
      return this.handleAddTenant(context);
    }

    // Try AI first for contextual responses
    const vaultData = this.getVaultDataSummary(context, ['properties', 'tenants', 'rent_records']);
    const aiResponse = await this.generateAIResponse(message, context, vaultData || undefined);
    if (aiResponse) {
      return this.respond(aiResponse, { suggestions: ['My properties', 'Add a property', 'Add a tenant', 'Rent status'] });
    }

    // VIEW flows
    if (content.includes('rent')) {
      return this.handleViewRent(context);
    }
    if (content.includes('tenant')) {
      return this.handleViewTenants(context);
    }
    if (content.includes('property') || content.includes('properties')) {
      return this.handleViewProperties(context);
    }
    if (content.includes('maintenance') || content.includes('repair')) {
      return this.respondWithContext(intent, context,
        "I'll help with maintenance tracking. What needs attention?", {
          suggestions: ['Log new request', 'Pending repairs'],
        });
    }

    // Acknowledge cross-agent context in fallback
    const crossNote = this.getCrossAgentContext(intent, context);
    if (crossNote) {
      return this.respond(
        `${crossNote}\n\nAs your Property Manager, I handle properties, tenants, rent collection, and maintenance. How can I help?`, {
          suggestions: ['My properties', 'Add a property', 'Add a tenant', 'Rent status'],
        });
    }

    return this.respond("I manage your properties, tenants, and rent collection. How can I help?", {
      suggestions: ['My properties', 'Add a property', 'Add a tenant', 'Rent status'],
    });
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    const insights: Insight[] = [];
    try {
      const rents = context.vault.getForAgent(context.userId, context.agentId, 'rent_records');
      const overdue = rents.filter(r => r.data.status === 'overdue');
      if (overdue.length > 0) {
        insights.push(
          this.insight(`${overdue.length} Rent(s) Overdue`, `Total overdue: $${overdue.reduce((s, r) => s + (Number(r.data.amount) || 0), 0)}`, 'high')
        );
      }
    } catch { /* no permission */ }
    return insights;
  }

  private async handleAddProperty(context: AgentContext): Promise<AgentResponse> {
    return this.respond("Let's add your property:", {
      actions: [{
        type: 'show_widget',
        payload: {
          widget: 'inline_form',
          form: {
            id: 'add_property',
            category: 'properties',
            fields: [
              { name: 'name', label: 'Property Name', type: 'text', placeholder: 'e.g. Downtown Apartment 2B', required: true },
              { name: 'type', label: 'Type', type: 'select', options: ['Apartment', 'House', 'Villa', 'Commercial', 'Land', 'Other'] },
              { name: 'address', label: 'Address', type: 'text', placeholder: '123 Main St, City', required: true },
              { name: 'rentAmount', label: 'Monthly Rent ($)', type: 'number', placeholder: '800' },
              { name: 'purchasePrice', label: 'Purchase Price ($)', type: 'number', placeholder: '250000' },
              { name: 'notes', label: 'Notes', type: 'text', placeholder: 'Any details...' },
            ],
          },
        },
      }],
    });
  }

  private async handleAddTenant(context: AgentContext): Promise<AgentResponse> {
    return this.respond("Let's add a tenant:", {
      actions: [{
        type: 'show_widget',
        payload: {
          widget: 'inline_form',
          form: {
            id: 'add_tenant',
            category: 'tenants',
            fields: [
              { name: 'name', label: 'Tenant Name', type: 'text', placeholder: 'John Doe', required: true },
              { name: 'phone', label: 'Phone', type: 'text', placeholder: '+1-555-0123' },
              { name: 'email', label: 'Email', type: 'text', placeholder: 'john@email.com' },
              { name: 'property', label: 'Property', type: 'text', placeholder: 'Which property?', required: true },
              { name: 'rentAmount', label: 'Monthly Rent ($)', type: 'number', placeholder: '800', required: true },
              { name: 'leaseStart', label: 'Lease Start', type: 'date' },
              { name: 'leaseEnd', label: 'Lease End', type: 'date' },
            ],
          },
        },
      }],
    });
  }

  private async handleViewProperties(context: AgentContext): Promise<AgentResponse> {
    try {
      const props = context.vault.getForAgent(context.userId, context.agentId, 'properties');
      if (props.length === 0) {
        return this.respond("No properties added yet. Let's add your first one!", {
          suggestions: ['Add a property'],
        });
      }
      const lines = props.map((p, i) => `${i + 1}. ${p.data.name} — ${p.data.type || 'Property'}${p.data.address ? ` (${p.data.address})` : ''}${p.data.rentAmount ? ` · Rent: $${p.data.rentAmount}/mo` : ''}`).join('\n');
      return this.respond(`Your properties (${props.length}):\n\n${lines}`, {
        suggestions: ['Add a property', 'Add a tenant', 'Rent status'],
      });
    } catch {
      return this.respond("I need permission to access your property data.", {
        actions: [{ type: 'request_permission', payload: { resource: 'properties', reason: 'To manage your property portfolio' } }],
      });
    }
  }

  private async handleViewTenants(context: AgentContext): Promise<AgentResponse> {
    try {
      const tenants = context.vault.getForAgent(context.userId, context.agentId, 'tenants');
      if (tenants.length === 0) {
        return this.respond("No tenants added yet. Add one to start tracking rent.", {
          suggestions: ['Add a tenant'],
        });
      }
      const lines = tenants.map((t, i) => `${i + 1}. ${t.data.name} — ${t.data.property || 'Unassigned'}${t.data.rentAmount ? ` · $${t.data.rentAmount}/mo` : ''}`).join('\n');
      return this.respond(`Your tenants (${tenants.length}):\n\n${lines}`, {
        suggestions: ['Add a tenant', 'Rent status'],
      });
    } catch {
      return this.respond("I need permission to access tenant data.", {
        actions: [{ type: 'request_permission', payload: { resource: 'tenants', reason: 'To manage your tenants' } }],
      });
    }
  }

  private async handleViewRent(context: AgentContext): Promise<AgentResponse> {
    try {
      const rents = context.vault.getForAgent(context.userId, context.agentId, 'rent_records');
      if (rents.length === 0) {
        return this.respond("No rent records yet. Add tenants first, then track their payments.", {
          suggestions: ['Add a tenant', 'My properties'],
        });
      }
      const lines = rents.map((r, i) => `${i + 1}. ${r.data.tenant} — $${r.data.amount} [${r.data.status || 'recorded'}]`).join('\n');
      return this.respond(`Rent records:\n\n${lines}`, {
        suggestions: ['Add a tenant', 'My properties'],
      });
    } catch {
      return this.respond("I need permission to access rent records.", {
        actions: [{ type: 'request_permission', payload: { resource: 'rent_records', reason: 'To track rent collection' } }],
      });
    }
  }

  private async handleFormSubmit(message: Message, context: AgentContext): Promise<AgentResponse> {
    try {
      let raw = message.content;
      if (raw.startsWith('save:')) raw = raw.slice(5);
      const parsed = JSON.parse(raw);
      const { _formId, _category, ...data } = parsed;
      const category = _category || 'properties';
      const key = `${category}-${Date.now()}`;

      try {
        context.vault.putForAgent(context.userId, context.agentId, category, key, {
          ...data, createdAt: new Date().toISOString(),
        });
      } catch {
        context.vault.put(context.userId, category, key, {
          ...data, createdAt: new Date().toISOString(),
        }, 'agent', context.agentId);
      }

      const label = data.name || data.property || category;
      return this.respond(`Saved! "${label}" has been added.`, {
        suggestions: ['My properties', 'My tenants', 'Add another'],
      });
    } catch {
      return this.respond("Couldn't save that. Please try again.", {
        suggestions: ['Add a property', 'Add a tenant'],
      });
    }
  }
}

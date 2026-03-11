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

    if (content.includes('rent')) {
      return this.respond("Here's your rent collection status. Which property would you like details for?", {
        suggestions: ['All properties', 'Overdue rents only', 'Send rent reminder'],
      });
    }
    if (content.includes('tenant')) {
      return this.respond("I can help manage your tenants. What do you need?", {
        suggestions: ['List all tenants', 'Add new tenant', 'Tenant contact info', 'Lease expiring soon'],
      });
    }
    if (content.includes('maintenance') || content.includes('repair')) {
      return this.respond("I'll help with maintenance tracking. What needs attention?", {
        suggestions: ['Log new request', 'Pending repairs', 'Find a plumber', 'Maintenance history'],
      });
    }

    return this.respond("I manage your properties, tenants, and rent collection. How can I help?", {
      suggestions: ['Rent status', 'My properties', 'Tenant list', 'Maintenance'],
    });
  }

  async getInsights(context: AgentContext): Promise<Insight[]> {
    return [
      this.insight('Rent Overdue', 'Flat 2B rent overdue by 5 days ($800)', 'high', {
        label: 'Send Reminder',
        type: 'confirm_action',
        payload: { action: 'send_rent_reminder', tenantId: 'example' },
      }),
      this.insight('Lease Expiring', 'Tenant John\'s lease expires in 30 days', 'medium', {
        label: 'Review Lease',
        type: 'navigate',
        payload: { screen: 'lease_details' },
      }),
    ];
  }
}

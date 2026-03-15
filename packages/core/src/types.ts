import { z } from 'zod';

// ─── User ───────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  plan: z.enum(['free', 'premium', 'pro']),
  createdAt: z.date(),
  preferences: z.record(z.unknown()).default({}),
});

export type User = z.infer<typeof UserSchema>;

// ─── Agent Definition ───────────────────────────────────

export const AgentCapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
});

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

export const DashboardWidgetSchema = z.object({
  id: z.string(),
  name: z.string(),
  size: z.enum(['small', 'medium', 'large', 'full']),
  refreshInterval: z.number().optional(), // seconds
});

export type DashboardWidget = z.infer<typeof DashboardWidgetSchema>;

export const AgentManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  icon: z.string(),
  category: z.enum([
    'finance',
    'property',
    'health',
    'shopping',
    'productivity',
    'social',
    'education',
    'lifestyle',
    'utility',
    'custom',
  ]),
  capabilities: z.array(AgentCapabilitySchema),
  widgets: z.array(DashboardWidgetSchema),
  requiredPermissions: z.array(z.string()),
  optionalPermissions: z.array(z.string()),
  requiredPlan: z.enum(['free', 'premium', 'pro']).default('free'),
  pricing: z
    .object({
      type: z.enum(['free', 'one_time', 'subscription']),
      amount: z.number().optional(),
      currency: z.string().default('USD'),
    })
    .default({ type: 'free' }),
});

export type AgentManifest = z.input<typeof AgentManifestSchema>;

// ─── Messages ───────────────────────────────────────────

export const MessageSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  agentId: z.string().optional(), // null = router decides
  content: z.string(),
  attachments: z
    .array(
      z.object({
        type: z.enum(['file', 'image', 'link', 'data']),
        uri: z.string(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .default([]),
  timestamp: z.date(),
});

export type Message = z.infer<typeof MessageSchema>;

export const AgentResponseSchema = z.object({
  agentId: z.string(),
  content: z.string(),
  actions: z
    .array(
      z.object({
        type: z.enum(['show_widget', 'navigate', 'confirm_action', 'request_permission', 'notify', 'select_item']),
        payload: z.record(z.unknown()),
      })
    )
    .default([]),
  suggestions: z.array(z.string()).default([]),
  timestamp: z.date(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// ─── Events ─────────────────────────────────────────────

export const SystemEventSchema = z.object({
  type: z.enum([
    'scheduled_trigger',
    'data_updated',
    'integration_sync',
    'user_action',
    'agent_message',
    'permission_changed',
  ]),
  source: z.string(),
  payload: z.record(z.unknown()),
  timestamp: z.date(),
});

export type SystemEvent = z.infer<typeof SystemEventSchema>;

// ─── Insights ───────────────────────────────────────────

export const InsightSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  title: z.string(),
  summary: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  actionable: z.boolean(),
  action: z
    .object({
      label: z.string(),
      type: z.string(),
      payload: z.record(z.unknown()),
    })
    .optional(),
  expiresAt: z.date().optional(),
  createdAt: z.date(),
});

export type Insight = z.infer<typeof InsightSchema>;

// ─── Data Categories ────────────────────────────────────

export const DATA_CATEGORIES = [
  'bank_accounts',
  'transactions',
  'investments',
  'properties',
  'tenants',
  'rent_records',
  'emis',
  'bills',
  'tax_records',
  'income',
  'expenses',
  'health_metrics',
  'workouts',
  'nutrition',
  'medications',
  'emails',
  'contacts',
  'calendar',
  'social_posts',
  'messages',
  'shopping_lists',
  'orders',
  'deliveries',
  'recipes',
  'meal_plans',
  'courses',
  'study_plans',
  'documents',
  'notes',
  'bookmarks',
] as const;

export type DataCategory = (typeof DATA_CATEGORIES)[number];

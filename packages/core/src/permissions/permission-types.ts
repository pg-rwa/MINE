import { z } from 'zod';
import { DataCategory, DATA_CATEGORIES } from '../types';

export const PermissionLevel = z.enum([
  'observe',           // Read-only, no action
  'suggest',           // Can recommend, user approves
  'act_with_approval', // Can prepare, user confirms
  'act_autonomously',  // Full auto within scope
]);

export type PermissionLevel = z.infer<typeof PermissionLevel>;

export const PermissionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  agentId: z.string(),
  resource: z.enum(DATA_CATEGORIES),
  level: PermissionLevel,
  actions: z.array(z.enum(['read', 'write', 'delete', 'execute'])),
  scope: z.record(z.unknown()).default({}), // e.g., { timeRange: "last_90_days", maxAmount: 100 }
  grantedAt: z.date(),
  expiresAt: z.date().optional(),
  autoRenew: z.boolean().default(false),
  revokedAt: z.date().optional(),
});

export type Permission = z.infer<typeof PermissionSchema>;

export const PermissionRequestSchema = z.object({
  agentId: z.string(),
  resource: z.enum(DATA_CATEGORIES),
  level: PermissionLevel,
  actions: z.array(z.enum(['read', 'write', 'delete', 'execute'])),
  reason: z.string(), // Human-readable explanation of WHY
  scope: z.record(z.unknown()).default({}),
  duration: z.enum(['session', '24h', '7d', '30d', '90d', '1y', 'permanent']).default('30d'),
});

export type PermissionRequest = z.input<typeof PermissionRequestSchema>;

export interface PermissionCheck {
  granted: boolean;
  permission?: Permission;
  reason?: string; // Why denied
}

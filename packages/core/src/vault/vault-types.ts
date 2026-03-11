import { DataCategory } from '../types';

export interface VaultEntry {
  id: string;
  userId: string;
  category: DataCategory;
  key: string;
  data: Record<string, unknown>;
  source: 'manual' | 'integration' | 'agent';
  sourceId?: string; // integration or agent ID
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

export interface VaultQuery {
  userId: string;
  category?: DataCategory;
  key?: string;
  source?: VaultEntry['source'];
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

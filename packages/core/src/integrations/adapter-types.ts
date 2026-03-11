import { DataCategory } from '../types';

/**
 * Every integration adapter implements this interface.
 * An adapter knows how to:
 *   1. Generate an OAuth URL (or auth flow)
 *   2. Exchange tokens
 *   3. Fetch data and normalize it to MINE's format
 *   4. Handle webhooks (optional)
 */
export interface IntegrationAdapter {
  /** Unique adapter ID */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** e.g., gmail, plaid, zerodha */
  readonly provider: string;

  /** What data categories this adapter populates */
  readonly dataCategories: DataCategory[];

  /** OAuth or other auth config */
  readonly authType: 'oauth2' | 'api_key' | 'token' | 'email_parse';

  /** OAuth scopes needed (if oauth2) */
  readonly scopes?: string[];

  /** Generate the OAuth authorization URL */
  getAuthUrl(state: string, redirectUri: string): string;

  /** Exchange auth code for tokens */
  exchangeToken(code: string, redirectUri: string): Promise<OAuthTokens>;

  /** Refresh an expired access token */
  refreshToken(refreshToken: string): Promise<OAuthTokens>;

  /** Fetch data from the service and return normalized entries */
  fetchData(tokens: OAuthTokens, options?: FetchOptions): Promise<NormalizedEntry[]>;

  /** Handle an incoming webhook (optional) */
  handleWebhook?(payload: unknown): Promise<NormalizedEntry[]>;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  raw?: Record<string, unknown>;
}

export interface FetchOptions {
  /** Only fetch data since this date */
  since?: Date;
  /** Max number of entries to fetch */
  limit?: number;
  /** Category filter */
  category?: DataCategory;
}

/**
 * Normalized data entry — the adapter converts service-specific data
 * into this common format, which then goes into the Data Vault.
 */
export interface NormalizedEntry {
  category: DataCategory;
  key: string;
  data: Record<string, unknown>;
  /** Original source timestamp */
  timestamp: Date;
  /** Raw data from the API (stored for debugging) */
  raw?: unknown;
}

/**
 * Adapter configuration stored per user per integration.
 */
export interface UserIntegration {
  id: string;
  userId: string;
  adapterId: string;
  status: 'connected' | 'disconnected' | 'error' | 'expired';
  tokens: OAuthTokens; // Encrypted at rest
  lastSync?: Date;
  syncInterval: number; // minutes
  error?: string;
  createdAt: Date;
}

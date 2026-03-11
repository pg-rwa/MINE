import { DataCategory } from '../../types';
import {
  IntegrationAdapter,
  OAuthTokens,
  FetchOptions,
  NormalizedEntry,
} from '../adapter-types';

/**
 * Plaid Adapter — Banking data aggregation (US, Canada, EU, UK).
 *
 * Plaid connects to 12,000+ banks and provides:
 * - Account balances
 * - Transaction history
 * - Income verification
 * - Investment holdings
 *
 * Flow:
 * 1. Create a link_token (server-side)
 * 2. User opens Plaid Link (frontend widget) to select their bank
 * 3. Plaid returns a public_token
 * 4. Exchange public_token for access_token (server-side)
 * 5. Use access_token to fetch data
 *
 * Pricing:
 * - Production: $0.30 per Link + usage-based
 * - Sandbox: Free (unlimited testing)
 *
 * @see https://plaid.com/docs/
 */
export class PlaidAdapter implements IntegrationAdapter {
  readonly id = 'plaid';
  readonly name = 'Bank Accounts (via Plaid)';
  readonly provider = 'plaid';
  readonly dataCategories: DataCategory[] = [
    'bank_accounts', 'transactions', 'investments', 'income',
  ];
  readonly authType = 'oauth2' as const;

  private clientId: string;
  private secret: string;
  private env: 'sandbox' | 'production';
  private baseUrl: string;

  constructor() {
    this.clientId = process.env.PLAID_CLIENT_ID || '';
    this.secret = process.env.PLAID_SECRET || '';
    this.env = (process.env.PLAID_ENV as any) || 'sandbox';
    this.baseUrl = this.env === 'production'
      ? 'https://production.plaid.com'
      : 'https://sandbox.plaid.com';
  }

  /**
   * Plaid uses a Link flow, not a standard OAuth URL.
   * This creates a link_token that the frontend uses to open Plaid Link.
   */
  getAuthUrl(_state: string, _redirectUri: string): string {
    // For Plaid, the "auth URL" is actually the Link token creation endpoint.
    // The frontend calls this, then opens Plaid Link widget.
    return `${this.baseUrl}/link/token/create`;
  }

  /**
   * Create a Plaid Link token (call this from your API, return to frontend).
   */
  async createLinkToken(userId: string, redirectUri?: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        secret: this.secret,
        user: { client_user_id: userId },
        client_name: 'MINE',
        products: ['transactions', 'auth'],
        country_codes: ['US', 'GB', 'EU'],
        language: 'en',
        redirect_uri: redirectUri,
      }),
    });
    const data = await res.json() as any;
    return data.link_token;
  }

  /**
   * Exchange the public_token (from Plaid Link) for an access_token.
   */
  async exchangeToken(publicToken: string, _redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch(`${this.baseUrl}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        secret: this.secret,
        public_token: publicToken,
      }),
    });
    const data = await res.json() as any;
    return {
      accessToken: data.access_token,
      raw: { item_id: data.item_id },
    };
  }

  async refreshToken(_refreshToken: string): Promise<OAuthTokens> {
    // Plaid access tokens don't expire, they persist until the user disconnects
    throw new Error('Plaid tokens do not need refreshing');
  }

  async fetchData(tokens: OAuthTokens, options?: FetchOptions): Promise<NormalizedEntry[]> {
    const entries: NormalizedEntry[] = [];

    // Fetch accounts
    const accounts = await this.getAccounts(tokens.accessToken);
    for (const account of accounts) {
      entries.push({
        category: 'bank_accounts',
        key: `plaid-${account.account_id}`,
        data: {
          name: account.name,
          officialName: account.official_name,
          type: account.type,
          subtype: account.subtype,
          balance: account.balances.current,
          currency: account.balances.iso_currency_code,
          mask: account.mask, // Last 4 digits
          institution: tokens.raw?.institution_name,
          source: 'plaid',
        },
        timestamp: new Date(),
      });
    }

    // Fetch transactions
    const startDate = options?.since
      ? options.since.toISOString().split('T')[0]
      : new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const transactions = await this.getTransactions(tokens.accessToken, startDate, endDate);
    for (const txn of transactions) {
      entries.push({
        category: 'transactions',
        key: `plaid-txn-${txn.transaction_id}`,
        data: {
          name: txn.name,
          amount: txn.amount,
          currency: txn.iso_currency_code,
          date: txn.date,
          category: txn.category?.join(' > '),
          merchantName: txn.merchant_name,
          pending: txn.pending,
          accountId: txn.account_id,
          source: 'plaid',
        },
        timestamp: new Date(txn.date),
      });
    }

    return entries;
  }

  // ─── Plaid API Calls ───────────────────────────────

  private async getAccounts(accessToken: string): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/accounts/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        secret: this.secret,
        access_token: accessToken,
      }),
    });
    const data = await res.json() as any;
    return data.accounts || [];
  }

  private async getTransactions(
    accessToken: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/transactions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.clientId,
        secret: this.secret,
        access_token: accessToken,
        options: { include_personal_finance_category: true },
      }),
    });
    const data = await res.json() as any;
    return data.added || [];
  }
}

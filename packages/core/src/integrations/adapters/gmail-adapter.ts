import { DataCategory } from '../../types';
import {
  IntegrationAdapter,
  OAuthTokens,
  FetchOptions,
  NormalizedEntry,
} from '../adapter-types';

/**
 * Gmail Adapter — the most powerful single integration.
 *
 * By parsing emails, we get:
 * - Bank transaction alerts → transactions
 * - Order confirmations (Amazon, Flipkart, etc.) → deliveries, orders
 * - Bill reminders → bills
 * - Flight/hotel bookings → calendar
 * - Subscription receipts → expenses
 * - Salary credits → income
 *
 * Scopes:
 * - gmail.readonly: Read all emails (most powerful)
 * - gmail.labels: Manage labels (for organizing parsed emails)
 */
export class GmailAdapter implements IntegrationAdapter {
  readonly id = 'gmail';
  readonly name = 'Gmail';
  readonly provider = 'google';
  readonly dataCategories: DataCategory[] = [
    'transactions', 'orders', 'deliveries', 'bills', 'expenses', 'income',
  ];
  readonly authType = 'oauth2' as const;
  readonly scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.labels',
  ];

  private clientId: string;
  private clientSecret: string;

  constructor(clientId?: string, clientSecret?: string) {
    this.clientId = clientId || process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async exchangeToken(code: string, redirectUri: string): Promise<OAuthTokens> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const data = await res.json() as any;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
      raw: data,
    };
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    const data = await res.json() as any;
    return {
      accessToken: data.access_token,
      refreshToken: refreshToken, // Refresh token doesn't change
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async fetchData(tokens: OAuthTokens, options?: FetchOptions): Promise<NormalizedEntry[]> {
    // Fetch recent emails
    const query = this.buildSearchQuery(options);
    const messages = await this.listMessages(tokens.accessToken, query, options?.limit || 50);

    // Fetch message details in parallel batches of 10 to avoid rate limits
    const batchSize = 10;
    const entries: NormalizedEntry[] = [];

    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (msgRef) => {
          const msg = await this.getMessage(tokens.accessToken, msgRef.id);
          return this.parseEmail(msg);
        })
      );
      for (const parsed of results) {
        if (parsed) entries.push(parsed);
      }
    }

    return entries;
  }

  // ─── Gmail API Helpers ─────────────────────────────

  private async listMessages(accessToken: string, query: string, maxResults: number): Promise<Array<{ id: string }>> {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(maxResults),
    });
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json() as any;
    return data.messages || [];
  }

  private async getMessage(accessToken: string, messageId: string): Promise<any> {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.json();
  }

  private buildSearchQuery(options?: FetchOptions): string {
    const parts: string[] = [];

    if (options?.since) {
      const dateStr = options.since.toISOString().split('T')[0].replace(/-/g, '/');
      parts.push(`after:${dateStr}`);
    }

    // Search for financial/transactional emails
    parts.push('(subject:(transaction OR payment OR order OR bill OR salary OR credit OR debit OR EMI OR delivery OR shipped))');

    return parts.join(' ');
  }

  // ─── Email Parsing Engine ──────────────────────────

  private parseEmail(msg: any): NormalizedEntry | null {
    const headers = msg.payload?.headers || [];
    const subject = this.getHeader(headers, 'Subject') || '';
    const from = this.getHeader(headers, 'From') || '';
    const date = new Date(this.getHeader(headers, 'Date') || Date.now());
    const body = this.extractBody(msg.payload);

    // Bank transaction alert
    if (this.isBankAlert(from, subject)) {
      return this.parseBankAlert(subject, body, from, date);
    }

    // Order confirmation
    if (this.isOrderConfirmation(from, subject)) {
      return this.parseOrderConfirmation(subject, body, from, date);
    }

    // Salary credit
    if (this.isSalaryCredit(subject, body)) {
      return this.parseSalaryCredit(subject, body, from, date);
    }

    // Bill/utility
    if (this.isBillNotification(from, subject)) {
      return this.parseBillNotification(subject, body, from, date);
    }

    return null;
  }

  private isBankAlert(from: string, subject: string): boolean {
    const bankDomains = ['hdfcbank', 'icicibank', 'sbi', 'axisbank', 'kotak', 'chase', 'bofa', 'wellsfargo', 'citi'];
    const fromLower = from.toLowerCase();
    return bankDomains.some(b => fromLower.includes(b)) &&
      /debit|credit|transaction|transfer|payment/i.test(subject);
  }

  private parseBankAlert(subject: string, body: string, from: string, date: Date): NormalizedEntry {
    const amountMatch = body.match(/(?:Rs\.?|INR|\$|USD)\s*([\d,]+\.?\d*)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;
    const isCredit = /credit|received|deposited/i.test(subject + body);

    return {
      category: 'transactions',
      key: `txn-${date.getTime()}`,
      data: {
        type: isCredit ? 'credit' : 'debit',
        amount,
        description: subject,
        source: from,
        date: date.toISOString(),
        parsedFrom: 'email',
      },
      timestamp: date,
    };
  }

  private isOrderConfirmation(from: string, subject: string): boolean {
    const ecomDomains = ['amazon', 'flipkart', 'myntra', 'swiggy', 'zomato', 'uber', 'ola'];
    const fromLower = from.toLowerCase();
    return ecomDomains.some(d => fromLower.includes(d)) &&
      /order|confirm|shipped|deliver/i.test(subject);
  }

  private parseOrderConfirmation(subject: string, body: string, from: string, date: Date): NormalizedEntry {
    const orderIdMatch = body.match(/order\s*(?:#|id|number)?\s*[:\s]?\s*([A-Z0-9-]+)/i);
    const amountMatch = body.match(/(?:Rs\.?|INR|\$|USD)\s*([\d,]+\.?\d*)/i);

    return {
      category: 'orders',
      key: `order-${orderIdMatch?.[1] || date.getTime()}`,
      data: {
        orderId: orderIdMatch?.[1] || 'unknown',
        platform: this.extractPlatform(from),
        amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0,
        status: /shipped|dispatch/i.test(subject) ? 'shipped' : 'confirmed',
        subject,
        date: date.toISOString(),
        parsedFrom: 'email',
      },
      timestamp: date,
    };
  }

  private isSalaryCredit(subject: string, body: string): boolean {
    return /salary|payroll|stipend/i.test(subject + body) && /credit/i.test(subject + body);
  }

  private parseSalaryCredit(subject: string, body: string, from: string, date: Date): NormalizedEntry {
    const amountMatch = body.match(/(?:Rs\.?|INR|\$|USD)\s*([\d,]+\.?\d*)/i);
    return {
      category: 'income',
      key: `salary-${date.getFullYear()}-${date.getMonth() + 1}`,
      data: {
        source: 'Salary',
        amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0,
        type: 'Salary',
        recurring: 'Monthly',
        date: date.toISOString(),
        parsedFrom: 'email',
      },
      timestamp: date,
    };
  }

  private isBillNotification(from: string, subject: string): boolean {
    return /bill|invoice|due|electricity|water|broadband|phone|mobile/i.test(subject + from);
  }

  private parseBillNotification(subject: string, body: string, from: string, date: Date): NormalizedEntry {
    const amountMatch = body.match(/(?:Rs\.?|INR|\$|USD)\s*([\d,]+\.?\d*)/i);
    return {
      category: 'bills',
      key: `bill-${date.getTime()}`,
      data: {
        name: subject.slice(0, 80),
        amount: amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0,
        provider: this.extractPlatform(from),
        date: date.toISOString(),
        parsedFrom: 'email',
      },
      timestamp: date,
    };
  }

  // ─── Utility ───────────────────────────────────────

  private getHeader(headers: Array<{ name: string; value: string }>, name: string): string | undefined {
    return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value;
  }

  private extractBody(payload: any): string {
    if (!payload) return '';
    if (payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64').toString('utf-8');
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return Buffer.from(part.body.data, 'base64').toString('utf-8');
        }
      }
      // Fallback to first part
      return this.extractBody(payload.parts[0]);
    }
    return '';
  }

  private extractPlatform(from: string): string {
    const match = from.match(/@([^.>]+)/);
    return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1) : 'Unknown';
  }
}

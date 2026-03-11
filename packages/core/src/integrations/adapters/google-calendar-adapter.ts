import { DataCategory } from '../../types';
import {
  IntegrationAdapter,
  OAuthTokens,
  FetchOptions,
  NormalizedEntry,
} from '../adapter-types';

/**
 * Google Calendar Adapter
 *
 * Syncs calendar events so agents can:
 * - Check for scheduling conflicts
 * - Suggest best times for tasks
 * - Remind about upcoming events
 * - Correlate expenses with events
 */
export class GoogleCalendarAdapter implements IntegrationAdapter {
  readonly id = 'google-calendar';
  readonly name = 'Google Calendar';
  readonly provider = 'google';
  readonly dataCategories: DataCategory[] = ['calendar'];
  readonly authType = 'oauth2' as const;
  readonly scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly',
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
      refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async fetchData(tokens: OAuthTokens, options?: FetchOptions): Promise<NormalizedEntry[]> {
    const timeMin = (options?.since || new Date()).toISOString();
    const timeMax = new Date(Date.now() + 30 * 86400000).toISOString(); // Next 30 days

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      maxResults: String(options?.limit || 100),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } }
    );
    const data = await res.json() as any;

    return (data.items || []).map((event: any) => ({
      category: 'calendar' as DataCategory,
      key: `gcal-${event.id}`,
      data: {
        title: event.summary,
        description: event.description,
        start: event.start?.dateTime || event.start?.date,
        end: event.end?.dateTime || event.end?.date,
        location: event.location,
        status: event.status,
        organizer: event.organizer?.email,
        attendees: event.attendees?.map((a: any) => a.email),
        link: event.htmlLink,
        source: 'google-calendar',
      },
      timestamp: new Date(event.start?.dateTime || event.start?.date || Date.now()),
    }));
  }
}

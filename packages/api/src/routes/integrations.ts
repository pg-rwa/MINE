import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

/**
 * Integration configuration — describes what's available to connect.
 * Adapter credentials come from env vars.
 */
const AVAILABLE_INTEGRATIONS = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Sync emails to auto-detect transactions, orders, bills, and salary credits.',
    icon: '📧',
    authType: 'oauth2',
    status: 'available',
    categories: ['transactions', 'orders', 'bills', 'income', 'expenses'],
    requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Sync your calendar events for scheduling and reminders.',
    icon: '📅',
    authType: 'oauth2',
    status: 'available',
    categories: ['calendar'],
    requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
  },
  {
    id: 'plaid',
    name: 'Bank Accounts (Plaid)',
    description: 'Connect your bank for automatic transaction and balance syncing.',
    icon: '🏦',
    authType: 'oauth2',
    status: 'available',
    categories: ['bank_accounts', 'transactions', 'investments'],
    requiredEnv: ['PLAID_CLIENT_ID', 'PLAID_SECRET'],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Get MINE notifications and chat with agents via Telegram.',
    icon: '💬',
    authType: 'bot_link',
    status: 'available',
    categories: ['messages'],
    requiredEnv: ['TELEGRAM_BOT_TOKEN'],
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    description: 'Post tweets, track engagement, and manage your presence.',
    icon: '🐦',
    authType: 'oauth2',
    status: 'coming_soon',
    categories: ['social_posts'],
    requiredEnv: [],
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Unified messaging — read and reply to WhatsApp from MINE.',
    icon: '💚',
    authType: 'business_api',
    status: 'coming_soon',
    categories: ['messages'],
    requiredEnv: [],
  },
  {
    id: 'fitbit',
    name: 'Fitbit',
    description: 'Sync steps, heart rate, sleep, and workout data.',
    icon: '⌚',
    authType: 'oauth2',
    status: 'coming_soon',
    categories: ['health_metrics', 'workouts'],
    requiredEnv: [],
  },
  {
    id: 'zerodha',
    name: 'Zerodha Kite',
    description: 'Sync your stock portfolio and trade history.',
    icon: '📈',
    authType: 'oauth2',
    status: 'coming_soon',
    categories: ['investments'],
    requiredEnv: [],
  },
];

export function integrationRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // List all available integrations with their status
    app.get('/available', async () => {
      return AVAILABLE_INTEGRATIONS.map(i => ({
        ...i,
        configured: i.requiredEnv.every(e => !!process.env[e]),
      }));
    });

    // List user's active connections
    app.get('/connections', async (request) => {
      const userId = (request as any).userId;
      const connections = ctx.integrations.listConnections(userId);
      // Don't leak tokens/credentials to the frontend
      return connections.map(c => ({
        id: c.id,
        integrationId: c.integrationId,
        status: c.status,
        lastSync: c.lastSync,
        lastSyncCount: c.lastSyncCount,
        errorMessage: c.errorMessage,
        createdAt: c.createdAt,
      }));
    });

    // Start OAuth flow — returns the auth URL to redirect to
    app.post<{ Body: { integrationId: string } }>('/auth/start', async (request) => {
      const { integrationId } = request.body;

      const integration = AVAILABLE_INTEGRATIONS.find(i => i.id === integrationId);
      if (!integration) throw new Error(`Unknown integration: ${integrationId}`);
      if (integration.status !== 'available') {
        return { error: 'coming_soon', message: `${integration.name} integration is coming soon!` };
      }

      const configured = integration.requiredEnv.every(e => !!process.env[e]);
      if (!configured) {
        return {
          status: 'not_configured',
          message: `${integration.name} requires environment variables: ${integration.requiredEnv.join(', ')}. Set these in your Railway dashboard.`,
          envVars: integration.requiredEnv,
        };
      }

      // Use the real adapter to generate the auth URL
      const adapter = ctx.integrations.getAdapter(integrationId);
      if (!adapter) {
        return { error: 'no_adapter', message: `No adapter registered for ${integrationId}` };
      }

      const userId = (request as any).userId;
      const state = Buffer.from(
        JSON.stringify({ userId, integrationId, ts: Date.now() })
      ).toString('base64url');

      const baseUrl = process.env.APP_URL || `${request.protocol}://${request.hostname}`;
      const redirectUri = `${baseUrl}/api/integrations/auth/callback`;
      const authUrl = adapter.getAuthUrl(state, redirectUri);

      return { status: 'redirect', authUrl, state };
    });

    // OAuth callback — exchanges code for tokens, stores connection, triggers first sync
    app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
      '/auth/callback',
      async (request, reply) => {
        const { code, state, error } = request.query;

        if (error) {
          return reply.redirect('/?integration_error=' + encodeURIComponent(error));
        }

        if (!code || !state) {
          return reply.redirect('/?integration_error=missing_params');
        }

        try {
          const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
          const { userId, integrationId } = stateData;

          // Verify state isn't too old (5 minute window)
          if (Date.now() - stateData.ts > 5 * 60 * 1000) {
            return reply.redirect('/?integration_error=state_expired');
          }

          const adapter = ctx.integrations.getAdapter(integrationId);
          if (!adapter) {
            return reply.redirect('/?integration_error=no_adapter');
          }

          // Exchange auth code for real tokens
          const baseUrl = process.env.APP_URL || `${request.protocol}://${request.hostname}`;
          const redirectUri = `${baseUrl}/api/integrations/auth/callback`;
          const tokens = await adapter.exchangeToken(code, redirectUri);

          // Store the connection with real tokens
          const connection = await ctx.integrations.connect(
            userId,
            integrationId,
            { connectedAt: new Date().toISOString() },
            tokens
          );

          // Trigger initial sync in the background (don't block the redirect)
          ctx.integrations.sync(connection.id).catch(err => {
            console.error(`Initial sync failed for ${integrationId}:`, err.message);
          });

          return reply.redirect('/?integration_success=' + integrationId);
        } catch (err) {
          console.error('OAuth callback error:', err);
          return reply.redirect('/?integration_error=token_exchange_failed');
        }
      }
    );

    // Simulate connecting (for demo without real OAuth)
    app.post<{ Body: { integrationId: string } }>('/connect/demo', async (request) => {
      const userId = (request as any).userId;
      const { integrationId } = request.body;

      const integration = AVAILABLE_INTEGRATIONS.find(i => i.id === integrationId);
      if (!integration) throw new Error(`Unknown integration: ${integrationId}`);

      const connection = await ctx.integrations.connect(userId, integrationId, {
        demo: true,
        connectedAt: new Date().toISOString(),
      });

      return { success: true, connection: { id: connection.id, status: connection.status } };
    });

    // Trigger sync
    app.post<{ Params: { connectionId: string } }>('/sync/:connectionId', async (request) => {
      try {
        const entries = await ctx.integrations.sync(request.params.connectionId);
        const connection = ctx.integrations.getConnection(request.params.connectionId);
        return {
          success: true,
          recordCount: entries.length,
          lastSync: connection?.lastSync,
          categories: [...new Set(entries.map(e => e.category))],
        };
      } catch (err) {
        return { success: false, error: (err as Error).message };
      }
    });

    // Disconnect
    app.post<{ Params: { connectionId: string } }>('/disconnect/:connectionId', async (request) => {
      ctx.integrations.disconnect(request.params.connectionId);
      return { success: true };
    });

    done();
  };
}

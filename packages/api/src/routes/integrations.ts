import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

/**
 * Integration configuration — describes what's available to connect.
 * In production, adapter credentials come from env vars.
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
      return ctx.integrations.listConnections(userId);
    });

    // Start OAuth flow — returns the auth URL to redirect to
    app.post<{ Body: { integrationId: string } }>('/auth/start', async (request) => {
      const userId = (request as any).userId;
      const { integrationId } = request.body;

      const integration = AVAILABLE_INTEGRATIONS.find(i => i.id === integrationId);
      if (!integration) throw new Error(`Unknown integration: ${integrationId}`);
      if (integration.status !== 'available') {
        return { error: 'coming_soon', message: `${integration.name} integration is coming soon!` };
      }

      // Generate state token for CSRF protection
      const state = Buffer.from(JSON.stringify({ userId, integrationId, ts: Date.now() })).toString('base64url');

      // For demo: simulate the OAuth URL (needs real credentials in production)
      const configured = integration.requiredEnv.every(e => !!process.env[e]);
      if (!configured) {
        return {
          status: 'not_configured',
          message: `${integration.name} requires environment variables: ${integration.requiredEnv.join(', ')}. Set these in your Railway dashboard.`,
          envVars: integration.requiredEnv,
        };
      }

      // In production: use the actual adapter to generate the auth URL
      const redirectUri = `${request.protocol}://${request.hostname}/api/integrations/auth/callback`;
      return {
        status: 'redirect',
        authUrl: `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
        state,
      };
    });

    // OAuth callback — exchanges code for tokens
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

          // In production: use adapter.exchangeToken(code, redirectUri)
          // Store the connection
          await ctx.integrations.connect(userId, integrationId, {
            accessToken: code, // Placeholder — real token from exchange
            connectedAt: new Date().toISOString(),
          });

          return reply.redirect('/?integration_success=' + integrationId);
        } catch (err) {
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

      return { success: true, connection };
    });

    // Trigger sync
    app.post<{ Params: { connectionId: string } }>('/sync/:connectionId', async (request) => {
      await ctx.integrations.sync(request.params.connectionId);
      return { success: true };
    });

    // Disconnect
    app.post<{ Params: { connectionId: string } }>('/disconnect/:connectionId', async (request) => {
      ctx.integrations.disconnect(request.params.connectionId);
      return { success: true };
    });

    done();
  };
}

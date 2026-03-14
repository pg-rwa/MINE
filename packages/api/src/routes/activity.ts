import { FastifyPluginCallback } from 'fastify';
import { AppContext } from '../app';

/**
 * SSE endpoint for live agent activity streaming.
 * The frontend connects via EventSource and receives real-time updates.
 */
export function activityRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {

    // SSE stream — sends activity events in real-time
    app.get('/stream', async (request, reply) => {
      if (!ctx.activityBus) {
        reply.code(503).send({ error: 'Activity bus not available' });
        return;
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send recent events as initial state
      const recent = ctx.activityBus.getRecent(15);
      for (const event of recent) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      // Stream new events
      const onActivity = (event: any) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // Client disconnected
        }
      };

      ctx.activityBus.on('activity', onActivity);

      // Keep-alive ping every 15s
      const keepAlive = setInterval(() => {
        try {
          reply.raw.write(': ping\n\n');
        } catch {
          cleanup();
        }
      }, 15000);

      const cleanup = () => {
        ctx.activityBus!.off('activity', onActivity);
        clearInterval(keepAlive);
      };

      // Cleanup on disconnect
      request.raw.on('close', cleanup);
      request.raw.on('error', cleanup);
    });

    // GET recent activity (non-streaming fallback)
    app.get('/recent', async () => {
      if (!ctx.activityBus) return [];
      return ctx.activityBus.getRecent(30);
    });

    done();
  };
}

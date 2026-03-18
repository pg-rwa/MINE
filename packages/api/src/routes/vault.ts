import { FastifyPluginCallback } from 'fastify';
import { DATA_CATEGORIES } from '@mine/core';
import { AppContext } from '../app';

export function vaultRoutes(ctx: AppContext): FastifyPluginCallback {
  return (app, _opts, done) => {
    // Store data manually
    app.post<{ Body: { category: string; key: string; data: Record<string, unknown> } }>(
      '/',
      async (request) => {
        const userId = (request as any).userId;
        const { category, key, data } = request.body;
        return ctx.vault.put(userId, category as any, key, data, 'manual');
      }
    );

    // Query vault data
    app.get<{ Querystring: { category?: string; limit?: string } }>('/', async (request) => {
      const userId = (request as any).userId;
      const { category, limit } = request.query;
      return ctx.vault.query({
        userId,
        category: category as any,
        limit: limit ? parseInt(limit) : 50,
      });
    });

    // Debug: show what the MINE agent can see across all categories
    app.get('/debug', async (request) => {
      const userId = (request as any).userId;

      // Raw vault entries (bypasses permissions)
      const allEntries = ctx.vault.exportAll(userId);
      const byCat: Record<string, number> = {};
      for (const e of allEntries) {
        byCat[e.category] = (byCat[e.category] || 0) + 1;
      }

      // What the mine agent sees (with permissions)
      const agentView: Record<string, number> = {};
      const agentErrors: Record<string, string> = {};
      for (const cat of DATA_CATEGORIES) {
        try {
          const entries = ctx.vault.getForAgent(userId, 'mine', cat as any);
          if (entries.length > 0) agentView[cat] = entries.length;
        } catch (err: any) {
          agentErrors[cat] = err.message;
        }
      }

      // Permission status
      const perms = ctx.permissions.list(userId, 'mine');

      return {
        userId,
        rawVaultTotal: allEntries.length,
        rawVaultByCategory: byCat,
        mineAgentView: agentView,
        mineAgentErrors: agentErrors,
        minePermissions: perms.length,
        minePermCategories: perms.map(p => p.resource),
        agentInstalled: ctx.runtime.listAgents().map(a => ({ id: a.manifest.id, active: a.active })),
      };
    });

    // Migrate: rebuild vault from old agent chat history
    app.post('/migrate', async (request) => {
      const userId = (request as any).userId;
      if (!ctx.persistence) return { error: 'No persistence layer' };

      // 1. Get all old agent messages (both user + assistant)
      const oldUserMsgs = ctx.persistence.getOldUserMessages(userId);
      const oldAssistantMsgs = ctx.persistence.getOldAgentMessages(userId);

      if (oldUserMsgs.length === 0 && oldAssistantMsgs.length === 0) {
        return { status: 'no_old_data', message: 'No old agent conversations found' };
      }

      // 2. Group messages by agent for context
      const byAgent: Record<string, string[]> = {};
      for (const m of [...oldUserMsgs, ...oldAssistantMsgs]) {
        if (!byAgent[m.agentId]) byAgent[m.agentId] = [];
        byAgent[m.agentId].push(`[${m.createdAt}] ${m.content}`);
      }

      // 3. For each agent, ask AI to extract structured data
      const results: Record<string, any> = {};
      let totalExtracted = 0;

      for (const [agentId, messages] of Object.entries(byAgent)) {
        // Truncate to avoid token limits — last 50 messages per agent
        const recentMessages = messages.slice(-50).join('\n---\n');
        const categories = agentToCategories(agentId);

        if (categories.length === 0) continue;

        const extractionPrompt = buildExtractionPrompt(categories, agentId);

        try {
          const extracted = await ctx.aiEngine.complete(
            `${extractionPrompt}\n\nHere are the conversation messages:\n\n${recentMessages}\n\nExtract ALL data items as a JSON array. Each item MUST have "category" (one of: ${categories.join(', ')}), "key" (short identifier), and "data" (object with actual fields). Return ONLY valid JSON array, no explanation.`,
            { tier: 'fast', maxTokens: 4000 }
          );

          // Parse AI response
          const jsonMatch = extracted.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const items = JSON.parse(jsonMatch[0]);
            results[agentId] = { categories, count: items.length };

            for (const item of items) {
              if (item.key && item.data && item.category) {
                ctx.vault.put(userId, item.category, item.key, item.data, 'migration');
                totalExtracted++;
              }
            }
          }
        } catch (err: any) {
          results[agentId] = { error: err.message };
        }
      }

      return {
        status: 'done',
        totalExtracted,
        agentsSeen: Object.keys(byAgent).length,
        messageCount: oldUserMsgs.length + oldAssistantMsgs.length,
        results,
      };
    });

    // Export all data (GDPR)
    app.get('/export', async (request) => {
      const userId = (request as any).userId;
      return ctx.vault.exportAll(userId);
    });

    // Delete all data
    app.delete('/purge', async (request) => {
      const userId = (request as any).userId;
      const count = ctx.vault.purgeUser(userId);
      return { deleted: count };
    });

    done();
  };
}

function agentToCategories(agentId: string): string[] {
  const map: Record<string, string[]> = {
    finance: ['income', 'expenses', 'emis'],
    property: ['properties', 'tenants', 'rent_records'],
    fitness: ['health'],
    trading: ['investments'],
    shopping: ['shopping'],
    cooking: ['recipes'],
    tax: ['tax'],
    utility: ['bills'],
    education: ['education'],
  };
  return map[agentId] || [];
}

function buildExtractionPrompt(categories: string[], agentId: string): string {
  // Build prompt based on which categories this agent covers
  const parts: string[] = [];

  if (categories.includes('income') || categories.includes('expenses') || categories.includes('emis')) {
    parts.push(`For income: category="income", key="income-{source}", data={source, amount, frequency}
For expenses: category="expenses", key="expense-{name}", data={name, amount, category, frequency}
For EMIs/loans: category="emis", key="emi-{name}", data={name, amount, lender, tenure, startDate}`);
  }
  if (categories.includes('properties') || categories.includes('tenants') || categories.includes('rent_records')) {
    parts.push(`For properties: category="properties", key="prop-{name}", data={name, location, type, purchasePrice, rentAmount}
For tenants: category="tenants", key="tenant-{name}", data={name, property, rentAmount, moveInDate}
For rent records: category="rent_records", key="rent-{tenant}", data={tenant, amount, month, status}`);
  }
  if (categories.includes('health')) {
    parts.push(`For health data: category="health", key="health-{type}", data={type, value, unit, date}`);
  }
  if (categories.includes('investments')) {
    parts.push(`For investments: category="investments", key="inv-{name}", data={name, type, amount, units, buyPrice, platform}`);
  }
  if (categories.includes('shopping')) {
    parts.push(`For shopping: category="shopping", key="shop-{item}", data={item, price, store, status}`);
  }
  if (categories.includes('recipes')) {
    parts.push(`For recipes: category="recipes", key="recipe-{name}", data={name, ingredients, cuisine}`);
  }
  if (categories.includes('tax')) {
    parts.push(`For tax: category="tax", key="tax-{item}", data={item, amount, section, year}`);
  }
  if (categories.includes('bills')) {
    parts.push(`For bills: category="bills", key="bill-{name}", data={name, amount, provider, dueDate}`);
  }
  if (categories.includes('education')) {
    parts.push(`For education: category="education", key="edu-{topic}", data={topic, progress, platform}`);
  }

  return `Extract ALL concrete data items from this ${agentId} conversation. Only include items where the user shared actual numbers/details (not just questions). Each item needs category, key, and data fields.\n\n${parts.join('\n')}`;
}

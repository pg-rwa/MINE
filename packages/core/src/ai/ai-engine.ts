import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

/**
 * AIEngine with multi-provider support.
 * Supports Claude (Anthropic) and OpenAI with automatic failover.
 * When one provider hits rate limits or errors, it falls back to the other.
 * Includes tiered routing: cheap models for extraction, smart models for reasoning.
 */

// ─── Types ─────────────────────────────────────────────

export interface ProviderConfig {
  name: 'claude' | 'openai';
  apiKey?: string;
  enabled: boolean;
  priority: number; // lower = preferred
  models: {
    fast: string;  // cheap model for extraction, classification
    smart: string; // powerful model for reasoning, analysis
  };
}

export interface AIConfig {
  providers?: ProviderConfig[];
  maxTokens?: number;
  /** @deprecated Use providers array instead */
  provider?: 'claude' | 'local';
  /** @deprecated Use providers array instead */
  model?: string;
  /** @deprecated Use providers array instead */
  apiKey?: string;
}

export type TaskTier = 'fast' | 'smart';

/** Attachment content for multimodal messages */
export interface MessageAttachment {
  type: 'image' | 'file';
  mimeType: string;
  /** base64-encoded data for images */
  data?: string;
  /** Extracted text content for documents */
  textContent?: string;
  filename?: string;
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
}

export interface UserIntent {
  primaryAction: string;
  primaryTopic: string;
  dataSources: string[];
  crossAgentRefs: string[];
  subRequests: Array<{ action: string; topic: string; agentDomain?: string }>;
  tone: 'casual' | 'urgent' | 'frustrated';
  originalMessage: string;
  confidence: number;
}

// ─── Provider Tracking ─────────────────────────────────

interface ProviderState {
  config: ProviderConfig;
  client: Anthropic | OpenAI | null;
  type: 'claude' | 'openai';
  available: boolean;
  consecutiveErrors: number;
  cooldownUntil: number; // timestamp
}

// ─── Keyword Maps ──────────────────────────────────────

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  finance: ['emi', 'loan', 'expense', 'income', 'salary', 'budget', 'spend', 'bank', 'payment', 'money', 'cost', 'balance', 'net worth', 'investment', 'saving', 'credit', 'debit', 'installment', 'mortgage'],
  email: ['mail', 'email', 'inbox', 'unread', 'newsletter', 'subscribe', 'gmail', 'outlook'],
  fitness: ['workout', 'exercise', 'gym', 'calorie', 'weight', 'sleep', 'step', 'run', 'health', 'diet', 'bmi', 'yoga', 'cardio'],
  shopping: ['buy', 'shop', 'price', 'deal', 'compare', 'grocery', 'list', 'cart', 'order', 'amazon', 'flipkart', 'discount', 'cheap', 'best place', 'where to buy'],
  trading: ['stock', 'share', 'portfolio', 'market', 'trade', 'nifty', 'sensex', 'mutual fund', 'crypto'],
  property: ['rent', 'tenant', 'property', 'house', 'apartment', 'lease', 'real estate', 'maintenance'],
  tax: ['tax', 'itr', 'deduction', '80c', 'gst', 'filing', 'return'],
  cooking: ['recipe', 'cook', 'dinner', 'lunch', 'breakfast', 'meal', 'food', 'ingredient'],
  education: ['course', 'learn', 'study', 'exam', 'class', 'lecture', 'tutorial'],
  social: ['post', 'tweet', 'instagram', 'facebook', 'linkedin', 'social media'],
  delivery: ['deliver', 'package', 'track', 'shipment', 'courier', 'parcel'],
  utility: ['bill', 'electricity', 'water', 'gas', 'recharge', 'dth', 'broadband'],
};

const ACTION_VERBS: Record<string, string[]> = {
  view: ['show', 'see', 'view', 'list', 'display', 'get', 'find', 'what', 'how much', 'how many', 'tell'],
  add: ['add', 'create', 'new', 'record', 'log', 'save', 'enter', 'set up', 'register'],
  check: ['check', 'scan', 'look', 'search', 'find out', 'verify', 'confirm', 'review'],
  update: ['update', 'change', 'modify', 'edit', 'adjust', 'correct'],
  delete: ['delete', 'remove', 'cancel', 'stop', 'unsubscribe'],
  analyze: ['analyze', 'summarize', 'summary', 'insights', 'breakdown', 'compare', 'trend', 'report'],
  remind: ['remind', 'alert', 'notify', 'schedule', 'due'],
};

// ─── AIEngine ──────────────────────────────────────────

export class AIEngine {
  private providers: ProviderState[] = [];
  private defaultMaxTokens: number;

  constructor(config: AIConfig) {
    this.defaultMaxTokens = config.maxTokens ?? 1024;

    // Support legacy single-provider config
    const providerConfigs = config.providers?.length
      ? config.providers
      : this.buildLegacyProviders(config);

    for (const pc of providerConfigs) {
      this.providers.push(this.initProvider(pc));
    }

    // Sort by priority (lower = preferred)
    this.providers.sort((a, b) => a.config.priority - b.config.priority);

    this.logStatus();
  }

  /**
   * Convert old-style config to new providers array.
   */
  private buildLegacyProviders(config: AIConfig): ProviderConfig[] {
    const providers: ProviderConfig[] = [];

    const anthropicKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      providers.push({
        name: 'claude',
        apiKey: anthropicKey,
        enabled: true,
        priority: 1,
        models: { fast: 'claude-haiku-4-5-20251001', smart: config.model || 'claude-sonnet-4-6' },
      });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      providers.push({
        name: 'openai',
        apiKey: openaiKey,
        enabled: true,
        priority: 2,
        models: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
      });
    }

    return providers;
  }

  private initProvider(config: ProviderConfig): ProviderState {
    const apiKey = config.apiKey
      || (config.name === 'claude' ? process.env.ANTHROPIC_API_KEY : undefined)
      || (config.name === 'openai' ? process.env.OPENAI_API_KEY : undefined);

    let client: Anthropic | OpenAI | null = null;

    if (apiKey && config.enabled) {
      if (config.name === 'claude') {
        client = new Anthropic({ apiKey });
      } else if (config.name === 'openai') {
        client = new OpenAI({ apiKey });
      }
    }

    return {
      config: { ...config, apiKey },
      client,
      type: config.name,
      available: client !== null,
      consecutiveErrors: 0,
      cooldownUntil: 0,
    };
  }

  private logStatus(): void {
    const active = this.providers.filter(p => p.available);
    if (active.length === 0) {
      console.log('AI Engine: No providers configured — set ANTHROPIC_API_KEY and/or OPENAI_API_KEY');
    } else {
      const names = active.map(p => `${p.type} (priority ${p.config.priority})`).join(', ');
      console.log(`AI Engine: ${active.length} provider(s) active — ${names}`);
      console.log(`AI Engine: Auto-failover ${active.length > 1 ? 'enabled' : 'disabled (single provider)'}`);
    }
  }

  // ─── Provider Selection ──────────────────────────────

  /**
   * Get available providers in priority order, skipping those on cooldown.
   */
  private getAvailableProviders(): ProviderState[] {
    const now = Date.now();
    return this.providers.filter(p => p.available && p.client && now >= p.cooldownUntil);
  }

  /**
   * Mark a provider as temporarily failed. After 3 consecutive errors,
   * it enters a 60-second cooldown before being retried.
   */
  private markProviderError(provider: ProviderState, error: unknown): void {
    provider.consecutiveErrors++;
    const isRateLimit = this.isRateLimitError(error);
    const isAuthError = this.isAuthError(error);

    if (isAuthError) {
      // Permanent failure — disable provider
      provider.available = false;
      console.error(`AI Engine: ${provider.type} disabled — invalid API key`);
    } else if (isRateLimit || provider.consecutiveErrors >= 3) {
      // Cooldown: rate limit = 60s, other errors = 30s
      const cooldownMs = isRateLimit ? 60_000 : 30_000;
      provider.cooldownUntil = Date.now() + cooldownMs;
      console.warn(`AI Engine: ${provider.type} on cooldown for ${cooldownMs / 1000}s (${isRateLimit ? 'rate limited' : 'consecutive errors'})`);
    }
  }

  private markProviderSuccess(provider: ProviderState): void {
    provider.consecutiveErrors = 0;
  }

  private isRateLimitError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      return e['status'] === 429 || (typeof e['message'] === 'string' && e['message'].includes('rate'));
    }
    return false;
  }

  private isAuthError(error: unknown): boolean {
    if (error && typeof error === 'object') {
      const e = error as Record<string, unknown>;
      return e['status'] === 401 || e['status'] === 403;
    }
    return false;
  }

  // ─── Core Call With Failover ─────────────────────────

  /**
   * Execute an AI call with automatic failover across providers.
   */
  private async callWithFailover(
    tier: TaskTier,
    callFn: (provider: ProviderState, model: string) => Promise<string>
  ): Promise<string> {
    const available = this.getAvailableProviders();
    if (available.length === 0) {
      return '[AI not configured — set ANTHROPIC_API_KEY and/or OPENAI_API_KEY]';
    }

    for (const provider of available) {
      const model = tier === 'fast' ? provider.config.models.fast : provider.config.models.smart;
      try {
        const result = await callFn(provider, model);
        this.markProviderSuccess(provider);
        return result;
      } catch (error) {
        console.warn(`AI Engine: ${provider.type} (${model}) failed, trying next provider...`, error);
        this.markProviderError(provider, error);
      }
    }

    return '[AI error — all providers unavailable, please try again later]';
  }

  // ─── Provider-Specific Calls ─────────────────────────

  private async claudeChat(
    client: Anthropic,
    model: string,
    systemPrompt: string | undefined,
    userMessage: string,
    maxTokens: number
  ): Promise<string> {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: 'user', content: userMessage }],
    });
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text ?? '';
  }

  private async openaiChat(
    client: OpenAI,
    model: string,
    systemPrompt: string | undefined,
    userMessage: string,
    maxTokens: number
  ): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userMessage });

    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  private async providerChat(
    provider: ProviderState,
    model: string,
    systemPrompt: string | undefined,
    userMessage: string,
    maxTokens: number
  ): Promise<string> {
    if (provider.type === 'claude') {
      return this.claudeChat(provider.client as Anthropic, model, systemPrompt, userMessage, maxTokens);
    } else {
      return this.openaiChat(provider.client as OpenAI, model, systemPrompt, userMessage, maxTokens);
    }
  }

  /**
   * Multi-turn conversation: sends actual structured message history to the AI provider.
   * This gives the model proper conversation context instead of text-embedded history.
   */
  private async providerChatWithHistory(
    provider: ProviderState,
    model: string,
    systemPrompt: string | undefined,
    history: Array<{ role: string; content: string }>,
    userMessage: string,
    maxTokens: number
  ): Promise<string> {
    if (provider.type === 'claude') {
      const client = provider.client as Anthropic;
      // Build proper multi-turn messages array
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

      // Filter out empty messages and build alternating turns
      for (const msg of history) {
        if (!msg.content || !msg.content.trim()) continue;
        const role = msg.role === 'user' ? 'user' as const : 'assistant' as const;
        // Ensure alternating roles — Claude requires user/assistant alternation
        if (messages.length > 0 && messages[messages.length - 1].role === role) {
          // Merge consecutive same-role messages
          messages[messages.length - 1].content += '\n' + msg.content;
        } else {
          messages.push({ role, content: msg.content });
        }
      }

      // Claude requires first message to be 'user'. Drop leading assistant messages.
      while (messages.length > 0 && messages[0].role !== 'user') {
        messages.shift();
      }

      // Ensure last history message isn't 'user' before we add the current user message
      if (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages[messages.length - 1].content += '\n' + userMessage;
      } else {
        messages.push({ role: 'user', content: userMessage });
      }

      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages,
      });
      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text ?? '';
    } else {
      const client = provider.client as OpenAI;
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      for (const msg of history) {
        if (!msg.content || !msg.content.trim()) continue;
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
      }
      messages.push({ role: 'user', content: userMessage });
      const response = await client.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages,
      });
      return response.choices[0]?.message?.content ?? '';
    }
  }

  // ─── Public API ──────────────────────────────────────

  /**
   * Check if any AI provider is available.
   */
  get isAvailable(): boolean {
    return this.getAvailableProviders().length > 0;
  }

  /**
   * Get a summary of provider status (for health checks / dashboard).
   */
  getProviderStatus(): Array<{ name: string; available: boolean; onCooldown: boolean; priority: number }> {
    const now = Date.now();
    return this.providers.map(p => ({
      name: p.type,
      available: p.available,
      onCooldown: now < p.cooldownUntil,
      priority: p.config.priority,
    }));
  }

  /**
   * Text completion. Uses the 'fast' tier by default.
   */
  async complete(
    prompt: string,
    options?: { maxTokens?: number; temperature?: number; tier?: TaskTier }
  ): Promise<string> {
    const tier = options?.tier ?? 'fast';
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;

    return this.callWithFailover(tier, (provider, model) =>
      this.providerChat(provider, model, undefined, prompt, maxTokens)
    );
  }

  /**
   * Chat-style completion with a system prompt and user message.
   * This is the primary method agents use for generating responses.
   * Defaults to the 'smart' tier for quality responses.
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; temperature?: number; tier?: TaskTier; history?: Array<{ role: string; content: string }> }
  ): Promise<string> {
    const tier = options?.tier ?? 'smart';
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;

    // If history provided, use proper multi-turn conversation format
    if (options?.history && options.history.length > 0) {
      const result = await this.callWithFailover(tier, (provider, model) =>
        this.providerChatWithHistory(provider, model, systemPrompt, options.history!, userMessage, maxTokens)
      );
      // If multi-turn failed (any AI error), fall back to single-message with embedded history
      if (result.startsWith('[AI ')) {
        console.warn('AI Engine: Multi-turn failed, falling back to single-message with text history');
        // Reset ALL provider states so they're available for the fallback attempt
        for (const p of this.providers) {
          if (p.client) {
            p.available = true;
            p.cooldownUntil = 0;
            p.consecutiveErrors = 0;
          }
        }
        const historyText = options.history
          .filter(h => h.content?.trim())
          .slice(-10) // Limit to last 10 messages to avoid token overflow
          .map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content.slice(0, 200)}`)
          .join('\n');
        const fallbackMsg = historyText
          ? `[Recent conversation]\n${historyText}\n\n[Current message]\n${userMessage}`
          : userMessage;
        return this.callWithFailover(tier, (provider, model) =>
          this.providerChat(provider, model, systemPrompt, fallbackMsg, maxTokens)
        );
      }
      return result;
    }

    return this.callWithFailover(tier, (provider, model) =>
      this.providerChat(provider, model, systemPrompt, userMessage, maxTokens)
    );
  }

  /**
   * Chat with attachments (images, documents).
   * Builds multimodal content blocks for Claude vision / OpenAI vision.
   */
  async chatWithAttachments(
    systemPrompt: string,
    userMessage: string,
    attachments: MessageAttachment[],
    options?: { maxTokens?: number; tier?: TaskTier }
  ): Promise<string> {
    const tier = options?.tier ?? 'smart';
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;

    return this.callWithFailover(tier, async (provider, model) => {
      if (provider.type === 'claude') {
        return this.claudeChatMultimodal(
          provider.client as Anthropic, model, systemPrompt, userMessage, attachments, maxTokens
        );
      } else {
        return this.openaiChatMultimodal(
          provider.client as OpenAI, model, systemPrompt, userMessage, attachments, maxTokens
        );
      }
    });
  }

  private async claudeChatMultimodal(
    client: Anthropic,
    model: string,
    systemPrompt: string,
    userMessage: string,
    attachments: MessageAttachment[],
    maxTokens: number
  ): Promise<string> {
    const content: Anthropic.Messages.ContentBlockParam[] = [];

    // Add images as image content blocks
    for (const att of attachments) {
      if (att.type === 'image' && att.data) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: att.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
            data: att.data,
          },
        });
      } else if (att.textContent) {
        // Document text — include as text block
        content.push({
          type: 'text',
          text: `[Attached file: ${att.filename || 'document'}]\n${att.textContent}`,
        });
      }
    }

    // Add user message
    content.push({ type: 'text', text: userMessage });

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    });
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock?.text ?? '';
  }

  private async openaiChatMultimodal(
    client: OpenAI,
    model: string,
    systemPrompt: string,
    userMessage: string,
    attachments: MessageAttachment[],
    maxTokens: number
  ): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
    ];

    const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    for (const att of attachments) {
      if (att.type === 'image' && att.data) {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:${att.mimeType};base64,${att.data}` },
        });
      } else if (att.textContent) {
        userContent.push({
          type: 'text',
          text: `[Attached file: ${att.filename || 'document'}]\n${att.textContent}`,
        });
      }
    }

    userContent.push({ type: 'text', text: userMessage });
    messages.push({ role: 'user', content: userContent });

    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  /**
   * Structured completion — returns parsed JSON.
   * Uses 'fast' tier since extraction is straightforward.
   */
  async completeStructured<T>(prompt: string, schema: string): Promise<T> {
    const raw = await this.complete(
      `${prompt}\n\nRespond with valid JSON matching this schema: ${schema}`,
      { tier: 'fast' }
    );
    return JSON.parse(raw) as T;
  }

  /**
   * Generate embeddings for semantic search.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    // TODO: Use OpenAI embeddings API when available (much cheaper than Claude for this)
    return {
      vector: new Array(1024).fill(0).map(() => Math.random()),
      model: 'stub',
    };
  }

  /**
   * Classify text into categories.
   * Uses 'fast' tier — classification doesn't need heavy reasoning.
   */
  async classify(
    text: string,
    categories: string[]
  ): Promise<{ category: string; confidence: number }> {
    const prompt = `Classify this text into one of these categories: ${categories.join(', ')}\n\nText: "${text}"\n\nRespond with ONLY the category name, nothing else.`;
    const result = await this.complete(prompt, { tier: 'fast' });
    return { category: result.trim(), confidence: 0.85 };
  }

  /**
   * Analyze a user message and extract structured intent.
   * Pure keyword-based — free, no API call needed.
   */
  analyzeIntent(message: string): UserIntent {
    const lower = message.toLowerCase();

    let primaryAction = 'view';
    for (const [action, verbs] of Object.entries(ACTION_VERBS)) {
      if (verbs.some(v => lower.includes(v))) {
        primaryAction = action;
        break;
      }
    }

    const detectedDomains: Array<{ domain: string; score: number }> = [];
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const matchCount = keywords.filter(kw => lower.includes(kw)).length;
      if (matchCount > 0) {
        detectedDomains.push({ domain, score: matchCount });
      }
    }
    detectedDomains.sort((a, b) => b.score - a.score);

    const primaryDomain = detectedDomains[0]?.domain || 'general';
    const primaryTopic = this.extractPrimaryTopic(lower, primaryDomain);

    const crossAgentRefs = detectedDomains
      .filter(d => d.domain !== primaryDomain)
      .map(d => d.domain);

    const dataSources = this.extractDataSources(lower);
    const subRequests = this.parseSubRequests(lower);
    const tone = this.detectTone(lower);
    const confidence = detectedDomains.length > 0 ? Math.min(0.95, 0.5 + detectedDomains[0].score * 0.15) : 0.3;

    return {
      primaryAction,
      primaryTopic,
      dataSources,
      crossAgentRefs,
      subRequests,
      tone,
      originalMessage: message,
      confidence,
    };
  }

  // ─── Intent Helpers (unchanged) ──────────────────────

  private extractPrimaryTopic(lower: string, domain: string): string {
    const keywords = DOMAIN_KEYWORDS[domain] || [];
    for (const kw of keywords) {
      if (lower.includes(kw)) return kw;
    }
    return domain;
  }

  private extractDataSources(lower: string): string[] {
    const sources: string[] = [];
    const sourcePatterns: Record<string, string[]> = {
      email: ['mail', 'email', 'inbox', 'gmail'],
      bank: ['bank', 'account', 'statement', 'transaction'],
      calendar: ['calendar', 'schedule', 'event'],
      sms: ['sms', 'text message', 'otp'],
    };
    for (const [source, patterns] of Object.entries(sourcePatterns)) {
      if (patterns.some(p => lower.includes(p))) {
        sources.push(source);
      }
    }
    return sources;
  }

  private parseSubRequests(lower: string): Array<{ action: string; topic: string; agentDomain?: string }> {
    const parts = lower.split(/\b(?:and|then|also|plus|after that)\b/).map(p => p.trim()).filter(Boolean);
    if (parts.length <= 1) return [this.parseSingleRequest(lower)];
    return parts.map(part => this.parseSingleRequest(part));
  }

  private parseSingleRequest(text: string): { action: string; topic: string; agentDomain?: string } {
    let action = 'view';
    for (const [act, verbs] of Object.entries(ACTION_VERBS)) {
      if (verbs.some(v => text.includes(v))) { action = act; break; }
    }
    let topic = 'general';
    let agentDomain: string | undefined;
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const matched = keywords.find(kw => text.includes(kw));
      if (matched) { topic = matched; agentDomain = domain; break; }
    }
    return { action, topic, agentDomain };
  }

  private detectTone(lower: string): 'casual' | 'urgent' | 'frustrated' {
    if (['urgent', 'asap', 'immediately', 'right now', 'hurry', 'critical'].some(w => lower.includes(w))) return 'urgent';
    if (['not working', 'broken', 'wrong', 'again', 'still', 'why', 'annoying'].some(w => lower.includes(w))) return 'frustrated';
    return 'casual';
  }
}

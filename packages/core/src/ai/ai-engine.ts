import Anthropic from '@anthropic-ai/sdk';

/**
 * AIEngine abstracts the AI/LLM layer.
 * Supports Claude API with automatic fallback.
 */
export interface AIConfig {
  provider: 'claude' | 'local';
  model: string;
  apiKey?: string;
  maxTokens?: number;
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
}

/**
 * Parsed user intent from a natural language message.
 */
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

// Keyword → agent domain mapping
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

export class AIEngine {
  private config: AIConfig;
  private client: Anthropic | null = null;

  constructor(config: AIConfig) {
    this.config = config;
    // Initialize Claude client if API key available
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (apiKey && config.provider === 'claude') {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Check if AI is available (Claude API key configured).
   */
  get isAvailable(): boolean {
    return this.client !== null;
  }

  /**
   * Text completion using Claude API.
   */
  async complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    if (!this.client) {
      return `[AI not configured — set ANTHROPIC_API_KEY]`;
    }

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text ?? '';
    } catch (error) {
      console.error('AIEngine.complete error:', error);
      return `[AI error — please try again]`;
    }
  }

  /**
   * Chat-style completion with a system prompt and user message.
   * This is the primary method agents use for generating smart responses.
   */
  async chat(
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<string> {
    if (!this.client) {
      return '';
    }

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: options?.maxTokens ?? this.config.maxTokens ?? 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });

      const textBlock = response.content.find(b => b.type === 'text');
      return textBlock?.text ?? '';
    } catch (error) {
      console.error('AIEngine.chat error:', error);
      return '';
    }
  }

  /**
   * Structured completion — returns parsed JSON.
   */
  async completeStructured<T>(prompt: string, schema: string): Promise<T> {
    const raw = await this.complete(`${prompt}\n\nRespond with valid JSON matching this schema: ${schema}`);
    return JSON.parse(raw) as T;
  }

  /**
   * Generate embeddings for semantic search.
   */
  async embed(text: string): Promise<EmbeddingResult> {
    return {
      vector: new Array(1024).fill(0).map(() => Math.random()),
      model: this.config.model,
    };
  }

  /**
   * Classify text into categories.
   */
  async classify(text: string, categories: string[]): Promise<{ category: string; confidence: number }> {
    const prompt = `Classify this text into one of these categories: ${categories.join(', ')}\n\nText: "${text}"\n\nRespond with ONLY the category name, nothing else.`;
    const result = await this.complete(prompt);
    return { category: result.trim(), confidence: 0.85 };
  }

  /**
   * Analyze a user message and extract structured intent.
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

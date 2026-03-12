/**
 * AIEngine abstracts the AI/LLM layer.
 * Supports multiple providers and local models for privacy.
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
  /** The primary action the user wants (e.g., 'view', 'add', 'check', 'search', 'compare') */
  primaryAction: string;
  /** The main topic/entity (e.g., 'emi', 'expense', 'email', 'workout') */
  primaryTopic: string;
  /** Secondary topics or data sources mentioned (e.g., user says "check mails for EMIs" → dataSources: ['email']) */
  dataSources: string[];
  /** Other agent domains referenced in the message (e.g., 'email', 'finance', 'fitness') */
  crossAgentRefs: string[];
  /** The full list of sub-requests if the message is compound */
  subRequests: Array<{ action: string; topic: string; agentDomain?: string }>;
  /** Sentiment/urgency: 'casual', 'urgent', 'frustrated' */
  tone: 'casual' | 'urgent' | 'frustrated';
  /** Original message for reference */
  originalMessage: string;
  /** Confidence score 0-1 */
  confidence: number;
}

// Keyword → agent domain mapping
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  finance: ['emi', 'loan', 'expense', 'income', 'salary', 'budget', 'spend', 'bank', 'payment', 'money', 'cost', 'balance', 'net worth', 'investment', 'saving', 'credit', 'debit', 'installment', 'mortgage'],
  email: ['mail', 'email', 'inbox', 'unread', 'newsletter', 'subscribe', 'gmail', 'outlook'],
  fitness: ['workout', 'exercise', 'gym', 'calorie', 'weight', 'sleep', 'step', 'run', 'health', 'diet', 'bmi', 'yoga', 'cardio'],
  shopping: ['buy', 'shop', 'price', 'deal', 'compare', 'grocery', 'list', 'cart', 'order', 'amazon', 'flipkart'],
  trading: ['stock', 'share', 'portfolio', 'market', 'trade', 'nifty', 'sensex', 'mutual fund', 'crypto'],
  property: ['rent', 'tenant', 'property', 'house', 'apartment', 'lease', 'real estate', 'maintenance'],
  tax: ['tax', 'itr', 'deduction', '80c', 'gst', 'filing', 'return'],
  cooking: ['recipe', 'cook', 'dinner', 'lunch', 'breakfast', 'meal', 'food', 'ingredient'],
  education: ['course', 'learn', 'study', 'exam', 'class', 'lecture', 'tutorial'],
  social: ['post', 'tweet', 'instagram', 'facebook', 'linkedin', 'social media'],
  delivery: ['deliver', 'package', 'track', 'shipment', 'courier', 'parcel'],
  utility: ['bill', 'electricity', 'water', 'gas', 'recharge', 'dth', 'broadband'],
};

// Action verbs mapping
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

  constructor(config: AIConfig) {
    this.config = config;
  }

  /**
   * Simple text completion.
   */
  async complete(prompt: string, options?: { maxTokens?: number; temperature?: number }): Promise<string> {
    // In production: calls Claude API or local model
    // For architecture scaffold, returns placeholder
    return `[AI Response to: ${prompt.slice(0, 50)}...]`;
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
    const prompt = `Classify this text into one of these categories: ${categories.join(', ')}\n\nText: "${text}"\n\nCategory:`;
    const result = await this.complete(prompt);
    return { category: result.trim(), confidence: 0.85 };
  }

  /**
   * Analyze a user message and extract structured intent.
   * Uses heuristic NLP (in production, this would use the LLM).
   */
  analyzeIntent(message: string): UserIntent {
    const lower = message.toLowerCase();
    const words = lower.split(/\s+/);

    // Detect action
    let primaryAction = 'view'; // default
    for (const [action, verbs] of Object.entries(ACTION_VERBS)) {
      if (verbs.some(v => lower.includes(v))) {
        primaryAction = action;
        break;
      }
    }

    // Detect all domains referenced
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

    // Detect cross-agent references (domains other than primary)
    const crossAgentRefs = detectedDomains
      .filter(d => d.domain !== primaryDomain)
      .map(d => d.domain);

    // Detect data sources mentioned (e.g., "check my mails" → email is a data source)
    const dataSources = this.extractDataSources(lower, primaryDomain);

    // Parse compound requests ("check mails AND find EMIs")
    const subRequests = this.parseSubRequests(lower);

    // Detect tone
    const tone = this.detectTone(lower);

    // Confidence based on how clear the intent is
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
    // Return the first matching keyword as the primary topic
    for (const kw of keywords) {
      if (lower.includes(kw)) return kw;
    }
    return domain;
  }

  private extractDataSources(lower: string, primaryDomain: string): string[] {
    const sources: string[] = [];
    // Check if user mentions data sources from other domains
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
    // Split on conjunctions to find compound requests
    const parts = lower.split(/\b(?:and|then|also|plus|after that)\b/).map(p => p.trim()).filter(Boolean);

    if (parts.length <= 1) {
      // Single request — still parse it
      return [this.parseSingleRequest(lower)];
    }

    return parts.map(part => this.parseSingleRequest(part));
  }

  private parseSingleRequest(text: string): { action: string; topic: string; agentDomain?: string } {
    let action = 'view';
    for (const [act, verbs] of Object.entries(ACTION_VERBS)) {
      if (verbs.some(v => text.includes(v))) {
        action = act;
        break;
      }
    }

    let topic = 'general';
    let agentDomain: string | undefined;
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      const matched = keywords.find(kw => text.includes(kw));
      if (matched) {
        topic = matched;
        agentDomain = domain;
        break;
      }
    }

    return { action, topic, agentDomain };
  }

  private detectTone(lower: string): 'casual' | 'urgent' | 'frustrated' {
    const urgentWords = ['urgent', 'asap', 'immediately', 'right now', 'hurry', 'critical'];
    const frustratedWords = ['not working', 'broken', 'wrong', 'again', 'still', 'why', 'annoying', 'frustrating'];

    if (urgentWords.some(w => lower.includes(w))) return 'urgent';
    if (frustratedWords.some(w => lower.includes(w))) return 'frustrated';
    return 'casual';
  }
}

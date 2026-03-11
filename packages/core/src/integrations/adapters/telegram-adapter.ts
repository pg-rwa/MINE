import { DataCategory } from '../../types';
import {
  IntegrationAdapter,
  OAuthTokens,
  FetchOptions,
  NormalizedEntry,
} from '../adapter-types';

/**
 * Telegram Bot Adapter
 *
 * Uses Telegram Bot API to:
 * - Receive messages forwarded to a MINE bot
 * - Send notifications to user via Telegram
 * - Act as a secondary interface to MINE (chat with agents via Telegram)
 *
 * Flow:
 * 1. User opens Telegram and starts conversation with @MINEAppBot
 * 2. Bot sends a unique link code
 * 3. User enters code in MINE app to link accounts
 * 4. Bot can now send notifications and receive forwarded messages
 *
 * Pricing: Free (Telegram Bot API is completely free)
 */
export class TelegramAdapter implements IntegrationAdapter {
  readonly id = 'telegram';
  readonly name = 'Telegram';
  readonly provider = 'telegram';
  readonly dataCategories: DataCategory[] = ['messages'];
  readonly authType = 'token' as const;

  private botToken: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
  }

  getAuthUrl(state: string, _redirectUri: string): string {
    // Telegram uses a bot link, not OAuth
    return `https://t.me/MINEAppBot?start=${state}`;
  }

  async exchangeToken(chatId: string, _redirectUri: string): Promise<OAuthTokens> {
    // For Telegram, the "token" is the chat_id
    return {
      accessToken: chatId,
      raw: { chatId },
    };
  }

  async refreshToken(_: string): Promise<OAuthTokens> {
    throw new Error('Telegram tokens do not expire');
  }

  async fetchData(tokens: OAuthTokens, _options?: FetchOptions): Promise<NormalizedEntry[]> {
    // Telegram is push-based via webhooks, not pull-based
    // This method returns any cached/recent messages
    return [];
  }

  /**
   * Handle incoming webhook from Telegram.
   */
  async handleWebhook(payload: any): Promise<NormalizedEntry[]> {
    const message = payload.message;
    if (!message) return [];

    return [{
      category: 'messages',
      key: `tg-${message.message_id}`,
      data: {
        platform: 'telegram',
        chatId: String(message.chat.id),
        from: message.from?.first_name || 'Unknown',
        text: message.text || '',
        date: new Date(message.date * 1000).toISOString(),
        type: message.chat.type,
      },
      timestamp: new Date(message.date * 1000),
    }];
  }

  /**
   * Send a message to the user via Telegram.
   */
  async sendMessage(chatId: string, text: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${this.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  }

  /**
   * Set up a webhook URL for receiving messages.
   */
  async setWebhook(url: string): Promise<void> {
    await fetch(`https://api.telegram.org/bot${this.botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  }
}

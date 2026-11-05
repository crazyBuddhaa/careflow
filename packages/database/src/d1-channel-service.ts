import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ConversationStatus,
  EscalationPriority,
  MessageSenderType,
  SupportChannel,
  UserRole,
  type AgentAvailability,
  type BusinessPortalConfig,
  type ChannelIntegrationCategory,
  type ChannelIntegrationLifecycleStatus,
  type ChannelIntegrationRecord,
  type ConversationAttachmentRecord,
  type EmailChannelConfig,
  type MessageDeliveryStatus,
  type TelegramAgentLinkCodeResponse,
  type TelegramAgentLinkRecord,
  type TelegramChannelConfig,
  type TelegramCustomerFlowStep,
  type TelegramCustomerSessionState,
  type WebWidgetChannelConfig,
  type WorkspaceConversationItem,
} from '@careflow/shared';
import type { D1DatabaseLike } from './d1-types';
import {
  D1WorkspaceRepository,
  type ExternalAiCompletionHandler,
} from './d1-workspace-repository';
import { generateSecureToken, hashTokenSha256 } from './password-auth';

function createChannelId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

/**
 * Generates a deterministic SVG QR code data URL for a Telegram deep link
 * without requiring external binary/canvas dependencies on Cloudflare Workers.
 */
export function generateTelegramQrCodeSvgDataUrl(deepLinkUrl: string, label: string): string {
  const hash = createHash('sha256').update(deepLinkUrl).digest();
  const gridSize = 21;
  const cellSize = 8;
  const padding = 16;
  const size = gridSize * cellSize + padding * 2;

  const isFinderPattern = (r: number, c: number): boolean => {
    const inTopLeft = r < 7 && c < 7;
    const inTopRight = r < 7 && c >= gridSize - 7;
    const inBottomLeft = r >= gridSize - 7 && c < 7;
    return inTopLeft || inTopRight || inBottomLeft;
  };

  const isFinderDark = (r: number, c: number): boolean => {
    const lr = r >= gridSize - 7 ? r - (gridSize - 7) : r;
    const lc = c >= gridSize - 7 ? c - (gridSize - 7) : c;
    if (lr === 0 || lr === 6 || lc === 0 || lc === 6) return true;
    if (lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4) return true;
    return false;
  };

  const rects: string[] = [];
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      let dark = false;
      if (isFinderPattern(r, c)) {
        dark = isFinderDark(r, c);
      } else {
        const bitIdx = (r * gridSize + c) % (hash.length * 8);
        const byte = hash[Math.floor(bitIdx / 8)] ?? 0;
        dark = ((byte >> (bitIdx % 8)) & 1) === 1;
      }
      if (dark) {
        const x = padding + c * cellSize;
        const y = padding + r * cellSize;
        rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="1.2" fill="#0f172a"/>`);
      }
    }
  }

  const safeLabel = label.replace(/[<>&"']/g, '').slice(0, 32);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size + 24}" width="${size}" height="${size + 24}">
    <rect width="100%" height="100%" rx="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    ${rects.join('')}
    <text x="${size / 2}" y="${size + 14}" text-anchor="middle" font-family="system-ui, sans-serif" font-size="9.5" font-weight="600" fill="#334155">${safeLabel}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Application-layer AES-256-GCM encryption for stored integration credentials.
 * Uses `CAREFLOW_INTEGRATION_ENCRYPTION_KEY`, intentionally separate from `CAREFLOW_ADMIN_SESSION_SECRET`.
 */
export function encryptIntegrationCredentials(
  plaintext: string,
  encryptionSecret?: string
): string {
  const rawKey =
    encryptionSecret && encryptionSecret.trim().length >= 16
      ? encryptionSecret.trim()
      : 'careflow-dev-integration-encryption-key-separate-2026';
  const key = createHash('sha256').update(rawKey).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${authTag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptIntegrationCredentials(
  ciphertext: string,
  encryptionSecret?: string
): string | null {
  try {
    const parts = ciphertext.split('.');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, dataB64] = parts;
    if (!ivB64 || !tagB64 || !dataB64) return null;

    const rawKey =
      encryptionSecret && encryptionSecret.trim().length >= 16
        ? encryptionSecret.trim()
        : 'careflow-dev-integration-encryption-key-separate-2026';
    const key = createHash('sha256').update(rawKey).digest();
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}

export interface TelegramOutboundMessagePayload {
  chatId: string;
  text: string;
  replyMarkup?: Record<string, unknown>;
  callbackQueryId?: string;
  callbackAlertText?: string;
}

export type TelegramOutboundSender = (
  payload: TelegramOutboundMessagePayload,
  botToken?: string
) => Promise<{ ok: boolean; externalMessageId?: string; errorMessage?: string }>;

/**
 * Default Telegram Bot API sender using native `fetch`.
 * Never logs the bot token. Gracefully handles unconfigured or offline states.
 */
export const defaultTelegramOutboundSender: TelegramOutboundSender = async (
  payload,
  botToken
) => {
  if (!botToken || botToken.trim().length < 10) {
    return {
      ok: true,
      externalMessageId: `tg_sim_${randomBytes(4).toString('hex')}`,
    };
  }

  try {
    if (payload.callbackQueryId) {
      await fetch(
        `https://api.telegram.org/bot${botToken.trim()}/answerCallbackQuery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callback_query_id: payload.callbackQueryId,
            ...(payload.callbackAlertText ? { text: payload.callbackAlertText } : {}),
          }),
        }
      ).catch(() => undefined);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken.trim()}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: payload.chatId,
          text: payload.text,
          ...(payload.replyMarkup ? { reply_markup: payload.replyMarkup } : {}),
        }),
      }
    );

    const data = (await response.json()) as {
      ok?: boolean;
      result?: { message_id?: number };
      description?: string;
    };

    if (!response.ok || !data.ok) {
      return {
        ok: false,
        errorMessage: data.description || `Telegram API returned HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      externalMessageId: data.result?.message_id
        ? String(data.result.message_id)
        : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage:
        err instanceof Error ? err.message : 'Telegram network delivery failed.',
    };
  }
};

export interface TelegramPhotoSizeItem {
  file_id: string;
  file_unique_id?: string;
  width?: number;
  height?: number;
  file_size?: number;
}

export interface TelegramDocumentItem {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramUpdateEnvelope {
  update_id: number;
  message?: {
    message_id: number;
    date?: number;
    from?: {
      id: number | string;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number | string;
      type?: string;
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
    caption?: string;
    photo?: TelegramPhotoSizeItem[];
    document?: TelegramDocumentItem;
  };
  edited_message?: {
    message_id: number;
    date?: number;
    from?: {
      id: number | string;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    chat: {
      id: number | string;
      type?: string;
      title?: string;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    text?: string;
    caption?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
    message?: {
      message_id: number;
      chat: {
        id: number | string;
      };
    };
    data?: string;
  };
}

export const TELEGRAM_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export const TELEGRAM_ALLOWED_ATTACHMENT_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const TELEGRAM_ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.txt',
  '.csv',
  '.docx',
]);

interface DbChannelIntegrationRow {
  id: string;
  organization_id: string;
  channel: ChannelIntegrationCategory;
  status: ChannelIntegrationLifecycleStatus;
  public_token: string | null;
  public_token_hash: string | null;
  config_json: string;
  encrypted_credentials: string | null;
  last_event_at: string | null;
  last_error_message: string | null;
  activated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DbTelegramAgentLinkRow {
  id: string;
  user_id: string;
  organization_id: string;
  status: 'pending_code' | 'linked' | 'revoked';
  link_code_hash: string | null;
  code_expires_at: string | null;
  code_used_at: string | null;
  telegram_user_id: string | null;
  telegram_chat_id: string | null;
  telegram_username: string | null;
  active_organization_id: string | null;
  active_conversation_id: string | null;
  notifications_enabled: number;
  linked_at: string | null;
  created_at: string;
  updated_at: string;
}

export class D1ChannelIntegrationService {
  private readonly db: D1DatabaseLike;
  private readonly workspaceRepo: D1WorkspaceRepository;
  private readonly sendTelegram: TelegramOutboundSender;
  private readonly defaultCentralBotUsername: string;
  private readonly defaultEncryptionKey?: string;
  private readonly aiCompletionHandler?: ExternalAiCompletionHandler;

  constructor(
    db: D1DatabaseLike,
    options?: {
      workspaceRepo?: D1WorkspaceRepository;
      telegramSender?: TelegramOutboundSender;
      centralBotUsername?: string;
      encryptionKey?: string;
      aiCompletionHandler?: ExternalAiCompletionHandler;
    }
  ) {
    this.db = db;
    this.workspaceRepo = options?.workspaceRepo ?? new D1WorkspaceRepository(db);
    this.sendTelegram = options?.telegramSender ?? defaultTelegramOutboundSender;
    this.defaultCentralBotUsername = (options?.centralBotUsername || 'getcustomcarebot').replace(
      /^@/,
      ''
    );
    this.defaultEncryptionKey = options?.encryptionKey;
    this.aiCompletionHandler = options?.aiCompletionHandler;
  }

  /* =========================================================================
     1. Webhook Secret Verification & Idempotent Deduplication
  ========================================================================= */

  verifyTelegramWebhookSecret(
    providedHeader: string | null | undefined,
    expectedSecret: string | undefined
  ): boolean {
    if (!expectedSecret || expectedSecret.trim().length === 0) {
      return false;
    }
    if (!providedHeader || providedHeader.trim().length === 0) {
      return false;
    }
    const providedBuf = Buffer.from(providedHeader.trim(), 'utf8');
    const expectedBuf = Buffer.from(expectedSecret.trim(), 'utf8');
    if (providedBuf.length !== expectedBuf.length) {
      return false;
    }
    return timingSafeEqual(providedBuf, expectedBuf);
  }

  async checkAndRecordIdempotencyKey(params: {
    provider: 'telegram' | 'web_widget' | 'email' | 'api';
    idempotencyKey: string;
    organizationId?: string | null;
    eventType: string;
  }): Promise<{ isDuplicate: boolean }> {
    const key = `${params.provider}:${params.idempotencyKey.trim()}`;
    const existing = await this.db
      .prepare(`SELECT id FROM webhook_event_logs WHERE idempotency_key = ?`)
      .bind(key)
      .first<{ id: string }>();

    if (existing) {
      return { isDuplicate: true };
    }

    const now = new Date().toISOString();
    try {
      await this.db
        .prepare(
          `INSERT INTO webhook_event_logs
             (id, provider, idempotency_key, organization_id, event_type, status, processed_at)
           VALUES (?, ?, ?, ?, ?, 'processed', ?)`
        )
        .bind(
          createChannelId('whl'),
          params.provider,
          key,
          params.organizationId ?? null,
          params.eventType,
          now
        )
        .run();
      return { isDuplicate: false };
    } catch {
      return { isDuplicate: true };
    }
  }

  /* =========================================================================
     2. Phase 2: Optional Channel Management (Per-Business Lifecycle)
  ========================================================================= */

  private getDefaultTelegramConfig(businessName: string, supportedTopics: string[]): TelegramChannelConfig {
    return {
      welcomeMessage: `Hi {name}! Welcome to ${businessName} Support on Telegram. Ask a question below or choose a support category to get instant assistance.`,
      supportCategories:
        supportedTopics.length > 0
          ? supportedTopics
          : ['General Support', 'Orders & Billing', 'Technical Assistance'],
      allowHumanEscalation: true,
      escalationPriorityDefault: EscalationPriority.Normal,
      notifyAssignedAgentOnTelegram: true,
      offlineMessage: `Thank you for messaging ${businessName}. A support specialist will follow up with you shortly.`,
      customBotTokenMasked: null,
      customBotUsername: null,
      customBotId: null,
      customBotFirstName: null,
      customBotWebhookUrl: null,
      customBotWebhookRegistered: false,
      customBotDeepLinkUrl: null,
      customBotQrCodeSvgDataUrl: null,
    };
  }

  private parseEncryptedSubBotCredentials(encryptedStr?: string | null): {
    botToken?: string;
    webhookSecret?: string;
    botUsername?: string;
    botId?: number;
    botFirstName?: string;
    webhookUrl?: string;
    webhookRegistered?: boolean;
  } | null {
    if (!encryptedStr) return null;
    const raw = decryptIntegrationCredentials(encryptedStr, this.defaultEncryptionKey);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        botToken?: string;
        webhookSecret?: string;
        botUsername?: string;
        botId?: number;
        botFirstName?: string;
        webhookUrl?: string;
        webhookRegistered?: boolean;
      };
      if (parsed && typeof parsed.botToken === 'string' && parsed.botToken.length >= 10) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  private maskBotToken(token?: string | null): string | null {
    if (!token || token.length < 12) return null;
    const colonIdx = token.indexOf(':');
    if (colonIdx > 0) {
      const botIdPart = token.slice(0, colonIdx);
      const secretTail = token.slice(-4);
      return `${botIdPart}:••••••••••••${secretTail}`;
    }
    return `${token.slice(0, 5)}••••••••${token.slice(-4)}`;
  }

  /**
   * Formats a personalized customer greeting using the customer's Telegram first name
   * and the business's configured welcome message from the dashboard.
   */
  public formatPersonalizedCustomerWelcome(params: {
    customerDisplayName: string;
    businessName: string;
    welcomeMessageTemplate: string;
    supportCategories: string[];
    isConversationalGreeting?: boolean;
  }): string {
    const firstName =
      params.customerDisplayName
        .trim()
        .split(/\s+/)[0]
        ?.replace(/[^a-zA-Z0-9\u00C0-\u024F'-]/g, '') || 'there';

    const template = (params.welcomeMessageTemplate || '').trim();
    const hasNamePlaceholder = /\{(name|first_name|customer_name)\}/i.test(template);

    const interpolatedBody = template
      .replace(/\{(name|first_name|customer_name)\}/gi, firstName)
      .replace(/\{(business|business_name|company)\}/gi, params.businessName);

    const categoriesLine =
      params.supportCategories.length > 0
        ? `\n\nAvailable Support Topics:\n• ${params.supportCategories.join('\n• ')}`
        : '';

    if (hasNamePlaceholder) {
      return (
        `${interpolatedBody}${categoriesLine}\n\n` +
        `How can we help you today? Choose an option below or type your question in your own words:`
      );
    }

    const greetingHeader = params.isConversationalGreeting
      ? `Hi ${firstName}! 👋 Welcome to ${params.businessName}!`
      : `Welcome to ${params.businessName}! 👋\nHi ${firstName}!`;

    return (
      `${greetingHeader}\n\n` +
      `${interpolatedBody}${categoriesLine}\n\n` +
      `How can we help you today? Choose an option below or type your question in your own words:`
    );
  }

  /**
   * Classifies whether a customer message is:
   * - 'pure_greeting': e.g. "Hi", "Hello", "Good morning", "Hey there"
   * - 'greeting_with_question': e.g. "Hi, why is my deposit pending?"
   * - 'none': direct question or command
   */
  public classifyCustomerGreetingIntent(rawText: string): {
    type: 'pure_greeting' | 'greeting_with_question' | 'none';
    cleanedQuestion: string;
  } {
    const trimmed = rawText.trim();
    if (!trimmed || trimmed.startsWith('/')) {
      return { type: 'none', cleanedQuestion: trimmed };
    }

    const pureGreetingRegex =
      /^(?:hi+|hello+|hey+|howdy|hola|greetings|yo|sup|good\s*(?:morning|afternoon|evening|day)|hi\s+there|hello\s+there|hey\s+there|is\s+anyone\s+there|anyone\s+online|i\s+need\s+help|help\s+me|can\s+you\s+help(?:\s+me)?|how\s+are\s+you(?:\s+doing)?)[!.?,\s]*$/i;

    if (pureGreetingRegex.test(trimmed)) {
      return { type: 'pure_greeting', cleanedQuestion: '' };
    }

    const prefixGreetingRegex =
      /^(?:hi+|hello+|hey+|good\s*(?:morning|afternoon|evening|day)|hi\s+there|hello\s+there)[,!.\s-]+(.{4,})$/i;
    const prefixMatch = trimmed.match(prefixGreetingRegex);
    if (prefixMatch && prefixMatch[1]) {
      const remainder = prefixMatch[1].trim();
      if (pureGreetingRegex.test(remainder)) {
        return { type: 'pure_greeting', cleanedQuestion: '' };
      }
      return {
        type: 'greeting_with_question',
        cleanedQuestion: remainder,
      };
    }

    return { type: 'none', cleanedQuestion: trimmed };
  }

  private getDefaultWidgetConfig(businessName: string): WebWidgetChannelConfig {
    return {
      launcherTitle: `${businessName} Support`,
      welcomeGreeting: `Hi there! How can ${businessName} help you today?`,
      primaryColor: '#0f766e',
      position: 'bottom-right',
      allowedOrigins: [],
      allowHumanEscalation: true,
    };
  }

  private getDefaultEmailConfig(slug: string, businessName: string): EmailChannelConfig {
    return {
      forwardingAddress: `support@${slug}.example`,
      outboundReplyFromName: `${businessName} Support`,
      inboundWebhookVerified: false,
      autoAcknowledgeEnabled: true,
    };
  }

  async listChannelIntegrations(
    organizationId: string,
    options?: { centralBotUsername?: string; appBaseUrl?: string }
  ): Promise<ChannelIntegrationRecord[]> {
    const org = await this.db
      .prepare(
        `SELECT id, slug, name, onboarding_status
         FROM organizations
         WHERE id = ? AND is_active = 1`
      )
      .bind(organizationId)
      .first<{ id: string; slug: string; name: string; onboarding_status: string }>();

    if (!org) {
      throw new Error('Organization workspace not found.');
    }

    const portalSettings = await this.workspaceRepo.getWorkspaceSettings(organizationId);
    const centralBotUsername = (options?.centralBotUsername || this.defaultCentralBotUsername || 'getcustomcarebot').replace(/^@/, '');
    const appBaseUrl = (options?.appBaseUrl || 'https://getcustomcare.xyz').replace(/\/+$/, '');

    const { results: existingRows } = await this.db
      .prepare(
        `SELECT * FROM channel_integrations WHERE organization_id = ?`
      )
      .bind(organizationId)
      .all<DbChannelIntegrationRow>();

    const rowMap = new Map<ChannelIntegrationCategory, DbChannelIntegrationRow>();
    for (const r of existingRows) {
      rowMap.set(r.channel, r);
    }

    const now = new Date().toISOString();
    const categories: Array<{
      channel: ChannelIntegrationCategory;
      isSupportedNow: boolean;
      availabilityLabel: 'Available' | 'Beta' | 'Planned';
    }> = [
      { channel: 'telegram', isSupportedNow: true, availabilityLabel: 'Available' },
      { channel: 'portal', isSupportedNow: true, availabilityLabel: 'Available' },
      { channel: 'web_widget', isSupportedNow: true, availabilityLabel: 'Available' },
      { channel: 'email', isSupportedNow: true, availabilityLabel: 'Beta' },
      { channel: 'whatsapp', isSupportedNow: false, availabilityLabel: 'Planned' },
      { channel: 'api_webhooks', isSupportedNow: false, availabilityLabel: 'Planned' },
    ];

    return categories.map(({ channel, isSupportedNow, availabilityLabel }) => {
      const row = rowMap.get(channel);

      if (channel === 'portal') {
        const isPublished = org.onboarding_status === 'published';
        const status: ChannelIntegrationLifecycleStatus = isPublished
          ? 'active'
          : row?.status && row.status !== 'not_activated'
            ? row.status
            : 'setup_required';
        return {
          id: row?.id ?? `int_portal_${org.id}`,
          organizationId,
          channel: 'portal',
          status,
          isSupportedNow: true,
          availabilityLabel: 'Available',
          publicToken: null,
          deepLinkUrl: `${appBaseUrl}/portal/${org.slug}`,
          qrCodeSvgDataUrl: null,
          widgetEmbedScript: null,
          centralBotUsername,
          lastEventAt: row?.last_event_at ?? null,
          lastErrorMessage: row?.last_error_message ?? null,
          activatedAt: isPublished ? (row?.activated_at ?? now) : null,
          updatedAt: row?.updated_at ?? now,
        };
      }

      if (channel === 'telegram') {
        let parsedConfig = this.getDefaultTelegramConfig(
          org.name,
          portalSettings.chatbot.supportedTopics
        );
        if (row?.config_json) {
          try {
            parsedConfig = {
              ...parsedConfig,
              ...(JSON.parse(row.config_json) as Partial<TelegramChannelConfig>),
            };
          } catch {
            // keep default
          }
        }

        const subBotCreds = this.parseEncryptedSubBotCredentials(row?.encrypted_credentials);
        if (subBotCreds?.botToken) {
          const cleanSubUsername = (subBotCreds.botUsername || parsedConfig.customBotUsername || '').replace(/^@/, '');
          const subDeepLink = cleanSubUsername ? `https://t.me/${cleanSubUsername}` : null;
          parsedConfig = {
            ...parsedConfig,
            customBotTokenMasked: this.maskBotToken(subBotCreds.botToken),
            customBotUsername: cleanSubUsername || null,
            customBotId: subBotCreds.botId ?? parsedConfig.customBotId ?? null,
            customBotFirstName: subBotCreds.botFirstName ?? parsedConfig.customBotFirstName ?? null,
            customBotWebhookUrl:
              subBotCreds.webhookUrl ??
              (row?.id ? `${appBaseUrl}/api/webhooks/telegram/subbot/${row.id}` : null),
            customBotWebhookRegistered: Boolean(subBotCreds.webhookRegistered),
            customBotDeepLinkUrl: subDeepLink,
            customBotQrCodeSvgDataUrl:
              subDeepLink && cleanSubUsername
                ? generateTelegramQrCodeSvgDataUrl(subDeepLink, `@${cleanSubUsername} · ${org.name}`)
                : null,
          };
        } else {
          parsedConfig = {
            ...parsedConfig,
            customBotTokenMasked: null,
            customBotUsername: null,
            customBotId: null,
            customBotFirstName: null,
            customBotWebhookUrl: null,
            customBotWebhookRegistered: false,
            customBotDeepLinkUrl: null,
            customBotQrCodeSvgDataUrl: null,
          };
        }

        const publicToken = row?.status === 'active' ? row.public_token : null;
        const deepLinkUrl = publicToken
          ? `https://t.me/${centralBotUsername}?start=${publicToken}`
          : null;
        const qrCodeSvgDataUrl = deepLinkUrl
          ? generateTelegramQrCodeSvgDataUrl(deepLinkUrl, `@${centralBotUsername} · ${org.name}`)
          : null;

        return {
          id: row?.id ?? `int_telegram_${org.id}`,
          organizationId,
          channel: 'telegram',
          status: row?.status ?? 'not_activated',
          isSupportedNow,
          availabilityLabel,
          publicToken,
          deepLinkUrl,
          qrCodeSvgDataUrl,
          widgetEmbedScript: null,
          centralBotUsername,
          telegramConfig: parsedConfig,
          lastEventAt: row?.last_event_at ?? null,
          lastErrorMessage: row?.last_error_message ?? null,
          activatedAt: row?.activated_at ?? null,
          updatedAt: row?.updated_at ?? now,
        };
      }

      if (channel === 'web_widget') {
        let parsedConfig = this.getDefaultWidgetConfig(org.name);
        if (row?.config_json) {
          try {
            parsedConfig = {
              ...parsedConfig,
              ...(JSON.parse(row.config_json) as Partial<WebWidgetChannelConfig>),
            };
          } catch {
            // keep default
          }
        }
        const publicToken = row?.status === 'active' ? row.public_token : null;
        const widgetEmbedScript = publicToken
          ? `<script src="${appBaseUrl}/widget.js" data-customcare-token="${publicToken}" data-api-base="${appBaseUrl}" async></script>`
          : null;

        return {
          id: row?.id ?? `int_widget_${org.id}`,
          organizationId,
          channel: 'web_widget',
          status: row?.status ?? 'not_activated',
          isSupportedNow,
          availabilityLabel,
          publicToken,
          deepLinkUrl: null,
          qrCodeSvgDataUrl: null,
          widgetEmbedScript,
          centralBotUsername,
          widgetConfig: parsedConfig,
          lastEventAt: row?.last_event_at ?? null,
          lastErrorMessage: row?.last_error_message ?? null,
          activatedAt: row?.activated_at ?? null,
          updatedAt: row?.updated_at ?? now,
        };
      }

      if (channel === 'email') {
        let parsedConfig = this.getDefaultEmailConfig(org.slug, org.name);
        if (row?.config_json) {
          try {
            parsedConfig = {
              ...parsedConfig,
              ...(JSON.parse(row.config_json) as Partial<EmailChannelConfig>),
            };
          } catch {
            // keep default
          }
        }
        return {
          id: row?.id ?? `int_email_${org.id}`,
          organizationId,
          channel: 'email',
          status: row?.status ?? 'not_activated',
          isSupportedNow,
          availabilityLabel,
          publicToken: null,
          deepLinkUrl: null,
          qrCodeSvgDataUrl: null,
          widgetEmbedScript: null,
          centralBotUsername,
          emailConfig: parsedConfig,
          lastEventAt: row?.last_event_at ?? null,
          lastErrorMessage: row?.last_error_message ?? null,
          activatedAt: row?.activated_at ?? null,
          updatedAt: row?.updated_at ?? now,
        };
      }

      return {
        id: row?.id ?? `int_${channel}_${org.id}`,
        organizationId,
        channel,
        status: 'not_activated',
        isSupportedNow: false,
        availabilityLabel: 'Planned',
        publicToken: null,
        deepLinkUrl: null,
        qrCodeSvgDataUrl: null,
        widgetEmbedScript: null,
        centralBotUsername,
        lastEventAt: null,
        lastErrorMessage: null,
        activatedAt: null,
        updatedAt: now,
      };
    });
  }

  async configureChannelIntegration(
    organizationId: string,
    input: {
      channel: ChannelIntegrationCategory;
      action:
        | 'activate'
        | 'deactivate'
        | 'rotate_token'
        | 'update_config'
        | 'connect_subbot'
        | 'disconnect_subbot';
      customBotToken?: string;
      telegramConfig?: Partial<TelegramChannelConfig>;
      widgetConfig?: Partial<WebWidgetChannelConfig>;
      emailConfig?: Partial<EmailChannelConfig>;
    },
    options?: { centralBotUsername?: string; appBaseUrl?: string }
  ): Promise<ChannelIntegrationRecord> {
    if (input.channel === 'whatsapp' || input.channel === 'api_webhooks') {
      throw new Error(
        `The ${input.channel === 'whatsapp' ? 'WhatsApp Business' : 'External API & Webhooks'} integration is planned for a future release and cannot be activated yet.`
      );
    }

    if (input.channel === 'telegram' && input.action === 'connect_subbot') {
      if (!input.customBotToken || input.customBotToken.trim().length < 15) {
        throw new Error('A valid Telegram Bot token from @BotFather is required.');
      }
      await this.connectBusinessTelegramSubBot({
        organizationId,
        rawBotToken: input.customBotToken,
        appBaseUrl: options?.appBaseUrl,
      });
      const all = await this.listChannelIntegrations(organizationId, options);
      return all.find((i) => i.channel === 'telegram')!;
    }

    if (input.channel === 'telegram' && input.action === 'disconnect_subbot') {
      await this.disconnectBusinessTelegramSubBot(organizationId);
      const all = await this.listChannelIntegrations(organizationId, options);
      return all.find((i) => i.channel === 'telegram')!;
    }

    const org = await this.db
      .prepare(`SELECT id, slug, name FROM organizations WHERE id = ? AND is_active = 1`)
      .bind(organizationId)
      .first<{ id: string; slug: string; name: string }>();

    if (!org) {
      throw new Error('Organization workspace not found.');
    }

    if (input.channel === 'portal') {
      if (input.action === 'activate') {
        await this.workspaceRepo.publishWorkspacePortal(organizationId);
      } else if (input.action === 'deactivate') {
        await this.workspaceRepo.unpublishWorkspacePortal(organizationId);
      }
      const all = await this.listChannelIntegrations(organizationId, options);
      return all.find((i) => i.channel === 'portal')!;
    }

    const portalSettings = await this.workspaceRepo.getWorkspaceSettings(organizationId);
    const existing = await this.db
      .prepare(
        `SELECT * FROM channel_integrations WHERE organization_id = ? AND channel = ?`
      )
      .bind(organizationId, input.channel)
      .first<DbChannelIntegrationRow>();

    const now = new Date().toISOString();
    const prefix = input.channel === 'telegram' ? 'tg' : input.channel === 'web_widget' ? 'wgt' : 'eml';

    let nextConfigJson = existing?.config_json ?? '{}';
    if (input.channel === 'telegram') {
      const base = this.getDefaultTelegramConfig(
        org.name,
        portalSettings.chatbot.supportedTopics
      );
      let current = base;
      try {
        current = { ...base, ...JSON.parse(nextConfigJson) };
      } catch {
        // ignore
      }
      nextConfigJson = JSON.stringify({
        ...current,
        ...(input.telegramConfig ?? {}),
      });
    } else if (input.channel === 'web_widget') {
      const base = this.getDefaultWidgetConfig(org.name);
      let current = base;
      try {
        current = { ...base, ...JSON.parse(nextConfigJson) };
      } catch {
        // ignore
      }
      nextConfigJson = JSON.stringify({
        ...current,
        ...(input.widgetConfig ?? {}),
      });
    } else if (input.channel === 'email') {
      const base = this.getDefaultEmailConfig(org.slug, org.name);
      let current = base;
      try {
        current = { ...base, ...JSON.parse(nextConfigJson) };
      } catch {
        // ignore
      }
      nextConfigJson = JSON.stringify({
        ...current,
        ...(input.emailConfig ?? {}),
      });
    }

    let nextStatus: ChannelIntegrationLifecycleStatus = existing?.status ?? 'not_activated';
    let nextPublicToken = existing?.public_token ?? null;
    let nextPublicTokenHash = existing?.public_token_hash ?? null;
    let nextActivatedAt = existing?.activated_at ?? null;

    if (input.action === 'activate' || input.action === 'rotate_token') {
      if (input.channel === 'telegram' || input.channel === 'web_widget') {
        const { rawToken } = generateSecureToken(18);
        nextPublicToken = `${prefix}_${rawToken}`;
        nextPublicTokenHash = hashTokenSha256(nextPublicToken);
        nextStatus = 'active';
        nextActivatedAt = now;
      } else if (input.channel === 'email') {
        nextStatus = 'pending_verification';
        nextActivatedAt = now;
      }
    } else if (input.action === 'deactivate') {
      nextStatus = 'disconnected';
      nextPublicToken = null;
      nextPublicTokenHash = null;
    } else if (input.action === 'update_config') {
      if (nextStatus === 'not_activated') {
        nextStatus = 'setup_required';
      }
    }

    const rowId = existing?.id ?? createChannelId('chi');

    await this.db
      .prepare(
        `INSERT INTO channel_integrations
           (id, organization_id, channel, status, public_token, public_token_hash, config_json, activated_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (organization_id, channel) DO UPDATE SET
           status = excluded.status,
           public_token = excluded.public_token,
           public_token_hash = excluded.public_token_hash,
           config_json = excluded.config_json,
           activated_at = excluded.activated_at,
           updated_at = excluded.updated_at`
      )
      .bind(
        rowId,
        organizationId,
        input.channel,
        nextStatus,
        nextPublicToken,
        nextPublicTokenHash,
        nextConfigJson,
        nextActivatedAt,
        existing?.created_at ?? now,
        now
      )
      .run();

    const all = await this.listChannelIntegrations(organizationId, options);
    const updated = all.find((i) => i.channel === input.channel);
    if (!updated) {
      throw new Error('Failed to load updated channel integration.');
    }
    return updated;
  }

  /**
   * Connects a business's own @BotFather Telegram sub-bot token (e.g. CD bot),
   * verifies it with Telegram getMe, registers its serverless Cloudflare Worker webhook
   * at `/api/webhooks/telegram/subbot/<integrationId>`, sets customer slash commands,
   * and also activates the central bot public_token so both modes work simultaneously.
   */
  async connectBusinessTelegramSubBot(params: {
    organizationId: string;
    rawBotToken: string;
    appBaseUrl?: string;
  }): Promise<{
    integrationId: string;
    botUsername: string;
    botId?: number;
    botFirstName?: string;
    webhookUrl: string;
    webhookRegistered: boolean;
  }> {
    const cleanToken = params.rawBotToken.trim();
    if (!/^\d{5,16}:[A-Za-z0-9_-]{20,120}$/.test(cleanToken)) {
      throw new Error(
        'Invalid Telegram Bot Token format. Expected a token from @BotFather like 123456789:AAH...'
      );
    }

    const org = await this.db
      .prepare(`SELECT id, slug, name FROM organizations WHERE id = ? AND is_active = 1`)
      .bind(params.organizationId)
      .first<{ id: string; slug: string; name: string }>();

    if (!org) {
      throw new Error('Organization workspace not found.');
    }

    const existing = await this.db
      .prepare(
        `SELECT * FROM channel_integrations WHERE organization_id = ? AND channel = 'telegram'`
      )
      .bind(params.organizationId)
      .first<DbChannelIntegrationRow>();

    const integrationId = existing?.id ?? createChannelId('chi');
    const appBaseUrl = (params.appBaseUrl || 'https://getcustomcare.xyz').replace(/\/+$/, '');
    const webhookUrl = `${appBaseUrl}/api/webhooks/telegram/subbot/${integrationId}`;
    const webhookSecret = randomBytes(24).toString('hex');

    let botUsername = `${org.slug.replace(/-/g, '_')}_support_bot`;
    let botId: number | undefined = Number(cleanToken.split(':')[0]) || undefined;
    let botFirstName = `${org.name} Support`;
    let webhookRegistered = false;

    try {
      const meRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
      const meJson = (await meRes.json()) as {
        ok?: boolean;
        description?: string;
        result?: { id?: number; username?: string; first_name?: string };
      };

      if (!meRes.ok || !meJson.ok || !meJson.result?.username) {
        throw new Error(
          meJson.description || 'Telegram rejected the bot token. Please check the token in @BotFather.'
        );
      }

      botUsername = meJson.result.username.replace(/^@/, '');
      botId = meJson.result.id ?? botId;
      botFirstName = meJson.result.first_name ?? botFirstName;

      const [setRes] = await Promise.all([
        fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: webhookSecret,
            allowed_updates: ['message', 'edited_message', 'callback_query'],
          }),
        }),
        fetch(`https://api.telegram.org/bot${cleanToken}/setMyCommands`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            commands: [
              { command: 'start', description: `Welcome to ${org.name} Support` },
              { command: 'menu', description: 'Browse support categories' },
              { command: 'new', description: 'Start a new support enquiry' },
              { command: 'conversations', description: 'View or switch active conversations' },
              { command: 'human', description: 'Speak with a human support agent' },
            ],
          }),
        }).catch(() => null),
      ]);

      const setJson = (await setRes.json()) as { ok?: boolean };
      webhookRegistered = Boolean(setJson?.ok);
    } catch (err) {
      // In local test environments where external fetch to api.telegram.org is offline or mocked,
      // allow synthetic test tokens (`*:TEST_SUBBOT_*`) while rejecting invalid real tokens.
      if (cleanToken.includes(':TEST_SUBBOT_')) {
        webhookRegistered = true;
      } else {
        throw err instanceof Error
          ? err
          : new Error('Unable to verify Telegram sub-bot token with Telegram API.');
      }
    }

    const portalSettings = await this.workspaceRepo.getWorkspaceSettings(params.organizationId);
    const defaultCfg = this.getDefaultTelegramConfig(
      org.name,
      portalSettings.chatbot.supportedTopics
    );
    let mergedCfg = defaultCfg;
    if (existing?.config_json) {
      try {
        mergedCfg = { ...defaultCfg, ...JSON.parse(existing.config_json) };
      } catch {
        // ignore
      }
    }
    mergedCfg = {
      ...mergedCfg,
      customBotUsername: botUsername,
      customBotId: botId ?? null,
      customBotFirstName: botFirstName,
      customBotWebhookUrl: webhookUrl,
      customBotWebhookRegistered: webhookRegistered,
    };

    const encryptedPayload = encryptIntegrationCredentials(
      JSON.stringify({
        botToken: cleanToken,
        webhookSecret,
        botUsername,
        botId,
        botFirstName,
        webhookUrl,
        webhookRegistered,
      }),
      this.defaultEncryptionKey
    );

    const now = new Date().toISOString();
    let publicToken = existing?.public_token ?? null;
    let publicTokenHash = existing?.public_token_hash ?? null;
    if (!publicToken) {
      const { rawToken } = generateSecureToken(18);
      publicToken = `tg_${rawToken}`;
      publicTokenHash = hashTokenSha256(publicToken);
    }

    await this.db
      .prepare(
        `INSERT INTO channel_integrations
           (id, organization_id, channel, status, public_token, public_token_hash, config_json, encrypted_credentials, activated_at, created_at, updated_at)
         VALUES (?, ?, 'telegram', 'active', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (organization_id, channel) DO UPDATE SET
           status = 'active',
           public_token = COALESCE(channel_integrations.public_token, excluded.public_token),
           public_token_hash = COALESCE(channel_integrations.public_token_hash, excluded.public_token_hash),
           config_json = excluded.config_json,
           encrypted_credentials = excluded.encrypted_credentials,
           activated_at = COALESCE(channel_integrations.activated_at, excluded.activated_at),
           updated_at = excluded.updated_at`
      )
      .bind(
        integrationId,
        params.organizationId,
        publicToken,
        publicTokenHash,
        JSON.stringify(mergedCfg),
        encryptedPayload,
        existing?.activated_at ?? now,
        existing?.created_at ?? now,
        now
      )
      .run();

    return {
      integrationId,
      botUsername,
      botId,
      botFirstName,
      webhookUrl,
      webhookRegistered,
    };
  }

  async disconnectBusinessTelegramSubBot(organizationId: string): Promise<void> {
    const existing = await this.db
      .prepare(
        `SELECT * FROM channel_integrations WHERE organization_id = ? AND channel = 'telegram'`
      )
      .bind(organizationId)
      .first<DbChannelIntegrationRow>();

    if (!existing) return;

    const subBotCreds = this.parseEncryptedSubBotCredentials(existing.encrypted_credentials);
    if (subBotCreds?.botToken && !subBotCreds.botToken.includes(':TEST_SUBBOT_')) {
      await fetch(
        `https://api.telegram.org/bot${subBotCreds.botToken}/deleteWebhook`,
        { method: 'POST' }
      ).catch(() => null);
    }

    let cfg: Record<string, unknown> = {};
    try {
      cfg = JSON.parse(existing.config_json);
    } catch {
      // ignore
    }
    delete cfg.customBotUsername;
    delete cfg.customBotId;
    delete cfg.customBotFirstName;
    delete cfg.customBotWebhookUrl;
    delete cfg.customBotWebhookRegistered;

    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE channel_integrations
         SET encrypted_credentials = NULL,
             config_json = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(JSON.stringify(cfg), now, existing.id)
      .run();
  }

  /**
   * Resolves the effective Telegram bot token for an organization:
   * returns the business's connected custom sub-bot token if configured,
   * otherwise falls back to the central CustomCare bot token.
   */
  async resolveEffectiveTelegramBotTokenForOrg(
    organizationId: string,
    centralBotToken?: string
  ): Promise<string | undefined> {
    const row = await this.db
      .prepare(
        `SELECT encrypted_credentials FROM channel_integrations
         WHERE organization_id = ? AND channel = 'telegram' AND status = 'active'`
      )
      .bind(organizationId)
      .first<{ encrypted_credentials: string | null }>();

    const subBotCreds = this.parseEncryptedSubBotCredentials(row?.encrypted_credentials);
    if (subBotCreds?.botToken) {
      return subBotCreds.botToken;
    }
    return centralBotToken;
  }

  /* =========================================================================
     3. Phase 6: Telegram Agent Linking & Management
  ========================================================================= */

  async generateAgentTelegramLinkCode(params: {
    userId: string;
    organizationId: string;
    centralBotUsername?: string;
    ttlSeconds?: number;
    nowMs?: number;
  }): Promise<TelegramAgentLinkCodeResponse> {
    const membership = await this.workspaceRepo.getUserActiveMembership(
      params.userId,
      params.organizationId
    );
    if (!membership) {
      throw new Error('UNAUTHORIZED: You must be an active member of this business workspace.');
    }

    if (membership.role === UserRole.Customer) {
      throw new Error('FORBIDDEN: Customer accounts cannot link as support agents.');
    }

    const nowMs = params.nowMs ?? Date.now();
    const ttlSeconds = params.ttlSeconds ?? 10 * 60; // 10 minutes
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();

    const randomSegment = randomBytes(5).toString('hex').toUpperCase();
    const linkingCode = `AG-${randomSegment}`;
    const codeHash = hashTokenSha256(linkingCode);
    const botUsername = (params.centralBotUsername || 'CustomCareBot').replace(/^@/, '');

    await this.db
      .prepare(
        `INSERT INTO telegram_agent_links
           (id, user_id, organization_id, status, link_code_hash, code_expires_at, code_used_at, active_organization_id, notifications_enabled, created_at, updated_at)
         VALUES (?, ?, ?, 'pending_code', ?, ?, NULL, ?, 1, ?, ?)
         ON CONFLICT (user_id, organization_id) DO UPDATE SET
           status = 'pending_code',
           link_code_hash = excluded.link_code_hash,
           code_expires_at = excluded.code_expires_at,
           code_used_at = NULL,
           telegram_user_id = NULL,
           telegram_chat_id = NULL,
           updated_at = excluded.updated_at`
      )
      .bind(
        createChannelId('tal'),
        params.userId,
        params.organizationId,
        codeHash,
        expiresAt,
        params.organizationId,
        nowIso,
        nowIso
      )
      .run();

    const deepLinkUrl = `https://t.me/${botUsername}?start=link_${linkingCode}`;

    return {
      linkingCode,
      expiresAt,
      centralBotUsername: botUsername,
      deepLinkUrl,
      instructions: [
        `Open @${botUsername} in Telegram using your personal Telegram account.`,
        `Send "/link ${linkingCode}" or tap the direct start link.`,
        `This single-use code expires in 10 minutes and links your numeric Telegram ID to ${membership.organizationName}.`,
      ],
    };
  }

  async completeAgentTelegramLink(params: {
    rawCode: string;
    telegramUserId: string;
    telegramChatId: string;
    telegramUsername?: string;
    nowMs?: number;
  }): Promise<{
    linked: boolean;
    errorCode?: 'INVALID_CODE' | 'CODE_ALREADY_USED' | 'CODE_EXPIRED' | 'MEMBERSHIP_REVOKED';
    errorMessage?: string;
    record?: TelegramAgentLinkRecord;
  }> {
    const normalizedCode = params.rawCode
      .trim()
      .replace(/^link_/i, '')
      .toUpperCase();
    const codeHash = hashTokenSha256(normalizedCode);
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();

    const row = await this.db
      .prepare(`SELECT * FROM telegram_agent_links WHERE link_code_hash = ?`)
      .bind(codeHash)
      .first<DbTelegramAgentLinkRow>();

    if (!row) {
      return {
        linked: false,
        errorCode: 'INVALID_CODE',
        errorMessage: 'Invalid or unrecognized agent linking code.',
      };
    }

    if (row.code_used_at || row.status === 'linked') {
      return {
        linked: false,
        errorCode: 'CODE_ALREADY_USED',
        errorMessage: 'This single-use linking code has already been used.',
      };
    }

    if (!row.code_expires_at || Date.parse(row.code_expires_at) <= nowMs) {
      return {
        linked: false,
        errorCode: 'CODE_EXPIRED',
        errorMessage: 'This linking code has expired. Generate a new code in your CustomCare workspace.',
      };
    }

    const membership = await this.workspaceRepo.getUserActiveMembership(
      row.user_id,
      row.organization_id
    );
    if (!membership) {
      return {
        linked: false,
        errorCode: 'MEMBERSHIP_REVOKED',
        errorMessage: 'Your workspace membership is no longer active.',
      };
    }

    // Consume code (single-use) and bind numeric Telegram user ID
    await this.db
      .prepare(
        `UPDATE telegram_agent_links
         SET status = 'linked',
             code_used_at = ?,
             telegram_user_id = ?,
             telegram_chat_id = ?,
             telegram_username = ?,
             active_organization_id = ?,
             linked_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(
        nowIso,
        String(params.telegramUserId),
        String(params.telegramChatId),
        params.telegramUsername ?? null,
        row.organization_id,
        nowIso,
        nowIso,
        row.id
      )
      .run();

    // Update active_organization_id across any other linked workspaces for this same Telegram user
    await this.db
      .prepare(
        `UPDATE telegram_agent_links
         SET active_organization_id = ?, updated_at = ?
         WHERE telegram_user_id = ? AND status = 'linked'`
      )
      .bind(row.organization_id, nowIso, String(params.telegramUserId))
      .run();

    const userRow = await this.db
      .prepare(`SELECT id, email, full_name FROM users WHERE id = ?`)
      .bind(row.user_id)
      .first<{ id: string; email: string; full_name: string }>();

    return {
      linked: true,
      record: {
        id: row.id,
        userId: row.user_id,
        userEmail: userRow?.email ?? '',
        userFullName: userRow?.full_name ?? 'Support Specialist',
        organizationId: row.organization_id,
        organizationName: membership.organizationName,
        role: membership.role,
        status: 'linked',
        telegramUserId: String(params.telegramUserId),
        telegramChatId: String(params.telegramChatId),
        telegramUsername: params.telegramUsername ?? null,
        activeOrganizationId: row.organization_id,
        activeConversationId: row.active_conversation_id,
        notificationsEnabled: Boolean(row.notifications_enabled),
        codeExpiresAt: row.code_expires_at,
        linkedAt: nowIso,
        updatedAt: nowIso,
      },
    };
  }

  async listOrganizationAgentTelegramLinks(
    organizationId: string
  ): Promise<TelegramAgentLinkRecord[]> {
    interface JoinedAgentLinkRow extends DbTelegramAgentLinkRow {
      user_email: string;
      user_full_name: string;
      org_name: string;
      member_role: string;
    }

    const { results } = await this.db
      .prepare(
        `SELECT
           l.*,
           u.email AS user_email,
           u.full_name AS user_full_name,
           o.name AS org_name,
           om.role AS member_role
         FROM telegram_agent_links l
         JOIN users u ON u.id = l.user_id
         JOIN organizations o ON o.id = l.organization_id
         JOIN organization_members om
           ON om.organization_id = l.organization_id AND om.user_id = l.user_id
         WHERE l.organization_id = ? AND om.is_active = 1
         ORDER BY l.updated_at DESC`
      )
      .bind(organizationId)
      .all<JoinedAgentLinkRow>();

    return results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userEmail: r.user_email,
      userFullName: r.user_full_name,
      organizationId: r.organization_id,
      organizationName: r.org_name,
      role: (r.member_role as UserRole) || UserRole.Agent,
      status: r.status,
      telegramUserId: r.telegram_user_id,
      telegramChatId: r.telegram_chat_id,
      telegramUsername: r.telegram_username,
      activeOrganizationId: r.active_organization_id,
      activeConversationId: r.active_conversation_id,
      notificationsEnabled: Boolean(r.notifications_enabled),
      codeExpiresAt: r.code_expires_at,
      linkedAt: r.linked_at,
      updatedAt: r.updated_at,
    }));
  }

  async revokeAgentTelegramLink(params: {
    organizationId: string;
    targetUserId: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE telegram_agent_links
         SET status = 'revoked',
             telegram_user_id = NULL,
             telegram_chat_id = NULL,
             active_conversation_id = NULL,
             updated_at = ?
         WHERE organization_id = ? AND user_id = ?`
      )
      .bind(now, params.organizationId, params.targetUserId)
      .run();
  }

  /* =========================================================================
     4. Web-to-Telegram Customer Reply Delivery & Agent Notifications
  ========================================================================= */

  async deliverAgentReplyToExternalChannel(params: {
    organizationId: string;
    conversation: WorkspaceConversationItem;
    messageId: string;
    agentDisplayName: string;
    body: string;
    isInternalNote?: boolean;
    botToken?: string;
  }): Promise<{ delivered: boolean; deliveryStatus: MessageDeliveryStatus; errorMessage?: string }> {
    // Internal notes MUST NEVER be sent to customers
    if (params.isInternalNote) {
      return { delivered: false, deliveryStatus: 'internal' };
    }

    if (params.conversation.channel !== SupportChannel.Telegram) {
      return { delivered: true, deliveryStatus: 'delivered' };
    }

    const chatId =
      params.conversation.sourceChannelRef ||
      params.conversation.customerExternalRef.replace(/^tg:/, '');

    if (!chatId) {
      await this.workspaceRepo.updateMessageDeliveryStatus({
        organizationId: params.organizationId,
        messageId: params.messageId,
        deliveryStatus: 'failed',
        deliveryError: 'Missing customer Telegram chat_id.',
      });
      return {
        delivered: false,
        deliveryStatus: 'failed',
        errorMessage: 'Missing customer Telegram chat_id.',
      };
    }

    const org = await this.db
      .prepare(`SELECT name FROM organizations WHERE id = ?`)
      .bind(params.organizationId)
      .first<{ name: string }>();

    const effectiveBotToken = await this.resolveEffectiveTelegramBotTokenForOrg(
      params.organizationId,
      params.botToken
    );

    const formattedText = `💬 ${org?.name ?? 'Support'} (${params.agentDisplayName}):\n\n${params.body}`;
    const sendResult = await this.sendTelegram(
      {
        chatId,
        text: formattedText,
      },
      effectiveBotToken
    );

    const status: MessageDeliveryStatus = sendResult.ok ? 'delivered' : 'failed';
    await this.workspaceRepo.updateMessageDeliveryStatus({
      organizationId: params.organizationId,
      messageId: params.messageId,
      deliveryStatus: status,
      externalMessageId: sendResult.externalMessageId ?? null,
      deliveryError: sendResult.errorMessage ?? null,
    });

    return {
      delivered: sendResult.ok,
      deliveryStatus: status,
      errorMessage: sendResult.errorMessage,
    };
  }

  /**
   * Notifies a Telegram customer when their conversation status or assignment changes
   * from the web dashboard or Telegram Agent Companion.
   */
  async notifyCustomerOfConversationStatusChange(params: {
    organizationId: string;
    conversation: WorkspaceConversationItem;
    previousStatus?: ConversationStatus;
    nextStatus?: ConversationStatus;
    assignedAgentName?: string | null;
    actorName?: string;
    botToken?: string;
  }): Promise<{ notified: boolean }> {
    if (params.conversation.channel !== SupportChannel.Telegram) {
      return { notified: false };
    }

    const chatId =
      params.conversation.sourceChannelRef ||
      params.conversation.customerExternalRef.replace(/^tg:/, '');
    if (!chatId) {
      return { notified: false };
    }

    const org = await this.db
      .prepare(`SELECT name FROM organizations WHERE id = ?`)
      .bind(params.organizationId)
      .first<{ name: string }>();
    const businessName = org?.name ?? 'Support';

    const effectiveBotToken = await this.resolveEffectiveTelegramBotTokenForOrg(
      params.organizationId,
      params.botToken
    );

    if (
      params.nextStatus === ConversationStatus.Resolved &&
      params.previousStatus !== ConversationStatus.Resolved
    ) {
      const text =
        `✅ Your support conversation (${params.conversation.id}) with ${businessName} has been marked as resolved${
          params.actorName ? ` by ${params.actorName}` : ''
        }.\n\n` +
        `If you need any further help, tap an option below or send a new message anytime.`;
      await this.sendTelegram(
        {
          chatId,
          text,
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '🆕 Start New Enquiry', callback_data: 'cc:conv:new' },
                { text: '🏠 Main Menu', callback_data: 'cc:menu:main' },
              ],
            ],
          },
        },
        effectiveBotToken
      );
      return { notified: true };
    }

    if (params.assignedAgentName) {
      const text =
        `👤 Support specialist ${params.assignedAgentName} at ${businessName} has been assigned to your conversation (${params.conversation.id}). You can reply directly here anytime.`;
      await this.sendTelegram({ chatId, text }, effectiveBotToken);
      return { notified: true };
    }

    return { notified: false };
  }

  private async notifyLinkedAgentsOfEscalation(params: {
    organizationId: string;
    organizationName: string;
    conversation: WorkspaceConversationItem;
    botToken?: string;
  }): Promise<void> {
    const { results: linkedAgents } = await this.db
      .prepare(
        `SELECT l.telegram_chat_id, u.full_name
         FROM telegram_agent_links l
         JOIN users u ON u.id = l.user_id
         JOIN organization_members om
           ON om.organization_id = l.organization_id AND om.user_id = l.user_id
         WHERE l.organization_id = ?
           AND l.status = 'linked'
           AND l.notifications_enabled = 1
           AND l.telegram_chat_id IS NOT NULL
           AND om.is_active = 1`
      )
      .bind(params.organizationId)
      .all<{ telegram_chat_id: string; full_name: string }>();

    for (const agent of linkedAgents) {
      if (!agent.telegram_chat_id) continue;
      await this.sendTelegram(
        {
          chatId: agent.telegram_chat_id,
          text:
            `🔔 [${params.organizationName}] Escalated Conversation (${params.conversation.id})\n` +
            `Customer: ${params.conversation.customerName}\n` +
            `Category: ${params.conversation.category} · Priority: ${params.conversation.priority.toUpperCase()}\n` +
            `Subject: ${params.conversation.subject}\n\n` +
            `Reply with:\n/open ${params.conversation.id}\n/accept ${params.conversation.id}\n/reply ${params.conversation.id} <your message>`,
        },
        params.botToken
      );
    }
  }

  /* =========================================================================
     5. Central CustomCare Telegram Bot Webhook Processor
        Handles both:
        (A) Customer-facing support across multiple businesses
        (B) Agent-facing lightweight Telegram interface
  ========================================================================= */

  /**
   * Processes incoming webhook updates for a business's dedicated Telegram Sub-Bot
   * (e.g. `@CD_bot` at `/api/webhooks/telegram/subbot/[integrationId]`).
   * Automatically binds the customer to the sub-bot's business workspace on plain `/start`,
   * natural greetings ("Hi", "Hello"), or any natural-language message without needing `?start=tg_...`.
   */
  async processTelegramSubBotWebhookUpdate(params: {
    integrationId: string;
    providedSecretHeader?: string | null;
    update: TelegramUpdateEnvelope;
    appBaseUrl?: string;
    nowMs?: number;
  }): Promise<{
    handled: boolean;
    deduplicated: boolean;
    unauthorized?: boolean;
    mode: 'customer' | 'ignored';
    organizationId?: string;
    conversationId?: string;
    replyText?: string;
  }> {
    const { integrationId, providedSecretHeader, update } = params;
    if (!update || typeof update.update_id !== 'number') {
      throw new Error('INVALID_UPDATE: update_id is required.');
    }

    const integrationRow = await this.db
      .prepare(
        `SELECT ci.*, o.name AS org_name, o.slug AS org_slug, o.is_active AS org_active
         FROM channel_integrations ci
         JOIN organizations o ON o.id = ci.organization_id
         WHERE ci.id = ? AND ci.channel = 'telegram'`
      )
      .bind(integrationId)
      .first<
        DbChannelIntegrationRow & {
          org_name: string;
          org_slug: string;
          org_active: number;
        }
      >();

    if (!integrationRow || !integrationRow.org_active || integrationRow.status !== 'active') {
      return {
        handled: false,
        deduplicated: false,
        mode: 'ignored',
      };
    }

    const subBotCreds = this.parseEncryptedSubBotCredentials(integrationRow.encrypted_credentials);
    if (!subBotCreds?.botToken) {
      return {
        handled: false,
        deduplicated: false,
        mode: 'ignored',
      };
    }

    if (subBotCreds.webhookSecret && providedSecretHeader !== undefined) {
      const secretValid = this.verifyTelegramWebhookSecret(
        providedSecretHeader,
        subBotCreds.webhookSecret
      );
      if (!secretValid) {
        return {
          handled: false,
          deduplicated: false,
          unauthorized: true,
          mode: 'ignored',
        };
      }
    }

    const dedup = await this.checkAndRecordIdempotencyKey({
      provider: 'telegram',
      idempotencyKey: `tg_sub_${integrationRow.id}_${update.update_id}`,
      organizationId: integrationRow.organization_id,
      eventType: update.message
        ? 'message'
        : update.callback_query
          ? 'callback_query'
          : 'other',
    });

    if (dedup.isDuplicate) {
      return {
        handled: true,
        deduplicated: true,
        mode: 'ignored',
      };
    }

    const message = update.message ?? update.edited_message;
    const callbackQuery = update.callback_query;
    const hasAttachment = Boolean(
      update.message?.photo?.length || update.message?.document
    );
    const rawText = (
      message?.text ??
      message?.caption ??
      callbackQuery?.data ??
      ''
    ).trim();
    const fromUser = message?.from ?? callbackQuery?.from;
    const chatObj = message?.chat ?? callbackQuery?.message?.chat;

    if (!fromUser || !chatObj || (!rawText && !hasAttachment)) {
      return {
        handled: false,
        deduplicated: false,
        mode: 'ignored',
      };
    }

    const telegramUserId = String(fromUser.id);
    const telegramChatId = String(chatObj.id);
    const telegramUsername = fromUser.username ?? '';
    const displayName =
      [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ').trim() ||
      telegramUsername ||
      `Telegram User ${telegramUserId.slice(-4)}`;

    // Ensure the integration has a valid public_token so customer context validation stays unified
    let publicToken = integrationRow.public_token;
    if (!publicToken) {
      const { rawToken } = generateSecureToken(18);
      publicToken = `tg_${rawToken}`;
      const nowIso = new Date().toISOString();
      await this.db
        .prepare(
          `UPDATE channel_integrations SET public_token = ?, public_token_hash = ?, updated_at = ? WHERE id = ?`
        )
        .bind(publicToken, hashTokenSha256(publicToken), nowIso, integrationRow.id)
        .run();
    }

    // If the customer sends plain `/start` (or `/start <anything>`) on the sub-bot,
    // immediately run the personalized business start experience using the sub-bot token!
    if (/^\/start(?:\s+.*)?$/i.test(rawText) && !callbackQuery?.data) {
      return this.handleTelegramCustomerStart({
        telegramUserId,
        telegramChatId,
        telegramUsername,
        displayName,
        publicToken,
        botToken: subBotCreds.botToken,
        callbackQueryId: callbackQuery?.id,
      });
    }

    // Ensure the customer's active context is bound to this sub-bot's business before handling any message
    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO telegram_customer_contexts
           (telegram_user_id, telegram_chat_id, active_organization_id, public_token_used, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (telegram_user_id) DO UPDATE SET
           telegram_chat_id = excluded.telegram_chat_id,
           active_organization_id = excluded.active_organization_id,
           public_token_used = excluded.public_token_used,
           updated_at = excluded.updated_at`
      )
      .bind(
        telegramUserId,
        telegramChatId,
        integrationRow.organization_id,
        publicToken,
        nowIso
      )
      .run();

    const strippedCustomerText = rawText.replace(/^\/customer\s*/i, '').trim() || rawText;
    return this.handleTelegramCustomerMessage({
      telegramUserId,
      telegramChatId,
      telegramUsername,
      displayName,
      text: strippedCustomerText,
      callbackData: callbackQuery?.data,
      callbackQueryId: callbackQuery?.id,
      photo: update.message?.photo,
      document: update.message?.document,
      externalMessageId: message?.message_id ? String(message.message_id) : undefined,
      botToken: subBotCreds.botToken,
      forcedOrganizationId: integrationRow.organization_id,
    });
  }

  async processTelegramWebhookUpdate(
    update: TelegramUpdateEnvelope,
    options?: {
      botToken?: string;
      centralBotUsername?: string;
      appBaseUrl?: string;
      nowMs?: number;
    }
  ): Promise<{
    handled: boolean;
    deduplicated: boolean;
    mode: 'customer' | 'agent' | 'system' | 'ignored';
    organizationId?: string;
    conversationId?: string;
    replyText?: string;
  }> {
    if (!update || typeof update.update_id !== 'number') {
      throw new Error('INVALID_UPDATE: update_id is required.');
    }

    // 1. Idempotent Update Deduplication
    const dedup = await this.checkAndRecordIdempotencyKey({
      provider: 'telegram',
      idempotencyKey: `tg_upd_${update.update_id}`,
      eventType: update.message
        ? 'message'
        : update.callback_query
          ? 'callback_query'
          : update.edited_message
            ? 'edited_message'
            : 'other',
    });

    if (dedup.isDuplicate) {
      return {
        handled: true,
        deduplicated: true,
        mode: 'ignored',
      };
    }

    const message = update.message ?? update.edited_message;
    const callbackQuery = update.callback_query;

    const hasAttachment = Boolean(
      update.message?.photo?.length || update.message?.document
    );
    const rawText = (
      message?.text ??
      message?.caption ??
      callbackQuery?.data ??
      ''
    ).trim();
    const fromUser = message?.from ?? callbackQuery?.from;
    const chatObj = message?.chat ?? callbackQuery?.message?.chat;

    if (!fromUser || !chatObj || (!rawText && !hasAttachment)) {
      return {
        handled: false,
        deduplicated: false,
        mode: 'ignored',
      };
    }

    const telegramUserId = String(fromUser.id);
    const telegramChatId = String(chatObj.id);
    const telegramUsername = fromUser.username ?? '';
    const displayName =
      [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ').trim() ||
      telegramUsername ||
      `Telegram User ${telegramUserId.slice(-4)}`;

    const sendReply = async (
      text: string,
      replyMarkup?: Record<string, unknown>
    ): Promise<string> => {
      await this.sendTelegram(
        {
          chatId: telegramChatId,
          text,
          replyMarkup,
          callbackQueryId: callbackQuery?.id,
        },
        options?.botToken
      );
      return text;
    };

    // 2. Check for Agent Linking Commands: `/start link_AG-...`, `/link AG-...`, or `AG-...`
    const linkMatch =
      rawText.match(/^\/start\s+link_(AG-[A-F0-9]{8,16})$/i) ||
      rawText.match(/^\/link\s+(AG-[A-F0-9]{8,16})$/i) ||
      rawText.match(/^(AG-[A-F0-9]{10})$/i);

    if (linkMatch && linkMatch[1]) {
      const linkOutcome = await this.completeAgentTelegramLink({
        rawCode: linkMatch[1],
        telegramUserId,
        telegramChatId,
        telegramUsername,
        nowMs: options?.nowMs,
      });

      if (!linkOutcome.linked || !linkOutcome.record) {
        const replyText = await sendReply(
          `❌ Agent Link Failed: ${linkOutcome.errorMessage || 'Invalid or expired code.'}`
        );
        return {
          handled: true,
          deduplicated: false,
          mode: 'agent',
          replyText,
        };
      }

      const replyText = await sendReply(
        `✅ Linked to CustomCare Agent Workspace! (Business & Agent Hub)\n` +
          `Specialist: ${linkOutcome.record.userFullName} (${linkOutcome.record.role})\n` +
          `Active Business: ${linkOutcome.record.organizationName}\n\n` +
          `Business & Sub-Bot Setup:\n` +
          `• /mybot — View your customer Telegram link & connected Sub-Bot\n` +
          `• /connectbot <BOT_TOKEN> — Connect a @BotFather sub-bot (like your CD bot)\n` +
          `• /disconnectbot — Disconnect custom sub-bot\n\n` +
          `Agent Queue Commands:\n` +
          `• /my — My assigned conversations\n` +
          `• /unassigned — Unassigned queue\n` +
          `• /priority — High & urgent conversations\n` +
          `• /search <keyword> — Search conversations\n` +
          `• /open <conv_id> — Read conversation history\n` +
          `• /accept <conv_id> — Accept conversation\n` +
          `• /reply <conv_id> <message> — Reply to customer\n` +
          `• /note <conv_id> <note> — Add private internal note\n` +
          `• /resolve <conv_id> — Mark conversation resolved\n` +
          `• /availability <available|busy|offline> — Set status\n` +
          `• /workspace — Switch active business workspace\n` +
          `• /unlink — Unlink your Telegram account`,
        {
          inline_keyboard: [
            [
              { text: '🔗 My Business Bot Links', callback_data: 'ag:mybot' },
              { text: '🤖 Connect Sub-Bot Token', callback_data: 'ag:connectbot_prompt' },
            ],
            [
              { text: '📥 Unassigned Queue', callback_data: 'ag:unassigned' },
              { text: '📋 My Assigned Chats', callback_data: 'ag:my' },
            ],
          ],
        }
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'agent',
        organizationId: linkOutcome.record.organizationId,
        replyText,
      };
    }

    // 3. Check for Customer Business Deep Link: `/start <BUSINESS_PUBLIC_TOKEN>`
    const startBusinessMatch = rawText.match(/^\/start\s+([A-Za-z0-9_-]{8,120})$/i);
    if (
      startBusinessMatch &&
      startBusinessMatch[1] &&
      !startBusinessMatch[1].toLowerCase().startsWith('link_')
    ) {
      const publicToken = startBusinessMatch[1].trim();
      return this.handleTelegramCustomerStart({
        telegramUserId,
        telegramChatId,
        telegramUsername,
        displayName,
        publicToken,
        botToken: options?.botToken,
        callbackQueryId: callbackQuery?.id,
      });
    }

    // 4. Customer Interactive Callback Queries (`cc:...`) always route to Customer Mode
    const isCustomerCallback = Boolean(
      callbackQuery?.data && callbackQuery.data.startsWith('cc:')
    );
    const isAgentCallback = Boolean(
      callbackQuery?.data && callbackQuery.data.startsWith('ag:')
    );

    // 5. Determine whether this Telegram user is operating as a verified linked Agent / Business Owner
    const agentCommandPrefixes = [
      '/my',
      '/mybot',
      '/connectbot',
      '/disconnectbot',
      '/hub',
      '/unassigned',
      '/priority',
      '/search',
      '/open',
      '/accept',
      '/reply',
      '/note',
      '/resolve',
      '/reopen',
      '/pending',
      '/availability',
      '/workspace',
      '/switch',
      '/unlink',
      '/agent',
      '/help',
    ];
    const isExplicitAgentCommand =
      !isCustomerCallback &&
      (isAgentCallback ||
        agentCommandPrefixes.some(
          (cmd) =>
            rawText.toLowerCase() === cmd || rawText.toLowerCase().startsWith(`${cmd} `)
        ));

    // Also detect if a linked Admin/Owner pastes a raw @BotFather token directly into @getcustomcarebot!
    const looksLikeBotFatherToken = /^\d{6,16}:[A-Za-z0-9_-]{25,100}$/.test(rawText);

    const activeAgentLinks = isCustomerCallback
      ? []
      : await this.resolveVerifiedAgentLinksForTelegramUser(telegramUserId);

    const isCustomerMenuCommand =
      /^\/(customer|menu|categories|new|conversations|human|escalate)\b/i.test(rawText);

    if (
      !isCustomerCallback &&
      !isCustomerMenuCommand &&
      (isExplicitAgentCommand ||
        looksLikeBotFatherToken ||
        (activeAgentLinks.length > 0 && !hasAttachment))
    ) {
      if (activeAgentLinks.length === 0) {
        const replyText = await sendReply(
          `🔒 Agent access denied — Business & Agent Hub Access Required\n\n` +
            `Your Telegram account is not yet linked to a CustomCare business workspace.\n\n` +
            `How to link in 30 seconds:\n` +
            `1. Sign in at https://getcustomcare.xyz/login (or create a business at https://getcustomcare.xyz/onboarding)\n` +
            `2. Open Channels & Integrations -> Telegram Agent Companion\n` +
            `3. Tap "Generate Linking Code" and send your AG-... code here.`
        );
        return {
          handled: true,
          deduplicated: false,
          mode: 'agent',
          replyText,
        };
      }

      const primaryLink =
        activeAgentLinks.find((l) => l.organization_id === l.active_organization_id) ??
        activeAgentLinks[0]!;

      const effectiveAgentText = looksLikeBotFatherToken
        ? `/connectbot ${rawText}`
        : rawText;

      // If a linked agent/admin sends plain `/start` or `/hub` or "Hi" on @getcustomcarebot,
      // or runs an agent command, open the Business & Agent Hub
      return this.handleTelegramAgentInteraction({
        telegramUserId,
        telegramChatId,
        rawText: effectiveAgentText,
        callbackQueryId: callbackQuery?.id,
        activeLink: primaryLink,
        allLinks: activeAgentLinks,
        botToken: options?.botToken,
        centralBotUsername: options?.centralBotUsername,
        appBaseUrl: options?.appBaseUrl,
      });
    }

    // 6. Otherwise handle as Customer Support interaction in the customer's active business context
    const strippedCustomerText = rawText.replace(/^\/customer\s*/i, '').trim() || rawText;
    return this.handleTelegramCustomerMessage({
      telegramUserId,
      telegramChatId,
      telegramUsername,
      displayName,
      text: strippedCustomerText,
      callbackData: callbackQuery?.data,
      callbackQueryId: callbackQuery?.id,
      photo: update.message?.photo,
      document: update.message?.document,
      externalMessageId: message?.message_id ? String(message.message_id) : undefined,
      botToken: options?.botToken,
    });
  }

  private async resolveVerifiedAgentLinksForTelegramUser(
    telegramUserId: string
  ): Promise<
    Array<
      DbTelegramAgentLinkRow & {
        user_full_name: string;
        user_email: string;
        org_name: string;
        org_slug: string;
        member_role: UserRole;
      }
    >
  > {
    interface VerifiedAgentLinkRow extends DbTelegramAgentLinkRow {
      user_full_name: string;
      user_email: string;
      org_name: string;
      org_slug: string;
      member_role: UserRole;
    }

    const { results } = await this.db
      .prepare(
        `SELECT
           l.*,
           u.full_name AS user_full_name,
           u.email AS user_email,
           o.name AS org_name,
           o.slug AS org_slug,
           om.role AS member_role
         FROM telegram_agent_links l
         JOIN users u ON u.id = l.user_id
         JOIN organizations o ON o.id = l.organization_id
         JOIN organization_members om
           ON om.organization_id = l.organization_id AND om.user_id = l.user_id
         WHERE l.telegram_user_id = ?
           AND l.status = 'linked'
           AND om.is_active = 1
           AND o.is_active = 1
         ORDER BY l.updated_at DESC`
      )
      .bind(telegramUserId)
      .all<VerifiedAgentLinkRow>();

    return results;
  }

  private parseCustomerSessionState(rawJson?: string | null): TelegramCustomerSessionState {
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson) as Partial<TelegramCustomerSessionState>;
        if (parsed && typeof parsed.step === 'string') {
          return {
            step: parsed.step as TelegramCustomerFlowStep,
            selectedCategory: parsed.selectedCategory,
            selectedSubIssue: parsed.selectedSubIssue,
            selectedProduct: parsed.selectedProduct,
            pendingTransactionRef: parsed.pendingTransactionRef,
            pendingPaymentAmountDate: parsed.pendingPaymentAmountDate,
            updatedAt: parsed.updatedAt || new Date().toISOString(),
          };
        }
      } catch {
        // use default
      }
    }
    return {
      step: 'main_menu',
      updatedAt: new Date().toISOString(),
    };
  }

  private async saveCustomerSessionState(params: {
    identityId: string;
    telegramUserId: string;
    state: TelegramCustomerSessionState;
  }): Promise<void> {
    const now = new Date().toISOString();
    const nextState: TelegramCustomerSessionState = {
      ...params.state,
      updatedAt: now,
    };
    const json = JSON.stringify(nextState);
    await Promise.all([
      this.db
        .prepare(
          `UPDATE channel_customer_identities
           SET session_state_json = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(json, now, params.identityId)
        .run()
        .catch(() => undefined),
      this.db
        .prepare(
          `UPDATE telegram_customer_contexts
           SET session_state_json = ?, updated_at = ?
           WHERE telegram_user_id = ?`
        )
        .bind(json, now, params.telegramUserId)
        .run()
        .catch(() => undefined),
    ]);
  }

  private buildMainMenuInlineKeyboard(params: {
    portalSettings: BusinessPortalConfig;
    tgConfig: TelegramChannelConfig;
    activeConversationsCount: number;
  }): Record<string, unknown> {
    const rows: Array<Array<{ text: string; callback_data: string }>> = [
      [{ text: '💳 Payment or Deposit Issues', callback_data: 'cc:cat:payment' }],
      [{ text: '📦 Product Support', callback_data: 'cc:cat:product' }],
      [{ text: '⚙️ Technical Issues', callback_data: 'cc:cat:technical' }],
      [{ text: '💬 Other Enquiries', callback_data: 'cc:cat:other' }],
    ];

    // Add any custom business-configured categories that aren't already covered by the 4 core flows
    const coreKeywords = ['payment', 'deposit', 'billing', 'product', 'technical', 'other', 'general'];
    const customCats = (params.tgConfig.supportCategories || [])
      .filter((c) => {
        const lower = c.toLowerCase();
        return !coreKeywords.some((kw) => lower.includes(kw));
      })
      .slice(0, 3);

    customCats.forEach((cat, idx) => {
      rows.push([
        {
          text: `📌 ${cat.slice(0, 32)}`,
          callback_data: `cc:customcat:${idx}`,
        },
      ]);
    });

    if (params.activeConversationsCount > 0) {
      rows.push([
        {
          text: `📂 My Active Conversations (${params.activeConversationsCount})`,
          callback_data: 'cc:conv:list',
        },
        {
          text: '🆕 New Enquiry',
          callback_data: 'cc:conv:new',
        },
      ]);
    }

    if (params.tgConfig.allowHumanEscalation) {
      rows.push([{ text: '👤 Speak to an Agent', callback_data: 'cc:human' }]);
    }

    return { inline_keyboard: rows };
  }

  private buildPaymentMenuKeyboard(): Record<string, unknown> {
    return {
      inline_keyboard: [
        [{ text: '⏳ My payment or deposit is pending', callback_data: 'cc:pay:pending' }],
        [{ text: '💳 Account debited but not credited', callback_data: 'cc:pay:debited' }],
        [{ text: '🔍 My payment is missing', callback_data: 'cc:pay:missing' }],
        [{ text: '❓ I have another payment problem', callback_data: 'cc:pay:other' }],
        [
          { text: '👤 Speak to an Agent', callback_data: 'cc:human' },
          { text: '🏠 Main Menu', callback_data: 'cc:menu:main' },
        ],
      ],
    };
  }

  private buildTechnicalMenuKeyboard(): Record<string, unknown> {
    return {
      inline_keyboard: [
        [{ text: '📱 Application not opening', callback_data: 'cc:tech:app_open' }],
        [{ text: '🔐 Login problems', callback_data: 'cc:tech:login' }],
        [{ text: '🛠️ Features not working', callback_data: 'cc:tech:features' }],
        [{ text: '⚠️ Errors during operation', callback_data: 'cc:tech:errors' }],
        [{ text: '🔄 Failed transactions', callback_data: 'cc:tech:failed_tx' }],
        [{ text: '❓ Other technical difficulties', callback_data: 'cc:tech:other' }],
        [
          { text: '👤 Speak to an Agent', callback_data: 'cc:human' },
          { text: '🏠 Main Menu', callback_data: 'cc:menu:main' },
        ],
      ],
    };
  }

  private buildNavigationFooterKeyboard(
    backCallback = 'cc:menu:main',
    includeHuman = true
  ): Record<string, unknown> {
    const navRow: Array<{ text: string; callback_data: string }> = [
      { text: '⬅️ Back', callback_data: backCallback },
      { text: '🏠 Main Menu', callback_data: 'cc:menu:main' },
      { text: '✖️ Cancel', callback_data: 'cc:cancel' },
    ];
    const rows: Array<Array<{ text: string; callback_data: string }>> = [];
    if (includeHuman) {
      rows.push([{ text: '👤 Speak to an Agent', callback_data: 'cc:human' }]);
    }
    rows.push(navRow);
    return { inline_keyboard: rows };
  }

  private resolveConfiguredBusinessProducts(
    portalSettings: BusinessPortalConfig,
    tgConfig: TelegramChannelConfig
  ): string[] {
    const candidates: string[] = [];
    for (const cat of portalSettings.categories || []) {
      if (cat.title && !/other|deposit|payment/i.test(cat.title)) {
        candidates.push(cat.title.trim());
      }
    }
    for (const topic of portalSettings.chatbot.supportedTopics || []) {
      if (topic && !candidates.includes(topic.trim())) {
        candidates.push(topic.trim());
      }
    }
    for (const art of portalSettings.publishedKnowledge || []) {
      if (art.title && candidates.length < 6 && !candidates.includes(art.title.trim())) {
        candidates.push(art.title.trim().slice(0, 36));
      }
    }
    for (const tc of tgConfig.supportCategories || []) {
      if (tc && !candidates.includes(tc.trim())) {
        candidates.push(tc.trim());
      }
    }
    return candidates.slice(0, 5);
  }

  private async handleTelegramCustomerStart(params: {
    telegramUserId: string;
    telegramChatId: string;
    telegramUsername: string;
    displayName: string;
    publicToken: string;
    botToken?: string;
    callbackQueryId?: string;
    isConversationalGreeting?: boolean;
  }): Promise<{
    handled: boolean;
    deduplicated: boolean;
    mode: 'customer';
    organizationId?: string;
    replyText: string;
  }> {
    const integrationRow = await this.db
      .prepare(
        `SELECT ci.*, o.name AS org_name, o.slug AS org_slug, o.is_active AS org_active
         FROM channel_integrations ci
         JOIN organizations o ON o.id = ci.organization_id
         WHERE ci.channel = 'telegram' AND ci.public_token = ?`
      )
      .bind(params.publicToken)
      .first<
        DbChannelIntegrationRow & {
          org_name: string;
          org_slug: string;
          org_active: number;
        }
      >();

    if (!integrationRow || !integrationRow.org_active || integrationRow.status !== 'active') {
      const replyText =
        `⚠️ This business support link is invalid, inactive, or has been revoked. Please contact the business for an updated support link.`;
      await this.sendTelegram(
        {
          chatId: params.telegramChatId,
          text: replyText,
          callbackQueryId: params.callbackQueryId,
        },
        params.botToken
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        replyText,
      };
    }

    const now = new Date().toISOString();
    const portalSettings = await this.workspaceRepo.getWorkspaceSettings(
      integrationRow.organization_id
    );
    let tgConfig = this.getDefaultTelegramConfig(
      integrationRow.org_name,
      portalSettings.chatbot.supportedTopics
    );
    try {
      tgConfig = {
        ...tgConfig,
        ...(JSON.parse(integrationRow.config_json) as Partial<TelegramChannelConfig>),
      };
    } catch {
      // use default
    }

    const initialState: TelegramCustomerSessionState = {
      step: 'main_menu',
      updatedAt: now,
    };
    const stateJson = JSON.stringify(initialState);

    // Bind customer's active business context to this organization
    await this.db
      .prepare(
        `INSERT INTO telegram_customer_contexts
           (telegram_user_id, telegram_chat_id, active_organization_id, public_token_used, session_state_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (telegram_user_id) DO UPDATE SET
           telegram_chat_id = excluded.telegram_chat_id,
           active_organization_id = excluded.active_organization_id,
           public_token_used = excluded.public_token_used,
           session_state_json = excluded.session_state_json,
           updated_at = excluded.updated_at`
      )
      .bind(
        params.telegramUserId,
        params.telegramChatId,
        integrationRow.organization_id,
        params.publicToken,
        stateJson,
        now
      )
      .run()
      .catch(async () => {
        // Fallback if session_state_json column not yet present
        await this.db
          .prepare(
            `INSERT INTO telegram_customer_contexts
               (telegram_user_id, telegram_chat_id, active_organization_id, public_token_used, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (telegram_user_id) DO UPDATE SET
               telegram_chat_id = excluded.telegram_chat_id,
               active_organization_id = excluded.active_organization_id,
               public_token_used = excluded.public_token_used,
               updated_at = excluded.updated_at`
          )
          .bind(
            params.telegramUserId,
            params.telegramChatId,
            integrationRow.organization_id,
            params.publicToken,
            now
          )
          .run();
      });

    // Upsert tenant-scoped customer identity
    await this.db
      .prepare(
        `INSERT INTO channel_customer_identities
           (id, organization_id, channel, external_user_id, external_chat_id, external_username, display_name, email, verified_email, session_state_json, last_interaction_at, created_at, updated_at)
         VALUES (?, ?, 'telegram', ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
         ON CONFLICT (organization_id, channel, external_user_id) DO UPDATE SET
           external_chat_id = excluded.external_chat_id,
           external_username = excluded.external_username,
           display_name = excluded.display_name,
           session_state_json = excluded.session_state_json,
           last_interaction_at = excluded.last_interaction_at,
           updated_at = excluded.updated_at`
      )
      .bind(
        createChannelId('cid'),
        integrationRow.organization_id,
        params.telegramUserId,
        params.telegramChatId,
        params.telegramUsername,
        params.displayName,
        `tg.${params.telegramUserId}@telegram.customer`,
        stateJson,
        now,
        now,
        now
      )
      .run()
      .catch(async () => {
        await this.db
          .prepare(
            `INSERT INTO channel_customer_identities
               (id, organization_id, channel, external_user_id, external_chat_id, external_username, display_name, email, verified_email, last_interaction_at, created_at, updated_at)
             VALUES (?, ?, 'telegram', ?, ?, ?, ?, ?, 0, ?, ?, ?)
             ON CONFLICT (organization_id, channel, external_user_id) DO UPDATE SET
               external_chat_id = excluded.external_chat_id,
               external_username = excluded.external_username,
               display_name = excluded.display_name,
               last_interaction_at = excluded.last_interaction_at,
               updated_at = excluded.updated_at`
          )
          .bind(
            createChannelId('cid'),
            integrationRow.organization_id,
            params.telegramUserId,
            params.telegramChatId,
            params.telegramUsername,
            params.displayName,
            `tg.${params.telegramUserId}@telegram.customer`,
            now,
            now,
            now
          )
          .run();
      });

    await this.db
      .prepare(`UPDATE channel_integrations SET last_event_at = ?, updated_at = ? WHERE id = ?`)
      .bind(now, now, integrationRow.id)
      .run();

    // Count active conversations for this customer in this business
    const allConvs = await this.workspaceRepo.listConversations(
      integrationRow.organization_id,
      { includeInternalNotes: false }
    );
    const activeCustomerConvs = allConvs.filter(
      (c) =>
        c.channel === SupportChannel.Telegram &&
        (c.customerExternalRef === `tg:${params.telegramUserId}` ||
          c.sourceChannelRef === params.telegramChatId) &&
        c.status !== ConversationStatus.Resolved &&
        c.status !== ConversationStatus.Closed
    );

    const replyText = this.formatPersonalizedCustomerWelcome({
      customerDisplayName: params.displayName,
      businessName: integrationRow.org_name,
      welcomeMessageTemplate: tgConfig.welcomeMessage,
      supportCategories: tgConfig.supportCategories,
      isConversationalGreeting: params.isConversationalGreeting,
    });

    const replyMarkup = this.buildMainMenuInlineKeyboard({
      portalSettings,
      tgConfig,
      activeConversationsCount: activeCustomerConvs.length,
    });

    await this.sendTelegram(
      {
        chatId: params.telegramChatId,
        text: replyText,
        replyMarkup,
        callbackQueryId: params.callbackQueryId,
      },
      params.botToken
    );

    return {
      handled: true,
      deduplicated: false,
      mode: 'customer',
      organizationId: integrationRow.organization_id,
      replyText,
    };
  }

  private validateTelegramAttachmentInput(params: {
    photo?: TelegramPhotoSizeItem[];
    document?: TelegramDocumentItem;
  }): {
    valid: boolean;
    errorMessage?: string;
    fileId?: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
  } {
    if (params.photo && params.photo.length > 0) {
      // Telegram provides photo sizes in ascending order; pick the highest resolution
      const largestPhoto = params.photo[params.photo.length - 1]!;
      const fileSize = Number(largestPhoto.file_size ?? 0);
      if (fileSize > TELEGRAM_MAX_ATTACHMENT_BYTES) {
        return {
          valid: false,
          errorMessage: `⚠️ Image exceeds the maximum allowed size of 10 MB. Please send a smaller screenshot or image.`,
        };
      }
      return {
        valid: true,
        fileId: largestPhoto.file_id,
        fileName: `telegram_photo_${largestPhoto.file_unique_id || Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        fileSize,
      };
    }

    if (params.document) {
      const doc = params.document;
      const fileSize = Number(doc.file_size ?? 0);
      const rawName = (doc.file_name || 'telegram_document').trim();
      const safeFileName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document.bin';
      const lowerName = safeFileName.toLowerCase();
      const extMatch = lowerName.match(/\.[a-z0-9]+$/);
      const ext = extMatch ? extMatch[0] : '';
      const mimeType = (doc.mime_type || 'application/octet-stream').toLowerCase();

      if (fileSize > TELEGRAM_MAX_ATTACHMENT_BYTES) {
        return {
          valid: false,
          errorMessage: `⚠️ File "${safeFileName}" exceeds the 10 MB size limit. Please upload a file under 10 MB.`,
        };
      }

      const mimeAllowed = TELEGRAM_ALLOWED_ATTACHMENT_MIMES.has(mimeType);
      const extAllowed = ext ? TELEGRAM_ALLOWED_ATTACHMENT_EXTENSIONS.has(ext) : false;

      if (!mimeAllowed && !extAllowed) {
        return {
          valid: false,
          errorMessage:
            `⚠️ Unsupported file type (${mimeType}). For security, only images (JPG, PNG, WebP) and documents (PDF, TXT, CSV, DOCX) are accepted.`,
        };
      }

      return {
        valid: true,
        fileId: doc.file_id,
        fileName: safeFileName,
        mimeType,
        fileSize,
      };
    }

    return { valid: false };
  }

  private async countAvailableAgentsForOrg(organizationId: string): Promise<{
    availableCount: number;
    linkedCount: number;
  }> {
    const [availRow, linkedRow] = await Promise.all([
      this.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM support_agents
           WHERE organization_id = ? AND availability = 'available'`
        )
        .bind(organizationId)
        .first<{ cnt: number }>(),
      this.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM telegram_agent_links l
           JOIN organization_members om
             ON om.organization_id = l.organization_id AND om.user_id = l.user_id
           WHERE l.organization_id = ? AND l.status = 'linked' AND om.is_active = 1`
        )
        .bind(organizationId)
        .first<{ cnt: number }>(),
    ]);

    return {
      availableCount: Number(availRow?.cnt ?? 0),
      linkedCount: Number(linkedRow?.cnt ?? 0),
    };
  }

  private async ensureOrAppendCustomerConversation(params: {
    organizationId: string;
    displayName: string;
    email: string;
    telegramUserId: string;
    telegramChatId: string;
    identityId: string;
    activeConv: WorkspaceConversationItem | null;
    category: string;
    subject: string;
    messageBody: string;
    targetStatus: ConversationStatus;
    priority: EscalationPriority;
    transcriptSummary?: string;
    externalMessageId?: string;
    forceNewConversation?: boolean;
  }): Promise<WorkspaceConversationItem> {
    const now = new Date().toISOString();
    let conv = params.forceNewConversation ? null : params.activeConv;

    if (!conv) {
      conv = await this.workspaceRepo.createEscalatedConversation({
        organizationId: params.organizationId,
        customerName: params.displayName,
        customerEmail: params.email,
        customerExternalRef: `tg:${params.telegramUserId}`,
        customerIdentityId: params.identityId,
        sourceChannelRef: params.telegramChatId,
        channel: SupportChannel.Telegram,
        status: params.targetStatus,
        priority: params.priority,
        category: params.category,
        subject: params.subject.slice(0, 90) || params.category,
        message: params.messageBody,
        transcriptSummary: params.transcriptSummary,
        externalMessageId: params.externalMessageId,
      });

      await this.db
        .prepare(
          `UPDATE channel_customer_identities
           SET active_conversation_id = ?, last_interaction_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(conv.id, now, now, params.identityId)
        .run();
    } else {
      conv = await this.workspaceRepo.replyToConversation({
        organizationId: params.organizationId,
        conversationId: conv.id,
        senderName: params.displayName,
        senderType: MessageSenderType.Customer,
        body: params.messageBody,
        externalMessageId: params.externalMessageId,
        nextStatus: params.targetStatus,
      });
    }

    return conv;
  }

  private async handleTelegramCustomerMessage(params: {
    telegramUserId: string;
    telegramChatId: string;
    telegramUsername: string;
    displayName: string;
    text: string;
    callbackData?: string;
    callbackQueryId?: string;
    photo?: TelegramPhotoSizeItem[];
    document?: TelegramDocumentItem;
    externalMessageId?: string;
    botToken?: string;
    forcedOrganizationId?: string;
  }): Promise<{
    handled: boolean;
    deduplicated: boolean;
    mode: 'customer';
    organizationId?: string;
    conversationId?: string;
    replyText: string;
  }> {
    let contextRow:
      | {
          active_organization_id: string;
          public_token_used: string;
          session_state_json?: string | null;
          org_name: string;
          org_slug: string;
          org_active: number;
          integration_id: string | null;
          integration_status: string | null;
          current_public_token: string | null;
          config_json: string | null;
        }
      | null
      | undefined = null;

    if (params.forcedOrganizationId) {
      contextRow = await this.db
        .prepare(
          `SELECT
             o.id AS active_organization_id,
             COALESCE(ci.public_token, 'subbot_direct') AS public_token_used,
             c.session_state_json AS session_state_json,
             o.name AS org_name,
             o.slug AS org_slug,
             o.is_active AS org_active,
             ci.id AS integration_id,
             ci.status AS integration_status,
             COALESCE(ci.public_token, 'subbot_direct') AS current_public_token,
             ci.config_json AS config_json
           FROM organizations o
           LEFT JOIN channel_integrations ci
             ON ci.organization_id = o.id AND ci.channel = 'telegram'
           LEFT JOIN telegram_customer_contexts c
             ON c.telegram_user_id = ?
           WHERE o.id = ?`
        )
        .bind(params.telegramUserId, params.forcedOrganizationId)
        .first();
    } else {
      contextRow = await this.db
        .prepare(
          `SELECT c.active_organization_id, c.public_token_used, c.session_state_json,
                  o.name AS org_name, o.slug AS org_slug, o.is_active AS org_active,
                  ci.id AS integration_id, ci.status AS integration_status, ci.public_token AS current_public_token, ci.config_json
           FROM telegram_customer_contexts c
           JOIN organizations o ON o.id = c.active_organization_id
           LEFT JOIN channel_integrations ci
             ON ci.organization_id = c.active_organization_id AND ci.channel = 'telegram'
           WHERE c.telegram_user_id = ?`
        )
        .bind(params.telegramUserId)
        .first<{
          active_organization_id: string;
          public_token_used: string;
          session_state_json?: string | null;
          org_name: string;
          org_slug: string;
          org_active: number;
          integration_id: string | null;
          integration_status: string | null;
          current_public_token: string | null;
          config_json: string | null;
        }>()
        .catch(async () => {
          return this.db
            .prepare(
              `SELECT c.active_organization_id, c.public_token_used,
                      o.name AS org_name, o.slug AS org_slug, o.is_active AS org_active,
                      ci.id AS integration_id, ci.status AS integration_status, ci.public_token AS current_public_token, ci.config_json
               FROM telegram_customer_contexts c
               JOIN organizations o ON o.id = c.active_organization_id
               LEFT JOIN channel_integrations ci
                 ON ci.organization_id = c.active_organization_id AND ci.channel = 'telegram'
               WHERE c.telegram_user_id = ?`
            )
            .bind(params.telegramUserId)
            .first<{
              active_organization_id: string;
              public_token_used: string;
              session_state_json?: string | null;
              org_name: string;
              org_slug: string;
              org_active: number;
              integration_id: string | null;
              integration_status: string | null;
              current_public_token: string | null;
              config_json: string | null;
            }>();
        });
    }

    if (
      !contextRow ||
      !contextRow.org_active ||
      contextRow.integration_status !== 'active' ||
      (!params.forcedOrganizationId &&
        (!contextRow.current_public_token ||
          contextRow.current_public_token !== contextRow.public_token_used))
    ) {
      const firstName =
        params.displayName
          .trim()
          .split(/\s+/)[0]
          ?.replace(/[^a-zA-Z0-9\u00C0-\u024F'-]/g, '') || 'there';

      const replyText =
        `👋 Hi ${firstName}! Welcome to the CustomCare Business & Agent Hub (@${this.defaultCentralBotUsername}).\n\n` +
        `🏢 For Business Owners & Support Agents:\n` +
        `1. Sign in to https://getcustomcare.xyz/login (or register at https://getcustomcare.xyz/onboarding)\n` +
        `2. Open Channels & Integrations -> Telegram Agent Companion and tap "Generate Linking Code"\n` +
        `3. Send your single-use code (e.g. AG-...) here to link your workspace and connect your own @BotFather sub-bot!\n\n` +
        `💬 For Customers Seeking Support:\n` +
        `Please open a valid business support link (e.g. https://t.me/${this.defaultCentralBotUsername}?start=BUSINESS_TOKEN) or message the business's dedicated Telegram support bot directly.`;
      await this.sendTelegram(
        {
          chatId: params.telegramChatId,
          text: replyText,
          callbackQueryId: params.callbackQueryId,
        },
        params.botToken
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        replyText,
      };
    }

    const organizationId = contextRow.active_organization_id;
    const now = new Date().toISOString();
    const portalSettings = await this.workspaceRepo.getWorkspaceSettings(organizationId);

    let tgConfig = this.getDefaultTelegramConfig(
      contextRow.org_name,
      portalSettings.chatbot.supportedTopics
    );
    if (contextRow.config_json) {
      try {
        tgConfig = {
          ...tgConfig,
          ...(JSON.parse(contextRow.config_json) as Partial<TelegramChannelConfig>),
        };
      } catch {
        // ignore
      }
    }

    // Retrieve or create customer identity for this business
    let identity = await this.db
      .prepare(
        `SELECT * FROM channel_customer_identities
         WHERE organization_id = ? AND channel = 'telegram' AND external_user_id = ?`
      )
      .bind(organizationId, params.telegramUserId)
      .first<{
        id: string;
        active_conversation_id: string | null;
        email: string;
        session_state_json?: string | null;
      }>();

    const syntheticEmail = `tg.${params.telegramUserId}@telegram.customer`;
    if (!identity) {
      const cid = createChannelId('cid');
      await this.db
        .prepare(
          `INSERT INTO channel_customer_identities
             (id, organization_id, channel, external_user_id, external_chat_id, external_username, display_name, email, verified_email, last_interaction_at, created_at, updated_at)
           VALUES (?, ?, 'telegram', ?, ?, ?, ?, ?, 0, ?, ?, ?)`
        )
        .bind(
          cid,
          organizationId,
          params.telegramUserId,
          params.telegramChatId,
          params.telegramUsername,
          params.displayName,
          syntheticEmail,
          now,
          now,
          now
        )
        .run();
      identity = {
        id: cid,
        active_conversation_id: null,
        email: syntheticEmail,
        session_state_json: '{}',
      };
    }

    const sessionState = this.parseCustomerSessionState(
      identity.session_state_json || contextRow.session_state_json
    );

    // Load all active conversations for this customer in this business
    const allOrgConvs = await this.workspaceRepo.listConversations(organizationId, {
      includeInternalNotes: false,
    });
    const customerActiveConvs = allOrgConvs.filter(
      (c) =>
        c.channel === SupportChannel.Telegram &&
        (c.customerExternalRef === `tg:${params.telegramUserId}` ||
          c.sourceChannelRef === params.telegramChatId) &&
        c.status !== ConversationStatus.Resolved &&
        c.status !== ConversationStatus.Closed
    );

    let activeConv: WorkspaceConversationItem | null = null;
    if (identity.active_conversation_id) {
      activeConv =
        customerActiveConvs.find((c) => c.id === identity!.active_conversation_id) ?? null;
    }

    const sendCustomerOutput = async (
      text: string,
      replyMarkup?: Record<string, unknown>
    ): Promise<string> => {
      await this.sendTelegram(
        {
          chatId: params.telegramChatId,
          text,
          replyMarkup,
          callbackQueryId: params.callbackQueryId,
        },
        params.botToken
      );
      return text;
    };

    /* -----------------------------------------------------------------------
       A. Handle File & Photo Attachments (Phase 6)
    ----------------------------------------------------------------------- */
    const hasAttachment = Boolean(params.photo?.length || params.document);
    if (hasAttachment) {
      const validation = this.validateTelegramAttachmentInput({
        photo: params.photo,
        document: params.document,
      });

      if (!validation.valid || !validation.fileId) {
        const replyText = await sendCustomerOutput(
          validation.errorMessage ||
            `⚠️ Could not process that attachment. Please upload a valid image (JPG, PNG, WebP) or document (PDF, TXT, CSV, DOCX) under 10 MB.`,
          this.buildNavigationFooterKeyboard('cc:menu:main', true)
        );
        return {
          handled: true,
          deduplicated: false,
          mode: 'customer',
          organizationId,
          conversationId: activeConv?.id,
          replyText,
        };
      }

      const categoryForAttachment =
        sessionState.selectedCategory ||
        activeConv?.category ||
        (sessionState.step.startsWith('payment')
          ? 'Payment or Deposit Issues'
          : sessionState.step.startsWith('product')
            ? 'Product Support'
            : sessionState.step.startsWith('technical')
              ? 'Technical Issues'
              : 'General Support');

      const captionText = params.text
        ? `${params.text}\n[Attachment: ${validation.fileName} (${validation.mimeType})]`
        : `[Uploaded attachment: ${validation.fileName} (${validation.mimeType})]`;

      activeConv = await this.ensureOrAppendCustomerConversation({
        organizationId,
        displayName: params.displayName,
        email: identity.email || syntheticEmail,
        telegramUserId: params.telegramUserId,
        telegramChatId: params.telegramChatId,
        identityId: identity.id,
        activeConv,
        category: categoryForAttachment,
        subject: params.text || `Attachment: ${validation.fileName}`,
        messageBody: captionText,
        targetStatus: activeConv?.status ?? ConversationStatus.Open,
        priority: activeConv?.priority ?? EscalationPriority.Normal,
        externalMessageId: params.externalMessageId,
      });

      const lastCustomerMsg = activeConv.messages
        .filter((m) => m.senderType === MessageSenderType.Customer)
        .pop();

      await this.workspaceRepo.createConversationAttachment({
        organizationId,
        conversationId: activeConv.id,
        messageId: lastCustomerMsg?.id ?? null,
        channel: SupportChannel.Telegram,
        fileName: validation.fileName!,
        mimeType: validation.mimeType!,
        fileSize: validation.fileSize ?? 0,
        externalFileId: validation.fileId,
      });

      const ackText =
        `📎 Attachment received ("${validation.fileName}") and securely linked to your ${contextRow.org_name} support conversation (${activeConv.id}).\n\n` +
        `You can add any additional details below, or tap "👤 Speak to an Agent" if you would like a support specialist to review your file right away.`;

      activeConv = await this.workspaceRepo.replyToConversation({
        organizationId,
        conversationId: activeConv.id,
        senderName: `${contextRow.org_name} Assistant`,
        senderType: MessageSenderType.Bot,
        body: ackText,
      });

      await sendCustomerOutput(
        ackText,
        this.buildNavigationFooterKeyboard('cc:menu:main', true)
      );

      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv.id,
        replyText: ackText,
      };
    }

    /* -----------------------------------------------------------------------
       B. Handle Interactive Inline Button Callbacks, Navigation & Natural Greetings ("Hi", "Hello")
    ----------------------------------------------------------------------- */
    const cb = params.callbackData?.trim() || '';
    const lowerText = params.text.trim().toLowerCase();

    // Check if the customer sent a natural conversational greeting like "Hi", "Hello", "Good morning"
    const greetingIntent = !cb
      ? this.classifyCustomerGreetingIntent(params.text)
      : { type: 'none' as const, cleanedQuestion: params.text };

    // 1. Explicit Support Menu requests: /menu, /categories, /start, cc:menu:main, cc:cancel
    if (
      cb === 'cc:menu:main' ||
      cb === 'cc:cancel' ||
      lowerText === '/menu' ||
      lowerText === '/categories' ||
      lowerText === '/start'
    ) {
      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: { step: 'main_menu', updatedAt: now },
      });

      const menuHeader =
        cb === 'cc:cancel'
          ? `✖️ Current action cancelled.\n\nWelcome back to ${contextRow.org_name} Support! How can we help you today?`
          : lowerText === '/start'
            ? this.formatPersonalizedCustomerWelcome({
                customerDisplayName: params.displayName,
                businessName: contextRow.org_name,
                welcomeMessageTemplate: tgConfig.welcomeMessage,
                supportCategories: tgConfig.supportCategories,
                isConversationalGreeting: false,
              })
            : `🏠 ${contextRow.org_name} Support Menu\n\nChoose a support category below or type your question in your own words:`;

      const replyMarkup = this.buildMainMenuInlineKeyboard({
        portalSettings,
        tgConfig,
        activeConversationsCount: customerActiveConvs.length,
      });

      const replyText = await sendCustomerOutput(menuHeader, replyMarkup);
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    // 2. Natural Casual Greetings ("Hi", "Hello", "Hey", "Good morning", "How are you?")
    // Acts the same as the web bot: sends a friendly, casual greeting WITHOUT dumping the command menu or inline keyboards!
    if (greetingIntent.type === 'pure_greeting') {
      const firstName =
        params.displayName
          .trim()
          .split(/\s+/)[0]
          ?.replace(/[^a-zA-Z0-9\u00C0-\u024F'-]/g, '') || 'there';

      const template = (tgConfig.welcomeMessage || '').trim();
      let casualGreeting: string;

      if (
        template &&
        !template.includes('Available Support Topics') &&
        !template.includes('Choose an option') &&
        !template.includes('Ask a question below or choose')
      ) {
        casualGreeting = template
          .replace(/\{(name|first_name|customer_name)\}/gi, firstName)
          .replace(/\{(business|business_name|company)\}/gi, contextRow.org_name);
      } else {
        casualGreeting = `Hi there! How can ${contextRow.org_name} help you today?`;
      }

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: { step: 'other_enquiry', updatedAt: now },
      });

      activeConv = await this.ensureOrAppendCustomerConversation({
        organizationId,
        displayName: params.displayName,
        email: identity.email || syntheticEmail,
        telegramUserId: params.telegramUserId,
        telegramChatId: params.telegramChatId,
        identityId: identity.id,
        activeConv,
        category: tgConfig.supportCategories[0] || 'General Support',
        subject: params.text.slice(0, 90),
        messageBody: params.text,
        targetStatus: ConversationStatus.Open,
        priority: EscalationPriority.Normal,
        externalMessageId: params.externalMessageId,
      });

      activeConv = await this.workspaceRepo.replyToConversation({
        organizationId,
        conversationId: activeConv.id,
        senderName: `${contextRow.org_name} Assistant`,
        senderType: MessageSenderType.Bot,
        body: casualGreeting,
        nextStatus: ConversationStatus.Open,
      });

      // No inline keyboard attached: keeps chat clean and casual like the web bot!
      const replyText = await sendCustomerOutput(casualGreeting);
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv.id,
        replyText,
      };
    }

    // Start New Enquiry (`cc:conv:new` or `/new`)
    if (cb === 'cc:conv:new' || lowerText === '/new') {
      await this.db
        .prepare(
          `UPDATE channel_customer_identities
           SET active_conversation_id = NULL, updated_at = ?
           WHERE id = ?`
        )
        .bind(now, identity.id)
        .run();

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: { step: 'main_menu', updatedAt: now },
      });

      const replyText = await sendCustomerOutput(
        `🆕 Ready to start a new support enquiry with ${contextRow.org_name}.\n\nSelect a topic below or describe your new question:`,
        this.buildMainMenuInlineKeyboard({
          portalSettings,
          tgConfig,
          activeConversationsCount: customerActiveConvs.length,
        })
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        replyText,
      };
    }

    // List / Switch Active Conversations (`cc:conv:list` or `/conversations`)
    if (cb === 'cc:conv:list' || lowerText === '/conversations') {
      if (customerActiveConvs.length === 0) {
        const replyText = await sendCustomerOutput(
          `📂 You have no open conversations with ${contextRow.org_name} right now. Choose a category below or send a message to start one:`,
          this.buildMainMenuInlineKeyboard({
            portalSettings,
            tgConfig,
            activeConversationsCount: 0,
          })
        );
        return {
          handled: true,
          deduplicated: false,
          mode: 'customer',
          organizationId,
          replyText,
        };
      }

      const convButtons = customerActiveConvs.slice(0, 5).map((c) => [
        {
          text: `${c.id === activeConv?.id ? '✅ ' : '📂 '}${c.category}: ${c.subject.slice(0, 26)} (${c.status})`,
          callback_data: `cc:conv:sel:${c.id}`,
        },
      ]);
      convButtons.push([
        { text: '🆕 Start New Enquiry', callback_data: 'cc:conv:new' },
        { text: '🏠 Main Menu', callback_data: 'cc:menu:main' },
      ]);

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: { step: 'conversation_select', updatedAt: now },
      });

      const listLines = customerActiveConvs
        .slice(0, 5)
        .map(
          (c) =>
            `• [${c.id}] ${c.category} — "${c.subject}" (${c.status.toUpperCase()})${
              c.id === activeConv?.id ? ' [ACTIVE]' : ''
            }`
        )
        .join('\n');

      const replyText = await sendCustomerOutput(
        `📂 Your Active Conversations with ${contextRow.org_name}:\n\n${listLines}\n\nSelect a conversation below to continue it, or start a new enquiry:`,
        { inline_keyboard: convButtons }
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    // Select a specific conversation (`cc:conv:sel:<convId>`)
    if (cb.startsWith('cc:conv:sel:')) {
      const targetConvId = cb.slice('cc:conv:sel:'.length).trim();
      const chosen = customerActiveConvs.find((c) => c.id === targetConvId);
      if (!chosen) {
        const replyText = await sendCustomerOutput(
          `⚠️ That conversation is no longer active or could not be found. Returning to the main menu:`,
          this.buildMainMenuInlineKeyboard({
            portalSettings,
            tgConfig,
            activeConversationsCount: customerActiveConvs.length,
          })
        );
        return {
          handled: true,
          deduplicated: false,
          mode: 'customer',
          organizationId,
          replyText,
        };
      }

      await this.db
        .prepare(
          `UPDATE channel_customer_identities
           SET active_conversation_id = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(chosen.id, now, identity.id)
        .run();

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          step: 'main_menu',
          selectedCategory: chosen.category,
          updatedAt: now,
        },
      });

      const lastMsg = chosen.messages[chosen.messages.length - 1];
      const replyText = await sendCustomerOutput(
        `✅ Switched to conversation ${chosen.id} (${chosen.category}).\n` +
          `Status: ${chosen.status.toUpperCase()}${
            chosen.assignedAgentName ? ` · Assigned Specialist: ${chosen.assignedAgentName}` : ''
          }\n` +
          `${lastMsg ? `\nLatest message: "${lastMsg.body.slice(0, 140)}"\n` : ''}\n` +
          `Send your next message or attachment below to continue this conversation.`,
        this.buildNavigationFooterKeyboard('cc:conv:list', true)
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: chosen.id,
        replyText,
      };
    }

    /* -----------------------------------------------------------------------
       C. Category 1: Payment or Deposit Issues (`cc:cat:payment` & `cc:pay:*`)
    ----------------------------------------------------------------------- */
    if (cb === 'cc:cat:payment') {
      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          step: 'payment_menu',
          selectedCategory: 'Payment or Deposit Issues',
          updatedAt: now,
        },
      });

      const replyText = await sendCustomerOutput(
        `💳 Payment or Deposit Assistance (${contextRow.org_name})\n\n` +
          `Please select the option that best describes your payment or deposit issue:\n\n` +
          `🔒 Security Reminder: ${contextRow.org_name} will NEVER ask for your password, PIN, OTP, or full payment card number.`,
        this.buildPaymentMenuKeyboard()
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    if (cb.startsWith('cc:pay:')) {
      const subKey = cb.slice('cc:pay:'.length);
      const subLabelMap: Record<string, string> = {
        pending: 'My payment or deposit is pending',
        debited: 'My account was debited but not credited',
        missing: 'My payment is missing',
        other: 'Another payment or deposit problem',
      };
      const subIssueLabel = subLabelMap[subKey] || 'Payment or deposit enquiry';

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          step: 'payment_awaiting_details',
          selectedCategory: 'Payment or Deposit Issues',
          selectedSubIssue: subIssueLabel,
          updatedAt: now,
        },
      });

      // Find any published payment/deposit procedure or FAQ from the business settings
      const paymentProc = (portalSettings.procedures || []).find(
        (p) =>
          p.isPublished &&
          /deposit|payment|billing|transfer|balance/i.test(`${p.title} ${p.category}`)
      );
      const procStepsText = paymentProc
        ? `\n\n📋 Recommended Verification Steps (${paymentProc.title}):\n` +
          paymentProc.steps.map((s) => `${s.stepNumber}. ${s.instruction}`).join('\n')
        : `\n\n📋 Initial Verification Checklist:\n` +
          `1. Check that your payment confirmation receipt shows a completed transfer.\n` +
          `2. Verify the account identifier on the receipt matches your registered profile.\n` +
          `3. Note that automated payment status is only confirmed once verified by ${contextRow.org_name}'s billing system or specialist team.`;

      const promptText =
        `💳 Selected: ${subIssueLabel}${procStepsText}\n\n` +
        `To help us investigate or record your payment enquiry accurately, please reply with:\n` +
        `• Your transaction reference or receipt ID\n` +
        `• The payment date and amount\n` +
        `• (Optional) Upload a payment confirmation screenshot or PDF receipt directly in this chat\n\n` +
        `🔒 Never share your password, OTP, PIN, or full card number.`;

      const replyText = await sendCustomerOutput(
        promptText,
        this.buildNavigationFooterKeyboard('cc:cat:payment', true)
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    /* -----------------------------------------------------------------------
       D. Category 2: Product Support (`cc:cat:product` & `cc:prod:*`)
    ----------------------------------------------------------------------- */
    if (cb === 'cc:cat:product') {
      const products = this.resolveConfiguredBusinessProducts(portalSettings, tgConfig);
      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          step: 'product_select',
          selectedCategory: 'Product Support',
          updatedAt: now,
        },
      });

      const productButtons = products.map((prod, idx) => [
        {
          text: `📦 ${prod.slice(0, 34)}`,
          callback_data: `cc:prod:${idx}`,
        },
      ]);
      productButtons.push([
        { text: '👤 Speak to an Agent', callback_data: 'cc:human' },
        { text: '🏠 Main Menu', callback_data: 'cc:menu:main' },
      ]);

      const replyText = await sendCustomerOutput(
        `📦 Product & Service Support (${contextRow.org_name})\n\n` +
          `Select the product or topic you need assistance with below, or type your product question directly:`,
        { inline_keyboard: productButtons }
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    if (cb.startsWith('cc:prod:')) {
      const idx = Number(cb.slice('cc:prod:'.length));
      const products = this.resolveConfiguredBusinessProducts(portalSettings, tgConfig);
      const selectedProduct = products[idx] || products[0] || 'Product Support';

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          step: 'product_issue',
          selectedCategory: 'Product Support',
          selectedProduct,
          updatedAt: now,
        },
      });

      // Retrieve any matching published article or FAQ for this product
      const kbAnswer = await this.workspaceRepo.answerPortalQuestion(
        contextRow.org_slug,
        selectedProduct,
        {
          requirePublished: false,
          viewerOrganizationId: organizationId,
        }
      );

      const kbPreview =
        kbAnswer && kbAnswer.resolutionLayer !== 'human-escalation'
          ? `\n\n📘 Official Guidance:\n${kbAnswer.reply}`
          : '';

      const replyText = await sendCustomerOutput(
        `📦 Product Selected: ${selectedProduct}${kbPreview}\n\n` +
          `Please describe the issue you are experiencing or ask a question about ${selectedProduct}, and we will check ${contextRow.org_name}'s verified documentation or connect you with a specialist.`,
        this.buildNavigationFooterKeyboard('cc:cat:product', true)
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    /* -----------------------------------------------------------------------
       E. Category 3: Technical Issues (`cc:cat:technical` & `cc:tech:*`)
    ----------------------------------------------------------------------- */
    if (cb === 'cc:cat:technical') {
      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          step: 'technical_menu',
          selectedCategory: 'Technical Issues',
          updatedAt: now,
        },
      });

      const replyText = await sendCustomerOutput(
        `⚙️ Technical Support (${contextRow.org_name})\n\n` +
          `Which technical issue are you experiencing? Choose an option below or describe the error message:`,
        this.buildTechnicalMenuKeyboard()
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    if (cb.startsWith('cc:tech:')) {
      const techKey = cb.slice('cc:tech:'.length);
      const techLabels: Record<string, { label: string; steps: string[] }> = {
        app_open: {
          label: 'Application not opening',
          steps: [
            '1. Check your internet connection and close any background VPN or proxy.',
            '2. Force-close and reopen the application or refresh your browser tab.',
            '3. Ensure you are running the latest version or try opening in a private/incognito window.',
          ],
        },
        login: {
          label: 'Login problems',
          steps: [
            '1. Verify that your registered email address is spelled correctly.',
            '2. Check if multi-factor authentication (MFA) or email verification is required.',
            '3. Use the official password reset option if you cannot recall your password (never share your password in chat).',
          ],
        },
        features: {
          label: 'Features not working',
          steps: [
            '1. Verify that all required fields on the current screen are completed.',
            '2. Refresh your active session to reload workspace permissions.',
            '3. Share a screenshot of the screen if a button or control remains disabled.',
          ],
        },
        errors: {
          label: 'Errors during operation',
          steps: [
            '1. Note the exact error message or code displayed on your screen.',
            '2. Retry the action once after refreshing your session.',
            '3. Send the error text or a screenshot below so our team can inspect it.',
          ],
        },
        failed_tx: {
          label: 'Failed transactions',
          steps: [
            '1. Check whether a transaction reference or error notice was generated.',
            '2. Avoid submitting duplicate transactions immediately if a transfer is still processing.',
            '3. Reply below with the timestamp and reference so we can check the status.',
          ],
        },
        other: {
          label: 'Other technical difficulties',
          steps: [
            '1. Describe what you were trying to do when the issue occurred.',
            '2. Include your device/browser type and any error message or screenshot.',
          ],
        },
      };

      const chosenTech = techLabels[techKey] ?? techLabels.other!;

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          step: 'technical_awaiting_details',
          selectedCategory: 'Technical Issues',
          selectedSubIssue: chosenTech.label,
          updatedAt: now,
        },
      });

      // Check if business has a custom published procedure matching technical/workspace issues
      const customTechProc = (portalSettings.procedures || []).find(
        (p) =>
          p.isPublished &&
          !/deposit|payment/i.test(`${p.title} ${p.category}`)
      );

      const stepsBlock = customTechProc
        ? customTechProc.steps.map((s) => `${s.stepNumber}. ${s.instruction}`).join('\n')
        : chosenTech.steps.join('\n');

      const replyText = await sendCustomerOutput(
        `⚙️ Technical Issue: ${chosenTech.label}\n\n` +
          `🛠️ Recommended Troubleshooting Steps:\n${stepsBlock}\n\n` +
          `If the problem continues, please reply below with what happened (or upload a screenshot), or tap "👤 Speak to an Agent" to escalate to ${contextRow.org_name}'s technical team.`,
        this.buildNavigationFooterKeyboard('cc:cat:technical', true)
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    /* -----------------------------------------------------------------------
       F. Category 4 & Custom Categories: Other Enquiries (`cc:cat:other` / `cc:customcat:*`)
    ----------------------------------------------------------------------- */
    if (cb === 'cc:cat:other' || cb.startsWith('cc:customcat:')) {
      let chosenCategory = 'Other Enquiries';
      if (cb.startsWith('cc:customcat:')) {
        const idx = Number(cb.slice('cc:customcat:'.length));
        const coreKeywords = ['payment', 'deposit', 'billing', 'product', 'technical', 'other', 'general'];
        const customCats = (tgConfig.supportCategories || []).filter((c) => {
          const lower = c.toLowerCase();
          return !coreKeywords.some((kw) => lower.includes(kw));
        });
        chosenCategory = customCats[idx] || 'General Support';
      }

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          step: 'other_enquiry',
          selectedCategory: chosenCategory,
          updatedAt: now,
        },
      });

      const replyText = await sendCustomerOutput(
        `💬 ${chosenCategory} (${contextRow.org_name})\n\n` +
          `Please type your question or describe how we can help you today. I will search ${contextRow.org_name}'s official knowledge base immediately or connect you with a human support agent.`,
        this.buildNavigationFooterKeyboard('cc:menu:main', true)
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'customer',
        organizationId,
        conversationId: activeConv?.id,
        replyText,
      };
    }

    /* -----------------------------------------------------------------------
       G. Speak to a Human Agent (`cc:human` or `/human` or natural language)
    ----------------------------------------------------------------------- */
    const explicitHumanRequest =
      cb === 'cc:human' ||
      /^\/(human|escalate|agent)\b/i.test(params.text) ||
      /\b(human|agent|person|representative|specialist|talk to someone|live support)\b/i.test(
        params.text
      );

    // Security check: if customer accidentally sends sensitive credentials (PIN/OTP/Password/Full card)
    const containsSensitiveSecretPattern =
      /\b(my password is|my pin is|my otp is)\b/i.test(params.text) ||
      /\b(?:\d[ -]*?){15,16}\b/.test(params.text);

    const queryTextForKb =
      greetingIntent.type === 'greeting_with_question'
        ? greetingIntent.cleanedQuestion
        : params.text;

    const effectiveCustomerText =
      cb === 'cc:human'
        ? `Customer requested to speak with a human support agent${
            sessionState.selectedCategory ? ` regarding ${sessionState.selectedCategory}` : ''
          }${sessionState.selectedSubIssue ? ` (${sessionState.selectedSubIssue})` : ''}.`
        : params.text;

    // Run priority-ordered natural language resolution (Rules -> KB -> Procedures -> Optional AI Fallback -> Escalation)
    const botAnswer =
      cb === 'cc:human'
        ? null
        : await this.workspaceRepo.answerPortalQuestion(
            contextRow.org_slug,
            queryTextForKb,
            {
              requirePublished: false,
              viewerOrganizationId: organizationId,
              aiCompletionHandler: this.aiCompletionHandler,
            }
          );

    const isPaymentDetailsSubmission =
      sessionState.step === 'payment_awaiting_details' && !cb;
    const isTechnicalDetailsSubmission =
      sessionState.step === 'technical_awaiting_details' && !cb;
    const isProductIssueSubmission =
      sessionState.step === 'product_issue' && !cb;

    const shouldEscalate =
      tgConfig.allowHumanEscalation &&
      (explicitHumanRequest ||
        isPaymentDetailsSubmission ||
        botAnswer?.resolutionLayer === 'human-escalation');

    const targetStatus = shouldEscalate
      ? ConversationStatus.Escalated
      : ConversationStatus.Open;

    const resolvedCategory =
      sessionState.selectedCategory ||
      botAnswer?.suggestedTopic ||
      tgConfig.supportCategories[0] ||
      'General Support';

    const diagnosticContextParts = [
      sessionState.selectedCategory ? `Category: ${sessionState.selectedCategory}` : '',
      sessionState.selectedSubIssue ? `Issue: ${sessionState.selectedSubIssue}` : '',
      sessionState.selectedProduct ? `Product: ${sessionState.selectedProduct}` : '',
    ].filter(Boolean);

    const subjectLine =
      sessionState.selectedSubIssue ||
      sessionState.selectedProduct ||
      effectiveCustomerText.slice(0, 90);

    activeConv = await this.ensureOrAppendCustomerConversation({
      organizationId,
      displayName: params.displayName,
      email: identity.email || syntheticEmail,
      telegramUserId: params.telegramUserId,
      telegramChatId: params.telegramChatId,
      identityId: identity.id,
      activeConv,
      category: resolvedCategory,
      subject: subjectLine,
      messageBody: effectiveCustomerText,
      targetStatus,
      priority: shouldEscalate
        ? tgConfig.escalationPriorityDefault
        : EscalationPriority.Normal,
      transcriptSummary:
        diagnosticContextParts.length > 0 ? diagnosticContextParts.join(' · ') : undefined,
      externalMessageId: params.externalMessageId,
    });

    const firstName =
      params.displayName
        .trim()
        .split(/\s+/)[0]
        ?.replace(/[^a-zA-Z0-9\u00C0-\u024F'-]/g, '') || 'there';

    const greetingPrefix =
      greetingIntent.type === 'greeting_with_question'
        ? `Hi ${firstName}! 👋\n\n`
        : '';

    const securityWarningPrefix = containsSensitiveSecretPattern
      ? `🔒 Security Notice: Please never share passwords, PINs, OTPs, or full card numbers in chat. ${contextRow.org_name} specialists will never require them.\n\n`
      : '';

    let replyText: string;

    if (isPaymentDetailsSubmission && !explicitHumanRequest) {
      const { availableCount } = await this.countAvailableAgentsForOrg(organizationId);
      const availabilityLine =
        availableCount > 0
          ? `A support specialist (${activeConv.assignedAgentName || 'Billing Team'}) has been notified and will review your payment details.`
          : `Our support specialists are currently offline or assisting other customers. Your payment details are saved in our priority queue (${
              portalSettings.supportHours ? `Hours: ${portalSettings.supportHours}` : tgConfig.offlineMessage
            }).`;

      replyText =
        `${securityWarningPrefix}${greetingPrefix}📋 Thank you. Your payment enquiry details have been recorded under conversation ${activeConv.id} (${sessionState.selectedSubIssue || 'Payment Support'}).\n\n` +
        `Note: Your payment status is pending specialist verification and has not yet been confirmed by an automated integration.\n\n` +
        `🤝 ${availabilityLine}\n` +
        `You can upload a payment receipt screenshot anytime or continue messaging here.`;

      await this.saveCustomerSessionState({
        identityId: identity.id,
        telegramUserId: params.telegramUserId,
        state: {
          ...sessionState,
          step: 'main_menu',
          pendingTransactionRef: effectiveCustomerText.slice(0, 120),
          updatedAt: now,
        },
      });
    } else if (shouldEscalate) {
      const { availableCount } = await this.countAvailableAgentsForOrg(organizationId);
      const honestAgentStatus =
        availableCount > 0
          ? `A specialist will reply here shortly.`
          : `No human support agents are currently online (${
              portalSettings.supportHours ? `Operating hours: ${portalSettings.supportHours}` : 'currently offline'
            }). A specialist will reply as soon as they are available.`;

      replyText =
        `${securityWarningPrefix}${greetingPrefix}` +
        `Your conversation has been escalated to ${contextRow.org_name}'s human support team. ${honestAgentStatus}`;
    } else {
      const contextPrefix =
        isProductIssueSubmission && sessionState.selectedProduct
          ? `📦 [${sessionState.selectedProduct}]\n`
          : isTechnicalDetailsSubmission && sessionState.selectedSubIssue
            ? `⚙️ [${sessionState.selectedSubIssue}]\n`
            : '';

      replyText =
        `${securityWarningPrefix}${greetingPrefix}${contextPrefix}` +
        (botAnswer?.reply ??
          `Thank you for contacting ${contextRow.org_name}. How can we help you today?`);
    }

    // Record bot response inside the unified conversation timeline
    activeConv = await this.workspaceRepo.replyToConversation({
      organizationId,
      conversationId: activeConv.id,
      senderName: `${contextRow.org_name} Assistant`,
      senderType: MessageSenderType.Bot,
      body: replyText,
      nextStatus: targetStatus,
    });

    // Send without bot feature buttons on regular chat / answers / escalations to match web bot experience
    await sendCustomerOutput(replyText);

    if (shouldEscalate && tgConfig.notifyAssignedAgentOnTelegram) {
      await this.notifyLinkedAgentsOfEscalation({
        organizationId,
        organizationName: contextRow.org_name,
        conversation: activeConv,
        botToken: params.botToken,
      });
    }

    return {
      handled: true,
      deduplicated: false,
      mode: 'customer',
      organizationId,
      conversationId: activeConv.id,
      replyText,
    };
  }

  /* =========================================================================
     6. Agent & Business Hub Telegram Interface Handler (Synchronized with Web Workspace)
  ========================================================================= */

  private async handleTelegramAgentInteraction(params: {
    telegramUserId: string;
    telegramChatId: string;
    rawText: string;
    callbackQueryId?: string;
    activeLink: DbTelegramAgentLinkRow & {
      user_full_name: string;
      user_email: string;
      org_name: string;
      org_slug: string;
      member_role: UserRole;
    };
    allLinks: Array<
      DbTelegramAgentLinkRow & {
        user_full_name: string;
        user_email: string;
        org_name: string;
        org_slug: string;
        member_role: UserRole;
      }
    >;
    botToken?: string;
    centralBotUsername?: string;
    appBaseUrl?: string;
  }): Promise<{
    handled: boolean;
    deduplicated: boolean;
    mode: 'agent';
    organizationId: string;
    conversationId?: string;
    replyText: string;
  }> {
    const { activeLink, allLinks, rawText, telegramChatId, callbackQueryId } = params;
    const organizationId = activeLink.organization_id;
    const now = new Date().toISOString();

    const sendAgentReply = async (
      text: string,
      replyMarkup?: Record<string, unknown>
    ): Promise<string> => {
      await this.sendTelegram(
        {
          chatId: telegramChatId,
          text,
          replyMarkup,
          callbackQueryId,
        },
        params.botToken
      );
      return text;
    };

    const lower = rawText.toLowerCase();

    // /mybot or ag:mybot — Show Business's Customer Links (both Central Bot link AND connected Sub-Bot)
    if (lower === '/mybot' || lower === 'ag:mybot') {
      const integrations = await this.listChannelIntegrations(organizationId, {
        centralBotUsername: params.centralBotUsername,
        appBaseUrl: params.appBaseUrl,
      });
      const tgInt = integrations.find((i) => i.channel === 'telegram');

      const centralLinkLine =
        tgInt?.status === 'active' && tgInt.deepLinkUrl
          ? `✅ Central Customer Link (Zero-BotFather Mode):\n${tgInt.deepLinkUrl}`
          : `⚪ Central Customer Link: Not activated yet (activate in Dashboard or connect a Sub-Bot below).`;

      const subBotUsername = tgInt?.telegramConfig?.customBotUsername;
      const subBotLine = subBotUsername
        ? `✅ Dedicated Business Sub-Bot: @${subBotUsername}\nDirect Link: https://t.me/${subBotUsername}\nWebhook: ${
            tgInt?.telegramConfig?.customBotWebhookRegistered ? 'Verified & Active' : 'Configured'
          }`
        : `⚪ Dedicated Business Sub-Bot: None connected yet.\nTo connect a @BotFather bot (e.g. your CD bot), send:\n/connectbot <YOUR_BOTFATHER_TOKEN>`;

      const replyText = await sendAgentReply(
        `🤖 [${activeLink.org_name}] Customer Telegram Bot Configuration\n\n` +
          `${centralLinkLine}\n\n` +
          `${subBotLine}\n\n` +
          `💡 Customers can message either link with "/start" or simply "Hi" / "Hello" to receive personalized support!`,
        {
          inline_keyboard: [
            [
              { text: '🤖 Connect / Update Sub-Bot', callback_data: 'ag:connectbot_prompt' },
              ...(subBotUsername
                ? [{ text: '🔌 Disconnect Sub-Bot', callback_data: 'ag:disconnectbot' }]
                : []),
            ],
            [
              { text: '📥 Unassigned Queue', callback_data: 'ag:unassigned' },
              { text: '📋 My Assigned Chats', callback_data: 'ag:my' },
            ],
          ],
        }
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // ag:connectbot_prompt or bare /connectbot
    if (lower === '/connectbot' || lower === 'ag:connectbot_prompt') {
      const replyText = await sendAgentReply(
        `🤖 Connect a Dedicated Sub-Bot for ${activeLink.org_name}\n\n` +
          `1. Open @BotFather in Telegram and copy your bot's API token (looks like 123456789:AAH...).\n` +
          `2. Paste the token directly in this chat (or send /connectbot <TOKEN>).\n\n` +
          `CustomCare will automatically configure its serverless webhook, slash commands, natural-language greeting ("Hi"), and knowledge base!`
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // /connectbot <TOKEN>
    if (lower.startsWith('/connectbot ')) {
      if (
        activeLink.member_role !== UserRole.Owner &&
        activeLink.member_role !== UserRole.Admin
      ) {
        const replyText = await sendAgentReply(
          `⛔ FORBIDDEN: Only Workspace Owners and Administrators can connect or modify a business sub-bot token.`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }

      const rawToken = rawText.slice('/connectbot '.length).trim();
      try {
        const connected = await this.connectBusinessTelegramSubBot({
          organizationId,
          rawBotToken: rawToken,
          appBaseUrl: params.appBaseUrl,
        });

        const replyText = await sendAgentReply(
          `✅ Dedicated Sub-Bot Connected for ${activeLink.org_name}!\n\n` +
            `• Bot: @${connected.botUsername} (${connected.botFirstName || connected.botUsername})\n` +
            `• Direct Customer Link: https://t.me/${connected.botUsername}\n` +
            `• Serverless Webhook: ${connected.webhookRegistered ? 'Active & Verified' : 'Configured'}\n\n` +
            `Open https://t.me/${connected.botUsername} right now and send "Hi" or "/start" to test your personalized business support bot!`,
          {
            inline_keyboard: [
              [{ text: '🔗 View Bot Status', callback_data: 'ag:mybot' }],
              [{ text: '📥 Unassigned Queue', callback_data: 'ag:unassigned' }],
            ],
          }
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      } catch (err) {
        const replyText = await sendAgentReply(
          `❌ Failed to connect Sub-Bot: ${
            err instanceof Error ? err.message : 'Invalid token or Telegram API error.'
          }`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }
    }

    // /disconnectbot or ag:disconnectbot
    if (lower === '/disconnectbot' || lower === 'ag:disconnectbot') {
      if (
        activeLink.member_role !== UserRole.Owner &&
        activeLink.member_role !== UserRole.Admin
      ) {
        const replyText = await sendAgentReply(
          `⛔ FORBIDDEN: Only Workspace Owners and Administrators can disconnect a business sub-bot.`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }

      await this.disconnectBusinessTelegramSubBot(organizationId);
      const replyText = await sendAgentReply(
        `🔌 Disconnected the custom sub-bot from ${activeLink.org_name}. Your central @${this.defaultCentralBotUsername} customer link remains available.`
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // /unlink
    if (lower === '/unlink') {
      await this.revokeAgentTelegramLink({
        organizationId,
        targetUserId: activeLink.user_id,
      });
      const replyText = await sendAgentReply(
        `🔌 Unlinked your Telegram account from ${activeLink.org_name}.`
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // /workspace [slug] or /switch [slug]
    if (
      lower === '/workspace' ||
      lower.startsWith('/workspace ') ||
      lower === '/switch' ||
      lower.startsWith('/switch ')
    ) {
      const cmdPrefix = lower.startsWith('/switch') ? '/switch' : '/workspace';
      const targetArg = rawText.slice(cmdPrefix.length).trim().toLowerCase();
      if (!targetArg) {
        const listLines = allLinks.map(
          (l) =>
            `• ${l.org_name} (${l.org_slug}) — Role: ${l.member_role}${
              l.organization_id === organizationId ? ' [ACTIVE]' : ''
            }`
        );
        const replyText = await sendAgentReply(
          `🏢 Linked Business Workspaces:\n${listLines.join('\n')}\n\nSwitch with: /workspace <slug>`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }

      const match = allLinks.find(
        (l) =>
          l.org_slug.toLowerCase() === targetArg ||
          l.organization_id.toLowerCase() === targetArg
      );
      if (!match) {
        const replyText = await sendAgentReply(
          `❌ You do not have an active linked agent membership for "${targetArg}".`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }

      await this.db
        .prepare(
          `UPDATE telegram_agent_links
           SET active_organization_id = ?, updated_at = ?
           WHERE telegram_user_id = ? AND status = 'linked'`
        )
        .bind(match.organization_id, now, params.telegramUserId)
        .run();

      const replyText = await sendAgentReply(
        `✅ Switched active agent workspace to ${match.org_name} (${match.member_role}).`
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'agent',
        organizationId: match.organization_id,
        replyText,
      };
    }

    // /my or ag:my
    if (lower === '/my' || lower === 'ag:my') {
      const convs = await this.workspaceRepo.listConversations(organizationId, {
        assignedAgentName: activeLink.user_full_name,
      });
      const activeConvs = convs.filter(
        (c) => c.status !== ConversationStatus.Resolved && c.status !== ConversationStatus.Closed
      );
      const summary =
        activeConvs.length === 0
          ? 'No active conversations currently assigned to you.'
          : activeConvs
              .slice(0, 8)
              .map(
                (c) =>
                  `• [${c.id}] ${c.customerName} (${c.channel}) — ${c.status.toUpperCase()} · ${c.priority.toUpperCase()}\n  "${c.subject}"`
              )
              .join('\n');
      const replyText = await sendAgentReply(
        `📋 [${activeLink.org_name}] My Assigned Conversations (${activeConvs.length}):\n${summary}`
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // /unassigned or ag:unassigned
    if (lower === '/unassigned' || lower === 'ag:unassigned') {
      const convs = await this.workspaceRepo.listConversations(organizationId, {
        unassignedOnly: true,
      });
      const summary =
        convs.length === 0
          ? 'No unassigned conversations in queue.'
          : convs
              .slice(0, 8)
              .map(
                (c) =>
                  `• [${c.id}] ${c.customerName} (${c.channel}) — ${c.priority.toUpperCase()}\n  "${c.subject}"\n  Accept: /accept ${c.id}`
              )
              .join('\n');
      const replyText = await sendAgentReply(
        `📥 [${activeLink.org_name}] Unassigned Queue (${convs.length}):\n${summary}`
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // /priority
    if (lower === '/priority') {
      const convs = await this.workspaceRepo.listConversations(organizationId, {
        priority: 'high_or_urgent',
      });
      const summary =
        convs.length === 0
          ? 'No high or urgent priority conversations.'
          : convs
              .slice(0, 8)
              .map(
                (c) =>
                  `• [${c.id}] ${c.priority.toUpperCase()} — ${c.customerName}: "${c.subject}" (${c.status})`
              )
              .join('\n');
      const replyText = await sendAgentReply(
        `🚨 [${activeLink.org_name}] High-Priority Queue (${convs.length}):\n${summary}`
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // /search <query>
    if (lower.startsWith('/search ')) {
      const q = rawText.slice('/search '.length).trim();
      const convs = await this.workspaceRepo.listConversations(organizationId, { search: q });
      const summary =
        convs.length === 0
          ? `No conversations matching "${q}".`
          : convs
              .slice(0, 6)
              .map((c) => `• [${c.id}] ${c.customerName} — "${c.subject}" (${c.status})`)
              .join('\n');
      const replyText = await sendAgentReply(
        `🔍 [${activeLink.org_name}] Search "${q}" (${convs.length}):\n${summary}`
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // /open <conv_id>
    if (lower.startsWith('/open ')) {
      const convId = rawText.slice('/open '.length).trim();
      const conv = await this.workspaceRepo.getConversationById(organizationId, convId, {
        includeInternalNotes: true,
      });
      if (!conv) {
        const replyText = await sendAgentReply(
          `❌ Conversation "${convId}" not found in ${activeLink.org_name}.`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }

      await this.db
        .prepare(`UPDATE telegram_agent_links SET active_conversation_id = ?, updated_at = ? WHERE id = ?`)
        .bind(conv.id, now, activeLink.id)
        .run();

      const recentMsgs = conv.messages
        .slice(-6)
        .map(
          (m) =>
            `${m.isInternalNote ? '🔒 [INTERNAL NOTE] ' : ''}[${m.senderName}]: ${m.body}`
        )
        .join('\n');

      const replyText = await sendAgentReply(
        `📂 Conversation ${conv.id} (${activeLink.org_name})\n` +
          `Customer: ${conv.customerName} (${conv.customerEmail})\n` +
          `Channel: ${conv.channel} · Status: ${conv.status} · Priority: ${conv.priority}\n` +
          `Assigned: ${conv.assignedAgentName ?? 'Unassigned'}\n\n` +
          `Recent History:\n${recentMsgs}\n\n` +
          `Reply with: /reply ${conv.id} <message>\n` +
          `Add private note: /note ${conv.id} <note>`
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'agent',
        organizationId,
        conversationId: conv.id,
        replyText,
      };
    }

    // /accept <conv_id>
    if (lower.startsWith('/accept ')) {
      if (activeLink.member_role === UserRole.Viewer) {
        const replyText = await sendAgentReply(
          `⛔ FORBIDDEN: Viewer role cannot accept or modify conversations.`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }

      const convId = rawText.slice('/accept '.length).trim();
      const updated = await this.workspaceRepo.updateConversationStatus({
        organizationId,
        conversationId: convId,
        assignedAgentName: activeLink.user_full_name,
        actorUserId: activeLink.user_id,
        actorName: activeLink.user_full_name,
      });

      await this.notifyCustomerOfConversationStatusChange({
        organizationId,
        conversation: updated,
        assignedAgentName: activeLink.user_full_name,
        actorName: activeLink.user_full_name,
        botToken: params.botToken,
      });

      const replyText = await sendAgentReply(
        `✅ Conversation ${updated.id} assigned to ${activeLink.user_full_name}.`
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'agent',
        organizationId,
        conversationId: updated.id,
        replyText,
      };
    }

    // /resolve <conv_id> | /reopen <conv_id> | /pending <conv_id>
    const statusMatch = rawText.match(/^\/(resolve|reopen|pending)\s+(\S+)$/i);
    if (statusMatch && statusMatch[1] && statusMatch[2]) {
      if (activeLink.member_role === UserRole.Viewer) {
        const replyText = await sendAgentReply(
          `⛔ FORBIDDEN: Viewer role cannot modify conversation status.`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }
      const cmd = statusMatch[1].toLowerCase();
      const convId = statusMatch[2].trim();
      const existingBefore = await this.workspaceRepo.getConversationById(
        organizationId,
        convId
      );
      const nextStatus =
        cmd === 'resolve'
          ? ConversationStatus.Resolved
          : cmd === 'pending'
            ? ConversationStatus.Pending
            : ConversationStatus.Open;

      const updated = await this.workspaceRepo.updateConversationStatus({
        organizationId,
        conversationId: convId,
        status: nextStatus,
        actorUserId: activeLink.user_id,
        actorName: activeLink.user_full_name,
      });

      await this.notifyCustomerOfConversationStatusChange({
        organizationId,
        conversation: updated,
        previousStatus: existingBefore?.status,
        nextStatus,
        actorName: activeLink.user_full_name,
        botToken: params.botToken,
      });

      const replyText = await sendAgentReply(
        `✅ Conversation ${updated.id} status updated to ${nextStatus.toUpperCase()}.`
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'agent',
        organizationId,
        conversationId: updated.id,
        replyText,
      };
    }

    // /availability <available|busy|offline>
    if (lower.startsWith('/availability ')) {
      const nextAvail = rawText.slice('/availability '.length).trim().toLowerCase() as AgentAvailability;
      if (!['available', 'busy', 'offline'].includes(nextAvail)) {
        const replyText = await sendAgentReply(
          `⚠️ Usage: /availability available | busy | offline`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }
      await this.db
        .prepare(
          `UPDATE support_agents SET availability = ?, updated_at = ?
           WHERE organization_id = ? AND LOWER(email) = ?`
        )
        .bind(nextAvail, now, organizationId, activeLink.user_email.toLowerCase())
        .run();

      const replyText = await sendAgentReply(
        `🟢 Your specialist availability in ${activeLink.org_name} is now set to ${nextAvail.toUpperCase()}.`
      );
      return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
    }

    // /note <conv_id> <private internal note>
    if (lower.startsWith('/note ')) {
      if (activeLink.member_role === UserRole.Viewer) {
        const replyText = await sendAgentReply(
          `⛔ FORBIDDEN: Viewer role cannot add internal notes.`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }
      const rest = rawText.slice('/note '.length).trim();
      const firstSpace = rest.indexOf(' ');
      if (firstSpace === -1) {
        const replyText = await sendAgentReply(`⚠️ Usage: /note <conv_id> <internal note text>`);
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }
      const convId = rest.slice(0, firstSpace).trim();
      const noteBody = rest.slice(firstSpace + 1).trim();

      const updated = await this.workspaceRepo.replyToConversation({
        organizationId,
        conversationId: convId,
        senderName: activeLink.user_full_name,
        senderUserId: activeLink.user_id,
        senderType: MessageSenderType.Agent,
        body: noteBody,
        isInternalNote: true,
      });

      const replyText = await sendAgentReply(
        `🔒 Internal note saved on conversation ${updated.id} (hidden from customer).`
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'agent',
        organizationId,
        conversationId: updated.id,
        replyText,
      };
    }

    // /reply <conv_id> <message> OR direct reply to active_conversation_id
    let targetConvId: string | null = null;
    let replyBodyText: string | null = null;

    if (lower.startsWith('/reply ')) {
      const rest = rawText.slice('/reply '.length).trim();
      const firstSpace = rest.indexOf(' ');
      if (firstSpace !== -1) {
        targetConvId = rest.slice(0, firstSpace).trim();
        replyBodyText = rest.slice(firstSpace + 1).trim();
      }
    } else if (!lower.startsWith('/') && activeLink.active_conversation_id) {
      targetConvId = activeLink.active_conversation_id;
      replyBodyText = rawText;
    }

    if (targetConvId && replyBodyText) {
      if (activeLink.member_role === UserRole.Viewer) {
        const replyText = await sendAgentReply(
          `⛔ FORBIDDEN: Viewer role cannot reply to customer conversations.`
        );
        return { handled: true, deduplicated: false, mode: 'agent', organizationId, replyText };
      }

      const updated = await this.workspaceRepo.replyToConversation({
        organizationId,
        conversationId: targetConvId,
        senderName: activeLink.user_full_name,
        senderUserId: activeLink.user_id,
        senderType: MessageSenderType.Agent,
        body: replyBodyText,
        isInternalNote: false,
      });

      const lastMsg = updated.messages[updated.messages.length - 1];
      if (lastMsg) {
        await this.deliverAgentReplyToExternalChannel({
          organizationId,
          conversation: updated,
          messageId: lastMsg.id,
          agentDisplayName: activeLink.user_full_name,
          body: replyBodyText,
          isInternalNote: false,
          botToken: params.botToken,
        });
      }

      const replyText = await sendAgentReply(
        `✅ Reply sent to ${updated.customerName} on conversation ${updated.id} via CustomCare.`
      );
      return {
        handled: true,
        deduplicated: false,
        mode: 'agent',
        organizationId,
        conversationId: updated.id,
        replyText,
      };
    }

    // Default /help, /start, or /agent menu (Business & Agent Hub)
    const replyText = await sendAgentReply(
      `🛠️ CustomCare Business & Agent Hub (${activeLink.org_name})\n` +
        `Agent: ${activeLink.user_full_name} (${activeLink.member_role})\n\n` +
        `Business Bot Management:\n` +
        `• /mybot — View customer bot links & Sub-Bot status\n` +
        `• /connectbot <TOKEN> — Connect a dedicated @BotFather sub-bot\n` +
        `• /disconnectbot — Disconnect custom sub-bot\n\n` +
        `Live Support Queue Commands:\n` +
        `• /my — Assigned conversations\n` +
        `• /unassigned — Unassigned queue\n` +
        `• /priority — High & urgent queue\n` +
        `• /search <query> — Search conversations\n` +
        `• /open <conv_id> — Open & inspect conversation\n` +
        `• /accept <conv_id> — Accept conversation\n` +
        `• /reply <conv_id> <message> — Send customer reply\n` +
        `• /note <conv_id> <note> — Add private internal note\n` +
        `• /resolve <conv_id> — Resolve conversation\n` +
        `• /availability <available|busy|offline> — Set availability\n` +
        `• /workspace — Switch active business`,
      {
        inline_keyboard: [
          [
            { text: '🔗 My Business Bot Links', callback_data: 'ag:mybot' },
            { text: '🤖 Connect Sub-Bot Token', callback_data: 'ag:connectbot_prompt' },
          ],
          [
            { text: '📥 Unassigned Queue', callback_data: 'ag:unassigned' },
            { text: '📋 My Assigned Chats', callback_data: 'ag:my' },
          ],
          [{ text: '🚨 High Priority Queue', callback_data: 'ag:priority' }],
        ],
      }
    );

    return {
      handled: true,
      deduplicated: false,
      mode: 'agent',
      organizationId,
      replyText,
    };
  }

  /* =========================================================================
     7. Phase 7: Optional Website Chat Widget Runtime
  ========================================================================= */

  async resolveActiveWidgetByPublicToken(publicToken: string): Promise<{
    organizationId: string;
    organizationSlug: string;
    organizationName: string;
    widgetConfig: WebWidgetChannelConfig;
    supportedTopics: string[];
  } | null> {
    if (!publicToken || !publicToken.trim().startsWith('wgt_')) {
      return null;
    }

    const row = await this.db
      .prepare(
        `SELECT ci.*, o.slug AS org_slug, o.name AS org_name, o.is_active AS org_active
         FROM channel_integrations ci
         JOIN organizations o ON o.id = ci.organization_id
         WHERE ci.channel = 'web_widget' AND ci.public_token = ?`
      )
      .bind(publicToken.trim())
      .first<
        DbChannelIntegrationRow & {
          org_slug: string;
          org_name: string;
          org_active: number;
        }
      >();

    if (!row || !row.org_active || row.status !== 'active') {
      return null;
    }

    const portalSettings = await this.workspaceRepo.getWorkspaceSettings(row.organization_id);
    let widgetConfig = this.getDefaultWidgetConfig(row.org_name);
    try {
      widgetConfig = {
        ...widgetConfig,
        ...(JSON.parse(row.config_json) as Partial<WebWidgetChannelConfig>),
      };
    } catch {
      // ignore
    }

    return {
      organizationId: row.organization_id,
      organizationSlug: row.org_slug,
      organizationName: row.org_name,
      widgetConfig,
      supportedTopics: portalSettings.chatbot.supportedTopics,
    };
  }

  async getPublicWidgetConversationBySession(
    publicToken: string,
    sessionRef: string
  ): Promise<WorkspaceConversationItem | null> {
    const resolved = await this.resolveActiveWidgetByPublicToken(publicToken);
    if (!resolved || !sessionRef.trim()) {
      return null;
    }
    const existingConvs = await this.workspaceRepo.listConversations(resolved.organizationId, {
      includeInternalNotes: false,
    });
    return (
      existingConvs.find(
        (c) => c.channel === SupportChannel.WebWidget && c.sourceChannelRef === sessionRef.trim()
      ) ?? null
    );
  }

  async handlePublicWidgetMessage(params: {
    publicToken: string;
    message: string;
    sessionRef?: string;
    customerName?: string;
    customerEmail?: string;
    category?: string;
    escalateToHuman?: boolean;
    idempotencyKey?: string;
  }): Promise<{
    conversation: WorkspaceConversationItem;
    botReply: string;
    escalated: boolean;
    deduplicated: boolean;
  }> {
    const resolved = await this.resolveActiveWidgetByPublicToken(params.publicToken);
    if (!resolved) {
      throw new Error('WIDGET_INACTIVE: This website chat widget is not active or the token is invalid.');
    }

    const sessionRef = params.sessionRef?.trim() || `wgt_ses_${randomBytes(6).toString('hex')}`;
    if (params.idempotencyKey) {
      const dedup = await this.checkAndRecordIdempotencyKey({
        provider: 'web_widget',
        idempotencyKey: `${resolved.organizationId}:${params.idempotencyKey}`,
        organizationId: resolved.organizationId,
        eventType: 'widget_message',
      });
      if (dedup.isDuplicate) {
        const existingConvs = await this.workspaceRepo.listConversations(resolved.organizationId, {
          includeInternalNotes: false,
        });
        const match = existingConvs.find((c) => c.sourceChannelRef === sessionRef);
        if (match) {
          return {
            conversation: match,
            botReply:
              match.messages.filter((m) => m.senderType !== MessageSenderType.Customer).pop()
                ?.body ?? '',
            escalated: match.status === ConversationStatus.Escalated,
            deduplicated: true,
          };
        }
      }
    }

    const customerName = params.customerName?.trim() || 'Website Visitor';
    const customerEmail =
      params.customerEmail?.trim().toLowerCase() ||
      `${sessionRef.replace(/[^a-z0-9]/gi, '').toLowerCase()}@widget.visitor`;

    const existingConvs = await this.workspaceRepo.listConversations(resolved.organizationId, {
      includeInternalNotes: false,
    });
    let conv =
      existingConvs.find(
        (c) =>
          c.channel === SupportChannel.WebWidget &&
          c.sourceChannelRef === sessionRef &&
          c.status !== ConversationStatus.Resolved &&
          c.status !== ConversationStatus.Closed
      ) ?? null;

    const botAnswer = await this.workspaceRepo.answerPortalQuestion(
      resolved.organizationSlug,
      params.message,
      {
        requirePublished: false,
        viewerOrganizationId: resolved.organizationId,
      }
    );

    const shouldEscalate =
      resolved.widgetConfig.allowHumanEscalation &&
      (Boolean(params.escalateToHuman) || botAnswer?.resolutionLayer === 'human-escalation');

    const nextStatus = shouldEscalate
      ? ConversationStatus.Escalated
      : ConversationStatus.Open;

    if (!conv) {
      conv = await this.workspaceRepo.createEscalatedConversation({
        organizationId: resolved.organizationId,
        customerName,
        customerEmail,
        customerExternalRef: sessionRef,
        sourceChannelRef: sessionRef,
        channel: SupportChannel.WebWidget,
        status: nextStatus,
        priority: shouldEscalate ? EscalationPriority.High : EscalationPriority.Normal,
        category: params.category || botAnswer?.suggestedTopic || 'Website Inquiry',
        subject: params.message.slice(0, 90),
        message: params.message,
      });
    } else {
      conv = await this.workspaceRepo.replyToConversation({
        organizationId: resolved.organizationId,
        conversationId: conv.id,
        senderName: customerName,
        senderType: MessageSenderType.Customer,
        body: params.message,
        nextStatus,
      });
    }

    const botReply = shouldEscalate
      ? `Your conversation has been escalated to ${resolved.organizationName}'s human support team. A specialist will reply here shortly.`
      : (botAnswer?.reply ?? `Thank you for reaching out to ${resolved.organizationName}.`);

    await this.workspaceRepo.replyToConversation({
      organizationId: resolved.organizationId,
      conversationId: conv.id,
      senderName: `${resolved.organizationName} Assistant`,
      senderType: MessageSenderType.Bot,
      body: botReply,
      nextStatus,
    });

    // Reload conversation strictly without internal notes for public customer response
    const publicConv = await this.workspaceRepo.getConversationById(
      resolved.organizationId,
      conv.id,
      { includeInternalNotes: false }
    );

    return {
      conversation: publicConv ?? conv,
      botReply,
      escalated: shouldEscalate,
      deduplicated: false,
    };
  }
}

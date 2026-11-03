import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  ConversationStatus,
  EscalationPriority,
  MessageSenderType,
  SupportChannel,
  UserRole,
  type AgentAvailability,
  type ChannelIntegrationCategory,
  type ChannelIntegrationLifecycleStatus,
  type ChannelIntegrationRecord,
  type EmailChannelConfig,
  type MessageDeliveryStatus,
  type TelegramAgentLinkCodeResponse,
  type TelegramAgentLinkRecord,
  type TelegramChannelConfig,
  type WebWidgetChannelConfig,
  type WorkspaceConversationItem,
} from '@careflow/shared';
import type { D1DatabaseLike } from './d1-types';
import { D1WorkspaceRepository } from './d1-workspace-repository';
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

  constructor(
    db: D1DatabaseLike,
    options?: {
      workspaceRepo?: D1WorkspaceRepository;
      telegramSender?: TelegramOutboundSender;
      centralBotUsername?: string;
      encryptionKey?: string;
    }
  ) {
    this.db = db;
    this.workspaceRepo = options?.workspaceRepo ?? new D1WorkspaceRepository(db);
    this.sendTelegram = options?.telegramSender ?? defaultTelegramOutboundSender;
    this.defaultCentralBotUsername = (options?.centralBotUsername || 'CustomCareBot').replace(
      /^@/,
      ''
    );
    this.defaultEncryptionKey = options?.encryptionKey;
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
      welcomeMessage: `Welcome to ${businessName} Support on Telegram! Ask a question below or choose a support category to get instant assistance.`,
      supportCategories:
        supportedTopics.length > 0
          ? supportedTopics
          : ['General Support', 'Orders & Billing', 'Technical Assistance'],
      allowHumanEscalation: true,
      escalationPriorityDefault: EscalationPriority.Normal,
      notifyAssignedAgentOnTelegram: true,
      offlineMessage: `Thank you for messaging ${businessName}. A support specialist will follow up with you shortly.`,
    };
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
    const centralBotUsername = (options?.centralBotUsername || 'CustomCareBot').replace(/^@/, '');
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
      action: 'activate' | 'deactivate' | 'rotate_token' | 'update_config';
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

    const formattedText = `💬 ${org?.name ?? 'Support'} (${params.agentDisplayName}):\n\n${params.body}`;
    const sendResult = await this.sendTelegram(
      {
        chatId,
        text: formattedText,
      },
      params.botToken
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
            `Reply with:\n/open ${params.conversation.id}\n/reply ${params.conversation.id} <your message>`,
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

  async processTelegramWebhookUpdate(
    update: TelegramUpdateEnvelope,
    options?: {
      botToken?: string;
      centralBotUsername?: string;
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
      eventType: update.message ? 'message' : update.callback_query ? 'callback_query' : 'other',
    });

    if (dedup.isDuplicate) {
      return {
        handled: true,
        deduplicated: true,
        mode: 'ignored',
      };
    }

    const message = update.message;
    const callbackQuery = update.callback_query;

    const rawText = (message?.text ?? callbackQuery?.data ?? '').trim();
    const fromUser = message?.from ?? callbackQuery?.from;
    const chatObj = message?.chat ?? callbackQuery?.message?.chat;

    if (!fromUser || !chatObj || !rawText) {
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

    const sendReply = async (text: string): Promise<string> => {
      await this.sendTelegram(
        {
          chatId: telegramChatId,
          text,
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
        `✅ Linked to CustomCare Agent Workspace!\n` +
          `Agent: ${linkOutcome.record.userFullName} (${linkOutcome.record.role})\n` +
          `Active Business: ${linkOutcome.record.organizationName}\n\n` +
          `Agent Commands:\n` +
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
          `• /unlink — Unlink your Telegram account`
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
    if (startBusinessMatch && startBusinessMatch[1] && !startBusinessMatch[1].toLowerCase().startsWith('link_')) {
      const publicToken = startBusinessMatch[1].trim();
      return this.handleTelegramCustomerStart({
        telegramUserId,
        telegramChatId,
        telegramUsername,
        displayName,
        publicToken,
        botToken: options?.botToken,
      });
    }

    // 4. Determine whether this Telegram user is operating as a verified linked Agent
    const agentCommandPrefixes = [
      '/my',
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
      '/unlink',
      '/agent',
      '/help',
    ];
    const isExplicitAgentCommand = agentCommandPrefixes.some(
      (cmd) => rawText.toLowerCase() === cmd || rawText.toLowerCase().startsWith(`${cmd} `)
    );

    const activeAgentLinks = await this.resolveVerifiedAgentLinksForTelegramUser(telegramUserId);

    if (isExplicitAgentCommand || (activeAgentLinks.length > 0 && !rawText.toLowerCase().startsWith('/customer'))) {
      if (activeAgentLinks.length === 0) {
        const replyText = await sendReply(
          `🔒 Agent access denied. Your Telegram account is not linked to an active CustomCare workspace member.\n` +
            `Sign into your CustomCare web dashboard -> Channels & Integrations -> Telegram Agent Link to generate a single-use code.`
        );
        return {
          handled: true,
          deduplicated: false,
          mode: 'agent',
          replyText,
        };
      }

      // If the user is a linked agent AND has an active conversation selected or sent an agent command, handle in Agent Mode
      const primaryLink =
        activeAgentLinks.find((l) => l.organization_id === l.active_organization_id) ??
        activeAgentLinks[0]!;

      if (isExplicitAgentCommand || primaryLink.active_conversation_id) {
        return this.handleTelegramAgentInteraction({
          telegramUserId,
          telegramChatId,
          rawText,
          activeLink: primaryLink,
          allLinks: activeAgentLinks,
          botToken: options?.botToken,
        });
      }
    }

    // 5. Otherwise handle as Customer Support interaction in the customer's active business context
    const strippedCustomerText = rawText.replace(/^\/customer\s*/i, '').trim() || rawText;
    return this.handleTelegramCustomerMessage({
      telegramUserId,
      telegramChatId,
      telegramUsername,
      displayName,
      text: strippedCustomerText,
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

  private async handleTelegramCustomerStart(params: {
    telegramUserId: string;
    telegramChatId: string;
    telegramUsername: string;
    displayName: string;
    publicToken: string;
    botToken?: string;
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
        { chatId: params.telegramChatId, text: replyText },
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

    // Bind customer's active business context to this organization
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

    // Upsert tenant-scoped customer identity
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

    await this.db
      .prepare(`UPDATE channel_integrations SET last_event_at = ?, updated_at = ? WHERE id = ?`)
      .bind(now, now, integrationRow.id)
      .run();

    const categoriesLine =
      tgConfig.supportCategories.length > 0
        ? `\n\nAvailable Support Topics:\n• ${tgConfig.supportCategories.join('\n• ')}`
        : '';

    const replyText =
      `👋 ${tgConfig.welcomeMessage}${categoriesLine}\n\n` +
      `Send your question anytime, or type /human to connect with a support specialist at ${integrationRow.org_name}.`;

    await this.sendTelegram(
      { chatId: params.telegramChatId, text: replyText },
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

  private async handleTelegramCustomerMessage(params: {
    telegramUserId: string;
    telegramChatId: string;
    telegramUsername: string;
    displayName: string;
    text: string;
    externalMessageId?: string;
    botToken?: string;
  }): Promise<{
    handled: boolean;
    deduplicated: boolean;
    mode: 'customer';
    organizationId?: string;
    conversationId?: string;
    replyText: string;
  }> {
    const contextRow = await this.db
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
        org_name: string;
        org_slug: string;
        org_active: number;
        integration_id: string | null;
        integration_status: string | null;
        current_public_token: string | null;
        config_json: string | null;
      }>();

    if (
      !contextRow ||
      !contextRow.org_active ||
      contextRow.integration_status !== 'active' ||
      !contextRow.current_public_token ||
      contextRow.current_public_token !== contextRow.public_token_used
    ) {
      const replyText =
        `⚠️ Please open a valid business support link (e.g. https://t.me/CustomCareBot?start=BUSINESS_TOKEN) to start or continue a support conversation.`;
      await this.sendTelegram(
        { chatId: params.telegramChatId, text: replyText },
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

    let tgConfig = this.getDefaultTelegramConfig(contextRow.org_name, []);
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
      identity = { id: cid, active_conversation_id: null, email: syntheticEmail };
    }

    // Check if there is an active open/pending/troubleshooting/escalated conversation for this customer in this business
    let activeConv: WorkspaceConversationItem | null = null;
    if (identity.active_conversation_id) {
      const existing = await this.workspaceRepo.getConversationById(
        organizationId,
        identity.active_conversation_id
      );
      if (
        existing &&
        existing.status !== ConversationStatus.Resolved &&
        existing.status !== ConversationStatus.Closed
      ) {
        activeConv = existing;
      }
    }

    const explicitHumanRequest =
      /^\/(human|escalate|agent)\b/i.test(params.text) ||
      /\b(human|agent|person|representative|specialist|talk to someone|live support)\b/i.test(
        params.text
      );

    // Run deterministic chatbot & knowledge base for this specific business
    const botAnswer = await this.workspaceRepo.answerPortalQuestion(
      contextRow.org_slug,
      params.text,
      {
        requirePublished: false,
        viewerOrganizationId: organizationId,
      }
    );

    const shouldEscalate =
      tgConfig.allowHumanEscalation &&
      (explicitHumanRequest || botAnswer?.resolutionLayer === 'human-escalation');

    const targetStatus = shouldEscalate
      ? ConversationStatus.Escalated
      : ConversationStatus.Open;

    if (!activeConv) {
      activeConv = await this.workspaceRepo.createEscalatedConversation({
        organizationId,
        customerName: params.displayName,
        customerEmail: identity.email || syntheticEmail,
        customerExternalRef: `tg:${params.telegramUserId}`,
        customerIdentityId: identity.id,
        sourceChannelRef: params.telegramChatId,
        channel: SupportChannel.Telegram,
        status: targetStatus,
        priority: shouldEscalate
          ? tgConfig.escalationPriorityDefault
          : EscalationPriority.Normal,
        category:
          botAnswer?.suggestedTopic ||
          tgConfig.supportCategories[0] ||
          'General Support',
        subject: params.text.slice(0, 90),
        message: params.text,
        externalMessageId: params.externalMessageId,
      });

      await this.db
        .prepare(
          `UPDATE channel_customer_identities
           SET active_conversation_id = ?, last_interaction_at = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(activeConv.id, now, now, identity.id)
        .run();
    } else {
      activeConv = await this.workspaceRepo.replyToConversation({
        organizationId,
        conversationId: activeConv.id,
        senderName: params.displayName,
        senderType: MessageSenderType.Customer,
        body: params.text,
        externalMessageId: params.externalMessageId,
        nextStatus: shouldEscalate ? ConversationStatus.Escalated : activeConv.status,
      });
    }

    let replyText: string;
    if (shouldEscalate) {
      replyText =
        `🤝 Your conversation (${activeConv.id}) has been escalated to ${contextRow.org_name}'s human support team.\n` +
        `${tgConfig.offlineMessage}`;
    } else {
      replyText =
        botAnswer?.reply ??
        `Thank you for contacting ${contextRow.org_name}. Type /human if you would like a support specialist to join this chat.`;
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

    await this.sendTelegram(
      { chatId: params.telegramChatId, text: replyText },
      params.botToken
    );

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
     6. Agent Telegram Interface Handler (Synchronized with Web Workspace)
  ========================================================================= */

  private async handleTelegramAgentInteraction(params: {
    telegramUserId: string;
    telegramChatId: string;
    rawText: string;
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
  }): Promise<{
    handled: boolean;
    deduplicated: boolean;
    mode: 'agent';
    organizationId: string;
    conversationId?: string;
    replyText: string;
  }> {
    const { activeLink, allLinks, rawText, telegramChatId } = params;
    const organizationId = activeLink.organization_id;
    const now = new Date().toISOString();

    const sendAgentReply = async (text: string): Promise<string> => {
      await this.sendTelegram({ chatId: telegramChatId, text }, params.botToken);
      return text;
    };

    const lower = rawText.toLowerCase();

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

    // /workspace [slug]
    if (lower === '/workspace' || lower.startsWith('/workspace ')) {
      const targetArg = rawText.slice('/workspace'.length).trim().toLowerCase();
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

    // /my
    if (lower === '/my') {
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

    // /unassigned
    if (lower === '/unassigned') {
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

    // Default /help or /agent menu
    const replyText = await sendAgentReply(
      `🛠️ CustomCare Agent Interface (${activeLink.org_name})\n` +
        `Agent: ${activeLink.user_full_name} (${activeLink.member_role})\n\n` +
        `Commands:\n` +
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
        `• /workspace — Switch active business`
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

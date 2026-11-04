import path from 'node:path';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  D1AuthIdentityService,
  D1ChannelIntegrationService,
  D1KnowledgeRepository,
  D1WorkspaceRepository,
  bootstrapKnowledgeD1Schema,
  type D1DatabaseLike,
} from '@careflow/database/d1';
import {
  NodeSqliteD1Adapter,
  isNodeSqliteAvailable,
} from '@careflow/database/sqlite-node';
import { KnowledgeManagementService } from '@careflow/support-engine';

declare global {
  // Preserve singleton SQLite / D1 bootstrap promises across dev reloads & Worker isolate invocations
  var __careflowKnowledgeD1Instance: D1DatabaseLike | undefined;
  var __careflowKnowledgeBootstrapPromise: Promise<void> | undefined;
  var __careflowWorkerD1BootstrapPromise: Promise<void> | undefined;
}

function isD1DatabaseBinding(value: unknown): value is D1DatabaseLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { prepare?: unknown }).prepare === 'function'
  );
}

const CLOUDFLARE_CONTEXT_SYMBOL = Symbol.for('__cloudflare-context__');

/**
 * Returns the active Cloudflare Worker `env` bindings only when executing inside an
 * initialized OpenNext Cloudflare Worker request context (`runWithCloudflareRequestContext`).
 *
 * Avoids calling `getCloudflareContext({ async: true })` in standard Node.js (`next dev`,
 * `next start`, `next build`), which would otherwise spawn Wrangler's Miniflare/workerd
 * `getPlatformProxy()` against `WORKER_SELF_REFERENCE` and crash `workerd`.
 */
export function getActiveCloudflareEnv(): Record<string, unknown> | null {
  const globalScope = globalThis as Record<symbol, unknown>;
  if (!globalScope[CLOUDFLARE_CONTEXT_SYMBOL]) {
    return null;
  }

  try {
    const context = getCloudflareContext({ async: false });
    const envRecord = context?.env as Record<string, unknown> | undefined;
    return envRecord ?? null;
  } catch {
    return null;
  }
}

function resolveCloudflareD1Binding(): D1DatabaseLike | null {
  const envRecord = getActiveCloudflareEnv();
  if (!envRecord) {
    return null;
  }

  const candidate = envRecord.DB ?? envRecord.CAREFLOW_DB;
  if (isD1DatabaseBinding(candidate)) {
    return candidate;
  }
  return null;
}

function resolveDefaultSqlitePath(): string {
  if (process.env.CAREFLOW_SQLITE_PATH && process.env.CAREFLOW_SQLITE_PATH.trim().length > 0) {
    return process.env.CAREFLOW_SQLITE_PATH.trim();
  }
  const cwd = process.cwd();
  const baseRoot = cwd.endsWith(path.join('apps', 'web'))
    ? path.resolve(cwd, '..', '..')
    : cwd;
  return path.join(baseRoot, '.careflow-data', 'careflow-knowledge.sqlite');
}

export async function getKnowledgeDatabase(): Promise<D1DatabaseLike> {
  // 1. Prefer native Cloudflare Workers D1 binding (`env.DB`) when deployed on Cloudflare
  const cloudflareD1 = resolveCloudflareD1Binding();
  if (cloudflareD1) {
    if (!globalThis.__careflowWorkerD1BootstrapPromise) {
      globalThis.__careflowWorkerD1BootstrapPromise = bootstrapKnowledgeD1Schema(
        cloudflareD1
      ).catch((err) => {
        globalThis.__careflowWorkerD1BootstrapPromise = undefined;
        throw err;
      });
    }
    await globalThis.__careflowWorkerD1BootstrapPromise;
    return cloudflareD1;
  }

  // 2. Fall back to Node's built-in `node:sqlite` during local development & automated tests
  if (isNodeSqliteAvailable()) {
    if (!globalThis.__careflowKnowledgeD1Instance) {
      globalThis.__careflowKnowledgeD1Instance = new NodeSqliteD1Adapter(
        resolveDefaultSqlitePath()
      );
    }

    if (!globalThis.__careflowKnowledgeBootstrapPromise) {
      globalThis.__careflowKnowledgeBootstrapPromise = bootstrapKnowledgeD1Schema(
        globalThis.__careflowKnowledgeD1Instance
      ).catch((err) => {
        globalThis.__careflowKnowledgeBootstrapPromise = undefined;
        throw err;
      });
    }

    await globalThis.__careflowKnowledgeBootstrapPromise;
    return globalThis.__careflowKnowledgeD1Instance;
  }

  // 3. Running inside Cloudflare Workers without a D1 database bound yet
  throw new Error(
    'Cloudflare D1 binding "DB" is not configured on this Worker. Run "npx wrangler d1 create careflow-db" and bind it as "DB" in wrangler.jsonc (or under Worker Settings -> Bindings in the Cloudflare Dashboard).'
  );
}

export async function getKnowledgeManagementService(): Promise<KnowledgeManagementService> {
  const db = await getKnowledgeDatabase();
  const repository = new D1KnowledgeRepository(db);
  return new KnowledgeManagementService(repository);
}

export async function getWorkspaceRepository(): Promise<D1WorkspaceRepository> {
  const db = await getKnowledgeDatabase();
  return new D1WorkspaceRepository(db);
}

export async function getAuthIdentityService(): Promise<D1AuthIdentityService> {
  const db = await getKnowledgeDatabase();
  return new D1AuthIdentityService(db);
}

declare global {
  var __careflowResolvedTelegramBotUsername: string | undefined;
  var __careflowWebhookSyncedAt: number | undefined;
}

export async function ensureTelegramBotIdentityAndWebhook(): Promise<{
  configured: boolean;
  botUsername: string;
  botId?: number;
  botFirstName?: string;
  webhookUrl?: string;
  webhookRegistered?: boolean;
  pendingUpdateCount?: number;
  lastErrorMessage?: string;
}> {
  const env = getActiveCloudflareEnv();
  const botToken =
    (typeof env?.TELEGRAM_BOT_TOKEN === 'string' && env.TELEGRAM_BOT_TOKEN.trim()) ||
    process.env.TELEGRAM_BOT_TOKEN?.trim() ||
    '';
  const webhookSecret =
    (typeof env?.TELEGRAM_WEBHOOK_SECRET === 'string' && env.TELEGRAM_WEBHOOK_SECRET.trim()) ||
    process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ||
    '';
  const appBaseUrl = (
    (typeof env?.CAREFLOW_APP_BASE_URL === 'string' && env.CAREFLOW_APP_BASE_URL.trim()) ||
    process.env.CAREFLOW_APP_BASE_URL?.trim() ||
    'https://getcustomcare.xyz'
  ).replace(/\/+$/, '');
  const fallbackUsername =
    globalThis.__careflowResolvedTelegramBotUsername ||
    (typeof env?.CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME === 'string' &&
      env.CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME.trim()) ||
    process.env.CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME?.trim() ||
    'getcustomcarebot';

  if (!botToken) {
    return {
      configured: false,
      botUsername: fallbackUsername,
      webhookRegistered: false,
    };
  }

  const targetWebhookUrl = `${appBaseUrl}/api/webhooks/telegram`;

  try {
    const [meRes, infoRes] = await Promise.all([
      fetch(`https://api.telegram.org/bot${botToken}/getMe`),
      fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`),
    ]);

    const meJson = (await meRes.json()) as {
      ok?: boolean;
      result?: { id?: number; username?: string; first_name?: string };
    };
    const infoJson = (await infoRes.json()) as {
      ok?: boolean;
      result?: {
        url?: string;
        pending_update_count?: number;
        last_error_message?: string;
      };
    };

    const resolvedUsername = meJson?.result?.username?.trim() || fallbackUsername;
    if (meJson?.ok && meJson?.result?.username) {
      globalThis.__careflowResolvedTelegramBotUsername = resolvedUsername;
    }

    const currentWebhookUrl = infoJson?.result?.url || '';
    const now = Date.now();
    const recentlySynced =
      typeof globalThis.__careflowWebhookSyncedAt === 'number' &&
      now - globalThis.__careflowWebhookSyncedAt < 5 * 60 * 1000;

    let webhookRegistered = currentWebhookUrl === targetWebhookUrl;

    if (!webhookRegistered || !recentlySynced) {
      const setPayload: Record<string, unknown> = {
        url: targetWebhookUrl,
        allowed_updates: ['message', 'edited_message', 'callback_query'],
      };
      if (webhookSecret) {
        setPayload.secret_token = webhookSecret;
      }
      const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setPayload),
      });
      const setJson = (await setRes.json()) as { ok?: boolean };
      if (setJson?.ok) {
        webhookRegistered = true;
        globalThis.__careflowWebhookSyncedAt = now;
      }
    }

    return {
      configured: Boolean(meJson?.ok),
      botUsername: resolvedUsername,
      botId: meJson?.result?.id,
      botFirstName: meJson?.result?.first_name,
      webhookUrl: webhookRegistered ? targetWebhookUrl : currentWebhookUrl,
      webhookRegistered,
      pendingUpdateCount: infoJson?.result?.pending_update_count ?? 0,
      lastErrorMessage: infoJson?.result?.last_error_message,
    };
  } catch {
    return {
      configured: true,
      botUsername: fallbackUsername,
    };
  }
}

export async function getChannelIntegrationService(): Promise<D1ChannelIntegrationService> {
  const db = await getKnowledgeDatabase();
  const env = getActiveCloudflareEnv();

  let centralBotUsername =
    globalThis.__careflowResolvedTelegramBotUsername ||
    (typeof env?.CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME === 'string' &&
      env.CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME.trim()) ||
    process.env.CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME?.trim() ||
    'getcustomcarebot';

  const hasBotToken = Boolean(
    (typeof env?.TELEGRAM_BOT_TOKEN === 'string' && env.TELEGRAM_BOT_TOKEN.trim()) ||
      process.env.TELEGRAM_BOT_TOKEN?.trim()
  );
  if (hasBotToken && !globalThis.__careflowResolvedTelegramBotUsername) {
    const botStatus = await ensureTelegramBotIdentityAndWebhook();
    if (botStatus.botUsername) {
      centralBotUsername = botStatus.botUsername;
    }
  }

  const encryptionKey =
    (typeof env?.CAREFLOW_INTEGRATION_ENCRYPTION_KEY === 'string' &&
      env.CAREFLOW_INTEGRATION_ENCRYPTION_KEY.trim()) ||
    process.env.CAREFLOW_INTEGRATION_ENCRYPTION_KEY?.trim() ||
    (typeof env?.CAREFLOW_ADMIN_SESSION_SECRET === 'string' &&
      env.CAREFLOW_ADMIN_SESSION_SECRET.trim()) ||
    process.env.CAREFLOW_ADMIN_SESSION_SECRET?.trim() ||
    '';

  return new D1ChannelIntegrationService(db, {
    centralBotUsername,
    encryptionKey,
    aiCompletionHandler: async ({
      provider,
      businessName,
      question,
      systemInstructions,
      supportedTopics,
      restrictedTopics,
      knowledgeContext,
    }) => {
      const systemPrompt =
        `You are the official customer support assistant for ${businessName}.\n` +
        `${systemInstructions || ''}\n` +
        `Supported Topics: ${supportedTopics.join(', ')}\n` +
        `Restricted Topics (refuse politely): ${restrictedTopics.join(', ')}\n` +
        `CRITICAL RULES:\n` +
        `1. Only answer using facts explicitly present in the Business Knowledge Context below.\n` +
        `2. Never invent policies, prices, product specifications, or payment verification statuses.\n` +
        `3. Never ask for passwords, PINs, OTPs, or full card numbers.\n` +
        `4. If the answer is not in the knowledge context, return an empty response or state that a human support specialist can assist.\n\n` +
        `Business Knowledge Context:\n${knowledgeContext || '(No knowledge articles matched)'}`;

      if (!knowledgeContext || knowledgeContext.trim().length === 0) {
        return null;
      }

      if (provider === 'gemini') {
        const geminiKey =
          (typeof env?.GEMINI_API_KEY === 'string' && env.GEMINI_API_KEY.trim()) ||
          process.env.GEMINI_API_KEY?.trim() ||
          '';
        if (!geminiKey) return null;

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
            geminiKey
          )}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: question }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 280 },
            }),
          }
        );
        if (!res.ok) return null;
        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        return json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
      }

      if (provider === 'groq') {
        const groqKey =
          (typeof env?.GROQ_API_KEY === 'string' && env.GROQ_API_KEY.trim()) ||
          process.env.GROQ_API_KEY?.trim() ||
          '';
        if (!groqKey) return null;

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            temperature: 0.1,
            max_tokens: 280,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question },
            ],
          }),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return json.choices?.[0]?.message?.content?.trim() || null;
      }

      if (provider === 'openrouter') {
        const openRouterKey =
          (typeof env?.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.trim()) ||
          process.env.OPENROUTER_API_KEY?.trim() ||
          '';
        if (!openRouterKey) return null;

        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openRouterKey}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            temperature: 0.1,
            max_tokens: 280,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: question },
            ],
          }),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        return json.choices?.[0]?.message?.content?.trim() || null;
      }

      return null;
    },
  });
}



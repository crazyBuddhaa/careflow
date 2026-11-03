import { timingSafeEqual } from 'node:crypto';
import {
  extractRequestClientMeta,
  readRuntimeSecret,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  ensureTelegramBotIdentityAndWebhook,
  getAuthIdentityService,
  getChannelIntegrationService,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

function verifyTelegramWebhookSecretHeader(
  providedSecret: string | null,
  expectedSecret: string | undefined
): boolean {
  if (!expectedSecret) {
    // In production, require TELEGRAM_WEBHOOK_SECRET to be configured
    return process.env.NODE_ENV !== 'production';
  }
  if (!providedSecret) {
    return false;
  }
  const a = Buffer.from(providedSecret, 'utf8');
  const b = Buffer.from(expectedSecret, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function GET() {
  try {
    const status = await ensureTelegramBotIdentityAndWebhook();
    return jsonApiSuccess(status);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const { ipAddress } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();
    const rateLimit = await authService.checkRateLimit('api', ipAddress);
    if (!rateLimit.allowed) {
      return jsonApiError(
        'RATE_LIMITED',
        'Too many webhook requests. Please retry later.',
        429
      );
    }

    const expectedSecret = readRuntimeSecret('TELEGRAM_WEBHOOK_SECRET');
    const providedSecret = request.headers.get('x-telegram-bot-api-secret-token');

    if (!verifyTelegramWebhookSecretHeader(providedSecret, expectedSecret)) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Invalid or missing X-Telegram-Bot-Api-Secret-Token header.',
        401
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Webhook body must be valid JSON.', 400);
    }

    if (
      !rawBody ||
      typeof rawBody !== 'object' ||
      typeof (rawBody as { update_id?: unknown }).update_id !== 'number'
    ) {
      return jsonApiError('VALIDATION_ERROR', 'Telegram update_id is required.', 400);
    }

    const channelService = await getChannelIntegrationService();
    const outcome = await channelService.processTelegramWebhookUpdate(
      rawBody as { update_id: number },
      {
        botToken: readRuntimeSecret('TELEGRAM_BOT_TOKEN'),
        centralBotUsername: readRuntimeSecret('CAREFLOW_CENTRAL_TELEGRAM_BOT_USERNAME'),
      }
    );

    return jsonApiSuccess(outcome);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

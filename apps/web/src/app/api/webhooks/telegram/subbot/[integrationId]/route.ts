import { extractRequestClientMeta, readRuntimeSecret } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  getAuthIdentityService,
  getChannelIntegrationService,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

interface SubBotRouteContext {
  params: Promise<{
    integrationId: string;
  }>;
}

export async function GET(_request: Request, context: SubBotRouteContext) {
  try {
    const { integrationId } = await context.params;
    return jsonApiSuccess({
      endpoint: 'telegram-subbot-webhook',
      integrationId,
      ready: true,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request, context: SubBotRouteContext) {
  try {
    const { integrationId } = await context.params;
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

    const providedSecretHeader = request.headers.get('x-telegram-bot-api-secret-token');
    const channelService = await getChannelIntegrationService();
    const outcome = await channelService.processTelegramSubBotWebhookUpdate({
      integrationId,
      providedSecretHeader,
      update: rawBody as { update_id: number },
      appBaseUrl:
        readRuntimeSecret('CAREFLOW_APP_BASE_URL') || 'https://getcustomcare.xyz',
    });

    if (outcome.unauthorized) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Invalid or missing X-Telegram-Bot-Api-Secret-Token header for sub-bot webhook.',
        401
      );
    }

    return jsonApiSuccess(outcome);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

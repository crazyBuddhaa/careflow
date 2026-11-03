import { PublicWidgetMessageSchema } from '@careflow/validation';
import { extractRequestClientMeta } from '@/lib/admin-auth';
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

interface RouteContext {
  params: Promise<{ publicToken: string }>;
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { publicToken } = await context.params;
    const channelService = await getChannelIntegrationService();
    const resolved = await channelService.resolveActiveWidgetByPublicToken(publicToken);

    if (!resolved) {
      const res = jsonApiError(
        'NOT_FOUND',
        'Website chat widget is not active or token is invalid.',
        404
      );
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    const url = new URL(request.url);
    const sessionRef = url.searchParams.get('sessionRef')?.trim();
    const activeConversation = sessionRef
      ? await channelService.getPublicWidgetConversationBySession(publicToken, sessionRef)
      : null;

    const res = jsonApiSuccess({
      organizationName: resolved.organizationName,
      widgetConfig: resolved.widgetConfig,
      supportedTopics: resolved.supportedTopics,
      conversation: activeConversation
        ? {
            id: activeConversation.id,
            status: activeConversation.status,
            messages: activeConversation.messages.map((m) => ({
              id: m.id,
              senderName: m.senderName,
              senderType: m.senderType,
              body: m.body,
              timestamp: m.createdAt,
            })),
          }
        : null,
    });
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  } catch (err) {
    const res = handleKnowledgeApiException(err);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { ipAddress } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();
    const rateLimit = await authService.checkRateLimit('escalation', ipAddress);
    if (!rateLimit.allowed) {
      const res = jsonApiError(
        'RATE_LIMITED',
        'Too many widget messages. Please wait before sending another message.',
        429
      );
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    const { publicToken } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      const res = jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    const input = PublicWidgetMessageSchema.parse(rawBody);
    const channelService = await getChannelIntegrationService();
    const resolved = await channelService.resolveActiveWidgetByPublicToken(publicToken);
    if (!resolved) {
      const res = jsonApiError(
        'NOT_FOUND',
        'Website chat widget is not active or token is invalid.',
        404
      );
      Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    }

    const result = await channelService.handlePublicWidgetMessage({
      publicToken,
      message: input.message,
      sessionRef: input.sessionRef,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      category: input.category,
      escalateToHuman: input.escalateToHuman,
      idempotencyKey: input.idempotencyKey,
    });

    const res = jsonApiSuccess({
      conversationId: result.conversation.id,
      status: result.conversation.status,
      botReply: result.botReply,
      escalated: result.escalated,
      deduplicated: result.deduplicated,
      messages: result.conversation.messages.map((m) => ({
        id: m.id,
        senderName: m.senderName,
        senderType: m.senderType,
        body: m.body,
        timestamp: m.createdAt,
      })),
    });
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  } catch (err) {
    const res = handleKnowledgeApiException(err);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }
}

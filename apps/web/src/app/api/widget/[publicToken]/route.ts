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

function normalizeHostEntry(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://')) {
      return new URL(trimmed).hostname.toLowerCase();
    }
  } catch {
    // Fall through to manual strip
  }
  return trimmed
    .replace(/^https?:\/\//, '')
    .split('/')[0]!
    .split(':')[0]!
    .trim();
}

function validateWidgetOrigin(
  request: Request,
  resolved: {
    organizationSlug: string;
    organizationWebsite: string;
    verifiedHostnames: string[];
    widgetConfig: { allowedOrigins?: string[] };
  }
): { allowed: boolean; allowOriginHeader: string } {
  const originHeader = request.headers.get('origin')?.trim() || '';
  let requestSelfOrigin = 'https://getcustomcare.xyz';
  let requestSelfHost = 'getcustomcare.xyz';
  try {
    const reqUrl = new URL(request.url);
    requestSelfOrigin = reqUrl.origin;
    requestSelfHost = reqUrl.hostname.toLowerCase();
  } catch {
    // Use default
  }

  // Same-origin or server-to-server requests without an Origin header
  if (!originHeader) {
    return { allowed: true, allowOriginHeader: requestSelfOrigin };
  }

  let originHostname = '';
  let normalizedOrigin = '';
  try {
    const parsedOrigin = new URL(originHeader);
    originHostname = parsedOrigin.hostname.toLowerCase();
    normalizedOrigin = parsedOrigin.origin;
  } catch {
    return { allowed: false, allowOriginHeader: requestSelfOrigin };
  }

  // Always allow same-host, CustomCare platform subdomains, and local development
  if (
    originHostname === requestSelfHost ||
    originHostname === 'localhost' ||
    originHostname === '127.0.0.1' ||
    originHostname === 'getcustomcare.xyz' ||
    originHostname.endsWith('.getcustomcare.xyz')
  ) {
    return { allowed: true, allowOriginHeader: normalizedOrigin };
  }

  const configuredPatterns = [
    ...(Array.isArray(resolved.widgetConfig.allowedOrigins)
      ? resolved.widgetConfig.allowedOrigins
      : []),
    resolved.organizationWebsite,
    ...resolved.verifiedHostnames,
  ]
    .map(normalizeHostEntry)
    .filter(Boolean);

  for (const pattern of configuredPatterns) {
    if (pattern === originHostname) {
      return { allowed: true, allowOriginHeader: normalizedOrigin };
    }
    if (pattern.startsWith('*.') && originHostname.endsWith(pattern.slice(1))) {
      return { allowed: true, allowOriginHeader: normalizedOrigin };
    }
    if (originHostname === `www.${pattern}` || `www.${originHostname}` === pattern) {
      return { allowed: true, allowOriginHeader: normalizedOrigin };
    }
  }

  return { allowed: false, allowOriginHeader: requestSelfOrigin };
}

function applyCorsHeaders(res: Response, allowOrigin: string): Response {
  res.headers.set('Access-Control-Allow-Origin', allowOrigin);
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Vary', 'Origin');
  return res;
}

export async function OPTIONS(request: Request, context: RouteContext) {
  const { publicToken } = await context.params;
  const channelService = await getChannelIntegrationService();
  const resolved = await channelService.resolveActiveWidgetByPublicToken(publicToken);

  if (!resolved) {
    return new Response(null, { status: 404 });
  }

  const originCheck = validateWidgetOrigin(request, resolved);
  if (!originCheck.allowed) {
    return jsonApiError(
      'ORIGIN_NOT_ALLOWED',
      'Origin is not authorized for this widget token.',
      403
    );
  }

  return applyCorsHeaders(new Response(null, { status: 204 }), originCheck.allowOriginHeader);
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { publicToken } = await context.params;
    const channelService = await getChannelIntegrationService();
    const resolved = await channelService.resolveActiveWidgetByPublicToken(publicToken);

    if (!resolved) {
      return jsonApiError(
        'NOT_FOUND',
        'Website chat widget is not active or token is invalid.',
        404
      );
    }

    const originCheck = validateWidgetOrigin(request, resolved);
    if (!originCheck.allowed) {
      return jsonApiError(
        'ORIGIN_NOT_ALLOWED',
        'Origin is not authorized for this widget token.',
        403
      );
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
    return applyCorsHeaders(res, originCheck.allowOriginHeader);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { publicToken } = await context.params;
    const channelService = await getChannelIntegrationService();
    const resolved = await channelService.resolveActiveWidgetByPublicToken(publicToken);
    if (!resolved) {
      return jsonApiError(
        'NOT_FOUND',
        'Website chat widget is not active or token is invalid.',
        404
      );
    }

    const originCheck = validateWidgetOrigin(request, resolved);
    if (!originCheck.allowed) {
      return jsonApiError(
        'ORIGIN_NOT_ALLOWED',
        'Origin is not authorized for this widget token.',
        403
      );
    }

    const { ipAddress } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();
    const rateLimit = await authService.checkRateLimit('escalation', ipAddress);
    if (!rateLimit.allowed) {
      const res = jsonApiError(
        'RATE_LIMITED',
        'Too many widget messages. Please wait before sending another message.',
        429
      );
      return applyCorsHeaders(res, originCheck.allowOriginHeader);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      const res = jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
      return applyCorsHeaders(res, originCheck.allowOriginHeader);
    }

    const input = PublicWidgetMessageSchema.parse(rawBody);

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
    return applyCorsHeaders(res, originCheck.allowOriginHeader);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

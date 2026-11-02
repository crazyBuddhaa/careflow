import {
  ReplyConversationSchema,
  UpdateConversationStatusSchema,
} from '@careflow/validation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ conversationId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { identity, organizationName } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    const { conversationId } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = ReplyConversationSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const updated = await repo.replyToConversation({
      organizationId: identity.organizationId,
      conversationId,
      senderName: input.senderName ?? `${organizationName ?? 'Workspace'} Support`,
      body: input.body,
      nextStatus: input.nextStatus,
    });

    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { identity } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    const { conversationId } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = UpdateConversationStatusSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const updated = await repo.updateConversationStatus({
      organizationId: identity.organizationId,
      conversationId,
      status: input.status,
      assignedAgentName: input.assignedAgentName,
    });

    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

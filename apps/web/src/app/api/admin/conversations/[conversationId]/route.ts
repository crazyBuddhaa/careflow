import { UserRole } from '@careflow/shared';
import { hasMinimumRole } from '@careflow/support-engine';
import {
  ReplyConversationSchema,
  UpdateConversationStatusSchema,
} from '@careflow/validation';
import {
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
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
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
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
      organizationId: auth.session.identity.organizationId,
      conversationId,
      senderName:
        input.senderName ?? `${auth.session.organizationName ?? 'Workspace'} Support`,
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
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const { conversationId } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = UpdateConversationStatusSchema.parse(rawBody);

    // Agents can claim unassigned conversations for themselves or update status,
    // but reassigning conversations to other specialists requires Supervisor+ role.
    if (
      input.assignedAgentName !== undefined &&
      !hasMinimumRole(auth.session.identity, UserRole.Supervisor)
    ) {
      const currentUserName = (auth.session.userName || '').trim().toLowerCase();
      const targetName = (input.assignedAgentName || '').trim().toLowerCase();
      if (targetName && targetName !== currentUserName) {
        return jsonApiError(
          'FORBIDDEN',
          'Supervisor, Administrator, or Owner permissions are required to assign conversations to other specialists.',
          403
        );
      }
    }

    const repo = await getWorkspaceRepository();
    const updated = await repo.updateConversationStatus({
      organizationId: auth.session.identity.organizationId,
      conversationId,
      status: input.status,
      assignedAgentName: input.assignedAgentName,
    });

    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


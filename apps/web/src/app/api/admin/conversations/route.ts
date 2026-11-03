import { ConversationStatus, UserRole } from '@careflow/shared';
import { CreateDemoConversationSchema } from '@careflow/validation';
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

export async function GET(request: Request) {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;
    const assignedTo = url.searchParams.get('assignedTo') ?? undefined;
    const priority = url.searchParams.get('priority') ?? undefined;
    const channel = url.searchParams.get('channel') ?? undefined;

    const repo = await getWorkspaceRepository();
    const conversations = await repo.listConversations(auth.session.identity.organizationId, {
      status,
      search,
      assignedAgentName:
        assignedTo === 'me'
          ? auth.session.userName || auth.session.identity.email
          : assignedTo && assignedTo !== 'unassigned' && assignedTo !== 'all'
            ? assignedTo
            : undefined,
      unassignedOnly: assignedTo === 'unassigned',
      priority,
      channel,
      includeInternalNotes: true,
    });
    return jsonApiSuccess(conversations);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = CreateDemoConversationSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const created = await repo.createEscalatedConversation({
      organizationId: auth.session.identity.organizationId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      channel: input.channel,
      status: ConversationStatus.Open,
      category: input.category,
      subject: input.subject,
      message: input.message,
    });
    return jsonApiSuccess(created, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

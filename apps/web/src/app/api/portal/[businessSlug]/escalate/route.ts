import { ConversationStatus, SupportChannel } from '@careflow/shared';
import { CreatePortalEscalationSchema } from '@careflow/validation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ businessSlug: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { businessSlug } = await context.params;
    const [repo, session] = await Promise.all([
      getWorkspaceRepository(),
      resolveServerAdminSession(),
    ]);

    const accessOptions = {
      requirePublished: true,
      viewerUserId: session.identity?.userId,
      viewerOrganizationId: session.identity?.organizationId,
    };

    const portal =
      (await repo.resolvePortalBySlug(businessSlug, accessOptions)) ??
      (businessSlug.includes('.')
        ? await repo.resolvePortalByHostname(businessSlug, accessOptions)
        : null);

    if (!portal) {
      return jsonApiError('NOT_FOUND', 'Business support portal not found.', 404);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = CreatePortalEscalationSchema.parse(rawBody);

    const created = await repo.createEscalatedConversation({
      organizationId: portal.organizationId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerExternalRef: input.customerExternalRef,
      channel: SupportChannel.Portal,
      status: ConversationStatus.Escalated,
      priority: input.priority,
      category: input.category,
      subject: input.subject,
      message: input.message,
      transcriptSummary: input.transcriptSummary,
    });

    return jsonApiSuccess(
      {
        conversationId: created.id,
        assignedAgentName: created.assignedAgentName,
        status: created.status,
      },
      201
    );
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


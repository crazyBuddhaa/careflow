import { PortalAssistantQuerySchema } from '@careflow/validation';
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = PortalAssistantQuerySchema.parse(rawBody);
    const [repo, session] = await Promise.all([
      getWorkspaceRepository(),
      resolveServerAdminSession(),
    ]);

    const result = await repo.answerPortalQuestion(businessSlug, input.message, {
      requirePublished: true,
      viewerUserId: session.identity?.userId,
      viewerOrganizationId: session.identity?.organizationId,
    });

    if (!result) {
      return jsonApiError('NOT_FOUND', 'Business support portal not found.', 404);
    }

    return jsonApiSuccess(result);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


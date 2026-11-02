import { UpdateAgentSchema } from '@careflow/validation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ agentId: string }>;
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

    const { agentId } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = UpdateAgentSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const updated = await repo.updateAgent(identity.organizationId, agentId, input);
    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { identity } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    const { agentId } = await context.params;
    const repo = await getWorkspaceRepository();
    await repo.deleteAgent(identity.organizationId, agentId);
    return jsonApiSuccess({ deleted: true });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

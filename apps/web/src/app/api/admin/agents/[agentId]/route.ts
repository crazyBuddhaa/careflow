import { UserRole } from '@careflow/shared';
import { hasMinimumRole } from '@careflow/support-engine';
import { UpdateAgentSchema } from '@careflow/validation';
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
  params: Promise<{ agentId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Supervisor);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const { agentId } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = UpdateAgentSchema.parse(rawBody);

    // Supervisors may update specialist availability and specialty, but modifying
    // a specialist's role requires Administrator or Owner privileges.
    if (input.role !== undefined && !hasMinimumRole(auth.session.identity, UserRole.Admin)) {
      return jsonApiError(
        'FORBIDDEN',
        'Only workspace owners or administrators can modify specialist roles.',
        403
      );
    }

    const repo = await getWorkspaceRepository();
    const updated = await repo.updateAgent(
      auth.session.identity.organizationId,
      agentId,
      input
    );
    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Admin);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const { agentId } = await context.params;
    const repo = await getWorkspaceRepository();
    await repo.deleteAgent(auth.session.identity.organizationId, agentId);
    return jsonApiSuccess({ deleted: true });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


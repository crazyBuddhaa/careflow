import { UserRole } from '@careflow/shared';
import { hasMinimumRole } from '@careflow/support-engine';
import { UpdateAgentSchema } from '@careflow/validation';
import {
  extractRequestClientMeta,
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  getAuthIdentityService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

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

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
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
    const repo = await getWorkspaceRepository();

    // If caller is an Agent (not Supervisor/Admin), they may only update their own availability/specialty
    if (!hasMinimumRole(auth.session.identity, UserRole.Supervisor)) {
      const agents = await repo.listAgents(auth.session.identity.organizationId);
      const targetAgent = agents.find((a) => a.id === agentId);
      if (
        !targetAgent ||
        targetAgent.email.toLowerCase() !== (auth.session.identity.email || '').toLowerCase() ||
        input.role !== undefined ||
        input.lifecycleAction !== undefined ||
        input.permissions !== undefined
      ) {
        return jsonApiError(
          'FORBIDDEN',
          'Support agents can only update their own availability status.',
          403
        );
      }
    }

    // Modifying a specialist's role, permissions, or lifecycle status requires Administrator or Owner privileges
    if (
      (input.role !== undefined ||
        input.lifecycleAction !== undefined ||
        input.permissions !== undefined) &&
      !hasMinimumRole(auth.session.identity, UserRole.Admin)
    ) {
      return jsonApiError(
        'FORBIDDEN',
        'Only workspace owners or administrators can modify specialist roles, permissions, or lifecycle status.',
        403
      );
    }

    if (input.lifecycleAction) {
      const authService = await getAuthIdentityService();
      const { ipAddress, userAgent } = extractRequestClientMeta(request);
      await authService.updateWorkspaceMemberLifecycle({
        organizationId: auth.session.identity.organizationId,
        targetEmailOrUserId: agentId,
        action: input.lifecycleAction,
        actorUserId: auth.session.identity.userId,
        ipAddress,
        userAgent,
      });
    }

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


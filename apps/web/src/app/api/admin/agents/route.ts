import { UserRole } from '@careflow/shared';
import { CreateAgentSchema } from '@careflow/validation';
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

export async function GET() {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const repo = await getWorkspaceRepository();
    const agents = await repo.listAgents(auth.session.identity.organizationId);
    return jsonApiSuccess(agents);
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

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Admin);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = CreateAgentSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const created = await repo.createAgent(auth.session.identity.organizationId, input);
    return jsonApiSuccess(created, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

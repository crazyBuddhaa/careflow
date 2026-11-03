import { UserRole } from '@careflow/shared';
import { UpdateWorkspaceSettingsSchema } from '@careflow/validation';
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
    const settings = await repo.getWorkspaceSettings(auth.session.identity.organizationId);
    return jsonApiSuccess(settings);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function PATCH(request: Request) {
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

    const patch = UpdateWorkspaceSettingsSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const updated = await repo.updateWorkspaceSettings(auth.session.identity.organizationId, patch);
    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

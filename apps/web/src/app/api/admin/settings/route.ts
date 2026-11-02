import { UpdateWorkspaceSettingsSchema } from '@careflow/validation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { identity } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    const repo = await getWorkspaceRepository();
    const settings = await repo.getWorkspaceSettings(identity.organizationId);
    return jsonApiSuccess(settings);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const { identity } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const patch = UpdateWorkspaceSettingsSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const updated = await repo.updateWorkspaceSettings(identity.organizationId, patch);
    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

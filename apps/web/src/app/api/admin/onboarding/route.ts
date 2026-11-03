import { UserRole } from '@careflow/shared';
import { SaveOnboardingStepSchema } from '@careflow/validation';
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
    const progress = await repo.getOnboardingProgress(auth.session.identity.organizationId);

    return jsonApiSuccess(progress);
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

    const input = SaveOnboardingStepSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();

    const updated = await repo.saveOnboardingStep(
      auth.session.identity.organizationId,
      input.step,
      input
    );

    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

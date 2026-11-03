import { UserRole } from '@careflow/shared';
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

    if (auth.session.emailVerified === false) {
      return jsonApiError(
        'EMAIL_VERIFICATION_REQUIRED',
        'Please verify your account email address before publishing your public customer support portal.',
        403
      );
    }

    const repo = await getWorkspaceRepository();
    const progress = await repo.publishWorkspacePortal(auth.session.identity.organizationId);

    return jsonApiSuccess(progress);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Admin);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const repo = await getWorkspaceRepository();
    const progress = await repo.unpublishWorkspacePortal(auth.session.identity.organizationId);

    return jsonApiSuccess(progress);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}



import { UserRole } from '@careflow/shared';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = await resolveServerAdminSession();
    if (!session.identity) {
      return jsonApiError('UNAUTHORIZED', 'Authentication required.', 401);
    }

    if (
      session.identity.role !== UserRole.Owner &&
      session.identity.role !== UserRole.Admin
    ) {
      return jsonApiError(
        'FORBIDDEN',
        'Only business owners or administrators can publish the support portal.',
        403
      );
    }

    const repo = await getWorkspaceRepository();
    const progress = await repo.publishWorkspacePortal(session.identity.organizationId);

    return jsonApiSuccess(progress);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

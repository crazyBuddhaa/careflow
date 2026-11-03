import { UserRole } from '@careflow/shared';
import { requireAuthorizedWorkspaceSession } from '@/lib/admin-auth';
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
    const summary = await repo.getAnalyticsSummary(auth.session.identity.organizationId);
    return jsonApiSuccess(summary);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


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
    const session = await resolveServerAdminSession();
    if (!session.identity) {
      return jsonApiError('UNAUTHORIZED', 'Authentication required to view workspaces.', 401);
    }

    const repo = await getWorkspaceRepository();
    const workspaces = await repo.getUserWorkspaces(session.identity.userId);

    return jsonApiSuccess({
      workspaces,
      activeOrganizationId: session.identity.organizationId,
      currentRole: session.identity.role,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

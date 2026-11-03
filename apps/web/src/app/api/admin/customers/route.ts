import { UserRole } from '@careflow/shared';
import { requireAuthorizedWorkspaceSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? undefined;
    const repo = await getWorkspaceRepository();
    const customers = await repo.listCustomers(
      auth.session.identity.organizationId,
      search
    );
    return jsonApiSuccess(customers);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


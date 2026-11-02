import { resolveServerAdminSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { identity } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? undefined;
    const repo = await getWorkspaceRepository();
    const customers = await repo.listCustomers(identity.organizationId, search);
    return jsonApiSuccess(customers);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

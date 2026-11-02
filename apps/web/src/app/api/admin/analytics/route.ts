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
    const summary = await repo.getAnalyticsSummary(identity.organizationId);
    return jsonApiSuccess(summary);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

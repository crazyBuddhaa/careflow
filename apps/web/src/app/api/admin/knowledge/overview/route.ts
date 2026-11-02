import { resolveServerAdminSession } from '@/lib/admin-auth';
import { getKnowledgeManagementService } from '@/lib/knowledge-runtime';
import { handleKnowledgeApiException, jsonApiSuccess } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { identity } = await resolveServerAdminSession();
    const service = await getKnowledgeManagementService();
    const overview = await service.getOverview(identity);
    return jsonApiSuccess(overview);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

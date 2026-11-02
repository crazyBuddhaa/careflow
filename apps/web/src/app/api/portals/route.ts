import {
  handleKnowledgeApiException,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const repo = await getWorkspaceRepository();
    const portals = await repo.listPublicPortals();
    return jsonApiSuccess(portals);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

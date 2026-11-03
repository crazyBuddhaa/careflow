import { CreateKnowledgeCategorySchema } from '@careflow/validation';
import {
  resolveServerAdminSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import { getKnowledgeManagementService } from '@/lib/knowledge-runtime';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { identity } = await resolveServerAdminSession();
    const service = await getKnowledgeManagementService();
    const categories = await service.listCategories(identity);
    return jsonApiSuccess(categories);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const { identity } = await resolveServerAdminSession();
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = CreateKnowledgeCategorySchema.parse(rawBody);
    const service = await getKnowledgeManagementService();
    const created = await service.createCategory(identity, input);
    return jsonApiSuccess(created, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


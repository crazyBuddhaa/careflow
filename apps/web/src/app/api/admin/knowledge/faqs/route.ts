import {
  CreateKnowledgeFaqSchema,
  KnowledgeListFilterSchema,
} from '@careflow/validation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import { getKnowledgeManagementService } from '@/lib/knowledge-runtime';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { identity } = await resolveServerAdminSession();
    const { searchParams } = new URL(request.url);

    const filter = KnowledgeListFilterSchema.parse({
      search: searchParams.get('search') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      status: searchParams.get('status') || undefined,
    });

    const service = await getKnowledgeManagementService();
    const faqs = await service.listFaqs(identity, filter);
    return jsonApiSuccess(faqs);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const { identity } = await resolveServerAdminSession();
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = CreateKnowledgeFaqSchema.parse(rawBody);
    const service = await getKnowledgeManagementService();
    const created = await service.createFaq(identity, input);
    return jsonApiSuccess(created, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

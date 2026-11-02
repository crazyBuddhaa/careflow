import { UpdateKnowledgeFaqSchema } from '@careflow/validation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import { getKnowledgeManagementService } from '@/lib/knowledge-runtime';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ faqId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { identity } = await resolveServerAdminSession();
    const { faqId } = await context.params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = UpdateKnowledgeFaqSchema.parse(rawBody);
    const service = await getKnowledgeManagementService();
    const updated = await service.updateFaq(identity, faqId, input);
    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { identity } = await resolveServerAdminSession();
    const { faqId } = await context.params;
    const service = await getKnowledgeManagementService();
    await service.deleteFaq(identity, faqId);
    return jsonApiSuccess({ deleted: true, id: faqId });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

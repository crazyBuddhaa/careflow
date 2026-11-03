import { UpdateKnowledgeFaqSchema } from '@careflow/validation';
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

interface RouteContext {
  params: Promise<{ faqId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

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

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const { identity } = await resolveServerAdminSession();
    const { faqId } = await context.params;
    const service = await getKnowledgeManagementService();
    await service.deleteFaq(identity, faqId);
    return jsonApiSuccess({ deleted: true, id: faqId });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


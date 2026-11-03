import { UpdateKnowledgeArticleSchema } from '@careflow/validation';
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
  params: Promise<{ articleId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { identity } = await resolveServerAdminSession();
    const { articleId } = await context.params;
    const service = await getKnowledgeManagementService();
    const article = await service.getArticle(identity, articleId);
    return jsonApiSuccess(article);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const { identity } = await resolveServerAdminSession();
    const { articleId } = await context.params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = UpdateKnowledgeArticleSchema.parse(rawBody);
    const service = await getKnowledgeManagementService();
    const updated = await service.updateArticle(identity, articleId, input);
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
    const { articleId } = await context.params;
    const service = await getKnowledgeManagementService();
    await service.deleteArticle(identity, articleId);
    return jsonApiSuccess({ deleted: true, id: articleId });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


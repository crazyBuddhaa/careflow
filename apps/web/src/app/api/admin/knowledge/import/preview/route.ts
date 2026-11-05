import {
  resolveServerAdminSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { parseKnowledgeDocument } from '@careflow/support-engine';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    await resolveServerAdminSession();

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const { content, fileName } = (rawBody || {}) as { content?: string; fileName?: string };
    if (!content || typeof content !== 'string' || !content.trim()) {
      return jsonApiError('VALIDATION_ERROR', 'File content is required for preview.', 400);
    }

    const parseResult = parseKnowledgeDocument(content, fileName || 'Knowledge Base');
    return jsonApiSuccess(parseResult);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

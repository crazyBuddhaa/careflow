import { KnowledgeStatus } from '@careflow/shared';
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

    const { content, fileName, status, mode } = (rawBody || {}) as {
      content?: string;
      fileName?: string;
      status?: KnowledgeStatus;
      mode?: 'merge' | 'replace';
    };

    if (!content || typeof content !== 'string' || !content.trim()) {
      return jsonApiError('VALIDATION_ERROR', 'File content is required for import.', 400);
    }

    const service = await getKnowledgeManagementService();
    const result = await service.importKnowledgeDocument(identity, {
      content,
      fileName,
      status:
        status === KnowledgeStatus.Draft ? KnowledgeStatus.Draft : KnowledgeStatus.Published,
      mode: mode === 'replace' ? 'replace' : 'merge',
    });

    return jsonApiSuccess(result, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

import { UserRole } from '@careflow/shared';
import { SavedReplyInputSchema } from '@careflow/validation';
import {
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const repo = await getWorkspaceRepository();
    const replies = await repo.listSavedReplies(auth.session.identity.organizationId);
    return jsonApiSuccess(replies);
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

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = SavedReplyInputSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const created = await repo.createSavedReply(auth.session.identity.organizationId, {
      title: input.title,
      category: input.category,
      body: input.body,
      createdByUserId: auth.session.identity.userId,
    });
    return jsonApiSuccess(created, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim();
    if (!id) {
      return jsonApiError('VALIDATION_ERROR', 'Saved reply id is required.', 400);
    }

    const repo = await getWorkspaceRepository();
    await repo.deleteSavedReply(auth.session.identity.organizationId, id);
    return jsonApiSuccess({ deleted: true, id });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

import { UserRole } from '@careflow/shared';
import { hasMinimumRole } from '@careflow/support-engine';
import {
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getChannelIntegrationService } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

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

    const channelService = await getChannelIntegrationService();
    const codeResponse = await channelService.generateAgentTelegramLinkCode({
      organizationId: auth.session.identity.organizationId,
      userId: auth.session.identity.userId,
    });

    return jsonApiSuccess(codeResponse, 201);
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
    const requestedUserId = url.searchParams.get('userId')?.trim();
    const targetUserId = requestedUserId || auth.session.identity.userId;

    if (
      targetUserId !== auth.session.identity.userId &&
      !hasMinimumRole(auth.session.identity, UserRole.Admin)
    ) {
      return jsonApiError(
        'FORBIDDEN',
        'Only Administrators or Owners can revoke another specialist’s Telegram link.',
        403
      );
    }

    const channelService = await getChannelIntegrationService();
    await channelService.revokeAgentTelegramLink({
      organizationId: auth.session.identity.organizationId,
      targetUserId,
    });

    return jsonApiSuccess({ revoked: true, userId: targetUserId });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

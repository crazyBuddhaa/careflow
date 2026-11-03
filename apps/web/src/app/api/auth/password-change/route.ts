import { sendPasswordChangedAlert } from '@careflow/database/d1';
import { ChangePasswordSchema } from '@careflow/validation';
import {
  extractRequestClientMeta,
  getMergedRuntimeEnv,
  resolveServerAdminSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getAuthIdentityService } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/password-change
 * Allows an authenticated user to change their password after verifying their current password.
 */
export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    const session = await resolveServerAdminSession();
    if (!session.identity) {
      return jsonApiError('UNAUTHORIZED', 'Valid authenticated session is required.', 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = ChangePasswordSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const runtimeEnv = getMergedRuntimeEnv();
    const authService = await getAuthIdentityService();

    try {
      const updatedUser = await authService.changePassword({
        userId: session.identity.userId,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: input.revokeOtherSessions,
        currentSessionId: session.sessionId,
        ipAddress,
        userAgent,
      });

      const emailDelivery = await sendPasswordChangedAlert(
        {
          to: updatedUser.email,
          fullName: updatedUser.fullName,
          ipAddress,
          userAgent,
        },
        undefined,
        runtimeEnv
      );

      return jsonApiSuccess({
        changed: true,
        revokedOtherSessions: input.revokeOtherSessions,
        emailDelivery,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to change password.';
      if (msg.startsWith('INVALID_CREDENTIALS:')) {
        return jsonApiError('INVALID_CREDENTIALS', 'Your current password is incorrect.', 401);
      }
      throw err;
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

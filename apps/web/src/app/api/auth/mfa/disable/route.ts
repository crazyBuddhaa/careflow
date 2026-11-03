import { MfaDisableSchema } from '@careflow/validation';
import {
  extractRequestClientMeta,
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
 * POST /api/auth/mfa/disable
 * Removes TOTP MFA from the authenticated user's account after verifying both
 * their current password and a valid authenticator code or recovery code.
 */
export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    const session = await resolveServerAdminSession();
    if (!session.identity || !session.identity.userId.startsWith('usr_')) {
      return jsonApiError('UNAUTHORIZED', 'Authentication required.', 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = MfaDisableSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();

    try {
      await authService.disableMfa({
        userId: session.identity.userId,
        currentPassword: input.currentPassword,
        code: input.code,
        ipAddress,
        userAgent,
      });

      return jsonApiSuccess({
        disabled: true,
        message: 'Two-factor authentication has been removed from your account.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to disable MFA.';
      if (msg.startsWith('INVALID_CREDENTIALS:')) {
        return jsonApiError('INVALID_CREDENTIALS', 'Current password is incorrect.', 401);
      }
      if (msg.startsWith('INVALID_MFA_CODE:')) {
        return jsonApiError(
          'INVALID_MFA_CODE',
          'Invalid authenticator code or recovery code.',
          401
        );
      }
      if (msg.startsWith('MFA_NOT_ENABLED:')) {
        return jsonApiError('MFA_NOT_ENABLED', 'MFA is not currently enabled on this account.', 400);
      }
      throw err;
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

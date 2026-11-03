import { cookies } from 'next/headers';
import { sendPasswordChangedAlert } from '@careflow/database/d1';
import { ConfirmPasswordResetSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  extractRequestClientMeta,
  getMergedRuntimeEnv,
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
 * POST /api/auth/password-reset/confirm
 * Validates a single-use password reset token, updates the password hash,
 * revokes all active sessions, and sends a security notification.
 */
export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = ConfirmPasswordResetSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const runtimeEnv = getMergedRuntimeEnv();
    const authService = await getAuthIdentityService();

    try {
      const updatedUser = await authService.resetPasswordWithToken(
        input.token,
        input.newPassword,
        {
          ipAddress,
          userAgent,
        }
      );

      // Clear any existing session cookie on this browser
      const cookieStore = await cookies();
      cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);

      void sendPasswordChangedAlert(
        {
          to: updatedUser.email,
          fullName: updatedUser.fullName,
          ipAddress,
          userAgent,
        },
        undefined,
        runtimeEnv
      ).catch(() => undefined);

      return jsonApiSuccess({
        reset: true,
        message: 'Your password has been reset and all existing sessions have been signed out. Please sign in with your new password.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reset password.';
      if (msg.startsWith('TOKEN_EXPIRED:')) {
        return jsonApiError(
          'TOKEN_EXPIRED',
          'This password reset token has expired. Please request a new password reset link.',
          410
        );
      }
      if (msg.startsWith('TOKEN_ALREADY_USED:')) {
        return jsonApiError(
          'TOKEN_ALREADY_USED',
          'This password reset token has already been used.',
          409
        );
      }
      return jsonApiError(
        'INVALID_TOKEN',
        'Invalid or unrecognized password reset token.',
        400
      );
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

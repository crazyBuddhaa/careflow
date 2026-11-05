import { cookies } from 'next/headers';
import { MfaVerifyEnrollmentSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  extractRequestClientMeta,
  getAdminCookieOptions,
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
 * POST /api/auth/mfa/verify
 * Verifies the 6-digit TOTP code from the user's authenticator app before activating MFA,
 * and returns 8 single-use recovery codes (storing only their SHA-256 hashes in D1).
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

    const input = MfaVerifyEnrollmentSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();

    const rateCheck = await authService.checkRateLimit('mfa_verify', session.identity.userId);
    if (!rateCheck.allowed) {
      return jsonApiError(
        'RATE_LIMITED',
        `Too many MFA verification attempts. Please wait ${rateCheck.retryAfterSeconds} seconds.`,
        429
      );
    }

    try {
      const result = await authService.confirmMfaEnrollment(
        session.identity.userId,
        input.code,
        { ipAddress, userAgent }
      );
      await authService.resetRateLimit('mfa_verify', session.identity.userId);

      if (session.sessionToken) {
        const updatedSignedToken = createSignedAdminSessionToken({
          userId: session.identity.userId,
          email: session.identity.email || '',
          userName: session.userName,
          organizationId: session.identity.organizationId,
          organizationName: session.organizationName || session.identity.organizationId,
          organizationSlug: session.organizationSlug || '',
          role: session.identity.role,
          sessionId: session.sessionId,
          sessionToken: session.sessionToken,
          emailVerified: session.emailVerified,
          mfaEnabled: true,
        });
        const cookieStore = await cookies();
        cookieStore.set(ADMIN_SESSION_COOKIE_NAME, updatedSignedToken, getAdminCookieOptions());
      }

      return jsonApiSuccess({
        enabled: result.enabled,
        recoveryCodes: result.recoveryCodes,
        message: 'Two-factor authentication (TOTP) is now active on your account.',
      });
    } catch (err) {
      await authService.recordRateLimitAttempt('mfa_verify', session.identity.userId);
      const msg = err instanceof Error ? err.message : 'Unable to verify MFA code.';
      if (msg.startsWith('INVALID_MFA_CODE:')) {
        return jsonApiError(
          'INVALID_MFA_CODE',
          'Invalid 6-digit authenticator code. Verify your authenticator app time and try again.',
          400
        );
      }
      if (msg.startsWith('MFA_NOT_PENDING:')) {
        return jsonApiError(
          'MFA_NOT_PENDING',
          'No pending MFA enrollment found. Start MFA setup first.',
          400
        );
      }
      throw err;
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

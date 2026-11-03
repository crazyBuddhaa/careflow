import { cookies } from 'next/headers';
import { MfaLoginChallengeSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  extractRequestClientMeta,
  getAdminCookieOptions,
  resolveSafeRedirectTarget,
  verifyRequestOriginCsrf,
  verifySignedMfaChallengeToken,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getAuthIdentityService } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

/**
 * POST /api/auth/mfa/challenge
 * Completes the second factor of login when a user has TOTP MFA enabled,
 * accepting either a 6-digit authenticator code or a single-use recovery code.
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

    const input = MfaLoginChallengeSchema.parse(rawBody);
    const redirectCheck = resolveSafeRedirectTarget(input.redirectTo, '/admin');
    if (!redirectCheck.valid) {
      return jsonApiError('INVALID_REDIRECT_URL', 'The provided redirect URL is not permitted.', 400);
    }

    const challenge = verifySignedMfaChallengeToken(input.challengeToken);
    if (!challenge) {
      return jsonApiError(
        'INVALID_CHALLENGE_TOKEN',
        'Your MFA sign-in challenge has expired. Please enter your email and password again.',
        401
      );
    }

    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();

    const rateCheck = await authService.checkRateLimit('mfa_verify', challenge.userId);
    if (!rateCheck.allowed) {
      return jsonApiError(
        'RATE_LIMITED',
        `Too many MFA attempts. Please wait ${rateCheck.retryAfterSeconds} seconds.`,
        429
      );
    }

    const verifyResult = await authService.verifyUserMfaCode(challenge.userId, input.code);
    if (!verifyResult.verified) {
      await authService.recordRateLimitAttempt('mfa_verify', challenge.userId);
      return jsonApiError(
        'INVALID_MFA_CODE',
        'Invalid authenticator code or recovery code.',
        401
      );
    }

    await authService.resetRateLimit('mfa_verify', challenge.userId);

    const workspaces = await authService.getUserWorkspaces(challenge.userId);
    const activeMembership =
      workspaces.find((w) => w.organizationId === challenge.organizationId) ?? workspaces[0];

    if (!activeMembership) {
      return jsonApiError('FORBIDDEN', 'No active workspace membership found for this account.', 403);
    }

    const d1Session = await authService.createSession({
      userId: challenge.userId,
      organizationId: activeMembership.organizationId,
      mfaVerified: true,
      ipAddress,
      userAgent,
    });

    await authService.recordSecurityEvent({
      userId: challenge.userId,
      organizationId: activeMembership.organizationId,
      eventType: 'login_succeeded',
      ipAddress,
      userAgent,
      metadata: { mfaVerified: true, usedRecoveryCode: verifyResult.usedRecoveryCode },
    });

    const token = createSignedAdminSessionToken({
      userId: challenge.userId,
      email: challenge.email,
      organizationId: activeMembership.organizationId,
      organizationName: activeMembership.organizationName,
      organizationSlug: activeMembership.organizationSlug,
      role: activeMembership.role,
      sessionId: d1Session.sessionId,
      sessionToken: d1Session.rawSessionToken,
      mfaEnabled: true,
    });

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

    return jsonApiSuccess({
      authenticated: true,
      usedRecoveryCode: verifyResult.usedRecoveryCode,
      activeWorkspace: activeMembership,
      workspaces,
      redirectUrl: redirectCheck.sanitizedUrl,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

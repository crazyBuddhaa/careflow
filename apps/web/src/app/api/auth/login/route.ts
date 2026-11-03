import { cookies } from 'next/headers';
import {
  sendNewLoginSecurityAlert,
  verifyTurnstileToken,
} from '@careflow/database/d1';
import { UserLoginSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  createSignedMfaChallengeToken,
  extractRequestClientMeta,
  getAdminCookieOptions,
  getMergedRuntimeEnv,
  resolveSafeRedirectTarget,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  getAuthIdentityService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

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

    const input = UserLoginSchema.parse(rawBody);
    const redirectCheck = resolveSafeRedirectTarget(input.redirectTo, '/admin');
    if (!redirectCheck.valid) {
      return jsonApiError('INVALID_REDIRECT_URL', 'The provided redirect URL is not permitted.', 400);
    }

    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const runtimeEnv = getMergedRuntimeEnv();
    const authService = await getAuthIdentityService();
    const rateKey = `${ipAddress}:${input.email.trim().toLowerCase()}`;

    // 1. Rate Limit Check (Login brute-force protection)
    const rateCheck = await authService.checkRateLimit('login', rateKey);
    if (!rateCheck.allowed) {
      return jsonApiError(
        'RATE_LIMITED',
        `Too many sign-in attempts. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
        429,
        { retryAfterSeconds: rateCheck.retryAfterSeconds }
      );
    }

    // 2. Cloudflare Turnstile Bot Protection Verification
    const turnstile = await verifyTurnstileToken(
      {
        token: input.turnstileToken,
        remoteIp: ipAddress,
      },
      runtimeEnv
    );
    if (!turnstile.success) {
      await authService.recordRateLimitAttempt('login', rateKey);
      return jsonApiError(
        turnstile.errorCode || 'TURNSTILE_FAILED',
        turnstile.errorMessage || 'Bot protection check failed.',
        403
      );
    }

    const repo = await getWorkspaceRepository();
    const authResult = await repo.authenticateUser(input.email, input.password);
    if (!authResult) {
      await authService.recordRateLimitAttempt('login', rateKey);
      return jsonApiError(
        'INVALID_CREDENTIALS',
        'Invalid email address or password. Please verify your credentials.',
        401
      );
    }

    const { user, activeMembership, workspaces } = authResult;
    await authService.resetRateLimit('login', rateKey);

    // 3. TOTP Multi-Factor Authentication Check
    if (user.mfaEnabled) {
      if (!input.mfaCode) {
        const challengeToken = createSignedMfaChallengeToken({
          userId: user.id,
          email: user.email,
          organizationId: activeMembership.organizationId,
        });

        await authService.recordSecurityEvent({
          userId: user.id,
          organizationId: activeMembership.organizationId,
          eventType: 'login_mfa_challenged',
          ipAddress,
          userAgent,
        });

        return jsonApiSuccess({
          authenticated: false,
          mfaRequired: true,
          challengeToken,
          redirectUrl: redirectCheck.sanitizedUrl,
        });
      }

      const mfaRate = await authService.checkRateLimit('mfa_verify', user.id);
      if (!mfaRate.allowed) {
        return jsonApiError(
          'RATE_LIMITED',
          `Too many MFA verification attempts. Please wait ${mfaRate.retryAfterSeconds} seconds.`,
          429,
          { retryAfterSeconds: mfaRate.retryAfterSeconds }
        );
      }

      const mfaVerify = await authService.verifyUserMfaCode(user.id, input.mfaCode);
      if (!mfaVerify.verified) {
        await authService.recordRateLimitAttempt('mfa_verify', user.id);
        return jsonApiError(
          'INVALID_MFA_CODE',
          'Invalid authenticator code or recovery code.',
          401
        );
      }
      await authService.resetRateLimit('mfa_verify', user.id);
    }

    // 4. Issue fresh D1 server-side session (prevents session fixation)
    const d1Session = await authService.createSession({
      userId: user.id,
      organizationId: activeMembership.organizationId,
      mfaVerified: Boolean(user.mfaEnabled),
      ipAddress,
      userAgent,
    });

    await authService.recordSecurityEvent({
      userId: user.id,
      organizationId: activeMembership.organizationId,
      eventType: 'login_succeeded',
      ipAddress,
      userAgent,
    });

    // Non-blocking security notification via Resend if configured
    void sendNewLoginSecurityAlert(
      {
        to: user.email,
        fullName: user.fullName,
        ipAddress,
        userAgent,
        organizationName: activeMembership.organizationName,
      },
      undefined,
      runtimeEnv
    ).catch(() => undefined);

    const token = createSignedAdminSessionToken({
      userId: user.id,
      email: user.email,
      userName: user.fullName,
      organizationId: activeMembership.organizationId,
      organizationName: activeMembership.organizationName,
      organizationSlug: activeMembership.organizationSlug,
      role: activeMembership.role,
      sessionId: d1Session.sessionId,
      sessionToken: d1Session.rawSessionToken,
      emailVerified: user.emailVerified,
      mfaEnabled: Boolean(user.mfaEnabled),
    });

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

    return jsonApiSuccess({
      authenticated: true,
      mfaRequired: false,
      user,
      activeWorkspace: activeMembership,
      workspaces,
      redirectUrl: redirectCheck.sanitizedUrl,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

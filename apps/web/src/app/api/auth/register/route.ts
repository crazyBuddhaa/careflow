import { cookies } from 'next/headers';
import { UserRole } from '@careflow/shared';
import {
  sendEmailVerificationMessage,
  verifyTurnstileToken,
} from '@careflow/database/d1';
import { FullRegistrationSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
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

    const input = FullRegistrationSchema.parse(rawBody);
    const redirectCheck = resolveSafeRedirectTarget(input.redirectTo, '/admin');
    if (!redirectCheck.valid) {
      return jsonApiError('INVALID_REDIRECT_URL', 'The provided redirect URL is not permitted.', 400);
    }

    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const runtimeEnv = getMergedRuntimeEnv();
    const authService = await getAuthIdentityService();

    // 1. Rate Limit Check (Registration)
    const rateCheck = await authService.checkRateLimit('register', ipAddress);
    if (!rateCheck.allowed) {
      return jsonApiError(
        'RATE_LIMITED',
        `Too many registration attempts. Please try again in ${rateCheck.retryAfterSeconds} seconds.`,
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
      await authService.recordRateLimitAttempt('register', ipAddress);
      return jsonApiError(
        turnstile.errorCode || 'TURNSTILE_FAILED',
        turnstile.errorMessage || 'Bot protection check failed.',
        403
      );
    }

    await authService.recordRateLimitAttempt('register', ipAddress);
    const repo = await getWorkspaceRepository();

    try {
      const result = await repo.registerUserAndFirstBusiness({
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        businessName: input.businessName,
        industry: input.industry,
        country: input.country,
        website: input.website,
        requireEmailVerification: true,
        ipAddress,
        userAgent,
      });

      // Create server-side D1 session
      const d1Session = await authService.createSession({
        userId: result.user.id,
        organizationId: result.organization.id,
        mfaVerified: false,
        ipAddress,
        userAgent,
      });

      // Dispatch transactional verification email via Resend (graceful if custom domain not yet configured)
      const emailDelivery = await sendEmailVerificationMessage(
        {
          to: result.user.email,
          fullName: result.user.fullName,
          rawToken: result.verificationToken,
        },
        undefined,
        runtimeEnv
      );

      // Issue signed HttpOnly session cookie referencing D1 session
      const token = createSignedAdminSessionToken({
        userId: result.user.id,
        email: result.user.email,
        userName: result.user.fullName,
        organizationId: result.organization.id,
        organizationName: result.organization.name,
        organizationSlug: result.organization.slug,
        role: UserRole.Owner,
        sessionId: d1Session.sessionId,
        sessionToken: d1Session.rawSessionToken,
        emailVerified: result.user.emailVerified,
        mfaEnabled: false,
      });

      const cookieStore = await cookies();
      cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

      return jsonApiSuccess(
        {
          user: result.user,
          organization: result.organization,
          emailDelivery,
          redirectUrl: redirectCheck.sanitizedUrl,
        },
        201
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to complete registration.';
      if (message.includes('already exists') || message.includes('reserved')) {
        return jsonApiError(
          'REGISTRATION_CONFLICT',
          'Unable to register with the provided account details. If you already have an account, please sign in or reset your password.',
          409
        );
      }
      throw err;
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

import { sendEmailVerificationMessage } from '@careflow/database/d1';
import { VerifyEmailTokenSchema } from '@careflow/validation';
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
 * POST /api/auth/verify-email
 * Verifies a single-use email verification token.
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

    const input = VerifyEmailTokenSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();

    try {
      const verifiedUser = await authService.verifyEmailWithToken(input.token, {
        ipAddress,
        userAgent,
      });

      return jsonApiSuccess({
        verified: true,
        user: verifiedUser,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to verify email token.';
      if (msg.startsWith('TOKEN_EXPIRED:')) {
        return jsonApiError(
          'TOKEN_EXPIRED',
          'This email verification token has expired. Request a new verification email.',
          410
        );
      }
      if (msg.startsWith('TOKEN_ALREADY_USED:')) {
        return jsonApiError(
          'TOKEN_ALREADY_USED',
          'This email verification token has already been used.',
          409
        );
      }
      return jsonApiError(
        'INVALID_TOKEN',
        'Invalid email verification token.',
        400
      );
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

/**
 * PUT /api/auth/verify-email
 * Issues and sends a new single-use email verification token for the signed-in user.
 */
export async function PUT(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    const session = await resolveServerAdminSession();
    if (!session.identity || !session.identity.email) {
      return jsonApiError('UNAUTHORIZED', 'Sign in to request a verification email.', 401);
    }

    const authService = await getAuthIdentityService();
    const rateCheck = await authService.checkRateLimit(
      'password_reset',
      `verify:${session.identity.userId}`
    );
    if (!rateCheck.allowed) {
      return jsonApiError(
        'RATE_LIMITED',
        `Please wait ${rateCheck.retryAfterSeconds} seconds before requesting another verification email.`,
        429
      );
    }

    await authService.recordRateLimitAttempt(
      'password_reset',
      `verify:${session.identity.userId}`
    );

    const { rawToken, expiresAt } = await authService.issueEmailVerificationToken(
      session.identity.userId
    );

    const runtimeEnv = getMergedRuntimeEnv();
    const emailDelivery = await sendEmailVerificationMessage(
      {
        to: session.identity.email,
        fullName: session.userName || 'CareFlow User',
        rawToken,
      },
      undefined,
      runtimeEnv
    );

    return jsonApiSuccess({
      issued: true,
      expiresAt,
      emailDelivery,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

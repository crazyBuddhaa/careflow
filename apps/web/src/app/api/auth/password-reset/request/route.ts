import {
  resolveResendConfig,
  sendPasswordResetMessage,
  verifyTurnstileToken,
} from '@careflow/database/d1';
import { RequestPasswordResetSchema } from '@careflow/validation';
import {
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
 * POST /api/auth/password-reset/request
 * Generates a single-use SHA-256 hashed password reset token and sends it via Resend.
 * Always returns a generic success message to avoid revealing whether an email is registered.
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

    const input = RequestPasswordResetSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const runtimeEnv = getMergedRuntimeEnv();
    const authService = await getAuthIdentityService();
    const rateKey = `${ipAddress}:${input.email.trim().toLowerCase()}`;

    // 1. Rate Limit Check
    const rateCheck = await authService.checkRateLimit('password_reset', rateKey);
    if (!rateCheck.allowed) {
      return jsonApiError(
        'RATE_LIMITED',
        `Too many password reset requests. Please wait ${rateCheck.retryAfterSeconds} seconds before trying again.`,
        429,
        { retryAfterSeconds: rateCheck.retryAfterSeconds }
      );
    }

    // 2. Cloudflare Turnstile Bot Protection
    const turnstile = await verifyTurnstileToken(
      {
        token: input.turnstileToken,
        remoteIp: ipAddress,
      },
      runtimeEnv
    );
    if (!turnstile.success) {
      await authService.recordRateLimitAttempt('password_reset', rateKey);
      return jsonApiError(
        turnstile.errorCode || 'TURNSTILE_FAILED',
        turnstile.errorMessage || 'Bot protection check failed.',
        403
      );
    }

    await authService.recordRateLimitAttempt('password_reset', rateKey);

    const resetResult = await authService.createPasswordResetToken(input.email, {
      ipAddress,
      userAgent,
    });

    const resendCfg = resolveResendConfig(undefined, runtimeEnv);
    let devToken: string | undefined;
    let devPreviewUrl: string | undefined;

    if (resetResult.userFound && resetResult.user && resetResult.rawToken) {
      const delivery = await sendPasswordResetMessage(
        {
          to: resetResult.user.email,
          fullName: resetResult.user.fullName,
          rawToken: resetResult.rawToken,
        },
        undefined,
        runtimeEnv
      );
      if (resendCfg.exposeDevTokens) {
        devToken = delivery.devToken;
        devPreviewUrl = delivery.devPreviewUrl;
      }
    }

    return jsonApiSuccess({
      accepted: true,
      message:
        'If an account exists for that email address, password reset instructions have been sent.',
      ...(resendCfg.exposeDevTokens && devToken
        ? {
            devToken,
            devPreviewUrl,
          }
        : {}),
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

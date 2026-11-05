export interface TurnstileVerificationResult {
  success: boolean;
  configured: boolean;
  errorCode?: string;
  errorMessage?: string;
  internalReason?: string;
}

export interface VerifyTurnstileOptions {
  token?: string | null;
  remoteIp?: string | null;
  secretKey?: string | null;
  /**
   * When true, requires a valid token even if TURNSTILE_SECRET_KEY is not set in env.
   */
  requireToken?: boolean;
}

const DUMMY_PASS_TOKEN = 'CF_TURNSTILE_TEST_PASS';
const DUMMY_FAIL_TOKEN = 'CF_TURNSTILE_TEST_FAIL';

/**
 * Verifies a Cloudflare Turnstile bot-protection token server-side.
 *
 * - When `TURNSTILE_SECRET_KEY` is configured in Cloudflare Worker secrets or `process.env`,
 *   validates the token via `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
 * - Supports deterministic test tokens (`CF_TURNSTILE_TEST_PASS` / `CF_TURNSTILE_TEST_FAIL`)
 *   for automated security test suites.
 * - When Turnstile is not yet configured in local development, allows requests unless
 *   `requireToken: true` or `DUMMY_FAIL_TOKEN` is supplied.
 */
export async function verifyTurnstileToken(
  options: VerifyTurnstileOptions,
  envSource: Record<string, unknown> = typeof process !== 'undefined' ? process.env : {}
): Promise<TurnstileVerificationResult> {
  const token = options.token?.trim() || '';
  const rawConfiguredSecret =
    options.secretKey?.trim() ||
    (typeof envSource.TURNSTILE_SECRET_KEY === 'string'
      ? envSource.TURNSTILE_SECRET_KEY.trim()
      : '');

  const configuredSiteKey =
    (typeof envSource.NEXT_PUBLIC_TURNSTILE_SITE_KEY === 'string'
      ? envSource.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim()
      : '') ||
    (typeof envSource.TURNSTILE_SITE_KEY === 'string'
      ? envSource.TURNSTILE_SITE_KEY.trim()
      : '');

  const isProduction = envSource.NODE_ENV === 'production';

  // In non-production development runtime (where NEXT_PUBLIC_APP_NAME or CAREFLOW_APP_BASE_URL is set),
  // only enforce Turnstile when the frontend also has a Site Key to render the widget.
  const isDevAppRuntimeWithoutSiteKey =
    !isProduction &&
    Boolean(envSource.NEXT_PUBLIC_APP_NAME || envSource.CAREFLOW_APP_BASE_URL) &&
    !configuredSiteKey &&
    !options.secretKey?.trim();

  const configuredSecret = isDevAppRuntimeWithoutSiteKey ? '' : rawConfiguredSecret;

  // Explicit test failure token is always rejected
  if (token === DUMMY_FAIL_TOKEN) {
    return {
      success: false,
      configured: Boolean(configuredSecret),
      errorCode: 'TURNSTILE_VERIFICATION_FAILED',
      errorMessage: 'Security verification failed. Please complete the challenge and try again.',
    };
  }

  // Explicit test pass token is accepted only in non-production or test runs
  if (token === DUMMY_PASS_TOKEN && !isProduction) {
    return {
      success: true,
      configured: Boolean(configuredSecret),
    };
  }

  if (!configuredSecret) {
    if (
      isProduction &&
      (options.requireToken ??
        Boolean(configuredSiteKey || envSource.CAREFLOW_ENFORCE_TURNSTILE !== 'false'))
    ) {
      return {
        success: false,
        configured: false,
        errorCode: 'TURNSTILE_NOT_CONFIGURED',
        errorMessage:
          'Security verification is temporarily unavailable. Please try again in a few moments.',
        internalReason:
          'TURNSTILE_SECRET_KEY is missing in Cloudflare Worker secrets while production Turnstile enforcement is active.',
      };
    }

    if (options.requireToken) {
      return {
        success: false,
        configured: false,
        errorCode: 'TURNSTILE_TOKEN_REQUIRED',
        errorMessage: 'Please complete the security verification check before continuing.',
        internalReason: 'TURNSTILE_SECRET_KEY is not configured while requireToken=true.',
      };
    }

    return {
      success: true,
      configured: false,
      internalReason: isProduction
        ? 'TURNSTILE_SECRET_KEY is not set in Worker secrets; server-side siteverify was skipped.'
        : undefined,
    };
  }

  if (!token) {
    return {
      success: false,
      configured: true,
      errorCode: 'TURNSTILE_TOKEN_REQUIRED',
      errorMessage: 'Please complete the security verification challenge before continuing.',
    };
  }

  try {
    const formData = new URLSearchParams();
    formData.set('secret', configuredSecret);
    formData.set('response', token);
    if (options.remoteIp) {
      formData.set('remoteip', options.remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (!res.ok || !data.success) {
      return {
        success: false,
        configured: true,
        errorCode: data['error-codes']?.[0] || 'TURNSTILE_VERIFICATION_FAILED',
        errorMessage: 'Bot protection verification failed. Please refresh the challenge and try again.',
      };
    }

    return {
      success: true,
      configured: true,
    };
  } catch {
    return {
      success: false,
      configured: true,
      errorCode: 'TURNSTILE_NETWORK_ERROR',
      errorMessage: 'Unable to verify bot protection challenge right now. Please try again.',
    };
  }
}

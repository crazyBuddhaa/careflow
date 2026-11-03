import { z } from 'zod';

const PlaceholderValues = new Set([
  'replace-with-at-least-32-character-random-secret',
  'careflow-dev-only-hmac-session-secret-change-in-production',
  '',
]);

function isConfiguredValue(val: string | undefined): val is string {
  return Boolean(val && !PlaceholderValues.has(val.trim()));
}

export const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('CustomCare'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_INITIAL_CLIENT: z.string().min(1).default('CustomCare'),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
});

export const ServerEnvSchema = PublicEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  CAREFLOW_ADMIN_SESSION_SECRET: z.string().min(16).optional(),
  CAREFLOW_SQLITE_PATH: z.string().min(1).optional(),
  CAREFLOW_APP_BASE_URL: z.string().url().optional(),
  CAREFLOW_AUTH_CALLBACK_URL: z.string().url().optional(),
  CAREFLOW_ALLOWED_REDIRECT_URLS: z.string().optional(),
  CAREFLOW_ENFORCE_ADMIN_MFA: z.enum(['true', 'false']).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  CAREFLOW_EMAIL_FROM_ADDRESS: z.string().email().optional(),
  CAREFLOW_EMAIL_FROM_NAME: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export interface ValidatedEnvStatus {
  publicEnv: PublicEnv;
  isSessionSecretConfigured: boolean;
  isTurnstileConfigured: boolean;
  isResendConfigured: boolean;
  validationErrors: string[];
}

export function validatePublicEnv(rawEnv: Record<string, string | undefined>): PublicEnv {
  const normalized = {
    NEXT_PUBLIC_APP_NAME: rawEnv.NEXT_PUBLIC_APP_NAME || 'CustomCare',
    NEXT_PUBLIC_APP_URL: isConfiguredValue(rawEnv.NEXT_PUBLIC_APP_URL)
      ? rawEnv.NEXT_PUBLIC_APP_URL
      : 'http://localhost:3000',
    NEXT_PUBLIC_INITIAL_CLIENT: rawEnv.NEXT_PUBLIC_INITIAL_CLIENT || 'CustomCare',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: isConfiguredValue(rawEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
      ? rawEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      : undefined,
  };

  return PublicEnvSchema.parse(normalized);
}

export function validateServerEnv(rawEnv: Record<string, string | undefined>): {
  env: ServerEnv;
  status: ValidatedEnvStatus;
} {
  if (typeof window !== 'undefined') {
    throw new Error(
      'Security Violation: validateServerEnv() must only be called in a server-side runtime.'
    );
  }

  const normalized = {
    NODE_ENV:
      rawEnv.NODE_ENV === 'production' || rawEnv.NODE_ENV === 'test'
        ? rawEnv.NODE_ENV
        : 'development',
    NEXT_PUBLIC_APP_NAME: rawEnv.NEXT_PUBLIC_APP_NAME || 'CustomCare',
    NEXT_PUBLIC_APP_URL: isConfiguredValue(rawEnv.NEXT_PUBLIC_APP_URL)
      ? rawEnv.NEXT_PUBLIC_APP_URL
      : 'http://localhost:3000',
    NEXT_PUBLIC_INITIAL_CLIENT: rawEnv.NEXT_PUBLIC_INITIAL_CLIENT || 'CustomCare',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: isConfiguredValue(rawEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
      ? rawEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      : undefined,
    TELEGRAM_BOT_TOKEN: isConfiguredValue(rawEnv.TELEGRAM_BOT_TOKEN)
      ? rawEnv.TELEGRAM_BOT_TOKEN
      : undefined,
    TELEGRAM_WEBHOOK_SECRET: isConfiguredValue(rawEnv.TELEGRAM_WEBHOOK_SECRET)
      ? rawEnv.TELEGRAM_WEBHOOK_SECRET
      : undefined,
    CAREFLOW_ADMIN_SESSION_SECRET: isConfiguredValue(rawEnv.CAREFLOW_ADMIN_SESSION_SECRET)
      ? rawEnv.CAREFLOW_ADMIN_SESSION_SECRET
      : undefined,
    CAREFLOW_SQLITE_PATH: isConfiguredValue(rawEnv.CAREFLOW_SQLITE_PATH)
      ? rawEnv.CAREFLOW_SQLITE_PATH
      : undefined,
    CAREFLOW_APP_BASE_URL: isConfiguredValue(rawEnv.CAREFLOW_APP_BASE_URL)
      ? rawEnv.CAREFLOW_APP_BASE_URL
      : undefined,
    CAREFLOW_AUTH_CALLBACK_URL: isConfiguredValue(rawEnv.CAREFLOW_AUTH_CALLBACK_URL)
      ? rawEnv.CAREFLOW_AUTH_CALLBACK_URL
      : undefined,
    CAREFLOW_ALLOWED_REDIRECT_URLS: isConfiguredValue(rawEnv.CAREFLOW_ALLOWED_REDIRECT_URLS)
      ? rawEnv.CAREFLOW_ALLOWED_REDIRECT_URLS
      : isConfiguredValue(rawEnv.CAREFLOW_ALLOWED_REDIRECT_ORIGINS)
        ? rawEnv.CAREFLOW_ALLOWED_REDIRECT_ORIGINS
        : undefined,
    CAREFLOW_ENFORCE_ADMIN_MFA:
      rawEnv.CAREFLOW_ENFORCE_ADMIN_MFA === 'true' ||
      rawEnv.CAREFLOW_ENFORCE_ADMIN_MFA === 'false'
        ? rawEnv.CAREFLOW_ENFORCE_ADMIN_MFA
        : undefined,
    RESEND_API_KEY: isConfiguredValue(rawEnv.RESEND_API_KEY)
      ? rawEnv.RESEND_API_KEY
      : undefined,
    CAREFLOW_EMAIL_FROM_ADDRESS: isConfiguredValue(rawEnv.CAREFLOW_EMAIL_FROM_ADDRESS)
      ? rawEnv.CAREFLOW_EMAIL_FROM_ADDRESS
      : undefined,
    CAREFLOW_EMAIL_FROM_NAME: isConfiguredValue(rawEnv.CAREFLOW_EMAIL_FROM_NAME)
      ? rawEnv.CAREFLOW_EMAIL_FROM_NAME
      : undefined,
    TURNSTILE_SECRET_KEY: isConfiguredValue(rawEnv.TURNSTILE_SECRET_KEY)
      ? rawEnv.TURNSTILE_SECRET_KEY
      : undefined,
  };

  const parsed = ServerEnvSchema.safeParse(normalized);

  if (!parsed.success) {
    const errors = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
    const fallbackPublic = PublicEnvSchema.parse({
      NEXT_PUBLIC_APP_NAME: 'CustomCare',
      NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
      NEXT_PUBLIC_INITIAL_CLIENT: 'CustomCare',
    });

    return {
      env: {
        ...fallbackPublic,
        NODE_ENV: 'development',
      },
      status: {
        publicEnv: fallbackPublic,
        isSessionSecretConfigured: false,
        isTurnstileConfigured: false,
        isResendConfigured: false,
        validationErrors: errors,
      },
    };
  }

  const data = parsed.data;
  const isSessionSecretConfigured = Boolean(
    data.CAREFLOW_ADMIN_SESSION_SECRET && data.CAREFLOW_ADMIN_SESSION_SECRET.length >= 16
  );
  const isTurnstileConfigured = Boolean(
    data.TURNSTILE_SECRET_KEY && data.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );
  const isResendConfigured = Boolean(
    data.RESEND_API_KEY && data.CAREFLOW_EMAIL_FROM_ADDRESS
  );

  return {
    env: data,
    status: {
      publicEnv: {
        NEXT_PUBLIC_APP_NAME: data.NEXT_PUBLIC_APP_NAME,
        NEXT_PUBLIC_APP_URL: data.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_INITIAL_CLIENT: data.NEXT_PUBLIC_INITIAL_CLIENT,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: data.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      },
      isSessionSecretConfigured,
      isTurnstileConfigured,
      isResendConfigured,
      validationErrors: [],
    },
  };
}


import { validatePublicEnv, validateServerEnv } from '@careflow/validation';
import { getActiveCloudflareEnv } from '@/lib/knowledge-runtime';

/**
 * Browser-safe environment accessor.
 * Explicitly references NEXT_PUBLIC_* properties so Next.js can inline them safely.
 */
export function getPublicEnv() {
  return validatePublicEnv({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_INITIAL_CLIENT: process.env.NEXT_PUBLIC_INITIAL_CLIENT,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  });
}

/**
 * Server-only environment accessor.
 * Merges Node `process.env` with Cloudflare Workers `context.env` so encrypted
 * Worker secrets (`CAREFLOW_ADMIN_SESSION_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`)
 * and runtime variables are always detected in production.
 */
export function getServerEnv() {
  const cfEnv = getActiveCloudflareEnv() ?? {};
  const merged: Record<string, string | undefined> = { ...process.env };
  for (const [key, value] of Object.entries(cfEnv)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      merged[key] = value.trim();
    }
  }
  return validateServerEnv(merged);
}


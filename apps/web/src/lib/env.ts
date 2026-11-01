import { validatePublicEnv, validateServerEnv } from '@careflow/validation';

/**
 * Browser-safe environment accessor.
 * Explicitly references NEXT_PUBLIC_* properties so Next.js can inline them safely.
 */
export function getPublicEnv() {
  return validatePublicEnv({
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_INITIAL_CLIENT: process.env.NEXT_PUBLIC_INITIAL_CLIENT,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/**
 * Server-only environment accessor.
 * Throws if accidentally imported and invoked inside a client component.
 */
export function getServerEnv() {
  return validateServerEnv(process.env);
}

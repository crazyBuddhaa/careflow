import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@careflow/database';
import {
  createCareFlowServerSessionClient,
  createCareFlowServiceRoleClient,
} from '@careflow/database/server';
import { getServerEnv } from '@/lib/env';

/**
 * Request-scoped Supabase client for Next.js Server Components & Route Handlers.
 * Enforces Row Level Security (RLS) via cookie-backed user sessions.
 */
export async function getSupabaseServerSessionClient(): Promise<SupabaseClient<Database> | null> {
  const { env, status } = getServerEnv();

  if (
    !status.isSupabasePublicConfigured ||
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const cookieStore = await cookies();

  return createCareFlowServerSessionClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Ignored when invoked from read-only Server Components; Middleware refreshes sessions.
        }
      },
    },
  });
}

/**
 * Privileged server-only Supabase client using SUPABASE_SERVICE_ROLE_KEY.
 * Strictly isolated to trusted server-side Route Handlers (e.g., signed channel webhooks).
 */
export function getSupabaseServiceRoleAdminClient(): SupabaseClient<Database> | null {
  const { env, status } = getServerEnv();

  if (
    !status.isSupabaseServerConfigured ||
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  return createCareFlowServiceRoleClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

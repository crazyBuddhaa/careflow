import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export interface CookieStoreAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll?(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>): void;
}

export interface ServerSessionClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  cookies: CookieStoreAdapter;
}

export interface ServiceRoleClientConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

function assertServerRuntime(caller: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(`Security Violation: ${caller} must never be invoked in the browser.`);
  }
}

/**
 * Creates a request-scoped server Supabase client that respects user session cookies and RLS.
 * Portable across Next.js Route Handlers, Server Components, and Middleware via CookieStoreAdapter.
 */
export function createCareFlowServerSessionClient(
  config: ServerSessionClientConfig
): SupabaseClient<Database> {
  assertServerRuntime('createCareFlowServerSessionClient');

  return createServerClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll() {
        return config.cookies.getAll();
      },
      setAll(cookiesToSet) {
        if (config.cookies.setAll) {
          config.cookies.setAll(cookiesToSet);
        }
      },
    },
  });
}

/**
 * Creates a privileged server-only Supabase admin client using SUPABASE_SERVICE_ROLE_KEY.
 * Strictly reserved for trusted backend webhooks (e.g. Telegram ingress) and system background tasks.
 * Never expose this client or key to client-side bundles.
 */
export function createCareFlowServiceRoleClient(
  config: ServiceRoleClientConfig
): SupabaseClient<Database> {
  assertServerRuntime('createCareFlowServiceRoleClient');

  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error(
      'Cannot initialize service-role Supabase client: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'
    );
  }

  return createClient<Database>(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

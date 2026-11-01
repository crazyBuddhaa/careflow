import { createCareFlowBrowserClient, type Database } from '@careflow/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv } from '@/lib/env';

let browserClientInstance: SupabaseClient<Database> | null = null;

/**
 * Returns a singleton browser Supabase client when NEXT_PUBLIC_SUPABASE_*
 * credentials are configured. Never accesses service-role credentials.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  const env = getPublicEnv();

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return null;
  }

  if (!browserClientInstance) {
    browserClientInstance = createCareFlowBrowserClient({
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });
  }

  return browserClientInstance;
}

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

export interface PublicSupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Creates a browser-safe Supabase client restricted to the public anon key
 * and governed by PostgreSQL Row Level Security (RLS) policies.
 */
export function createCareFlowBrowserClient(
  config: PublicSupabaseConfig
): SupabaseClient<Database> {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error(
      'Cannot initialize browser Supabase client: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.'
    );
  }

  return createBrowserClient<Database>(config.supabaseUrl, config.supabaseAnonKey);
}

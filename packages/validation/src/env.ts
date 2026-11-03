import { z } from 'zod';

const PlaceholderValues = new Set([
  'https://your-project-ref.supabase.co',
  'your-supabase-anon-public-key',
  'your-supabase-service-role-secret-key',
  '',
]);

function isConfiguredValue(val: string | undefined): val is string {
  return Boolean(val && !PlaceholderValues.has(val.trim()));
}

export const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('CustomCare'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_INITIAL_CLIENT: z.string().min(1).default('CustomCare'),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

export const ServerEnvSchema = PublicEnvSchema.extend({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  CAREFLOW_ADMIN_SESSION_SECRET: z.string().min(16).optional(),
  CAREFLOW_ADMIN_PASSCODE: z.string().min(4).optional(),
  CAREFLOW_SQLITE_PATH: z.string().min(1).optional(),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export interface ValidatedEnvStatus {
  publicEnv: PublicEnv;
  isSupabasePublicConfigured: boolean;
  isSupabaseServerConfigured: boolean;
  validationErrors: string[];
}

export function validatePublicEnv(rawEnv: Record<string, string | undefined>): PublicEnv {
  const normalized = {
    NEXT_PUBLIC_APP_NAME: rawEnv.NEXT_PUBLIC_APP_NAME || 'CustomCare',
    NEXT_PUBLIC_APP_URL: isConfiguredValue(rawEnv.NEXT_PUBLIC_APP_URL)
      ? rawEnv.NEXT_PUBLIC_APP_URL
      : 'http://localhost:3000',
    NEXT_PUBLIC_INITIAL_CLIENT: rawEnv.NEXT_PUBLIC_INITIAL_CLIENT || 'CustomCare',
    NEXT_PUBLIC_SUPABASE_URL: isConfiguredValue(rawEnv.NEXT_PUBLIC_SUPABASE_URL)
      ? rawEnv.NEXT_PUBLIC_SUPABASE_URL
      : undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: isConfiguredValue(rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      ? rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
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
    NEXT_PUBLIC_SUPABASE_URL: isConfiguredValue(rawEnv.NEXT_PUBLIC_SUPABASE_URL)
      ? rawEnv.NEXT_PUBLIC_SUPABASE_URL
      : undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: isConfiguredValue(rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY)
      ? rawEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
      : undefined,
    SUPABASE_SERVICE_ROLE_KEY: isConfiguredValue(rawEnv.SUPABASE_SERVICE_ROLE_KEY)
      ? rawEnv.SUPABASE_SERVICE_ROLE_KEY
      : undefined,
    DATABASE_URL: isConfiguredValue(rawEnv.DATABASE_URL) ? rawEnv.DATABASE_URL : undefined,
    TELEGRAM_BOT_TOKEN: isConfiguredValue(rawEnv.TELEGRAM_BOT_TOKEN)
      ? rawEnv.TELEGRAM_BOT_TOKEN
      : undefined,
    TELEGRAM_WEBHOOK_SECRET: isConfiguredValue(rawEnv.TELEGRAM_WEBHOOK_SECRET)
      ? rawEnv.TELEGRAM_WEBHOOK_SECRET
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
        isSupabasePublicConfigured: false,
        isSupabaseServerConfigured: false,
        validationErrors: errors,
      },
    };
  }

  const data = parsed.data;
  const isSupabasePublicConfigured = Boolean(
    data.NEXT_PUBLIC_SUPABASE_URL && data.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const isSupabaseServerConfigured = Boolean(
    isSupabasePublicConfigured && data.SUPABASE_SERVICE_ROLE_KEY
  );

  return {
    env: data,
    status: {
      publicEnv: {
        NEXT_PUBLIC_APP_NAME: data.NEXT_PUBLIC_APP_NAME,
        NEXT_PUBLIC_APP_URL: data.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_INITIAL_CLIENT: data.NEXT_PUBLIC_INITIAL_CLIENT,
        NEXT_PUBLIC_SUPABASE_URL: data.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      },
      isSupabasePublicConfigured,
      isSupabaseServerConfigured,
      validationErrors: [],
    },
  };
}

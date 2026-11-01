import {
  CAREFLOW_NAME,
  CAREFLOW_VERSION,
  SupportChannel,
  type HealthCheckReport,
} from '@careflow/shared';
import { CORE_MODULE_REGISTRY } from '@careflow/support-engine';
import { getServerEnv } from '@/lib/env';

/**
 * Pure business service constructing the CareFlow platform health report.
 * Separated from Next.js HTTP Request/Response objects for portability.
 */
export function buildSystemHealthReport(): HealthCheckReport {
  const { env, status } = getServerEnv();

  return {
    service: CAREFLOW_NAME,
    version: CAREFLOW_VERSION,
    client: env.NEXT_PUBLIC_INITIAL_CLIENT,
    status: status.validationErrors.length === 0 ? 'operational' : 'degraded',
    environment: env.NODE_ENV,
    architecture: {
      hosting: 'vercel-ready',
      backend: 'nextjs-route-handlers',
      database: 'supabase-postgresql',
      realtime: 'supabase-realtime-prepared',
      channels: [
        SupportChannel.WebWidget,
        SupportChannel.Telegram,
        SupportChannel.Portal,
      ],
    },
    supabase: {
      publicClientConfigured: status.isSupabasePublicConfigured,
      serverRoleConfigured: status.isSupabaseServerConfigured,
    },
    modules: CORE_MODULE_REGISTRY.map((mod) => ({
      key: mod.key,
      name: mod.name,
      stage: mod.stage,
    })),
    timestamp: new Date().toISOString(),
  };
}

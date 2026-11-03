import {
  CAREFLOW_NAME,
  CAREFLOW_VERSION,
  type HealthCheckReport,
} from '@careflow/shared';
import { getServerEnv } from '@/lib/env';
import { getKnowledgeDatabase } from '@/lib/knowledge-runtime';

/**
 * Performs a real Cloudflare D1 / SQLite connectivity check (`SELECT 1`)
 * and validates server environment configuration.
 */
export async function checkSystemHealthReport(): Promise<HealthCheckReport> {
  const { status } = getServerEnv();
  const startedAt = Date.now();
  let dbConnected = false;
  let dbErrorMessage: string | undefined;

  try {
    const db = await getKnowledgeDatabase();
    const probe = await db
      .prepare(`SELECT 1 AS ok FROM organizations LIMIT 1`)
      .first<{ ok: number }>();
    dbConnected = probe === null || probe?.ok === 1;
  } catch (err) {
    dbConnected = false;
    dbErrorMessage = err instanceof Error ? err.message : 'D1 database connectivity probe failed.';
  }

  const latencyMs = Math.max(0, Date.now() - startedAt);
  const isHealthy = status.validationErrors.length === 0 && dbConnected;

  return {
    service: CAREFLOW_NAME,
    version: CAREFLOW_VERSION,
    status: isHealthy ? 'operational' : 'degraded',
    timestamp: new Date().toISOString(),
    database: {
      connected: dbConnected,
      engine: 'd1-sqlite',
      latencyMs,
      ...(dbErrorMessage ? { errorMessage: dbErrorMessage } : {}),
    },
    security: {
      sessionSecretConfigured: status.isSessionSecretConfigured,
      turnstileConfigured: status.isTurnstileConfigured,
      resendConfigured: status.isResendConfigured,
    },
  };
}


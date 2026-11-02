import {
  CAREFLOW_NAME,
  CAREFLOW_VERSION,
  type HealthCheckReport,
} from '@careflow/shared';
import { getServerEnv } from '@/lib/env';

/**
 * Pure business service constructing the CareFlow platform health report.
 */
export function buildSystemHealthReport(): HealthCheckReport {
  const { status } = getServerEnv();

  return {
    service: CAREFLOW_NAME,
    version: CAREFLOW_VERSION,
    status: status.validationErrors.length === 0 ? 'operational' : 'degraded',
    timestamp: new Date().toISOString(),
  };
}

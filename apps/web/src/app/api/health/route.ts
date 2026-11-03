import { NextResponse } from 'next/server';
import { CAREFLOW_VERSION, type ApiSuccessResponse, type HealthCheckReport } from '@careflow/shared';
import { checkSystemHealthReport } from '@/services/health.service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const report = await checkSystemHealthReport();

  const body: ApiSuccessResponse<HealthCheckReport> = {
    ok: true,
    data: report,
    meta: {
      version: CAREFLOW_VERSION,
      timestamp: report.timestamp,
    },
  };

  return NextResponse.json(body, {
    status: report.status === 'operational' ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}


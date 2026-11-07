import {
  type OperationsDatePreset,
  UserRole,
} from '@careflow/shared';
import { requireAuthorizedWorkspaceSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  getOperationsManagementService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const url = new URL(request.url);
    const orgId = auth.session.identity.organizationId;
    const section = url.searchParams.get('section') || 'all';
    const preset = (url.searchParams.get('preset') || 'today') as OperationsDatePreset;
    const fromIso =
      url.searchParams.get('fromIso') ||
      url.searchParams.get('from') ||
      url.searchParams.get('customStart') ||
      undefined;
    const toIso =
      url.searchParams.get('toIso') ||
      url.searchParams.get('to') ||
      url.searchParams.get('customEnd') ||
      undefined;

    const [opsService, workspaceRepo] = await Promise.all([
      getOperationsManagementService(),
      getWorkspaceRepository(),
    ]);

    if (section === 'timeline') {
      const events = await opsService.listOperationalTimeline(orgId, {
        dateFrom: url.searchParams.get('dateFrom') || fromIso,
        dateTo: url.searchParams.get('dateTo') || toIso,
        actorUserId: url.searchParams.get('actorUserId') || undefined,
        actorRole: url.searchParams.get('actorRole') || undefined,
        eventCategory:
          url.searchParams.get('eventCategory') ||
          url.searchParams.get('actionCategory') ||
          undefined,
        caseReference: url.searchParams.get('caseReference') || undefined,
        productOrService: url.searchParams.get('productOrService') || undefined,
        limit: Number(url.searchParams.get('limit') || 250),
      });
      return jsonApiSuccess({ events });
    }

    if (section === 'closing_report') {
      const period = (url.searchParams.get('period') ||
        url.searchParams.get('periodType') ||
        'daily') as 'daily' | 'weekly' | 'monthly';
      const report = await opsService.generateClosingReport(orgId, {
        period,
        fromIso,
        toIso,
      });
      return jsonApiSuccess({ report });
    }

    const [config, metrics, activityTimeline, closingReport, teamMembers] = await Promise.all([
      opsService.getOperationsConfig(orgId),
      opsService.getOperationsDashboardMetrics(orgId, {
        preset,
        fromIso,
        toIso,
      }),
      opsService.listOperationalTimeline(orgId, {
        dateFrom: fromIso,
        dateTo: toIso,
        actorUserId: url.searchParams.get('actorUserId') || undefined,
        actorRole: url.searchParams.get('actorRole') || undefined,
        eventCategory: url.searchParams.get('eventCategory') || undefined,
        caseReference: url.searchParams.get('caseReference') || undefined,
        productOrService: url.searchParams.get('productOrService') || undefined,
        limit: 200,
      }),
      opsService.generateClosingReport(orgId, {
        period:
          preset === 'last_7_days'
            ? 'weekly'
            : preset === 'last_30_days'
              ? 'monthly'
              : 'daily',
        fromIso,
        toIso,
      }),
      workspaceRepo.listAgents(orgId),
    ]);

    return jsonApiSuccess({
      config,
      metrics,
      closingReport,
      activityTimeline,
      teamMembers,
      dashboard: metrics,
      timeline: activityTimeline,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

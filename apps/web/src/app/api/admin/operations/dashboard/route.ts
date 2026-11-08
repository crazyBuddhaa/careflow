import {
  type AutomationRuleType,
  type OperationsDatePreset,
  SupportChannel,
  UserRole,
  type WorkspacePermissionKey,
} from '@careflow/shared';
import {
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
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

    const [
      config,
      metrics,
      activityTimeline,
      closingReport,
      teamMembers,
      agentScorecards,
      qaEvaluations,
      automationRules,
      automationLogs,
      customerFeedback,
    ] = await Promise.all([
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
      opsService.getAgentScorecards(orgId),
      opsService.listQaEvaluations(orgId),
      opsService.listAutomationRules(orgId),
      opsService.listAutomationLogs(orgId, 100),
      opsService.listCustomerFeedback(orgId),
    ]);

    return jsonApiSuccess({
      config,
      metrics,
      closingReport,
      activityTimeline,
      teamMembers,
      agentScorecards,
      qaEvaluations,
      automationRules,
      automationLogs,
      customerFeedback,
      dashboard: metrics,
      timeline: activityTimeline,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const orgId = auth.session.identity.organizationId;
    const actor = {
      userId: auth.session.identity.userId,
      userName: auth.session.userName || auth.session.identity.email || 'Support Member',
      userEmail: auth.session.identity.email || '',
      userRole: auth.session.identity.role,
      permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
    };

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    const opsService = await getOperationsManagementService();

    if (action === 'create_qa_evaluation') {
      const targetType: 'conversation' | 'complaint' =
        body.targetType === 'conversation' ? 'conversation' : 'complaint';
      const targetId = typeof body.targetId === 'string' ? body.targetId.trim() : '';
      const caseReference =
        typeof body.caseReference === 'string' && body.caseReference.trim()
          ? body.caseReference.trim()
          : typeof body.targetReference === 'string' && body.targetReference.trim()
            ? body.targetReference.trim()
            : targetId || 'CASE-QA';
      const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
      const agentName = typeof body.agentName === 'string' ? body.agentName.trim() : '';
      if (!agentName) {
        return jsonApiError('VALIDATION_ERROR', 'Agent name is required for QA evaluation.', 400);
      }

      const rawComplexity = String(body.caseComplexity || body.complexityLevel || 'standard');
      const caseComplexity: 'low' | 'standard' | 'complex' =
        rawComplexity === 'low' || rawComplexity === 'simple'
          ? 'low'
          : rawComplexity === 'complex' || rawComplexity === 'critical'
            ? 'complex'
            : 'standard';

      const evaluation = await opsService.createQaEvaluation(orgId, actor, {
        conversationId: targetType === 'conversation' ? targetId || undefined : undefined,
        complaintId: targetType === 'complaint' ? targetId || undefined : undefined,
        caseReference,
        agentId: agentId || agentName,
        agentName,
        accuracyScore: Number(body.accuracyScore ?? 5),
        professionalismScore: Number(body.professionalismScore ?? 5),
        resolutionEffectivenessScore: Number(body.resolutionEffectivenessScore ?? 5),
        caseComplexity,
        feedbackNotes: typeof body.feedbackNotes === 'string' ? body.feedbackNotes : '',
        coachingRecommendations:
          typeof body.coachingRecommendations === 'string'
            ? body.coachingRecommendations
            : typeof body.coachingRecommendation === 'string'
              ? body.coachingRecommendation
              : '',
      });
      return jsonApiSuccess({ evaluation }, 201);
    }

    if (action === 'upsert_automation_rule') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const ruleType =
        typeof body.ruleType === 'string' ? (body.ruleType as AutomationRuleType) : null;
      if (!name || !ruleType) {
        return jsonApiError('VALIDATION_ERROR', 'Rule name and ruleType are required.', 400);
      }
      const rule = await opsService.upsertAutomationRule(orgId, actor, {
        id: typeof body.id === 'string' ? body.id : undefined,
        name,
        description: typeof body.description === 'string' ? body.description : '',
        ruleType,
        isEnabled: body.isEnabled === undefined ? true : Boolean(body.isEnabled),
        conditions:
          body.conditions && typeof body.conditions === 'object'
            ? (body.conditions as Record<string, unknown>)
            : {},
        actions:
          body.actions && typeof body.actions === 'object'
            ? (body.actions as Record<string, unknown>)
            : {},
      });
      return jsonApiSuccess({ rule });
    }

    if (action === 'toggle_automation_rule') {
      const ruleId = typeof body.ruleId === 'string' ? body.ruleId.trim() : '';
      if (!ruleId) {
        return jsonApiError('VALIDATION_ERROR', 'ruleId is required.', 400);
      }
      await opsService.toggleAutomationRule(
        orgId,
        ruleId,
        actor,
        Boolean(body.isEnabled),
      );
      return jsonApiSuccess({ toggled: true });
    }

    if (action === 'run_automation_sweep') {
      const sweepResult = await opsService.runAutomationRulesSweep(orgId, actor);
      return jsonApiSuccess(sweepResult);
    }

    if (action === 'submit_csat_feedback') {
      const feedback = await opsService.submitCustomerFeedback(orgId, {
        conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
        complaintId: typeof body.complaintId === 'string' ? body.complaintId : undefined,
        caseReference:
          typeof body.caseReference === 'string'
            ? body.caseReference
            : typeof body.referenceCode === 'string'
              ? body.referenceCode
              : undefined,
        customerName:
          typeof body.customerName === 'string' ? body.customerName : 'Verified Customer',
        customerEmail: typeof body.customerEmail === 'string' ? body.customerEmail : '',
        channel: typeof body.channel === 'string' ? body.channel : 'portal',
        rating: Number(body.rating ?? 5),
        comment: typeof body.comment === 'string' ? body.comment : undefined,
      });
      return jsonApiSuccess({ feedback }, 201);
    }

    if (action === 'seed_demo_scenario') {
      const demo = await opsService.seedDemonstrationScenario(orgId, actor);
      return jsonApiSuccess(demo, 201);
    }

    return jsonApiError('VALIDATION_ERROR', `Unsupported action "${action}".`, 400);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}


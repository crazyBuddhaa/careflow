import {
  type ComplaintCustomFieldDefinition,
  EscalationPriority,
  type ReplacementFulfilmentMethod,
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

export async function GET() {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const orgId = auth.session.identity.organizationId;
    const [opsService, workspaceRepo] = await Promise.all([
      getOperationsManagementService(),
      getWorkspaceRepository(),
    ]);

    const [config, categories, members] = await Promise.all([
      opsService.getOperationsConfig(orgId),
      opsService.listComplaintCategories(orgId),
      workspaceRepo.listAgents(orgId),
    ]);

    return jsonApiSuccess({
      config,
      categories,
      teamMembers: members,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Admin);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const opsService = await getOperationsManagementService();
    const actor = {
      userId: auth.session.identity.userId,
      userName: auth.session.userName || auth.session.identity.email || 'Workspace Admin',
      userEmail: auth.session.identity.email || '',
      userRole: auth.session.identity.role,
      permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
    };

    const fulfilmentRaw = body.fulfilmentMethod ?? body.replacementFulfilmentMode;
    const fulfilmentMethod: ReplacementFulfilmentMethod | undefined =
      fulfilmentRaw === 'supervisor_controlled' ||
      fulfilmentRaw === 'agent_assisted' ||
      fulfilmentRaw === 'both'
        ? fulfilmentRaw
        : undefined;

    const updated = await opsService.updateOperationsConfig(
      auth.session.identity.organizationId,
      actor,
      {
        timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
        businessClosingTime:
          typeof body.businessClosingTime === 'string'
            ? body.businessClosingTime
            : undefined,
        fulfilmentMethod,
        allowAgentDirectApproval:
          typeof body.allowAgentDirectApproval === 'boolean'
            ? body.allowAgentDirectApproval
            : undefined,
        autoAssignSupervisor:
          typeof body.autoAssignSupervisor === 'boolean'
            ? body.autoAssignSupervisor
            : undefined,
        slaFirstResponseMinutes:
          typeof body.slaFirstResponseMinutes === 'number'
            ? body.slaFirstResponseMinutes
            : undefined,
        slaResolutionHours:
          typeof body.slaResolutionHours === 'number'
            ? body.slaResolutionHours
            : undefined,
        slaOverdueHours:
          typeof body.slaOverdueHours === 'number' ? body.slaOverdueHours : undefined,
        inactivityTimeoutMinutes:
          typeof body.inactivityTimeoutMinutes === 'number'
            ? body.inactivityTimeoutMinutes
            : undefined,
      }
    );

    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export { PATCH as PUT };

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Supervisor);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return jsonApiError('VALIDATION_ERROR', 'Complaint category name is required.', 400);
    }

    const opsService = await getOperationsManagementService();
    const actor = {
      userId: auth.session.identity.userId,
      userName: auth.session.userName || auth.session.identity.email || 'Supervisor',
      userEmail: auth.session.identity.email || '',
      userRole: auth.session.identity.role,
      permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
    };

    const upserted = await opsService.upsertComplaintCategory(
      auth.session.identity.organizationId,
      actor,
      {
        id: typeof body.categoryId === 'string' ? body.categoryId : undefined,
        name: body.name.trim(),
        description: typeof body.description === 'string' ? body.description : undefined,
        requiresOrderId:
          typeof body.requiresOrderId === 'boolean' ? body.requiresOrderId : true,
        requiresLoginInfo: Boolean(body.requiresLoginInfo),
        requiresEvidence: Boolean(body.requiresEvidence),
        customFields: Array.isArray(body.customFields)
          ? (body.customFields as ComplaintCustomFieldDefinition[])
          : undefined,
        defaultPriority:
          typeof body.defaultPriority === 'string'
            ? (body.defaultPriority as EscalationPriority)
            : EscalationPriority.Normal,
        autoEscalateToSupervisor:
          typeof body.autoEscalateToSupervisor === 'boolean'
            ? body.autoEscalateToSupervisor
            : true,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : true,
      }
    );

    return jsonApiSuccess(upserted, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

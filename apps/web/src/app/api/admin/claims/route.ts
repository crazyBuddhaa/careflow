import {
  type ClaimStatus,
  EscalationPriority,
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
    const [opsService, workspaceRepo] = await Promise.all([
      getOperationsManagementService(),
      getWorkspaceRepository(),
    ]);

    const status = (url.searchParams.get('status') || undefined) as
      | ClaimStatus
      | 'all'
      | undefined;
    const supervisorQueue = (url.searchParams.get('supervisorQueue') || undefined) as
      | 'pending_review'
      | 'in_progress'
      | 'awaiting_information'
      | 'approved'
      | 'awaiting_replacement'
      | 'declined'
      | 'resolved'
      | 'all'
      | undefined;
    const assignedAgentId = url.searchParams.get('assignedAgentId') || undefined;
    const assignedSupervisorId = url.searchParams.get('assignedSupervisorId') || undefined;
    const orderId = url.searchParams.get('orderId') || undefined;
    const conversationId = url.searchParams.get('conversationId') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const onlyDuplicates =
      url.searchParams.get('duplicateOnly') === 'true' ||
      url.searchParams.get('onlyDuplicates') === 'true';

    const [complaints, queueCounts, categories, config, allTeam, availableReplacements] =
      await Promise.all([
        opsService.listComplaints(orgId, {
          status,
          supervisorQueue,
          assignedAgentId:
            assignedAgentId === 'me' ? auth.session.identity.userId : assignedAgentId,
          assignedSupervisorId:
            assignedSupervisorId === 'me'
              ? auth.session.identity.userId
              : assignedSupervisorId,
          orderId,
          conversationId,
          search,
          onlyDuplicates,
        }),
        opsService.getSupervisorQueueCounts(orgId),
        opsService.listComplaintCategories(orgId),
        opsService.getOperationsConfig(orgId),
        workspaceRepo.listAgents(orgId),
        opsService.listInventoryItems(orgId, { status: 'AVAILABLE' }),
      ]);

    const supervisors = allTeam.filter(
      (a) =>
        a.role === UserRole.Supervisor ||
        a.role === UserRole.Admin ||
        a.role === UserRole.Owner
    );

    return jsonApiSuccess({
      complaints,
      queueCounts,
      categories,
      config,
      supervisors,
      agents: allTeam,
      availableReplacements,
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
    const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : '';
    const productOrService =
      typeof body.productOrService === 'string' ? body.productOrService.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    if (!customerName || !productOrService || !description) {
      return jsonApiError(
        'VALIDATION_ERROR',
        'Customer name, product/service, and complaint description are required.',
        400
      );
    }

    const opsService = await getOperationsManagementService();
    const actorName = auth.session.userName || auth.session.identity.email || 'Support Member';
    const actor = {
      userId: auth.session.identity.userId,
      userName: actorName,
      userEmail: auth.session.identity.email || '',
      userRole: auth.session.identity.role,
      permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
    };

    // Combine loginInfo from either direct loginInfo / rawLoginInfo or identifier/secret fields
    let loginInfo =
      typeof body.loginInfo === 'string' && body.loginInfo.trim()
        ? body.loginInfo.trim()
        : typeof body.rawLoginInfo === 'string' && body.rawLoginInfo.trim()
          ? body.rawLoginInfo.trim()
          : '';
    if (!loginInfo) {
      const parts = [
        typeof body.suppliedLoginIdentifier === 'string' ? body.suppliedLoginIdentifier.trim() : '',
        typeof body.suppliedLoginSecret === 'string' ? body.suppliedLoginSecret.trim() : '',
        typeof body.suppliedLoginNotes === 'string' ? body.suppliedLoginNotes.trim() : '',
      ].filter(Boolean);
      loginInfo = parts.join(' | ');
    }

    const customFieldsRaw = body.customFields ?? body.customFieldValues;
    const customFields =
      customFieldsRaw && typeof customFieldsRaw === 'object'
        ? (customFieldsRaw as Record<string, string>)
        : undefined;

    const complaint = await opsService.createComplaint(
      auth.session.identity.organizationId,
      actor,
      {
        conversationId:
          typeof body.conversationId === 'string'
            ? body.conversationId
            : typeof body.linkedConversationId === 'string'
              ? body.linkedConversationId
              : undefined,
        ticketId:
          typeof body.ticketId === 'string'
            ? body.ticketId
            : typeof body.linkedTicketId === 'string'
              ? body.linkedTicketId
              : undefined,
        customerId: typeof body.customerId === 'string' ? body.customerId : undefined,
        customerName,
        customerEmail: customerEmail || 'customer@unspecified.local',
        orderId: typeof body.orderId === 'string' ? body.orderId : undefined,
        productOrService,
        categoryId: typeof body.categoryId === 'string' ? body.categoryId : undefined,
        categoryName: typeof body.categoryName === 'string' ? body.categoryName : undefined,
        priority:
          typeof body.priority === 'string'
            ? (body.priority as EscalationPriority)
            : EscalationPriority.Normal,
        description,
        loginInfo: loginInfo || undefined,
        customFields,
        assignedAgentId:
          typeof body.assignedAgentId === 'string'
            ? body.assignedAgentId
            : auth.session.identity.userId,
        assignedAgentName:
          typeof body.assignedAgentName === 'string' ? body.assignedAgentName : actorName,
        escalateImmediately: Boolean(
          body.escalateToSupervisor ?? body.autoEscalate ?? body.escalateImmediately
        ),
      }
    );

    return jsonApiSuccess(complaint, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

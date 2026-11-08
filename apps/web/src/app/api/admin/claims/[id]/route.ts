import {
  type ComplaintCommentType,
  EscalationPriority,
  SupportChannel,
  UserRole,
  type WorkspacePermissionKey,
} from '@careflow/shared';
import {
  readRuntimeSecret,
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  getChannelIntegrationService,
  getOperationsManagementService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const { id } = await context.params;
    const orgId = auth.session.identity.organizationId;
    const opsService = await getOperationsManagementService();

    const complaint = await opsService.getComplaintDetail(orgId, id);
    if (!complaint) {
      return jsonApiError('NOT_FOUND', 'Complaint not found.', 404);
    }

    const url = new URL(request.url);
    if (url.searchParams.get('revealCredentials') === 'true') {
      const actor = {
        userId: auth.session.identity.userId,
        userName: auth.session.userName || auth.session.identity.email || 'Support Member',
        userEmail: auth.session.identity.email || '',
        userRole: auth.session.identity.role,
        permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
      };
      const revealed = await opsService.revealComplaintLoginCredentials(orgId, id, actor);
      return jsonApiSuccess({
        complaint,
        revealedLoginInfo: revealed.loginInfo,
      });
    }

    return jsonApiSuccess(complaint);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const { id } = await context.params;
    const orgId = auth.session.identity.organizationId;
    const actorUserId = auth.session.identity.userId;
    const actorName = auth.session.userName || auth.session.identity.email || 'Support Member';
    const actorRole = auth.session.identity.role;
    const actor = {
      userId: actorUserId,
      userName: actorName,
      userEmail: auth.session.identity.email || '',
      userRole: actorRole,
      permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
    };

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action : '';

    const opsService = await getOperationsManagementService();

    if (action === 'escalate') {
      const escalationNote =
        typeof body.escalationNote === 'string' && body.escalationNote.trim()
          ? body.escalationNote.trim()
          : typeof body.note === 'string' && body.note.trim()
            ? body.note.trim()
            : typeof body.reason === 'string' && body.reason.trim()
              ? body.reason.trim()
              : 'Escalated to supervisor for verification';

      const updated = await opsService.escalateComplaintToSupervisor(orgId, id, actor, {
        supervisorId: typeof body.supervisorId === 'string' ? body.supervisorId : undefined,
        supervisorName: typeof body.supervisorName === 'string' ? body.supervisorName : undefined,
        priority:
          typeof body.priority === 'string'
            ? (body.priority as EscalationPriority)
            : undefined,
        escalationNote,
      });
      return jsonApiSuccess(updated);
    }

    if (
      action === 'supervisor_decision' ||
      action === 'start_investigation' ||
      action === 'approve' ||
      action === 'decline' ||
      action === 'request_info'
    ) {
      const rawDecision =
        action === 'supervisor_decision'
          ? String(body.decision || '')
          : action === 'start_investigation'
            ? 'in_progress'
            : action;

      let mappedDecision: 'in_progress' | 'approved' | 'declined' | 'info_requested' = 'approved';
      let authorizeReplacement = Boolean(body.authorizeReplacement ?? true);
      let resolutionType: string | undefined =
        typeof body.resolutionType === 'string' ? body.resolutionType : undefined;

      if (rawDecision === 'in_progress') {
        mappedDecision = 'in_progress';
      } else if (rawDecision === 'decline' || rawDecision === 'declined') {
        mappedDecision = 'declined';
      } else if (
        rawDecision === 'request_more_info' ||
        rawDecision === 'info_requested' ||
        rawDecision === 'request_info'
      ) {
        mappedDecision = 'info_requested';
      } else if (rawDecision === 'approve_for_account_fix') {
        mappedDecision = 'approved';
        authorizeReplacement = false;
        resolutionType = 'account_fixed';
      } else {
        mappedDecision = 'approved';
      }

      const reason =
        typeof body.reason === 'string' && body.reason.trim()
          ? body.reason.trim()
          : typeof body.note === 'string' && body.note.trim()
            ? body.note.trim()
            : rawDecision === 'in_progress'
              ? 'Started active supervisor investigation'
              : '';

      const replacementInventoryItemId =
        typeof body.replacementInventoryItemId === 'string'
          ? body.replacementInventoryItemId
          : typeof body.allocateReplacementItemId === 'string'
            ? body.allocateReplacementItemId
            : undefined;
      const supervisorInstructionToAgent =
        typeof body.supervisorInstructionToAgent === 'string'
          ? body.supervisorInstructionToAgent
          : typeof body.supervisorInstructions === 'string'
            ? body.supervisorInstructions
            : undefined;

      try {
        const updated = await opsService.recordSupervisorDecision(orgId, id, actor, {
          decision: mappedDecision,
          reason,
          authorizeReplacement,
          replacementInventoryItemId,
          resolutionType,
          supervisorInstructionToAgent,
        });
        return jsonApiSuccess(updated);
      } catch (decisionErr) {
        const message =
          decisionErr instanceof Error ? decisionErr.message : 'Decision not permitted.';
        if (message.includes('FORBIDDEN:')) {
          return jsonApiError('FORBIDDEN', message.replace('FORBIDDEN:', '').trim(), 403);
        }
        if (message.includes('VALIDATION_ERROR:')) {
          return jsonApiError(
            'VALIDATION_ERROR',
            message.replace('VALIDATION_ERROR:', '').trim(),
            400
          );
        }
        if (message.includes('CONFLICT:')) {
          return jsonApiError('CONFLICT', message.replace('CONFLICT:', '').trim(), 409);
        }
        throw decisionErr;
      }
    }

    if (action === 'allocate_replacement') {
      const inventoryItemId =
        typeof body.inventoryItemId === 'string' ? body.inventoryItemId.trim() : '';
      if (!inventoryItemId) {
        return jsonApiError('VALIDATION_ERROR', 'inventoryItemId is required.', 400);
      }
      const allocated = await opsService.allocateReplacementForComplaint(orgId, actor, {
        complaintId: id,
        inventoryItemId,
        notes: typeof body.notes === 'string' ? body.notes : undefined,
      });
      if (body.issueImmediately) {
        const delivered = await opsService.confirmReplacementDelivery(orgId, actor, {
          complaintId: id,
          deliveryNotes: typeof body.notes === 'string' ? body.notes : undefined,
        });
        return jsonApiSuccess(delivered);
      }
      return jsonApiSuccess(allocated.complaint);
    }

    if (action === 'IssueReservedReplacement' || action === 'confirm_delivery') {
      const updated = await opsService.confirmReplacementDelivery(orgId, actor, {
        complaintId: id,
        deliveryNotes:
          typeof body.notes === 'string'
            ? body.notes
            : typeof body.deliveryNotes === 'string'
              ? body.deliveryNotes
              : undefined,
      });
      return jsonApiSuccess(updated);
    }

    if (action === 'reassign') {
      const assignmentRole: 'supervisor' | 'agent' | 'specialist' =
        body.assignmentRole === 'specialist'
          ? 'specialist'
          : body.assignmentRole === 'agent' || typeof body.assignedAgentId === 'string'
            ? 'agent'
            : 'supervisor';
      const toUserId =
        typeof body.toUserId === 'string'
          ? body.toUserId
          : typeof body.assignedSupervisorId === 'string'
            ? body.assignedSupervisorId
            : typeof body.assignedAgentId === 'string'
              ? body.assignedAgentId
              : '';
      const toUserName =
        typeof body.toUserName === 'string'
          ? body.toUserName
          : typeof body.assignedSupervisorName === 'string'
            ? body.assignedSupervisorName
            : typeof body.assignedAgentName === 'string'
              ? body.assignedAgentName
              : typeof body.assignedSpecialistName === 'string'
                ? body.assignedSpecialistName
                : toUserId;

      if (!toUserName) {
        return jsonApiError('VALIDATION_ERROR', 'Target assignee is required.', 400);
      }

      const updated = await opsService.reassignComplaint(orgId, id, actor, {
        assignmentRole,
        toUserId: toUserId || toUserName,
        toUserName,
        specialistDepartment:
          typeof body.specialistDepartment === 'string'
            ? body.specialistDepartment
            : typeof body.assignedSpecialistDepartment === 'string'
              ? body.assignedSpecialistDepartment
              : undefined,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
      });
      return jsonApiSuccess(updated);
    }

    if (
      action === 'status' ||
      action === 'resolve' ||
      action === 'close_resolved' ||
      action === 'reopen'
    ) {
      const targetAction: 'resolve' | 'reopen' | 'CustomerSuppliedInfo' =
        action === 'reopen' || body.status === 'reopened'
          ? 'reopen'
          : body.status === 'pending_review'
            ? 'CustomerSuppliedInfo'
            : 'resolve';

      const updated = await opsService.resolveOrUpdateComplaintStatus(orgId, id, actor, {
        action: targetAction,
        resolutionSummary:
          typeof body.resolutionSummary === 'string'
            ? body.resolutionSummary
            : typeof body.reason === 'string'
              ? body.reason
              : undefined,
        notifyCustomerMessage:
          typeof body.notifyCustomerMessage === 'string'
            ? body.notifyCustomerMessage
            : undefined,
      });
      return jsonApiSuccess(updated);
    }

    if (action === 'comment' || action === 'add_comment') {
      const commentBody = typeof body.body === 'string' ? body.body.trim() : '';
      if (!commentBody) {
        return jsonApiError('VALIDATION_ERROR', 'Comment body is required.', 400);
      }
      await opsService.addComplaintComment(orgId, id, actor, {
        body: commentBody,
        commentType: (body.commentType as ComplaintCommentType) || 'internal_note',
        notifyCustomerInConversation: Boolean(
          body.notifyCustomerInConversation ?? body.isVisibleToCustomer
        ),
      });
      const refreshed = await opsService.getComplaintDetail(orgId, id);
      return jsonApiSuccess(refreshed);
    }

    if (action === 'evidence' || action === 'add_evidence') {
      const fileName =
        typeof body.fileName === 'string' && body.fileName.trim()
          ? body.fileName.trim()
          : typeof body.title === 'string' && body.title.trim()
            ? body.title.trim()
            : '';
      if (!fileName) {
        return jsonApiError('VALIDATION_ERROR', 'Evidence title or file name is required.', 400);
      }
      await opsService.addComplaintEvidence(orgId, id, actor, {
        fileName,
        mimeType: typeof body.mimeType === 'string' ? body.mimeType : 'image/png',
        fileUrlOrData:
          typeof body.fileUrlOrData === 'string' && body.fileUrlOrData.trim()
            ? body.fileUrlOrData.trim()
            : 'evidence://attached-note',
        description: typeof body.description === 'string' ? body.description : undefined,
      });
      const refreshed = await opsService.getComplaintDetail(orgId, id);
      return jsonApiSuccess(refreshed);
    }

    if (action === 'reveal_credentials') {
      const credentials = await opsService.revealComplaintLoginCredentials(orgId, id, actor);
      return jsonApiSuccess(credentials);
    }

    if (action === 'notify_customer') {
      const messageText = typeof body.message === 'string' ? body.message.trim() : '';
      if (!messageText) {
        return jsonApiError('VALIDATION_ERROR', 'Customer notification message is required.', 400);
      }

      const complaint = await opsService.getComplaintDetail(orgId, id);
      if (!complaint) {
        return jsonApiError('NOT_FOUND', 'Complaint not found.', 404);
      }

      if (complaint.conversationId) {
        try {
          const workspaceRepo = await getWorkspaceRepository();
          const updatedConv = await workspaceRepo.replyToConversation({
            organizationId: orgId,
            conversationId: complaint.conversationId,
            senderName: actorName,
            senderUserId: actorUserId,
            body: `[Claim ${complaint.referenceCode}] ${messageText}`,
            isInternalNote: false,
          });
          if (updatedConv.channel === SupportChannel.Telegram) {
            const lastMsg = updatedConv.messages[updatedConv.messages.length - 1];
            if (lastMsg) {
              const channelService = await getChannelIntegrationService();
              await channelService.deliverAgentReplyToExternalChannel({
                organizationId: orgId,
                conversation: updatedConv,
                messageId: lastMsg.id,
                agentDisplayName: actorName,
                body: `[Claim ${complaint.referenceCode}] ${messageText}`,
                isInternalNote: false,
                botToken: readRuntimeSecret('TELEGRAM_BOT_TOKEN'),
              });
            }
          }
        } catch {
          // Proceed even if linked conversation was archived
        }
      }

      await opsService.addComplaintComment(orgId, id, actor, {
        commentType: 'customer_update',
        body: messageText,
        notifyCustomerInConversation: false,
      });

      const refreshed = await opsService.getComplaintDetail(orgId, id);
      return jsonApiSuccess(refreshed);
    }

    return jsonApiError('VALIDATION_ERROR', `Unsupported action "${action}".`, 400);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export { PATCH as POST };

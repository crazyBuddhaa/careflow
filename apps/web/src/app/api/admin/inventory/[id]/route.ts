import {
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

    try {
      if (action === 'allocate_to_complaint' || action === 'allocate') {
        const complaintId =
          typeof body.complaintId === 'string' ? body.complaintId.trim() : '';
        if (!complaintId) {
          return jsonApiError('VALIDATION_ERROR', 'complaintId is required.', 400);
        }
        const allocated = await opsService.allocateReplacementForComplaint(orgId, actor, {
          complaintId,
          inventoryItemId: id,
          notes:
            typeof body.notes === 'string'
              ? body.notes
              : typeof body.reason === 'string'
                ? body.reason
                : undefined,
        });
        return jsonApiSuccess({
          item: allocated.inventoryItem,
          complaint: allocated.complaint,
        });
      }

      if (action === 'release_reservation' || action === 'release') {
        let complaintId =
          typeof body.complaintId === 'string' ? body.complaintId.trim() : '';
        if (!complaintId) {
          const items = await opsService.listInventoryItems(orgId);
          const matching = items.find((i) => i.id === id);
          complaintId = matching?.associatedComplaintId || '';
        }
        if (!complaintId) {
          return jsonApiError('VALIDATION_ERROR', 'complaintId is required to release reservation.', 400);
        }

        const updatedComplaint = await opsService.releaseReplacementReservation(
          orgId,
          actor,
          {
            complaintId,
            reason:
              typeof body.reason === 'string' && body.reason.trim()
                ? body.reason.trim()
                : 'Reservation released back to available stock',
          }
        );
        return jsonApiSuccess({ complaint: updatedComplaint });
      }

      if (action === 'reveal_credentials') {
        if (typeof body.complaintId === 'string' && body.complaintId.trim()) {
          const revealed = await opsService.revealAllocatedReplacementCredentials(
            orgId,
            body.complaintId.trim(),
            actor
          );
          return jsonApiSuccess({
            ...revealed,
            credentials: revealed.credentialsPlaintext,
          });
        }
        const revealed = await opsService.revealInventoryItemCredentials(orgId, id, actor);
        return jsonApiSuccess({
          ...revealed,
          credentials: revealed.credentialsPlaintext,
        });
      }

      if (action === 'confirm_delivery') {
        let complaintId =
          typeof body.complaintId === 'string' ? body.complaintId.trim() : '';
        if (!complaintId) {
          const items = await opsService.listInventoryItems(orgId);
          const matching = items.find((i) => i.id === id);
          complaintId = matching?.associatedComplaintId || '';
        }
        if (!complaintId) {
          return jsonApiError('VALIDATION_ERROR', 'complaintId is required.', 400);
        }

        const updatedComplaint = await opsService.confirmReplacementDelivery(
          orgId,
          actor,
          {
            complaintId,
            deliveryNotes:
              typeof body.deliveryNotes === 'string' ? body.deliveryNotes : undefined,
            sendToCustomerConversation: Boolean(body.sendToCustomerConversation),
            customerMessageBody:
              typeof body.customerMessage === 'string'
                ? body.customerMessage
                : typeof body.customerMessageBody === 'string'
                  ? body.customerMessageBody
                  : undefined,
          }
        );

        if (
          typeof body.customerMessage === 'string' &&
          body.customerMessage.trim() &&
          updatedComplaint.conversationId
        ) {
          try {
            const workspaceRepo = await getWorkspaceRepository();
            const conv = await workspaceRepo.replyToConversation({
              organizationId: orgId,
              conversationId: updatedComplaint.conversationId,
              senderName: actorName,
              senderUserId: actorUserId,
              body: body.customerMessage.trim(),
              isInternalNote: false,
            });
            if (conv.channel === SupportChannel.Telegram) {
              const lastMsg = conv.messages[conv.messages.length - 1];
              if (lastMsg) {
                const channelService = await getChannelIntegrationService();
                await channelService.deliverAgentReplyToExternalChannel({
                  organizationId: orgId,
                  conversation: conv,
                  messageId: lastMsg.id,
                  agentDisplayName: actorName,
                  body: body.customerMessage.trim(),
                  isInternalNote: false,
                  botToken: readRuntimeSecret('TELEGRAM_BOT_TOKEN'),
                });
              }
            }
          } catch {
            // Non-blocking if conversation was closed
          }
        }

        return jsonApiSuccess({ complaint: updatedComplaint });
      }

      if (action === 'transition_status' || action === 'update_status') {
        const nextStatus = (body.nextStatus || body.status) as
          | 'INVALID'
          | 'WITHDRAWN'
          | 'EXPIRED'
          | 'AVAILABLE';
        if (!nextStatus) {
          return jsonApiError('VALIDATION_ERROR', 'nextStatus is required.', 400);
        }
        await opsService.updateInventoryItemStatus(orgId, id, actor, {
          status: nextStatus,
          notes:
            typeof body.notes === 'string'
              ? body.notes
              : typeof body.reason === 'string'
                ? body.reason
                : undefined,
        });
        return jsonApiSuccess({ id, status: nextStatus });
      }

      return jsonApiError('VALIDATION_ERROR', `Unsupported action "${action}".`, 400);
    } catch (opErr) {
      const msg = opErr instanceof Error ? opErr.message : 'Inventory operation failed.';
      if (msg.includes('FORBIDDEN:')) {
        return jsonApiError('FORBIDDEN', msg.replace('FORBIDDEN:', '').trim(), 403);
      }
      if (msg.includes('CONFLICT:')) {
        return jsonApiError('CONFLICT', msg.replace('CONFLICT:', '').trim(), 409);
      }
      if (msg.includes('VALIDATION_ERROR:')) {
        return jsonApiError('VALIDATION_ERROR', msg.replace('VALIDATION_ERROR:', '').trim(), 400);
      }
      throw opErr;
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export { PATCH as POST };

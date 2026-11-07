import {
  SupportChannel,
  UserRole,
  type WorkspacePermissionKey,
} from '@careflow/shared';
import { hasMinimumRole } from '@careflow/support-engine';
import {
  ReplyConversationSchema,
  UpdateConversationStatusSchema,
} from '@careflow/validation';
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
  params: Promise<{ conversationId: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Agent);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const { conversationId } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = ReplyConversationSchema.parse(rawBody);
    const senderDisplayName =
      input.senderName?.trim() ||
      auth.session.userName?.trim() ||
      `${auth.session.organizationName ?? 'Workspace'} Support`;

    const repo = await getWorkspaceRepository();
    let updated = await repo.replyToConversation({
      organizationId: auth.session.identity.organizationId,
      conversationId,
      senderName: senderDisplayName,
      senderUserId: auth.session.identity.userId,
      body: input.body,
      isInternalNote: Boolean(input.isInternalNote),
      nextStatus: input.nextStatus,
    });

    // Record meaningful agent action & timeline event
    try {
      const opsService = await getOperationsManagementService();
      await opsService.recordMeaningfulAgentAction(
        auth.session.identity.organizationId,
        {
          userId: auth.session.identity.userId,
          userName: senderDisplayName,
          userEmail: auth.session.identity.email || '',
          userRole: auth.session.identity.role,
          permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
        },
        input.isInternalNote ? 'internal_note' : 'conversation_reply',
        input.isInternalNote
          ? `Added internal note on conversation with ${updated.customerName}`
          : `Replied to ${updated.customerName} (${updated.subject})`
      );
      await opsService.recordOperationalEvent({
        organizationId: auth.session.identity.organizationId,
        actorUserId: auth.session.identity.userId,
        actorName: senderDisplayName,
        actorRole: auth.session.identity.role,
        eventCategory: 'conversation',
        eventType: input.isInternalNote ? 'conversation_internal_note' : 'conversation_reply',
        caseReference: updated.id,
        conversationId: updated.id,
        summary: input.isInternalNote
          ? `Added internal note on conversation with ${updated.customerName}`
          : `Sent customer reply on conversation with ${updated.customerName} (${updated.subject})`,
      });
    } catch {
      // Do not fail reply if audit logging encounters a transient issue
    }

    // If this is a public agent reply on a Telegram conversation, deliver through the central CustomCare bot
    if (!input.isInternalNote && updated.channel === SupportChannel.Telegram) {
      const lastMsg = updated.messages[updated.messages.length - 1];
      if (lastMsg) {
        const channelService = await getChannelIntegrationService();
        await channelService.deliverAgentReplyToExternalChannel({
          organizationId: auth.session.identity.organizationId,
          conversation: updated,
          messageId: lastMsg.id,
          agentDisplayName: senderDisplayName,
          body: input.body,
          isInternalNote: false,
          botToken: readRuntimeSecret('TELEGRAM_BOT_TOKEN'),
        });
        const refreshed = await repo.getConversationById(
          auth.session.identity.organizationId,
          conversationId,
          { includeInternalNotes: true }
        );
        if (refreshed) {
          updated = refreshed;
        }
      }
    }

    return jsonApiSuccess(updated);
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

    const { conversationId } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = UpdateConversationStatusSchema.parse(rawBody);

    // Agents can claim unassigned conversations for themselves or update status/priority/category,
    // but reassigning conversations to other specialists requires Supervisor+ role.
    if (
      input.assignedAgentName !== undefined &&
      !hasMinimumRole(auth.session.identity, UserRole.Supervisor)
    ) {
      const currentUserName = (auth.session.userName || '').trim().toLowerCase();
      const targetName = (input.assignedAgentName || '').trim().toLowerCase();
      if (targetName && targetName !== currentUserName) {
        return jsonApiError(
          'FORBIDDEN',
          'Supervisor, Administrator, or Owner permissions are required to assign conversations to other specialists.',
          403
        );
      }
    }

    const repo = await getWorkspaceRepository();
    const existingBefore = await repo.getConversationById(
      auth.session.identity.organizationId,
      conversationId
    );
    const actorName =
      auth.session.userName || auth.session.identity.email || 'Support Member';
    const updated = await repo.updateConversationStatus({
      organizationId: auth.session.identity.organizationId,
      conversationId,
      status: input.status,
      priority: input.priority,
      category: input.category,
      assignedAgentName: input.assignedAgentName,
      assignedAgentId: input.assignedAgentId,
      actorUserId: auth.session.identity.userId,
      actorName,
    });

    try {
      const opsService = await getOperationsManagementService();
      await opsService.recordMeaningfulAgentAction(
        auth.session.identity.organizationId,
        {
          userId: auth.session.identity.userId,
          userName: actorName,
          userEmail: auth.session.identity.email || '',
          userRole: auth.session.identity.role,
          permissions: (auth.session.permissions || []) as WorkspacePermissionKey[],
        },
        input.status === 'resolved' ? 'conversation_resolved' : 'conversation_updated',
        `Updated conversation ${updated.id} (${updated.status})`
      );
      await opsService.recordOperationalEvent({
        organizationId: auth.session.identity.organizationId,
        actorUserId: auth.session.identity.userId,
        actorName,
        actorRole: auth.session.identity.role,
        eventCategory: 'conversation',
        eventType:
          input.status === 'resolved'
            ? 'conversation_resolved'
            : input.assignedAgentName !== undefined
              ? 'conversation_assigned'
              : 'conversation_updated',
        caseReference: updated.id,
        conversationId: updated.id,
        summary:
          input.status === 'resolved'
            ? `Marked conversation with ${updated.customerName} as Resolved`
            : input.assignedAgentName !== undefined
              ? `Assigned conversation with ${updated.customerName} to ${input.assignedAgentName || 'Unassigned'}`
              : `Updated conversation with ${updated.customerName} (status: ${updated.status})`,
      });
    } catch {
      // Non-blocking audit hook
    }

    if (
      updated.channel === SupportChannel.Telegram &&
      (input.status !== undefined ||
        (input.assignedAgentName !== undefined &&
          input.assignedAgentName !== existingBefore?.assignedAgentName))
    ) {
      const channelService = await getChannelIntegrationService();
      await channelService.notifyCustomerOfConversationStatusChange({
        organizationId: auth.session.identity.organizationId,
        conversation: updated,
        previousStatus: existingBefore?.status,
        nextStatus: updated.status,
        assignedAgentName: input.assignedAgentName,
        actorName,
        botToken: readRuntimeSecret('TELEGRAM_BOT_TOKEN'),
      });
    }

    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

import { UserRole } from '@careflow/shared';
import { sendWorkspaceInvitationEmail } from '@careflow/database/d1';
import { CreateWorkspaceInvitationSchema } from '@careflow/validation';
import {
  extractRequestClientMeta,
  getMergedRuntimeEnv,
  readRuntimeSecret,
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getAuthIdentityService } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Supervisor);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const authService = await getAuthIdentityService();
    const [invitations, auditLogs] = await Promise.all([
      authService.listWorkspaceInvitations(auth.session.identity.organizationId),
      authService.listWorkspaceAuditLogs(auth.session.identity.organizationId, 50),
    ]);

    return jsonApiSuccess({
      invitations,
      auditLogs,
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

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Admin);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = CreateWorkspaceInvitationSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();

    const created = await authService.createWorkspaceInvitation({
      actorUserId: auth.session.identity.userId,
      organizationId: auth.session.identity.organizationId,
      email: input.email,
      role: input.role,
      department: input.department,
      permissions: input.permissions,
      ttlSeconds: (input.expiresInHours ?? 72) * 3600,
      ipAddress,
      userAgent,
    });

    const runtimeEnv = getMergedRuntimeEnv();
    const requestOrigin = (() => {
      try {
        return new URL(request.url).origin;
      } catch {
        return 'https://getcustomcare.xyz';
      }
    })();
    const appBaseUrl = (
      readRuntimeSecret('CAREFLOW_APP_BASE_URL') ||
      readRuntimeSecret('NEXT_PUBLIC_APP_URL') ||
      requestOrigin
    ).replace(/\/+$/, '');

    const rawToken = created.rawToken || '';
    const inviteUrl = `${appBaseUrl}/invite/${encodeURIComponent(rawToken)}`;

    const emailDelivery = await sendWorkspaceInvitationEmail(
      {
        to: created.email,
        organizationName: created.organizationName || auth.session.organizationName || 'Workspace',
        invitedByName: created.invitedByName || auth.session.userName || 'Workspace Administrator',
        role: created.role,
        department: created.department,
        rawToken,
        expiresAt: created.expiresAt,
      },
      { appBaseUrl },
      runtimeEnv
    );

    return jsonApiSuccess(
      {
        invitation: created,
        inviteUrl,
        invitationUrl: inviteUrl,
        rawToken,
        emailDelivery,
      },
      201
    );
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Admin);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const url = new URL(request.url);
    const invitationId = url.searchParams.get('id')?.trim();
    if (!invitationId) {
      return jsonApiError('VALIDATION_ERROR', 'Missing invitation id query parameter.', 400);
    }

    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();
    await authService.revokeWorkspaceInvitation({
      actorUserId: auth.session.identity.userId,
      organizationId: auth.session.identity.organizationId,
      invitationId,
      ipAddress,
      userAgent,
    });

    return jsonApiSuccess({ revoked: true, invitationId });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

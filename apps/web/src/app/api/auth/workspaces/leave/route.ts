import { cookies } from 'next/headers';
import { LeaveWorkspaceSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  extractRequestClientMeta,
  getAdminCookieOptions,
  resolveServerAdminSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  getAuthIdentityService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const session = await resolveServerAdminSession();
    if (!session.identity) {
      return jsonApiError('UNAUTHORIZED', 'Valid authenticated session is required.', 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = LeaveWorkspaceSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const [authService, repo] = await Promise.all([
      getAuthIdentityService(),
      getWorkspaceRepository(),
    ]);

    const departure = await authService.leaveWorkspaceVoluntarily({
      organizationId: input.organizationId,
      userId: session.identity.userId,
      ipAddress,
      userAgent,
    });

    // Determine remaining workspaces or fallback to CustomCare Agent Hub for personal accounts
    const remainingWorkspaces = await repo.getUserWorkspaces(session.identity.userId);
    const cookieStore = await cookies();

    if (remainingWorkspaces.length > 0) {
      const nextWs = remainingWorkspaces[0]!;
      const nextSession = await authService.createSession({
        userId: session.identity.userId,
        organizationId: nextWs.organizationId,
        mfaVerified: Boolean(session.mfaEnabled),
        ipAddress,
        userAgent,
      });

      const signed = createSignedAdminSessionToken({
        userId: session.identity.userId,
        email: session.identity.email || '',
        userName: session.userName,
        organizationId: nextWs.organizationId,
        organizationName: nextWs.organizationName,
        organizationSlug: nextWs.organizationSlug,
        role: nextWs.role,
        sessionId: nextSession.sessionId,
        sessionToken: nextSession.rawSessionToken,
        emailVerified: session.emailVerified,
        mfaEnabled: session.mfaEnabled,
      });
      cookieStore.set(ADMIN_SESSION_COOKIE_NAME, signed, getAdminCookieOptions());

      return jsonApiSuccess({
        departed: true,
        unassignedConversationsCount: departure.unassignedConversationCount,
        nextWorkspace: nextWs,
        signedOut: false,
      });
    }

    if (session.isPersonalAccount !== false) {
      const hubMembership = await repo.getUserActiveMembership(
        session.identity.userId,
        'org_customcare_agent_hub'
      );
      if (hubMembership) {
        const nextSession = await authService.createSession({
          userId: session.identity.userId,
          organizationId: hubMembership.organizationId,
          mfaVerified: Boolean(session.mfaEnabled),
          ipAddress,
          userAgent,
        });
        const signed = createSignedAdminSessionToken({
          userId: session.identity.userId,
          email: session.identity.email || '',
          userName: session.userName,
          organizationId: hubMembership.organizationId,
          organizationName: hubMembership.organizationName,
          organizationSlug: hubMembership.organizationSlug,
          role: hubMembership.role,
          sessionId: nextSession.sessionId,
          sessionToken: nextSession.rawSessionToken,
          emailVerified: session.emailVerified,
          mfaEnabled: session.mfaEnabled,
        });
        cookieStore.set(ADMIN_SESSION_COOKIE_NAME, signed, getAdminCookieOptions());

        return jsonApiSuccess({
          departed: true,
          unassignedConversationsCount: departure.unassignedConversationCount,
          nextWorkspace: hubMembership,
          signedOut: false,
        });
      }
    }

    // Business-managed agent with 0 remaining workspaces is signed out cleanly
    cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
    return jsonApiSuccess({
      departed: true,
      unassignedConversationsCount: departure.unassignedConversationCount,
      nextWorkspace: null,
      signedOut: true,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

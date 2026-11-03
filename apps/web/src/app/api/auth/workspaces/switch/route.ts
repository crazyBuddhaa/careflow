import { cookies } from 'next/headers';
import { SwitchWorkspaceSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
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
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    const session = await resolveServerAdminSession();
    if (!session.identity) {
      return jsonApiError('UNAUTHORIZED', 'Authentication required to switch workspaces.', 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = SwitchWorkspaceSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();

    let targetMembership;
    try {
      targetMembership = await repo.switchUserActiveWorkspace(
        session.identity.userId,
        input.organizationId
      );
    } catch {
      return jsonApiError(
        'FORBIDDEN',
        'You do not have active membership in the requested organization.',
        403
      );
    }

    if (session.sessionToken) {
      const authService = await getAuthIdentityService();
      await authService.switchSessionWorkspace(session.sessionToken, targetMembership.organizationId);
    }

    // Issue updated signed session cookie with new active workspace and server-verified role
    const token = createSignedAdminSessionToken({
      userId: session.identity.userId,
      email: session.identity.email || 'admin@careflow.local',
      userName: session.userName,
      organizationId: targetMembership.organizationId,
      organizationName: targetMembership.organizationName,
      organizationSlug: targetMembership.organizationSlug,
      role: targetMembership.role,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      emailVerified: session.emailVerified,
      mfaEnabled: session.mfaEnabled,
    });

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

    return jsonApiSuccess({
      switched: true,
      activeWorkspace: targetMembership,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

import { cookies } from 'next/headers';
import { CreateAdditionalBusinessSchema } from '@careflow/validation';
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
    if (!session.identity || !session.sessionToken) {
      return jsonApiError('UNAUTHORIZED', 'Authentication required to create a workspace.', 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = CreateAdditionalBusinessSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const authService = await getAuthIdentityService();

    const createdMembership = await repo.createAdditionalBusinessForUser(
      session.identity.userId,
      input
    );

    // Update the active organization_id on the server-side D1 session
    await authService.switchSessionWorkspace(
      session.sessionToken,
      createdMembership.organizationId
    );

    // Switch active session cookie to the newly created business workspace while preserving sessionToken
    const token = createSignedAdminSessionToken({
      userId: session.identity.userId,
      email: session.identity.email || 'admin@careflow.local',
      userName: session.userName,
      organizationId: createdMembership.organizationId,
      organizationName: createdMembership.organizationName,
      organizationSlug: createdMembership.organizationSlug,
      role: createdMembership.role,
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      emailVerified: session.emailVerified,
      mfaEnabled: session.mfaEnabled,
    });

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

    return jsonApiSuccess(
      {
        created: true,
        workspace: createdMembership,
      },
      201
    );
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

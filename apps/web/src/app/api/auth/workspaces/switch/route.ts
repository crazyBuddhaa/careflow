import { cookies } from 'next/headers';
import { SwitchWorkspaceSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  getAdminCookieOptions,
  resolveServerAdminSession,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
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

    const targetMembership = await repo.switchUserActiveWorkspace(
      session.identity.userId,
      input.organizationId
    );

    // Issue updated signed session token with new active workspace and role
    const token = createSignedAdminSessionToken({
      userId: session.identity.userId,
      email: session.identity.email || 'admin@careflow.local',
      userName: session.userName,
      organizationId: targetMembership.organizationId,
      organizationName: targetMembership.organizationName,
      organizationSlug: targetMembership.organizationSlug,
      role: targetMembership.role,
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

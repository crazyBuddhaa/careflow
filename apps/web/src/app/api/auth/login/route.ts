import { cookies } from 'next/headers';
import { UserLoginSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  getAdminCookieOptions,
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
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = UserLoginSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();

    const authResult = await repo.authenticateUser(input.email, input.password);
    if (!authResult) {
      return jsonApiError(
        'INVALID_CREDENTIALS',
        'Invalid email address or password. Please verify your credentials.',
        401
      );
    }

    const { user, activeMembership, workspaces } = authResult;

    const token = createSignedAdminSessionToken({
      userId: user.id,
      email: user.email,
      userName: user.fullName,
      organizationId: activeMembership.organizationId,
      organizationName: activeMembership.organizationName,
      organizationSlug: activeMembership.organizationSlug,
      role: activeMembership.role,
    });

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

    return jsonApiSuccess({
      authenticated: true,
      user,
      activeWorkspace: activeMembership,
      workspaces,
      redirectUrl: '/admin',
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

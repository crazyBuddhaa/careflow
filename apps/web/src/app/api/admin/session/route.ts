import { cookies } from 'next/headers';
import { UserRole } from '@careflow/shared';
import { DevAdminSessionSignInSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  getAdminCookieOptions,
  getExpectedAdminPasscode,
  listAvailableAdminWorkspaces,
  resolveServerAdminSession,
  verifyPasscodeConstantTime,
  type RegisteredWorkspaceSummary,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';

export const dynamic = 'force-dynamic';

export interface AdminSessionStatusDto {
  authenticated: boolean;
  session: {
    userId: string;
    email?: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: UserRole;
  } | null;
  availableWorkspaces: RegisteredWorkspaceSummary[];
  authMode: 'stage1-signed-workspace-gate';
  usesDefaultDevPasscode: boolean;
}

export async function GET() {
  try {
    const [resolved, workspaces] = await Promise.all([
      resolveServerAdminSession(),
      listAvailableAdminWorkspaces(),
    ]);
    const { isDefaultDevPasscode } = getExpectedAdminPasscode();

    const response: AdminSessionStatusDto = {
      authenticated: Boolean(resolved.identity),
      session: resolved.identity
        ? {
            userId: resolved.identity.userId,
            email: resolved.identity.email,
            organizationId: resolved.identity.organizationId,
            organizationName: resolved.organizationName ?? resolved.identity.organizationId,
            organizationSlug: resolved.organizationSlug ?? '',
            role: resolved.identity.role,
          }
        : null,
      availableWorkspaces: workspaces,
      authMode: 'stage1-signed-workspace-gate',
      usesDefaultDevPasscode: isDefaultDevPasscode,
    };

    return jsonApiSuccess(response);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = DevAdminSessionSignInSchema.parse(rawBody);

    if (!verifyPasscodeConstantTime(input.accessPasscode)) {
      return jsonApiError(
        'INVALID_CREDENTIALS',
        'Invalid workspace access passcode.',
        401
      );
    }

    const workspaces = await listAvailableAdminWorkspaces();
    const targetOrg = workspaces.find((w) => w.id === input.organizationId);

    if (!targetOrg) {
      return jsonApiError(
        'WORKSPACE_NOT_FOUND',
        'Selected organization workspace does not exist or is inactive.',
        404
      );
    }

    const token = createSignedAdminSessionToken({
      userId: `admin_${targetOrg.slug}`,
      email: `admin@${targetOrg.slug}.careflow.local`,
      organizationId: targetOrg.id,
      organizationName: targetOrg.name,
      organizationSlug: targetOrg.slug,
      role: UserRole.Admin,
    });

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

    return jsonApiSuccess({
      authenticated: true,
      session: {
        userId: `admin_${targetOrg.slug}`,
        email: `admin@${targetOrg.slug}.careflow.local`,
        organizationId: targetOrg.id,
        organizationName: targetOrg.name,
        organizationSlug: targetOrg.slug,
        role: UserRole.Admin,
      },
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
    return jsonApiSuccess({ authenticated: false });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

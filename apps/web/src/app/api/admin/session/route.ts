import { cookies } from 'next/headers';
import { UserRole, type UserWorkspaceMembership } from '@careflow/shared';
import {
  ADMIN_SESSION_COOKIE_NAME,
  extractRequestClientMeta,
  readRuntimeSecret,
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

export interface AdminSessionStatusDto {
  authenticated: boolean;
  turnstileSiteKey?: string;
  session: {
    userId: string;
    email?: string;
    userName?: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: UserRole;
    sessionId?: string;
    emailVerified?: boolean;
    mfaEnabled?: boolean;
  } | null;
  workspaces?: UserWorkspaceMembership[];
}

export async function GET() {
  try {
    const resolved = await resolveServerAdminSession();

    let userWorkspaces: UserWorkspaceMembership[] = [];
    if (resolved.identity?.userId) {
      try {
        const repo = await getWorkspaceRepository();
        userWorkspaces = await repo.getUserWorkspaces(resolved.identity.userId);
      } catch {
        // Fallback if workspace lookup fails
      }
    }

    const turnstileSiteKey =
      readRuntimeSecret('NEXT_PUBLIC_TURNSTILE_SITE_KEY') ||
      readRuntimeSecret('TURNSTILE_SITE_KEY') ||
      undefined;

    const response: AdminSessionStatusDto = {
      authenticated: Boolean(resolved.identity),
      turnstileSiteKey,
      session: resolved.identity
        ? {
            userId: resolved.identity.userId,
            email: resolved.identity.email,
            userName: resolved.userName,
            organizationId: resolved.identity.organizationId,
            organizationName: resolved.organizationName ?? resolved.identity.organizationId,
            organizationSlug: resolved.organizationSlug ?? '',
            role: resolved.identity.role,
            sessionId: resolved.sessionId,
            emailVerified: resolved.emailVerified,
            mfaEnabled: resolved.mfaEnabled,
          }
        : null,
      workspaces: userWorkspaces,
    };

    return jsonApiSuccess(response);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  const csrf = verifyRequestOriginCsrf(request);
  if (!csrf.allowed) {
    return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
  }

  return jsonApiError(
    'LEGACY_PASSCODE_DISABLED',
    'Shared passcode authentication has been disabled. Please sign in with your account email and password at /api/auth/login.',
    410
  );
}

export async function DELETE(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    const resolved = await resolveServerAdminSession();
    if (resolved.sessionToken) {
      const { ipAddress, userAgent } = extractRequestClientMeta(request);
      const authService = await getAuthIdentityService();
      await authService.revokeSessionByToken(resolved.sessionToken, {
        ipAddress,
        userAgent,
      });
    }

    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
    return jsonApiSuccess({ authenticated: false });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

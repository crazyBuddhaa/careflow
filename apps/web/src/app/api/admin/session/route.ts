import { cookies } from 'next/headers';
import { UserRole, type UserWorkspaceMembership } from '@careflow/shared';
import { DevAdminSessionSignInSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  extractRequestClientMeta,
  getAdminCookieOptions,
  listAvailableAdminWorkspaces,
  resolveServerAdminSession,
  verifyPasscodeConstantTime,
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

function normalizeWorkspaceIdentifier(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.careflow\.com$/, '')
    .replace(/\.localhost(?::\d+)?$/, '');
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
        // Fallback for isolated dev session
      }
    }

    const response: AdminSessionStatusDto = {
      authenticated: Boolean(resolved.identity),
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
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = DevAdminSessionSignInSchema.parse(rawBody);
    const { ipAddress } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();

    const rateCheck = await authService.checkRateLimit('login', `passcode:${ipAddress}`);
    if (!rateCheck.allowed) {
      return jsonApiError(
        'RATE_LIMITED',
        `Too many sign-in attempts. Please wait ${rateCheck.retryAfterSeconds} seconds.`,
        429
      );
    }

    if (!verifyPasscodeConstantTime(input.accessPasscode)) {
      await authService.recordRateLimitAttempt('login', `passcode:${ipAddress}`);
      return jsonApiError(
        'INVALID_CREDENTIALS',
        'Invalid workspace identifier or access passcode.',
        401
      );
    }

    const normalized = normalizeWorkspaceIdentifier(input.organizationId);
    const rawTrimmed = input.organizationId.trim().toLowerCase();

    const workspaces = await listAvailableAdminWorkspaces();
    const targetOrg = workspaces.find(
      (w) =>
        w.id.toLowerCase() === rawTrimmed ||
        w.slug.toLowerCase() === normalized ||
        w.name.toLowerCase() === rawTrimmed
    );

    if (!targetOrg) {
      await authService.recordRateLimitAttempt('login', `passcode:${ipAddress}`);
      return jsonApiError(
        'INVALID_CREDENTIALS',
        'Invalid workspace identifier or access passcode.',
        401
      );
    }

    await authService.resetRateLimit('login', `passcode:${ipAddress}`);

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

export async function DELETE(request: Request) {
  try {
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

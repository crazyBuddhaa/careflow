import { cookies } from 'next/headers';
import { AcceptWorkspaceInvitationSchema } from '@careflow/validation';
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
import { getAuthIdentityService } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const authService = await getAuthIdentityService();
    const inspection = await authService.inspectInvitationToken(decodeURIComponent(token));
    return jsonApiSuccess(inspection);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const { token } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = AcceptWorkspaceInvitationSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();
    const accepted = await authService.acceptWorkspaceInvitation({
      rawToken: decodeURIComponent(token),
      displayName: input.displayName,
      password: input.password,
      accessMode: input.accessMode,
      consentToLinkPersonalAccount: input.consentToLinkPersonalAccount,
      ipAddress,
      userAgent,
    });

    const d1Session = await authService.createSession({
      userId: accepted.user.id,
      organizationId: accepted.membership.organizationId,
      mfaVerified: false,
      ipAddress,
      userAgent,
    });

    const signedCookie = createSignedAdminSessionToken({
      userId: accepted.user.id,
      email: accepted.user.email,
      userName: accepted.user.fullName,
      organizationId: accepted.membership.organizationId,
      organizationName: accepted.membership.organizationName,
      organizationSlug: accepted.membership.organizationSlug,
      role: accepted.membership.role,
      sessionId: d1Session.sessionId,
      sessionToken: d1Session.rawSessionToken,
      emailVerified: true,
      mfaEnabled: Boolean(accepted.user.mfaEnabled),
    });

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, signedCookie, getAdminCookieOptions());

    return jsonApiSuccess({
      accepted: true,
      user: accepted.user,
      organizationId: accepted.membership.organizationId,
      organizationName: accepted.membership.organizationName,
      organizationSlug: accepted.membership.organizationSlug,
      role: accepted.membership.role,
      accessMode: accepted.accessMode,
      redirectUrl: '/admin',
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

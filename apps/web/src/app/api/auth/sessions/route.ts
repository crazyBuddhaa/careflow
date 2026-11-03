import { cookies } from 'next/headers';
import { RevokeSessionSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  extractRequestClientMeta,
  getMergedRuntimeEnv,
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

/**
 * GET /api/auth/sessions
 * Returns the authenticated user's security overview, active sessions, MFA status,
 * recent security audit events, and infrastructure configuration readiness.
 */
export async function GET() {
  try {
    const session = await resolveServerAdminSession();
    if (!session.identity || !session.identity.userId.startsWith('usr_')) {
      return jsonApiError(
        'UNAUTHORIZED',
        'A registered CustomCare account session is required to view account security settings.',
        401
      );
    }

    const authService = await getAuthIdentityService();
    const overview = await authService.getAccountSecurityOverview(
      session.identity.userId,
      session.identity.role,
      session.sessionId,
      getMergedRuntimeEnv()
    );

    return jsonApiSuccess(overview);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

/**
 * POST /api/auth/sessions
 * Revokes a specific session, all other sessions, or all sessions across all devices.
 */
export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    const session = await resolveServerAdminSession();
    if (!session.identity || !session.identity.userId.startsWith('usr_')) {
      return jsonApiError('UNAUTHORIZED', 'Authentication required.', 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = RevokeSessionSchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();

    if (input.revokeAllIncludingCurrent) {
      const revokedCount = await authService.revokeAllUserSessions(
        session.identity.userId,
        undefined,
        { ipAddress, userAgent }
      );
      const cookieStore = await cookies();
      cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
      return jsonApiSuccess({
        revoked: true,
        revokedCount,
        signedOutCurrent: true,
      });
    }

    if (input.revokeAllOther) {
      const revokedCount = await authService.revokeAllUserSessions(
        session.identity.userId,
        session.sessionId,
        { ipAddress, userAgent }
      );
      return jsonApiSuccess({
        revoked: true,
        revokedCount,
        signedOutCurrent: false,
      });
    }

    if (input.sessionId) {
      const revoked = await authService.revokeSessionById(
        session.identity.userId,
        input.sessionId,
        { ipAddress, userAgent }
      );
      if (!revoked) {
        return jsonApiError('NOT_FOUND', 'Session not found or already revoked.', 404);
      }

      const signedOutCurrent = input.sessionId === session.sessionId;
      if (signedOutCurrent) {
        const cookieStore = await cookies();
        cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
      }

      return jsonApiSuccess({
        revoked: true,
        revokedCount: 1,
        signedOutCurrent,
      });
    }

    return jsonApiError(
      'BAD_REQUEST',
      'Specify sessionId, revokeAllOther, or revokeAllIncludingCurrent.',
      400
    );
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

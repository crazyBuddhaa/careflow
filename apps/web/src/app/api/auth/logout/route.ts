import { cookies } from 'next/headers';
import {
  ADMIN_SESSION_COOKIE_NAME,
  extractRequestClientMeta,
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

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    let allDevices = false;
    try {
      const body = (await request.json()) as { allDevices?: boolean };
      allDevices = Boolean(body?.allDevices);
    } catch {
      // Optional JSON body
    }

    const resolved = await resolveServerAdminSession();
    const { ipAddress, userAgent } = extractRequestClientMeta(request);

    if (resolved.identity) {
      const authService = await getAuthIdentityService();
      if (allDevices) {
        await authService.revokeAllUserSessions(resolved.identity.userId, undefined, {
          ipAddress,
          userAgent,
        });
      } else if (resolved.sessionToken) {
        await authService.revokeSessionByToken(resolved.sessionToken, {
          ipAddress,
          userAgent,
        });
      }
    }

    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);

    return jsonApiSuccess({
      loggedOut: true,
      allDevices,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

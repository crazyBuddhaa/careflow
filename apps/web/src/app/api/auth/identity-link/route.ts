import { LinkAgentIdentitySchema } from '@careflow/validation';
import {
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
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const session = await resolveServerAdminSession();
    if (!session.identity) {
      return jsonApiError('UNAUTHORIZED', 'Valid authenticated session is required.', 401);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = LinkAgentIdentitySchema.parse(rawBody);
    const { ipAddress, userAgent } = extractRequestClientMeta(request);
    const authService = await getAuthIdentityService();

    const result = await authService.linkAgentIdentityToPersonalAccount({
      userId: session.identity.userId,
      password: input.password,
      consentConfirmed: input.consentConfirmed,
      ipAddress,
      userAgent,
    });

    return jsonApiSuccess({
      ...result,
      userId: result.user.id,
      linkedOrganizationsCount: result.workspaces.length,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

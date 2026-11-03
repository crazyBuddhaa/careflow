import {
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
 * POST /api/auth/mfa/enroll
 * Generates a Base32 TOTP secret, otpauth:// URI, and self-contained SVG QR code Data URL.
 */
export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
    }

    const session = await resolveServerAdminSession();
    if (!session.identity || !session.identity.userId.startsWith('usr_')) {
      return jsonApiError(
        'UNAUTHORIZED',
        'A registered CustomCare account session is required to enroll in MFA.',
        401
      );
    }

    const authService = await getAuthIdentityService();
    const setup = await authService.beginMfaEnrollment(session.identity.userId, 'CustomCare');

    return jsonApiSuccess(setup);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

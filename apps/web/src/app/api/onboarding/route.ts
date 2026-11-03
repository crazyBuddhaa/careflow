import { verifyRequestOriginCsrf } from '@/lib/admin-auth';
import { jsonApiError } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * Legacy unauthenticated workspace provisioning endpoint is permanently disabled.
 * Organization creation requires either:
 * 1. Full account registration via POST /api/auth/register
 * 2. Authenticated workspace creation via POST /api/auth/workspaces/create
 */
export async function POST(request: Request) {
  const csrf = verifyRequestOriginCsrf(request);
  if (!csrf.allowed) {
    return jsonApiError('CSRF_REJECTED', csrf.reason || 'Forbidden cross-origin request.', 403);
  }

  return jsonApiError(
    'LEGACY_ENDPOINT_DISABLED',
    'Unauthenticated workspace provisioning is disabled. Register an account via /api/auth/register or create an additional workspace from an authenticated session via /api/auth/workspaces/create.',
    410
  );
}

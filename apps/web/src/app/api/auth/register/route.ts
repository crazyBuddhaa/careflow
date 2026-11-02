import { cookies } from 'next/headers';
import { UserRole } from '@careflow/shared';
import { FullRegistrationSchema } from '@careflow/validation';
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

    const input = FullRegistrationSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();

    try {
      const result = await repo.registerUserAndFirstBusiness({
        fullName: input.fullName,
        email: input.email,
        password: input.password,
        businessName: input.businessName,
        industry: input.industry,
        country: input.country,
        website: input.website,
      });

      // Issue signed session token for new user & their first business workspace
      const token = createSignedAdminSessionToken({
        userId: result.user.id,
        email: result.user.email,
        userName: result.user.fullName,
        organizationId: result.organization.id,
        organizationName: result.organization.name,
        organizationSlug: result.organization.slug,
        role: UserRole.Owner,
      });

      const cookieStore = await cookies();
      cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

      return jsonApiSuccess(
        {
          user: result.user,
          organization: result.organization,
          redirectUrl: '/admin',
        },
        201
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to complete registration.';
      if (message.includes('already exists') || message.includes('reserved')) {
        return jsonApiError('CONFLICT', message, 409);
      }
      throw err;
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

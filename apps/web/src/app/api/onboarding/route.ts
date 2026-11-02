import { CreateOnboardingWorkspaceSchema } from '@careflow/validation';
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

    const input = CreateOnboardingWorkspaceSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();

    try {
      const created = await repo.provisionNewBusinessWorkspace(input);
      return jsonApiSuccess(
        {
          organizationId: created.organizationId,
          slug: created.slug,
          displayName: created.displayName,
          portalPath: `/portal/${created.slug}`,
          verifiedHostname: `${created.slug}.careflow.com`,
        },
        201
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to provision workspace.';
      if (message.includes('already exists') || message.includes('reserved')) {
        return jsonApiError('CONFLICT', message, 409);
      }
      throw err;
    }
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

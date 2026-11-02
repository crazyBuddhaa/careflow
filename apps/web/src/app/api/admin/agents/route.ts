import { CreateAgentSchema } from '@careflow/validation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { identity } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    const repo = await getWorkspaceRepository();
    const agents = await repo.listAgents(identity.organizationId);
    return jsonApiSuccess(agents);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const { identity } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = CreateAgentSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const created = await repo.createAgent(identity.organizationId, input);
    return jsonApiSuccess(created, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

import { ConversationStatus } from '@careflow/shared';
import { CreateDemoConversationSchema } from '@careflow/validation';
import { resolveServerAdminSession } from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { identity } = await resolveServerAdminSession();
    if (!identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Authorized business administrator session is required.',
        401
      );
    }

    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? undefined;
    const search = url.searchParams.get('search') ?? undefined;

    const repo = await getWorkspaceRepository();
    const conversations = await repo.listConversations(identity.organizationId, {
      status,
      search,
    });
    return jsonApiSuccess(conversations);
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

    const input = CreateDemoConversationSchema.parse(rawBody);
    const repo = await getWorkspaceRepository();
    const created = await repo.createEscalatedConversation({
      organizationId: identity.organizationId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      channel: input.channel,
      status: ConversationStatus.Open,
      category: input.category,
      subject: input.subject,
      message: input.message,
    });
    return jsonApiSuccess(created, 201);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

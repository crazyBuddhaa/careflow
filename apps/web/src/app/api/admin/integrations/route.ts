import { UserRole } from '@careflow/shared';
import { ConfigureChannelIntegrationSchema } from '@careflow/validation';
import {
  requireAuthorizedWorkspaceSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import { getChannelIntegrationService } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const channelService = await getChannelIntegrationService();
    const [integrations, agentLinks] = await Promise.all([
      channelService.listChannelIntegrations(auth.session.identity.organizationId),
      channelService.listOrganizationAgentTelegramLinks(auth.session.identity.organizationId),
    ]);

    return jsonApiSuccess({
      integrations,
      agentLinks,
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const csrf = verifyRequestOriginCsrf(request);
    if (!csrf.allowed) {
      return jsonApiError('FORBIDDEN', csrf.reason || 'CSRF validation failed.', 403);
    }

    const auth = await requireAuthorizedWorkspaceSession(UserRole.Admin);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = ConfigureChannelIntegrationSchema.parse(rawBody);
    const channelService = await getChannelIntegrationService();
    const updated = await channelService.configureChannelIntegration(
      auth.session.identity.organizationId,
      {
        channel: input.channel,
        action: input.action,
        telegramConfig: input.telegramConfig,
        widgetConfig: input.widgetConfig,
        emailConfig: input.emailConfig,
      }
    );

    return jsonApiSuccess(updated);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

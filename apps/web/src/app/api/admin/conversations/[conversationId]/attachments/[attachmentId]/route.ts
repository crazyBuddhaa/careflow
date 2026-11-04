import { UserRole } from '@careflow/shared';
import {
  readRuntimeSecret,
  requireAuthorizedWorkspaceSession,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  getChannelIntegrationService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{
    conversationId: string;
    attachmentId: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const auth = await requireAuthorizedWorkspaceSession(UserRole.Viewer);
    if (!auth.authorized) {
      return jsonApiError(auth.code, auth.message, auth.status);
    }

    const { conversationId, attachmentId } = await context.params;
    const repo = await getWorkspaceRepository();
    const attachment = await repo.getConversationAttachmentById(
      auth.session.identity.organizationId,
      conversationId,
      attachmentId
    );

    if (!attachment) {
      return jsonApiError(
        'NOT_FOUND',
        'Attachment not found or does not belong to this workspace conversation.',
        404
      );
    }

    const url = new URL(request.url);
    const shouldDownload = url.searchParams.get('download') === '1';

    if (!shouldDownload || !attachment.externalFileId) {
      return jsonApiSuccess(attachment);
    }

    const channelService = await getChannelIntegrationService();
    const botToken = await channelService.resolveEffectiveTelegramBotTokenForOrg(
      auth.session.identity.organizationId,
      readRuntimeSecret('TELEGRAM_BOT_TOKEN')
    );
    if (!botToken) {
      return jsonApiError(
        'UNAVAILABLE',
        'Telegram bot token is not configured on this server.',
        503
      );
    }

    // 1. Resolve file_path from Telegram getFile API (server-side only; never expose botToken)
    const getFileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(
        attachment.externalFileId
      )}`
    );
    const getFileJson = (await getFileRes.json()) as {
      ok?: boolean;
      result?: { file_path?: string; file_size?: number };
      description?: string;
    };

    if (!getFileRes.ok || !getFileJson.ok || !getFileJson.result?.file_path) {
      return jsonApiError(
        'ATTACHMENT_UNAVAILABLE',
        getFileJson.description || 'Could not retrieve file from Telegram.',
        502
      );
    }

    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${getFileJson.result.file_path}`
    );
    if (!fileRes.ok || !fileRes.body) {
      return jsonApiError(
        'ATTACHMENT_DOWNLOAD_FAILED',
        'Failed to stream attachment bytes from Telegram.',
        502
      );
    }

    const safeFileName = attachment.fileName.replace(/["\\\r\n]/g, '_');

    return new Response(fileRes.body, {
      status: 200,
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${safeFileName}"`,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

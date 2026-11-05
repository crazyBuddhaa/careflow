import { cookies } from 'next/headers';
import { z } from 'zod';
import { UserRole } from '@careflow/shared';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  extractRequestClientMeta,
  getAdminCookieOptions,
  readRuntimeSecret,
  resolveServerAdminSession,
  verifyRequestOriginCsrf,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';
import {
  ensureTelegramBotIdentityAndWebhook,
  getAuthIdentityService,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

const PlatformAdminActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('toggle_business_active'),
    organizationId: z.string().trim().min(2),
    isActive: z.boolean(),
  }),
  z.object({
    type: z.literal('set_business_onboarding_status'),
    organizationId: z.string().trim().min(2),
    status: z.enum(['incomplete', 'in_progress', 'ready_to_publish', 'published', 'suspended']),
  }),
  z.object({
    type: z.literal('verify_user_email'),
    targetUserId: z.string().trim().min(2),
  }),
  z.object({
    type: z.literal('toggle_platform_admin'),
    targetUserId: z.string().trim().min(2),
    isPlatformAdmin: z.boolean(),
  }),
  z.object({
    type: z.literal('revoke_user_sessions'),
    targetUserId: z.string().trim().min(2),
  }),
  z.object({
    type: z.literal('clear_rate_limits'),
    bucketKey: z.string().trim().optional(),
  }),
  z.object({
    type: z.literal('enter_business_workspace'),
    organizationId: z.string().trim().min(2),
  }),
  z.object({
    type: z.literal('sync_central_telegram_bot'),
  }),
]);

export async function GET() {
  try {
    const session = await resolveServerAdminSession();
    if (!session.identity) {
      return jsonApiError('UNAUTHORIZED', 'Valid authenticated session is required.', 401);
    }

    const repo = await getWorkspaceRepository();
    const isSuperAdmin =
      Boolean(session.isPlatformAdmin) ||
      (await repo.isUserPlatformAdmin(session.identity.userId, session.identity.email));

    if (!isSuperAdmin) {
      return jsonApiError(
        'FORBIDDEN',
        'Access restricted to CustomCare Platform Super-Administrators.',
        403
      );
    }

    if (!session.mfaEnabled) {
      return jsonApiError(
        'MFA_SETUP_REQUIRED',
        'Two-Factor Authentication (2FA) setup is required for Platform Super-Administrators. Please complete Authenticator App (TOTP) setup in your Workspace Account Security panel first.',
        403
      );
    }

    const centralBotUsername = (
      readRuntimeSecret('CAREFLOW_TELEGRAM_CENTRAL_BOT_USERNAME') || 'getcustomcarebot'
    ).replace(/^@/, '');
    const centralBotToken = readRuntimeSecret('TELEGRAM_BOT_TOKEN');
    const centralBotSecret = readRuntimeSecret('TELEGRAM_WEBHOOK_SECRET');

    const overview = await repo.getPlatformAdminOverview({
      centralTelegramBotUsername: centralBotUsername,
      centralTelegramTokenConfigured: Boolean(centralBotToken && centralBotToken.length >= 10),
      centralTelegramSecretConfigured: Boolean(centralBotSecret && centralBotSecret.length >= 8),
    });

    return jsonApiSuccess(overview);
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

    const session = await resolveServerAdminSession();
    if (!session.identity) {
      return jsonApiError('UNAUTHORIZED', 'Valid authenticated session is required.', 401);
    }

    const repo = await getWorkspaceRepository();
    const isSuperAdmin =
      Boolean(session.isPlatformAdmin) ||
      (await repo.isUserPlatformAdmin(session.identity.userId, session.identity.email));

    if (!isSuperAdmin) {
      return jsonApiError(
        'FORBIDDEN',
        'Access restricted to CustomCare Platform Super-Administrators.',
        403
      );
    }

    if (!session.mfaEnabled) {
      return jsonApiError(
        'MFA_SETUP_REQUIRED',
        'Two-Factor Authentication (2FA) setup is required for Platform Super-Administrators. Please complete Authenticator App (TOTP) setup in your Workspace Account Security panel first.',
        403
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const action = PlatformAdminActionSchema.parse(rawBody);

    if (action.type === 'sync_central_telegram_bot') {
      const centralBotToken = readRuntimeSecret('TELEGRAM_BOT_TOKEN');
      const centralBotSecret = readRuntimeSecret('TELEGRAM_WEBHOOK_SECRET');
      if (!centralBotToken) {
        return jsonApiError(
          'TELEGRAM_TOKEN_MISSING',
          'TELEGRAM_BOT_TOKEN is not configured in runtime environment secrets.',
          400
        );
      }

      const requestOrigin = (() => {
        try {
          return new URL(request.url).origin;
        } catch {
          return 'https://getcustomcare.xyz';
        }
      })();
      const appBaseUrl = (
        readRuntimeSecret('CAREFLOW_APP_BASE_URL') ||
        readRuntimeSecret('NEXT_PUBLIC_APP_URL') ||
        requestOrigin
      ).replace(/\/+$/, '');
      const webhookUrl = `${appBaseUrl}/api/webhooks/telegram`;

      const syncResult = await ensureTelegramBotIdentityAndWebhook();

      return jsonApiSuccess({
        message: `Synchronized @${syncResult.botUsername || 'getcustomcarebot'} webhook (${syncResult.webhookUrl || webhookUrl}) and slash commands.`,
        webhookRegistered: Boolean(syncResult.webhookRegistered),
        commandsRegistered: true,
      });
    }

    const result = await repo.executePlatformAdminAction({
      actorUserId: session.identity.userId,
      actorName: session.userName || session.identity.email || 'Platform Admin',
      action,
    });

    if (action.type === 'enter_business_workspace' && result.organizationId) {
      const targetMembership = await repo.getUserActiveMembership(
        session.identity.userId,
        result.organizationId
      );
      if (targetMembership) {
        const authService = await getAuthIdentityService();
        const { ipAddress, userAgent } = extractRequestClientMeta(request);
        const newSession = await authService.createSession({
          userId: session.identity.userId,
          organizationId: targetMembership.organizationId,
          mfaVerified: Boolean(session.mfaEnabled),
          ipAddress,
          userAgent,
        });

        const signedToken = createSignedAdminSessionToken({
          userId: session.identity.userId,
          email: session.identity.email || '',
          userName: session.userName,
          organizationId: targetMembership.organizationId,
          organizationName: targetMembership.organizationName,
          organizationSlug: targetMembership.organizationSlug,
          role: UserRole.Owner,
          sessionId: newSession.sessionId,
          sessionToken: newSession.rawSessionToken,
          emailVerified: session.emailVerified,
          mfaEnabled: session.mfaEnabled,
        });

        const cookieStore = await cookies();
        cookieStore.set(ADMIN_SESSION_COOKIE_NAME, signedToken, getAdminCookieOptions());
      }
    }

    return jsonApiSuccess(result);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

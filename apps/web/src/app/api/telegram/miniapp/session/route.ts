import { NextResponse } from 'next/server';
import { UserRole, type AgentAvailability } from '@careflow/shared';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  extractRequestClientMeta,
  getAdminCookieOptions,
  readRuntimeSecret,
  resolveServerAdminSession,
} from '@/lib/admin-auth';
import { jsonApiError, jsonApiSuccess } from '@/lib/api-response';
import {
  getAuthIdentityService,
  getChannelIntegrationService,
  getKnowledgeDatabase,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export async function GET() {
  try {
    const resolved = await resolveServerAdminSession();
    if (!resolved.identity) {
      return jsonApiError('UNAUTHORIZED', 'No active Mini App or workspace session.', 401);
    }

    const identityEmail = resolved.identity.email || '';
    const db = await getKnowledgeDatabase();
    const workspaceRepo = await getWorkspaceRepository();
    const agents = await workspaceRepo.listAgents(resolved.identity.organizationId);
    const matchingAgent = agents.find(
      (a) => a.email.toLowerCase() === identityEmail.toLowerCase()
    );

    const { results: memberships } = await db
      .prepare(
        `SELECT om.organization_id, om.role, o.name AS org_name, o.slug AS org_slug
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = ? AND om.is_active = 1 AND o.is_active = 1
         ORDER BY o.name ASC`
      )
      .bind(resolved.identity.userId)
      .all<{
        organization_id: string;
        role: UserRole;
        org_name: string;
        org_slug: string;
      }>();

    const tgLink = await db
      .prepare(
        `SELECT telegram_user_id, telegram_username
         FROM telegram_agent_links
         WHERE user_id = ? AND organization_id = ? AND status = 'linked'
         LIMIT 1`
      )
      .bind(resolved.identity.userId, resolved.identity.organizationId)
      .first<{ telegram_user_id: string; telegram_username: string | null }>();

    return jsonApiSuccess({
      authenticated: true,
      authSource: tgLink ? 'telegram_linked' : 'web_session',
      telegramUsername: tgLink?.telegram_username ?? null,
      user: {
        id: resolved.identity.userId,
        email: identityEmail,
        fullName: resolved.userName || identityEmail,
      },
      activeWorkspace: {
        organizationId: resolved.identity.organizationId,
        organizationName: resolved.organizationName || 'Workspace',
        organizationSlug: resolved.organizationSlug || 'workspace',
        role: resolved.identity.role,
        availability: matchingAgent?.availability ?? 'available',
      },
      linkedWorkspaces: memberships.map((m) => ({
        organizationId: m.organization_id,
        organizationName: m.org_name,
        organizationSlug: m.org_slug,
        role: m.role,
      })),
    });
  } catch (error) {
    return jsonApiError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unable to resolve Mini App session.',
      500
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      initData?: string;
      organizationId?: string;
      availability?: AgentAvailability;
    };

    const db = await getKnowledgeDatabase();
    const authService = await getAuthIdentityService();
    const channelService = await getChannelIntegrationService();
    const workspaceRepo = await getWorkspaceRepository();
    const { ipAddress, userAgent } = extractRequestClientMeta(request);

    // Path A: Cryptographic Telegram Mini App initData authentication
    if (body.initData && body.initData.trim().length > 0) {
      const centralBotToken = readRuntimeSecret('TELEGRAM_BOT_TOKEN');
      const authResult = await channelService.authenticateTelegramMiniAppAgent({
        initData: body.initData,
        centralBotToken,
        preferredOrganizationId: body.organizationId,
      });

      const createdSession = await authService.createSession({
        userId: authResult.user.id,
        organizationId: authResult.activeWorkspace.organizationId,
        mfaVerified: true,
        ipAddress,
        userAgent: `TelegramMiniApp (${userAgent})`.slice(0, 240),
      });

      const signedCookieValue = createSignedAdminSessionToken({
        userId: authResult.user.id,
        email: authResult.user.email,
        userName: authResult.user.fullName,
        organizationId: authResult.activeWorkspace.organizationId,
        organizationName: authResult.activeWorkspace.organizationName,
        organizationSlug: authResult.activeWorkspace.organizationSlug,
        role: authResult.activeWorkspace.role,
        sessionId: createdSession.sessionId,
        sessionToken: createdSession.rawSessionToken,
        emailVerified: true,
      });

      const response = NextResponse.json(
        {
          ok: true,
          success: true,
          data: {
            authenticated: true,
            authSource: 'telegram_init_data',
            telegramUsername: authResult.telegramUser.username ?? null,
            user: authResult.user,
            activeWorkspace: authResult.activeWorkspace,
            linkedWorkspaces: authResult.linkedWorkspaces,
          },
          meta: { timestamp: new Date().toISOString() },
        },
        { status: 200 }
      );

      response.cookies.set(
        ADMIN_SESSION_COOKIE_NAME,
        signedCookieValue,
        getAdminCookieOptions()
      );
      return response;
    }

    // Path B: Authenticated session updating availability or switching active workspace
    const existing = await resolveServerAdminSession();
    if (!existing.identity) {
      return jsonApiError(
        'UNAUTHORIZED',
        'Valid Telegram Mini App initData or active workspace session is required.',
        401
      );
    }

    const existingEmail = existing.identity.email || '';
    let targetOrgId = existing.identity.organizationId;
    let targetOrgName = existing.organizationName || 'Workspace';
    let targetOrgSlug = existing.organizationSlug || 'workspace';
    let targetRole = existing.identity.role;

    if (
      body.organizationId &&
      body.organizationId.trim() &&
      body.organizationId !== existing.identity.organizationId
    ) {
      const targetMembership = await db
        .prepare(
          `SELECT om.organization_id, om.role, o.name AS org_name, o.slug AS org_slug
           FROM organization_members om
           JOIN organizations o ON o.id = om.organization_id
           WHERE om.user_id = ? AND om.organization_id = ? AND om.is_active = 1 AND o.is_active = 1`
        )
        .bind(existing.identity.userId, body.organizationId.trim())
        .first<{
          organization_id: string;
          role: UserRole;
          org_name: string;
          org_slug: string;
        }>();

      if (!targetMembership) {
        return jsonApiError(
          'FORBIDDEN',
          'You do not have an active membership in the requested workspace.',
          403
        );
      }

      targetOrgId = targetMembership.organization_id;
      targetOrgName = targetMembership.org_name;
      targetOrgSlug = targetMembership.org_slug;
      targetRole = targetMembership.role;
    }

    if (
      body.availability &&
      ['available', 'busy', 'offline'].includes(body.availability)
    ) {
      const nowIso = new Date().toISOString();
      await db
        .prepare(
          `UPDATE support_agents
           SET availability = ?, updated_at = ?
           WHERE organization_id = ? AND LOWER(email) = ?`
        )
        .bind(
          body.availability,
          nowIso,
          targetOrgId,
          existingEmail.toLowerCase()
        )
        .run();
    }

    const agents = await workspaceRepo.listAgents(targetOrgId);
    const matchingAgent = agents.find(
      (a) => a.email.toLowerCase() === existingEmail.toLowerCase()
    );

    const createdSession = await authService.createSession({
      userId: existing.identity.userId,
      organizationId: targetOrgId,
      mfaVerified: Boolean(existing.mfaEnabled),
      ipAddress,
      userAgent,
    });

    const signedCookieValue = createSignedAdminSessionToken({
      userId: existing.identity.userId,
      email: existingEmail,
      userName: existing.userName || existingEmail,
      organizationId: targetOrgId,
      organizationName: targetOrgName,
      organizationSlug: targetOrgSlug,
      role: targetRole,
      sessionId: createdSession.sessionId,
      sessionToken: createdSession.rawSessionToken,
      emailVerified: existing.emailVerified,
      mfaEnabled: existing.mfaEnabled,
    });

    const { results: memberships } = await db
      .prepare(
        `SELECT om.organization_id, om.role, o.name AS org_name, o.slug AS org_slug
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = ? AND om.is_active = 1 AND o.is_active = 1
         ORDER BY o.name ASC`
      )
      .bind(existing.identity.userId)
      .all<{
        organization_id: string;
        role: UserRole;
        org_name: string;
        org_slug: string;
      }>();

    const response = NextResponse.json(
      {
        ok: true,
        success: true,
        data: {
          authenticated: true,
          authSource: 'web_session',
          user: {
            id: existing.identity.userId,
            email: existingEmail,
            fullName: existing.userName || existingEmail,
          },
          activeWorkspace: {
            organizationId: targetOrgId,
            organizationName: targetOrgName,
            organizationSlug: targetOrgSlug,
            role: targetRole,
            availability:
              body.availability ?? matchingAgent?.availability ?? 'available',
          },
          linkedWorkspaces: memberships.map((m) => ({
            organizationId: m.organization_id,
            organizationName: m.org_name,
            organizationSlug: m.org_slug,
            role: m.role,
          })),
        },
        meta: { timestamp: new Date().toISOString() },
      },
      { status: 200 }
    );

    response.cookies.set(
      ADMIN_SESSION_COOKIE_NAME,
      signedCookieValue,
      getAdminCookieOptions()
    );
    return response;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Mini App authentication failed.';
    if (msg.startsWith('MINIAPP_AUTH_INVALID:')) {
      return jsonApiError('UNAUTHORIZED', msg.replace('MINIAPP_AUTH_INVALID:', '').trim(), 401);
    }
    if (msg.startsWith('MINIAPP_AGENT_NOT_LINKED:')) {
      return jsonApiError('FORBIDDEN', msg.replace('MINIAPP_AGENT_NOT_LINKED:', '').trim(), 403);
    }
    return jsonApiError('INTERNAL_ERROR', 'Unable to authenticate Telegram Mini App session.', 500);
  }
}

import { cookies } from 'next/headers';
import { UserRole } from '@careflow/shared';
import { DevAdminSessionSignInSchema } from '@careflow/validation';
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSignedAdminSessionToken,
  getAdminCookieOptions,
  listAvailableAdminWorkspaces,
  resolveServerAdminSession,
  verifyPasscodeConstantTime,
} from '@/lib/admin-auth';
import {
  handleKnowledgeApiException,
  jsonApiError,
  jsonApiSuccess,
} from '@/lib/api-response';

import { getWorkspaceRepository } from '@/lib/knowledge-runtime';
import type { UserWorkspaceMembership } from '@careflow/shared';

export const dynamic = 'force-dynamic';

export interface AdminSessionStatusDto {
  authenticated: boolean;
  session: {
    userId: string;
    email?: string;
    userName?: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: UserRole;
  } | null;
  workspaces?: UserWorkspaceMembership[];
}

function normalizeWorkspaceIdentifier(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.careflow\.com$/, '')
    .replace(/\.localhost(?::\d+)?$/, '');
}

export async function GET() {
  try {
    const resolved = await resolveServerAdminSession();

    let userWorkspaces: UserWorkspaceMembership[] = [];
    if (resolved.identity?.userId) {
      try {
        const repo = await getWorkspaceRepository();
        userWorkspaces = await repo.getUserWorkspaces(resolved.identity.userId);
      } catch {
        // Fallback for isolated tests or dev session
      }
    }

    const response: AdminSessionStatusDto = {
      authenticated: Boolean(resolved.identity),
      session: resolved.identity
        ? {
            userId: resolved.identity.userId,
            email: resolved.identity.email,
            userName: resolved.userName,
            organizationId: resolved.identity.organizationId,
            organizationName: resolved.organizationName ?? resolved.identity.organizationId,
            organizationSlug: resolved.organizationSlug ?? '',
            role: resolved.identity.role,
          }
        : null,
      workspaces: userWorkspaces,
    };

    return jsonApiSuccess(response);
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function POST(request: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonApiError('INVALID_JSON', 'Request body must be valid JSON.', 400);
    }

    const input = DevAdminSessionSignInSchema.parse(rawBody);

    if (!verifyPasscodeConstantTime(input.accessPasscode)) {
      return jsonApiError(
        'INVALID_CREDENTIALS',
        'Invalid workspace identifier or access passcode.',
        401
      );
    }

    const normalized = normalizeWorkspaceIdentifier(input.organizationId);
    const rawTrimmed = input.organizationId.trim().toLowerCase();

    const workspaces = await listAvailableAdminWorkspaces();
    const targetOrg = workspaces.find(
      (w) =>
        w.id.toLowerCase() === rawTrimmed ||
        w.slug.toLowerCase() === normalized ||
        w.name.toLowerCase() === rawTrimmed
    );

    if (!targetOrg) {
      return jsonApiError(
        'INVALID_CREDENTIALS',
        'Invalid workspace identifier or access passcode.',
        401
      );
    }

    const token = createSignedAdminSessionToken({
      userId: `admin_${targetOrg.slug}`,
      email: `admin@${targetOrg.slug}.careflow.local`,
      organizationId: targetOrg.id,
      organizationName: targetOrg.name,
      organizationSlug: targetOrg.slug,
      role: UserRole.Admin,
    });

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, getAdminCookieOptions());

    return jsonApiSuccess({
      authenticated: true,
      session: {
        userId: `admin_${targetOrg.slug}`,
        email: `admin@${targetOrg.slug}.careflow.local`,
        organizationId: targetOrg.id,
        organizationName: targetOrg.name,
        organizationSlug: targetOrg.slug,
        role: UserRole.Admin,
      },
    });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(ADMIN_SESSION_COOKIE_NAME);
    return jsonApiSuccess({ authenticated: false });
  } catch (err) {
    return handleKnowledgeApiException(err);
  }
}

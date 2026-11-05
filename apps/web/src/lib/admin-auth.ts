import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { UserRole } from '@careflow/shared';
import { hasMinimumRole, type AuthSessionIdentity } from '@careflow/support-engine';
import { validateSafeRedirectUrl } from '@careflow/validation';
import {
  getActiveCloudflareEnv,
  getAuthIdentityService,
  getKnowledgeDatabase,
  getWorkspaceRepository,
} from '@/lib/knowledge-runtime';

export const ADMIN_SESSION_COOKIE_NAME = 'cf_admin_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours
const MFA_CHALLENGE_TTL_SECONDS = 60 * 5; // 5 minutes

export interface RegisteredWorkspaceSummary {
  id: string;
  slug: string;
  name: string;
}

export interface SignedSessionPayload {
  userId: string;
  email: string;
  userName?: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: UserRole;
  sessionId?: string;
  sessionToken?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  exp: number;
}

export interface SignedMfaChallengePayload {
  purpose: 'mfa_login_challenge';
  userId: string;
  email: string;
  organizationId: string;
  exp: number;
}

export function readRuntimeSecret(key: string): string | undefined {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess && fromProcess.length > 0) {
    return fromProcess;
  }
  const cfEnv = getActiveCloudflareEnv();
  const fromCf = cfEnv?.[key];
  if (typeof fromCf === 'string' && fromCf.trim().length > 0) {
    return fromCf.trim();
  }
  return undefined;
}

export function getMergedRuntimeEnv(): Record<string, unknown> {
  const cfEnv = getActiveCloudflareEnv() ?? {};
  return {
    ...process.env,
    ...cfEnv,
  };
}

let loggedMissingSessionSecretWarning = false;

function getSigningSecret(): string {
  const configured = readRuntimeSecret('CAREFLOW_ADMIN_SESSION_SECRET');
  if (configured && configured.length >= 16) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    const entropyParts = [
      readRuntimeSecret('TELEGRAM_WEBHOOK_SECRET') || '',
      readRuntimeSecret('RESEND_API_KEY') || '',
      readRuntimeSecret('TURNSTILE_SECRET_KEY') || '',
      readRuntimeSecret('TELEGRAM_BOT_TOKEN') || '',
      readRuntimeSecret('CAREFLOW_APP_BASE_URL') || 'https://getcustomcare.xyz',
      'customcare-production-derived-session-hmac-v1',
    ].join('::');

    if (!loggedMissingSessionSecretWarning) {
      loggedMissingSessionSecretWarning = true;
      void getWorkspaceRepository()
        .then((workspaceRepo) =>
          workspaceRepo.recordSystemErrorLog({
            errorCode: 'CFG-SESSION-SECRET',
            internalMessage:
              'CAREFLOW_ADMIN_SESSION_SECRET (>= 16 chars) is not explicitly set in Worker secrets; using derived production HMAC key. Add CAREFLOW_ADMIN_SESSION_SECRET in Cloudflare Worker Settings -> Variables and Secrets.',
            routeOrContext: 'admin-auth:getSigningSecret',
          })
        )
        .catch(() => undefined);
    }

    return createHmac('sha256', 'customcare-hmac-root-salt-2026')
      .update(entropyParts)
      .digest('hex');
  }

  return 'careflow-stage1-local-dev-hmac-secret-key-do-not-use-in-prod';
}

function signBase64Payload(payloadBase64Url: string): string {
  return createHmac('sha256', getSigningSecret())
    .update(payloadBase64Url)
    .digest('base64url');
}

export function createSignedAdminSessionToken(payload: Omit<SignedSessionPayload, 'exp'>): string {
  const fullPayload: SignedSessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const signature = signBase64Payload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedAdminSessionToken(
  token: string | undefined | null
): SignedSessionPayload | null {
  if (!token || !token.includes('.')) {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signBase64Payload(encodedPayload);
  const providedBuf = Buffer.from(providedSignature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');

  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as SignedSessionPayload;

    if (!parsed.organizationId || !parsed.userId || !parsed.role || !parsed.exp) {
      return null;
    }

    if (parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function createSignedMfaChallengeToken(
  payload: Omit<SignedMfaChallengePayload, 'purpose' | 'exp'>
): string {
  const fullPayload: SignedMfaChallengePayload = {
    ...payload,
    purpose: 'mfa_login_challenge',
    exp: Math.floor(Date.now() / 1000) + MFA_CHALLENGE_TTL_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const signature = signBase64Payload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySignedMfaChallengeToken(
  token: string | undefined | null
): SignedMfaChallengePayload | null {
  if (!token || !token.includes('.')) {
    return null;
  }

  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = signBase64Payload(encodedPayload);
  const providedBuf = Buffer.from(providedSignature, 'utf8');
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');

  if (
    providedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(providedBuf, expectedBuf)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    ) as SignedMfaChallengePayload;

    if (
      parsed.purpose !== 'mfa_login_challenge' ||
      !parsed.userId ||
      !parsed.organizationId ||
      parsed.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function listAvailableAdminWorkspaces(): Promise<RegisteredWorkspaceSummary[]> {
  const db = await getKnowledgeDatabase();
  const { results } = await db
    .prepare(
      `SELECT id, slug, name
       FROM organizations
       WHERE is_active = 1
       ORDER BY name ASC`
    )
    .all<RegisteredWorkspaceSummary>();

  return results;
}

/**
 * Resolves and validates the current server-side session.
 * Strictly requires a D1-backed `sessionToken` in the signed cookie and verifies that:
 * 1. The session exists in `auth_sessions`, is not revoked (`revoked_at IS NULL`), and has not expired.
 * 2. The user still belongs to the active organization (`organization_members.is_active = 1`).
 * 3. The organization is active (`organizations.is_active = 1`).
 * 4. Returns the authoritative server-side role and organization from D1.
 */
export async function resolveServerAdminSession(): Promise<{
  identity: AuthSessionIdentity | null;
  organizationName?: string;
  organizationSlug?: string;
  userName?: string;
  sessionId?: string;
  sessionToken?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
  accountType?: 'business' | 'agent' | 'both';
  isPersonalAccount?: boolean;
  isPlatformAdmin?: boolean;
  department?: string;
  permissions?: string[];
  agentIdentityId?: string | null;
}> {
  const cookieStore = await cookies();
  const rawCookie = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const verified = verifySignedAdminSessionToken(rawCookie);

  if (!verified || !verified.sessionToken) {
    return { identity: null };
  }

  try {
    const authService = await getAuthIdentityService();
    const dbValidated = await authService.validateSessionToken(verified.sessionToken);
    if (!dbValidated) {
      return { identity: null };
    }

    return {
      identity: {
        userId: dbValidated.user.id,
        email: dbValidated.user.email,
        organizationId: dbValidated.activeMembership.organizationId,
        role: dbValidated.activeMembership.role,
      },
      organizationName: dbValidated.activeMembership.organizationName,
      organizationSlug: dbValidated.activeMembership.organizationSlug,
      userName: dbValidated.user.fullName,
      sessionId: dbValidated.session.id,
      sessionToken: verified.sessionToken,
      emailVerified: dbValidated.user.emailVerified,
      mfaEnabled: Boolean(dbValidated.user.mfaEnabled),
      accountType: dbValidated.user.accountType || 'business',
      isPersonalAccount: dbValidated.user.isPersonalAccount !== false,
      isPlatformAdmin: Boolean(dbValidated.user.isPlatformAdmin),
      department: dbValidated.activeMembership.department ?? '',
      permissions: dbValidated.activeMembership.permissions ?? [],
      agentIdentityId: dbValidated.activeMembership.agentIdentityId ?? null,
    };
  } catch {
    return { identity: null };
  }
}

/**
 * Enforces server-side authentication, organization membership, and role authorization.
 */
export async function requireAuthorizedWorkspaceSession(
  minimumRole: UserRole = UserRole.Viewer
): Promise<
  | {
      authorized: true;
      session: Awaited<ReturnType<typeof resolveServerAdminSession>> & {
        identity: AuthSessionIdentity;
      };
    }
  | {
      authorized: false;
      status: 401 | 403;
      code: 'UNAUTHORIZED' | 'FORBIDDEN';
      message: string;
    }
> {
  const resolved = await resolveServerAdminSession();
  if (!resolved.identity) {
    return {
      authorized: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Valid authenticated session is required.',
    };
  }

  if (!hasMinimumRole(resolved.identity, minimumRole)) {
    return {
      authorized: false,
      status: 403,
      code: 'FORBIDDEN',
      message: `Insufficient role permissions. Required minimum role: ${minimumRole}.`,
    };
  }

  return {
    authorized: true,
    session: resolved as Awaited<ReturnType<typeof resolveServerAdminSession>> & {
      identity: AuthSessionIdentity;
    },
  };
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
    priority: 'high' as const,
  };
}

export function extractRequestClientMeta(request: Request): {
  ipAddress: string;
  userAgent: string;
} {
  const cfIp = request.headers.get('cf-connecting-ip')?.trim();
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ipAddress = cfIp || forwardedFor || '127.0.0.1';
  const userAgent = (request.headers.get('user-agent') || 'Unknown Client').slice(0, 240);
  return { ipAddress, userAgent };
}

export function getConfiguredAllowedRedirectOrigins(): string[] {
  const list: string[] = [];
  const base = readRuntimeSecret('CAREFLOW_APP_BASE_URL') || readRuntimeSecret('NEXT_PUBLIC_APP_URL');
  if (base) {
    try {
      list.push(new URL(base).origin);
    } catch {
      // ignore invalid URL
    }
  }
  const rawAllowed =
    readRuntimeSecret('CAREFLOW_ALLOWED_REDIRECT_URLS') ||
    readRuntimeSecret('CAREFLOW_ALLOWED_REDIRECT_ORIGINS');
  if (rawAllowed) {
    for (const part of rawAllowed.split(',')) {
      const trimmed = part.trim();
      if (trimmed) {
        try {
          list.push(new URL(trimmed).origin);
        } catch {
          // ignore invalid URL
        }
      }
    }
  }
  return Array.from(new Set(list));
}

export function resolveSafeRedirectTarget(
  rawUrl?: string | null,
  fallback = '/admin'
): { valid: boolean; sanitizedUrl: string } {
  return validateSafeRedirectUrl(rawUrl, getConfiguredAllowedRedirectOrigins(), fallback);
}

/**
 * Validates Origin / Referer headers on state-changing requests when present
 * to protect cookie-authenticated endpoints against Cross-Site Request Forgery (CSRF).
 */
export function verifyRequestOriginCsrf(request: Request): {
  allowed: boolean;
  reason?: string;
} {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { allowed: true };
  }

  const originHeader = request.headers.get('origin')?.trim();
  const refererHeader = request.headers.get('referer')?.trim();
  const sourceHeader = originHeader || refererHeader;

  if (!sourceHeader) {
    // Non-browser API clients or same-origin requests omitting Origin/Referer are allowed
    return { allowed: true };
  }

  try {
    const requestUrl = new URL(request.url);
    const sourceUrl = new URL(sourceHeader);
    if (sourceUrl.host.toLowerCase() === requestUrl.host.toLowerCase()) {
      return { allowed: true };
    }

    const hostHeader =
      request.headers.get('x-forwarded-host')?.trim() ||
      request.headers.get('host')?.trim();
    if (hostHeader && sourceUrl.host.toLowerCase() === hostHeader.toLowerCase()) {
      return { allowed: true };
    }

    const allowedOrigins = getConfiguredAllowedRedirectOrigins().map((o) => o.toLowerCase());
    if (allowedOrigins.includes(sourceUrl.origin.toLowerCase())) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Cross-origin state-changing request from ${sourceUrl.origin} was blocked by CSRF protection.`,
    };
  } catch {
    return {
      allowed: false,
      reason: 'Malformed Origin or Referer header blocked by CSRF protection.',
    };
  }
}

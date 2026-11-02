import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { UserRole } from '@careflow/shared';
import type { AuthSessionIdentity } from '@careflow/support-engine';
import { getActiveCloudflareEnv, getKnowledgeDatabase } from '@/lib/knowledge-runtime';

export const ADMIN_SESSION_COOKIE_NAME = 'cf_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export interface RegisteredWorkspaceSummary {
  id: string;
  slug: string;
  name: string;
}

interface SignedSessionPayload {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: UserRole;
  exp: number;
}

function readRuntimeSecret(key: string): string | undefined {
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

function getSigningSecret(): string {
  const configured = readRuntimeSecret('CAREFLOW_ADMIN_SESSION_SECRET');
  if (configured && configured.length >= 16) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Security Configuration Error: CAREFLOW_ADMIN_SESSION_SECRET (>= 16 chars) is required in production. Add it in Cloudflare Worker Settings -> Variables and Secrets.'
    );
  }
  return 'careflow-stage1-local-dev-hmac-secret-key-do-not-use-in-prod';
}

export function getExpectedAdminPasscode(): {
  passcode: string;
  isDefaultDevPasscode: boolean;
} {
  const configured = readRuntimeSecret('CAREFLOW_ADMIN_PASSCODE');
  if (configured && configured.length >= 4) {
    return { passcode: configured, isDefaultDevPasscode: false };
  }
  return { passcode: 'careflow-dev-admin', isDefaultDevPasscode: true };
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

export async function resolveServerAdminSession(): Promise<{
  identity: AuthSessionIdentity | null;
  organizationName?: string;
  organizationSlug?: string;
}> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const verified = verifySignedAdminSessionToken(rawToken);

  if (!verified) {
    return { identity: null };
  }

  return {
    identity: {
      userId: verified.userId,
      email: verified.email,
      organizationId: verified.organizationId,
      role: verified.role,
    },
    organizationName: verified.organizationName,
    organizationSlug: verified.organizationSlug,
  };
}

export function verifyPasscodeConstantTime(inputPasscode: string): boolean {
  const { passcode } = getExpectedAdminPasscode();
  const a = Buffer.from(inputPasscode);
  const b = Buffer.from(passcode);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

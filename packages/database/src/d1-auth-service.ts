import {
  DEFAULT_PERMISSIONS_BY_ROLE,
  DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS,
  isRegisteredPlatformSuperAdminEmail,
  UserRole,
  type AccountRegistrationMode,
  type AccountSecurityOverviewDto,
  type AgentAccessMode,
  type AgentIdentityRecord,
  type AuthSecurityEventRecord,
  type AuthSessionRecord,
  type BusinessOnboardingStatus,
  type CareFlowUserRecord,
  type InvitationInspectionDto,
  type MembershipLifecycleStatus,
  type MfaEnrollmentSetupDto,
  type UserWorkspaceMembership,
  type WorkspaceAuditLogRecord,
  type WorkspaceInvitationRecord,
  type WorkspaceInvitationStatus,
  type WorkspacePermissionKey,
} from '@careflow/shared';
import type { D1DatabaseLike } from './d1-types';
import {
  buildOtpAuthUri,
  buildTotpQrCodeSvgDataUrl,
  generateRecoveryCodes,
  generateSecureToken,
  generateTotpSecret,
  hashPassword,
  hashTokenSha256,
  verifyAndConsumeRecoveryCode,
  verifyPassword,
  verifyTotpCode,
} from './password-auth';
import { resolveResendConfig } from './resend-email';

export type RateLimitAction =
  | 'login'
  | 'register'
  | 'password_reset'
  | 'mfa_verify'
  | 'api'
  | 'escalation';

export interface RateLimitPolicy {
  maxAttempts: number;
  windowSeconds: number;
  cooldownSeconds: number;
}

const DEFAULT_RATE_LIMIT_POLICIES: Record<RateLimitAction, RateLimitPolicy> = {
  login: { maxAttempts: 5, windowSeconds: 15 * 60, cooldownSeconds: 15 * 60 },
  register: { maxAttempts: 5, windowSeconds: 15 * 60, cooldownSeconds: 15 * 60 },
  password_reset: { maxAttempts: 3, windowSeconds: 15 * 60, cooldownSeconds: 15 * 60 },
  mfa_verify: { maxAttempts: 5, windowSeconds: 10 * 60, cooldownSeconds: 10 * 60 },
  api: { maxAttempts: 120, windowSeconds: 60, cooldownSeconds: 60 },
  escalation: { maxAttempts: 30, windowSeconds: 60, cooldownSeconds: 60 },
};

const ROLE_WEIGHT: Record<UserRole, number> = {
  [UserRole.Customer]: 10,
  [UserRole.Viewer]: 15,
  [UserRole.Agent]: 20,
  [UserRole.Supervisor]: 30,
  [UserRole.Admin]: 40,
  [UserRole.Owner]: 50,
};

interface DbUserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  email_verified: number;
  mfa_enabled: number;
  mfa_secret: string | null;
  mfa_pending_secret: string | null;
  mfa_recovery_codes_json: string | null;
  mfa_verified_at: string | null;
  password_changed_at: string | null;
  account_type?: string | null;
  is_platform_admin?: number | null;
  is_personal_account?: number | null;
  created_at: string;
  updated_at: string;
}

interface DbSessionRow {
  id: string;
  token_hash: string;
  user_id: string;
  organization_id: string;
  agent_identity_id?: string | null;
  access_mode?: string | null;
  user_agent: string;
  ip_address: string;
  mfa_verified: number;
  expires_at: string;
  revoked_at: string | null;
  last_active_at: string;
  created_at: string;
}

interface DbTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  token_type: 'email_verification' | 'password_reset';
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface DbRateLimitRow {
  key: string;
  action: string;
  attempt_count: number;
  window_started_at: string;
  locked_until: string | null;
  updated_at: string;
}

interface DbMemberOrgRow {
  membership_id?: string;
  organization_id: string;
  slug: string;
  name: string;
  role: string;
  status?: string | null;
  department?: string | null;
  permissions_json?: string | null;
  agent_identity_id?: string | null;
  country: string | null;
  industry: string | null;
  website: string | null;
  onboarding_status: string | null;
  onboarding_step: number | null;
  org_active: number;
  member_active: number;
}

interface DbSecurityEventRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  event_type: AuthSecurityEventRecord['eventType'];
  ip_address: string;
  user_agent: string;
  metadata_json: string;
  created_at: string;
}

interface DbAgentIdentityRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  user_id: string | null;
  email_verified: number;
  department: string;
  specialty: string;
  access_mode: string;
  created_at: string;
  updated_at: string;
}

interface DbInvitationRow {
  id: string;
  organization_id: string;
  org_name?: string;
  org_slug?: string;
  org_country?: string;
  org_industry?: string;
  email: string;
  display_name: string;
  role: string;
  department: string;
  specialty: string;
  permissions_json: string;
  token_hash: string;
  invited_by_user_id: string | null;
  invited_by_name: string;
  status: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

function isSuperAdminEmail(email: string): boolean {
  return isRegisteredPlatformSuperAdminEmail(email);
}

function parsePermissionsJson(raw: string | null | undefined, role: UserRole): WorkspacePermissionKey[] {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((p): p is WorkspacePermissionKey => typeof p === 'string');
      }
    } catch {
      // fall through
    }
  }
  return DEFAULT_PERMISSIONS_BY_ROLE[role] ?? [];
}

function createAuthId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 16);
  return `${prefix}_${rand}`;
}

export class D1AuthIdentityService {
  constructor(private readonly db: D1DatabaseLike) {}

  /* =========================================================================
     1. Rate Limiting & Brute-Force Protection (Temporary Cooldowns Only)
  ========================================================================= */

  async checkRateLimit(
    action: RateLimitAction,
    identifier: string,
    nowMs = Date.now(),
    customPolicy?: Partial<RateLimitPolicy>
  ): Promise<{
    allowed: boolean;
    remainingAttempts: number;
    retryAfterSeconds: number;
  }> {
    const policy = { ...DEFAULT_RATE_LIMIT_POLICIES[action], ...customPolicy };
    const normalizedId = identifier.trim().toLowerCase() || 'anonymous';
    const key = `${action}:${normalizedId}`;

    const row = await this.db
      .prepare(`SELECT * FROM auth_rate_limits WHERE key = ?`)
      .bind(key)
      .first<DbRateLimitRow>();

    if (!row) {
      return {
        allowed: true,
        remainingAttempts: policy.maxAttempts,
        retryAfterSeconds: 0,
      };
    }

    if (row.locked_until) {
      const lockedUntilMs = Date.parse(row.locked_until);
      if (!Number.isNaN(lockedUntilMs) && lockedUntilMs > nowMs) {
        const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000));
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfterSeconds,
        };
      }
    }

    const windowStartMs = Date.parse(row.window_started_at);
    const windowExpired =
      Number.isNaN(windowStartMs) || nowMs - windowStartMs >= policy.windowSeconds * 1000;

    if (windowExpired) {
      return {
        allowed: true,
        remainingAttempts: policy.maxAttempts,
        retryAfterSeconds: 0,
      };
    }

    const remaining = Math.max(0, policy.maxAttempts - row.attempt_count);
    return {
      allowed: remaining > 0,
      remainingAttempts: remaining,
      retryAfterSeconds: remaining > 0 ? 0 : policy.cooldownSeconds,
    };
  }

  async recordRateLimitAttempt(
    action: RateLimitAction,
    identifier: string,
    nowMs = Date.now(),
    customPolicy?: Partial<RateLimitPolicy>
  ): Promise<{
    allowed: boolean;
    attemptCount: number;
    remainingAttempts: number;
    retryAfterSeconds: number;
  }> {
    const policy = { ...DEFAULT_RATE_LIMIT_POLICIES[action], ...customPolicy };
    const normalizedId = identifier.trim().toLowerCase() || 'anonymous';
    const key = `${action}:${normalizedId}`;
    const nowIso = new Date(nowMs).toISOString();

    const existing = await this.db
      .prepare(`SELECT * FROM auth_rate_limits WHERE key = ?`)
      .bind(key)
      .first<DbRateLimitRow>();

    if (existing?.locked_until) {
      const lockedUntilMs = Date.parse(existing.locked_until);
      if (!Number.isNaN(lockedUntilMs) && lockedUntilMs > nowMs) {
        return {
          allowed: false,
          attemptCount: existing.attempt_count,
          remainingAttempts: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 1000)),
        };
      }
    }

    const windowStartMs = existing ? Date.parse(existing.window_started_at) : NaN;
    const windowExpired =
      !existing ||
      Number.isNaN(windowStartMs) ||
      nowMs - windowStartMs >= policy.windowSeconds * 1000 ||
      Boolean(existing.locked_until && Date.parse(existing.locked_until) <= nowMs);

    const newCount = windowExpired ? 1 : existing.attempt_count + 1;
    const newWindowStart = windowExpired ? nowIso : existing.window_started_at;
    const shouldLock = newCount >= policy.maxAttempts;
    const lockedUntil = shouldLock
      ? new Date(nowMs + policy.cooldownSeconds * 1000).toISOString()
      : null;

    await this.db
      .prepare(
        `INSERT INTO auth_rate_limits (key, action, attempt_count, window_started_at, locked_until, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET
           attempt_count = excluded.attempt_count,
           window_started_at = excluded.window_started_at,
           locked_until = excluded.locked_until,
           updated_at = excluded.updated_at`
      )
      .bind(key, action, newCount, newWindowStart, lockedUntil, nowIso)
      .run();

    const remainingAttempts = Math.max(0, policy.maxAttempts - newCount);
    return {
      allowed: !shouldLock,
      attemptCount: newCount,
      remainingAttempts,
      retryAfterSeconds: shouldLock ? policy.cooldownSeconds : 0,
    };
  }

  async resetRateLimit(action: RateLimitAction, identifier: string): Promise<void> {
    const normalizedId = identifier.trim().toLowerCase() || 'anonymous';
    const key = `${action}:${normalizedId}`;
    await this.db.prepare(`DELETE FROM auth_rate_limits WHERE key = ?`).bind(key).run();
  }

  /* =========================================================================
     2. Security Audit Events
  ========================================================================= */

  async recordSecurityEvent(params: {
    userId: string;
    organizationId?: string | null;
    eventType: AuthSecurityEventRecord['eventType'];
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO auth_security_events
           (id, user_id, organization_id, event_type, ip_address, user_agent, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createAuthId('sec'),
        params.userId,
        params.organizationId ?? null,
        params.eventType,
        params.ipAddress ?? '',
        params.userAgent ?? '',
        JSON.stringify(params.metadata ?? {}),
        now
      )
      .run();
  }

  async listRecentSecurityEvents(
    userId: string,
    limit = 15
  ): Promise<AuthSecurityEventRecord[]> {
    const { results } = await this.db
      .prepare(
        `SELECT id, user_id, organization_id, event_type, ip_address, user_agent, metadata_json, created_at
         FROM auth_security_events
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .bind(userId, limit)
      .all<DbSecurityEventRow>();

    return results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      organizationId: r.organization_id,
      eventType: r.event_type,
      ipAddress: r.ip_address,
      userAgent: r.user_agent,
      metadataJson: r.metadata_json,
      createdAt: r.created_at,
    }));
  }

  /* =========================================================================
     3. Single-Use Hashed Tokens (Email Verification & Password Reset)
  ========================================================================= */

  async issueEmailVerificationToken(
    userId: string,
    ttlSeconds = 24 * 60 * 60,
    nowMs = Date.now()
  ): Promise<{ rawToken: string; expiresAt: string }> {
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
    const { rawToken, tokenHash } = generateSecureToken(32);

    // Invalidate any previous unused email verification tokens for this user
    await this.db
      .prepare(
        `UPDATE auth_tokens
         SET used_at = ?
         WHERE user_id = ? AND token_type = 'email_verification' AND used_at IS NULL`
      )
      .bind(nowIso, userId)
      .run();

    await this.db
      .prepare(
        `INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, used_at, created_at)
         VALUES (?, ?, ?, 'email_verification', ?, NULL, ?)`
      )
      .bind(createAuthId('tok'), userId, tokenHash, expiresAt, nowIso)
      .run();

    await this.recordSecurityEvent({
      userId,
      eventType: 'email_verification_requested',
    });

    return { rawToken, expiresAt };
  }

  async verifyEmailWithToken(
    rawToken: string,
    options?: { nowMs?: number; ipAddress?: string; userAgent?: string }
  ): Promise<CareFlowUserRecord> {
    const nowMs = options?.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const tokenHash = hashTokenSha256(rawToken);

    const tokenRow = await this.db
      .prepare(
        `SELECT * FROM auth_tokens
         WHERE token_hash = ? AND token_type = 'email_verification'`
      )
      .bind(tokenHash)
      .first<DbTokenRow>();

    if (!tokenRow) {
      throw new Error('INVALID_TOKEN: Invalid email verification token.');
    }

    if (tokenRow.used_at) {
      throw new Error('TOKEN_ALREADY_USED: This email verification token has already been used.');
    }

    const expiresMs = Date.parse(tokenRow.expires_at);
    if (Number.isNaN(expiresMs) || expiresMs <= nowMs) {
      throw new Error('TOKEN_EXPIRED: This email verification token has expired.');
    }

    await this.db
      .prepare(`UPDATE auth_tokens SET used_at = ? WHERE id = ?`)
      .bind(nowIso, tokenRow.id)
      .run();

    await this.db
      .prepare(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`)
      .bind(nowIso, tokenRow.user_id)
      .run();

    await this.recordSecurityEvent({
      userId: tokenRow.user_id,
      eventType: 'email_verified',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(tokenRow.user_id)
      .first<DbUserRow>();

    if (!userRow) {
      throw new Error('User account not found.');
    }

    return {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      emailVerified: Boolean(userRow.email_verified),
      mfaEnabled: Boolean(userRow.mfa_enabled),
      createdAt: userRow.created_at,
    };
  }

  async createPasswordResetToken(
    emailInput: string,
    options?: { ttlSeconds?: number; nowMs?: number; ipAddress?: string; userAgent?: string }
  ): Promise<{
    userFound: boolean;
    user?: CareFlowUserRecord;
    rawToken?: string;
    expiresAt?: string;
  }> {
    const email = emailInput.trim().toLowerCase();
    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .bind(email)
      .first<DbUserRow>();

    if (!userRow) {
      return { userFound: false };
    }

    const nowMs = options?.nowMs ?? Date.now();
    const ttlSeconds = options?.ttlSeconds ?? 60 * 60; // 1 hour default
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
    const { rawToken, tokenHash } = generateSecureToken(32);

    // Invalidate any prior unused password reset tokens for this user
    await this.db
      .prepare(
        `UPDATE auth_tokens
         SET used_at = ?
         WHERE user_id = ? AND token_type = 'password_reset' AND used_at IS NULL`
      )
      .bind(nowIso, userRow.id)
      .run();

    await this.db
      .prepare(
        `INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, used_at, created_at)
         VALUES (?, ?, ?, 'password_reset', ?, NULL, ?)`
      )
      .bind(createAuthId('tok'), userRow.id, tokenHash, expiresAt, nowIso)
      .run();

    await this.recordSecurityEvent({
      userId: userRow.id,
      eventType: 'password_reset_requested',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    return {
      userFound: true,
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        emailVerified: Boolean(userRow.email_verified),
        mfaEnabled: Boolean(userRow.mfa_enabled),
        createdAt: userRow.created_at,
      },
      rawToken,
      expiresAt,
    };
  }

  async resetPasswordWithToken(
    rawToken: string,
    newPassword: string,
    options?: { nowMs?: number; ipAddress?: string; userAgent?: string }
  ): Promise<CareFlowUserRecord> {
    const nowMs = options?.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const tokenHash = hashTokenSha256(rawToken);

    const tokenRow = await this.db
      .prepare(
        `SELECT * FROM auth_tokens
         WHERE token_hash = ? AND token_type = 'password_reset'`
      )
      .bind(tokenHash)
      .first<DbTokenRow>();

    if (!tokenRow) {
      throw new Error('INVALID_TOKEN: Invalid password reset token.');
    }

    if (tokenRow.used_at) {
      throw new Error('TOKEN_ALREADY_USED: This password reset token has already been used.');
    }

    const expiresMs = Date.parse(tokenRow.expires_at);
    if (Number.isNaN(expiresMs) || expiresMs <= nowMs) {
      throw new Error('TOKEN_EXPIRED: This password reset token has expired.');
    }

    const newPasswordHash = hashPassword(newPassword);

    await this.db
      .prepare(`UPDATE auth_tokens SET used_at = ? WHERE id = ?`)
      .bind(nowIso, tokenRow.id)
      .run();

    await this.db
      .prepare(
        `UPDATE users
         SET password_hash = ?, password_changed_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(newPasswordHash, nowIso, nowIso, tokenRow.user_id)
      .run();

    // Revoke all existing sessions for security when password is reset
    await this.revokeAllUserSessions(tokenRow.user_id, undefined, {
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    await this.recordSecurityEvent({
      userId: tokenRow.user_id,
      eventType: 'password_reset_completed',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(tokenRow.user_id)
      .first<DbUserRow>();

    if (!userRow) {
      throw new Error('User account not found.');
    }

    return {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      emailVerified: Boolean(userRow.email_verified),
      mfaEnabled: Boolean(userRow.mfa_enabled),
      createdAt: userRow.created_at,
    };
  }

  async changePassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
    currentSessionId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<CareFlowUserRecord> {
    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(params.userId)
      .first<DbUserRow>();

    if (!userRow) {
      throw new Error('User account not found.');
    }

    if (!verifyPassword(params.currentPassword, userRow.password_hash)) {
      throw new Error('INVALID_CREDENTIALS: Current password is incorrect.');
    }

    const nowIso = new Date().toISOString();
    const newHash = hashPassword(params.newPassword);

    await this.db
      .prepare(
        `UPDATE users
         SET password_hash = ?, password_changed_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(newHash, nowIso, nowIso, params.userId)
      .run();

    if (params.revokeOtherSessions !== false) {
      await this.revokeAllUserSessions(params.userId, params.currentSessionId, {
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      });
    }

    await this.recordSecurityEvent({
      userId: params.userId,
      eventType: 'password_changed',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });

    return {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      emailVerified: Boolean(userRow.email_verified),
      mfaEnabled: Boolean(userRow.mfa_enabled),
      createdAt: userRow.created_at,
    };
  }

  /* =========================================================================
     4. Server-Side D1 Session Management & Revocation
  ========================================================================= */

  async createSession(params: {
    userId: string;
    organizationId: string;
    agentIdentityId?: string | null;
    accessMode?: AgentAccessMode;
    mfaVerified?: boolean;
    ipAddress?: string;
    userAgent?: string;
    ttlSeconds?: number;
    nowMs?: number;
  }): Promise<{
    sessionId: string;
    rawSessionToken: string;
    session: AuthSessionRecord;
  }> {
    const nowMs = params.nowMs ?? Date.now();
    const ttlSeconds = params.ttlSeconds ?? 8 * 60 * 60; // 8 hours default
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
    const sessionId = createAuthId('ses');
    const { rawToken: rawSessionToken, tokenHash } = generateSecureToken(32);
    const accessMode: AgentAccessMode = params.accessMode ?? 'personal_account';

    await this.db
      .prepare(
        `INSERT INTO auth_sessions
           (id, token_hash, user_id, organization_id, agent_identity_id, access_mode, user_agent, ip_address, mfa_verified, expires_at, revoked_at, last_active_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(
        sessionId,
        tokenHash,
        params.userId,
        params.organizationId,
        params.agentIdentityId ?? null,
        accessMode,
        params.userAgent ?? '',
        params.ipAddress ?? '',
        params.mfaVerified ? 1 : 0,
        expiresAt,
        nowIso,
        nowIso
      )
      .run();

    const session: AuthSessionRecord = {
      id: sessionId,
      userId: params.userId,
      organizationId: params.organizationId,
      agentIdentityId: params.agentIdentityId ?? null,
      accessMode,
      userAgent: params.userAgent ?? '',
      ipAddress: params.ipAddress ?? '',
      mfaVerified: Boolean(params.mfaVerified),
      createdAt: nowIso,
      lastActiveAt: nowIso,
      expiresAt,
      revokedAt: null,
      isCurrent: true,
    };

    return { sessionId, rawSessionToken, session };
  }

  async validateSessionToken(
    rawSessionToken: string,
    options?: { nowMs?: number; ttlSeconds?: number }
  ): Promise<{
    session: AuthSessionRecord;
    user: CareFlowUserRecord;
    activeMembership: UserWorkspaceMembership;
    workspaces: UserWorkspaceMembership[];
  } | null> {
    if (!rawSessionToken || rawSessionToken.trim().length < 16) {
      return null;
    }

    const nowMs = options?.nowMs ?? Date.now();
    const ttlSeconds = options?.ttlSeconds ?? 8 * 60 * 60;
    const tokenHash = hashTokenSha256(rawSessionToken);

    const sessionRow = await this.db
      .prepare(`SELECT * FROM auth_sessions WHERE token_hash = ?`)
      .bind(tokenHash)
      .first<DbSessionRow>();

    if (!sessionRow || sessionRow.revoked_at) {
      return null;
    }

    const expiresMs = Date.parse(sessionRow.expires_at);
    if (Number.isNaN(expiresMs) || expiresMs <= nowMs) {
      return null;
    }

    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(sessionRow.user_id)
      .first<DbUserRow>();

    if (!userRow) {
      return null;
    }

    const isPersonalAccount = userRow.is_personal_account !== 0;
    const accountType = (userRow.account_type as AccountRegistrationMode) || 'business';
    const isPlatformAdmin = isRegisteredPlatformSuperAdminEmail(userRow.email);

    const workspaces = await this.getUserWorkspaces(userRow.id);

    // If this session is for a Business-Managed Agent (is_personal_account === 0)
    // and their membership in sessionRow.organization_id was suspended or revoked, immediately reject!
    if (!isPersonalAccount) {
      const stillActiveInSessionOrg = workspaces.find(
        (w) => w.organizationId === sessionRow.organization_id
      );
      if (!stillActiveInSessionOrg) {
        return null;
      }
    }

    let activeMembership: UserWorkspaceMembership | undefined;
    if (workspaces.length === 0) {
      // Allow standalone registered personal agents (or platform admins) with 0 active workspaces
      // to access their Agent Hub so they can accept invitations.
      if (isPersonalAccount && (accountType === 'agent' || isPlatformAdmin)) {
        activeMembership = {
          organizationId: 'org_customcare_agent_hub',
          organizationSlug: 'customcare-agent-hub',
          organizationName: 'CustomCare Agent Hub',
          role: UserRole.Agent,
          status: 'active',
          department: 'Support',
          permissions: DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent],
          accessMode: 'personal_account',
          country: 'United States',
          industry: 'Customer Support',
          onboardingStatus: 'incomplete',
          onboardingStep: 1,
        };
      } else {
        return null;
      }
    } else {
      activeMembership = workspaces.find(
        (w) => w.organizationId === sessionRow.organization_id
      );

      if (!activeMembership) {
        activeMembership = workspaces[0]!;
        await this.db
          .prepare(`UPDATE auth_sessions SET organization_id = ? WHERE id = ?`)
          .bind(activeMembership.organizationId, sessionRow.id)
          .run();
      }
    }

    // Sliding window session renewal if less than 50% of TTL remains
    const remainingMs = expiresMs - nowMs;
    const nowIso = new Date(nowMs).toISOString();
    let updatedExpiresAt = sessionRow.expires_at;

    if (remainingMs < (ttlSeconds * 1000) / 2) {
      updatedExpiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
      await this.db
        .prepare(
          `UPDATE auth_sessions
           SET last_active_at = ?, expires_at = ?
           WHERE id = ?`
        )
        .bind(nowIso, updatedExpiresAt, sessionRow.id)
        .run();
    } else {
      await this.db
        .prepare(`UPDATE auth_sessions SET last_active_at = ? WHERE id = ?`)
        .bind(nowIso, sessionRow.id)
        .run();
    }

    return {
      session: {
        id: sessionRow.id,
        userId: sessionRow.user_id,
        organizationId: activeMembership.organizationId,
        agentIdentityId: sessionRow.agent_identity_id ?? null,
        accessMode: (sessionRow.access_mode as AgentAccessMode) || (isPersonalAccount ? 'personal_account' : 'business_managed'),
        userAgent: sessionRow.user_agent,
        ipAddress: sessionRow.ip_address,
        mfaVerified: Boolean(sessionRow.mfa_verified),
        createdAt: sessionRow.created_at,
        lastActiveAt: nowIso,
        expiresAt: updatedExpiresAt,
        revokedAt: null,
        isCurrent: true,
      },
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        emailVerified: Boolean(userRow.email_verified),
        mfaEnabled: Boolean(userRow.mfa_enabled),
        accountType,
        isPersonalAccount,
        isPlatformAdmin,
        createdAt: userRow.created_at,
      },
      activeMembership,
      workspaces,
    };
  }

  async revokeSessionByToken(
    rawSessionToken: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<boolean> {
    if (!rawSessionToken) return false;
    const tokenHash = hashTokenSha256(rawSessionToken);
    const row = await this.db
      .prepare(`SELECT id, user_id, organization_id FROM auth_sessions WHERE token_hash = ?`)
      .bind(tokenHash)
      .first<{ id: string; user_id: string; organization_id: string }>();

    if (!row) return false;

    const nowIso = new Date().toISOString();
    await this.db
      .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE id = ?`)
      .bind(nowIso, row.id)
      .run();

    await this.recordSecurityEvent({
      userId: row.user_id,
      organizationId: row.organization_id,
      eventType: 'session_revoked',
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      metadata: { sessionId: row.id },
    });

    return true;
  }

  async revokeSessionById(
    userId: string,
    sessionId: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<boolean> {
    const row = await this.db
      .prepare(
        `SELECT id, organization_id FROM auth_sessions
         WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
      )
      .bind(sessionId, userId)
      .first<{ id: string; organization_id: string }>();

    if (!row) return false;

    const nowIso = new Date().toISOString();
    await this.db
      .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND user_id = ?`)
      .bind(nowIso, sessionId, userId)
      .run();

    await this.recordSecurityEvent({
      userId,
      organizationId: row.organization_id,
      eventType: 'session_revoked',
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      metadata: { sessionId },
    });

    return true;
  }

  async revokeAllUserSessions(
    userId: string,
    exceptSessionId?: string,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<number> {
    const nowIso = new Date().toISOString();

    if (exceptSessionId) {
      const res = await this.db
        .prepare(
          `UPDATE auth_sessions
           SET revoked_at = ?
           WHERE user_id = ? AND id != ? AND revoked_at IS NULL`
        )
        .bind(nowIso, userId, exceptSessionId)
        .run();

      await this.recordSecurityEvent({
        userId,
        eventType: 'all_sessions_revoked',
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent,
        metadata: { keptCurrentSession: true },
      });

      return Number(res.meta?.changes ?? 0);
    }

    const res = await this.db
      .prepare(
        `UPDATE auth_sessions
         SET revoked_at = ?
         WHERE user_id = ? AND revoked_at IS NULL`
      )
      .bind(nowIso, userId)
      .run();

    await this.recordSecurityEvent({
      userId,
      eventType: 'all_sessions_revoked',
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent,
      metadata: { keptCurrentSession: false },
    });

    return Number(res.meta?.changes ?? 0);
  }

  async listActiveSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<AuthSessionRecord[]> {
    const nowIso = new Date().toISOString();
    const { results } = await this.db
      .prepare(
        `SELECT * FROM auth_sessions
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY last_active_at DESC`
      )
      .bind(userId, nowIso)
      .all<DbSessionRow>();

    return results.map((r) => ({
      id: r.id,
      userId: r.user_id,
      organizationId: r.organization_id,
      userAgent: r.user_agent,
      ipAddress: r.ip_address,
      mfaVerified: Boolean(r.mfa_verified),
      createdAt: r.created_at,
      lastActiveAt: r.last_active_at,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      isCurrent: r.id === currentSessionId,
    }));
  }

  async switchSessionWorkspace(
    rawSessionToken: string,
    targetOrganizationId: string
  ): Promise<{
    membership: UserWorkspaceMembership;
    sessionId: string;
  }> {
    const validated = await this.validateSessionToken(rawSessionToken);
    if (!validated) {
      throw new Error('UNAUTHORIZED: Valid session required.');
    }

    const membership = await this.verifyOrganizationMembership(
      validated.user.id,
      targetOrganizationId
    );
    if (!membership) {
      throw new Error('FORBIDDEN: You do not have active membership in this workspace.');
    }

    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE auth_sessions
         SET organization_id = ?, last_active_at = ?
         WHERE id = ?`
      )
      .bind(targetOrganizationId, nowIso, validated.session.id)
      .run();

    return {
      membership,
      sessionId: validated.session.id,
    };
  }

  /* =========================================================================
     5. TOTP Multi-Factor Authentication (Enrollment, QR, Recovery, Disable)
  ========================================================================= */

  async beginMfaEnrollment(
    userId: string,
    issuer = 'CustomCare'
  ): Promise<MfaEnrollmentSetupDto> {
    const userRow = await this.db
      .prepare(`SELECT id, email, full_name FROM users WHERE id = ?`)
      .bind(userId)
      .first<DbUserRow>();

    if (!userRow) {
      throw new Error('User account not found.');
    }

    const secret = generateTotpSecret(20);
    const nowIso = new Date().toISOString();

    await this.db
      .prepare(`UPDATE users SET mfa_pending_secret = ?, updated_at = ? WHERE id = ?`)
      .bind(secret, nowIso, userId)
      .run();

    const otpauthUri = buildOtpAuthUri({
      secret,
      accountName: userRow.email,
      issuer,
    });

    const qrCodeSvgDataUrl = buildTotpQrCodeSvgDataUrl({
      otpauthUri,
      secret,
      accountName: userRow.email,
    });

    return {
      secret,
      otpauthUri,
      qrCodeSvgDataUrl,
      issuer,
      accountName: userRow.email,
    };
  }

  async confirmMfaEnrollment(
    userId: string,
    code: string,
    options?: { timestampMs?: number; ipAddress?: string; userAgent?: string }
  ): Promise<{
    enabled: boolean;
    recoveryCodes: string[];
  }> {
    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(userId)
      .first<DbUserRow>();

    if (!userRow) {
      throw new Error('User account not found.');
    }

    const pendingSecret = userRow.mfa_pending_secret;
    if (!pendingSecret) {
      throw new Error('MFA_NOT_PENDING: Start MFA enrollment first before verifying a code.');
    }

    const isValid = verifyTotpCode(pendingSecret, code, options?.timestampMs ?? Date.now());
    if (!isValid) {
      throw new Error('INVALID_MFA_CODE: Invalid 6-digit authenticator code. Please check your device time and try again.');
    }

    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
    const nowIso = new Date().toISOString();

    await this.db
      .prepare(
        `UPDATE users
         SET mfa_enabled = 1,
             mfa_secret = ?,
             mfa_pending_secret = NULL,
             mfa_recovery_codes_json = ?,
             mfa_verified_at = ?,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(pendingSecret, JSON.stringify(hashedCodes), nowIso, nowIso, userId)
      .run();

    await this.db
      .prepare(
        `UPDATE auth_sessions
         SET mfa_verified = 1
         WHERE user_id = ? AND revoked_at IS NULL`
      )
      .bind(userId)
      .run();

    await this.recordSecurityEvent({
      userId,
      eventType: 'mfa_enrolled',
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    return {
      enabled: true,
      recoveryCodes: plainCodes,
    };
  }

  async verifyUserMfaCode(
    userId: string,
    code: string,
    timestampMs = Date.now()
  ): Promise<{
    verified: boolean;
    usedRecoveryCode: boolean;
  }> {
    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(userId)
      .first<DbUserRow>();

    if (!userRow || !userRow.mfa_enabled || !userRow.mfa_secret) {
      return { verified: false, usedRecoveryCode: false };
    }

    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      const ok = verifyTotpCode(userRow.mfa_secret, trimmed, timestampMs);
      return { verified: ok, usedRecoveryCode: false };
    }

    // Check single-use recovery codes
    let storedHashes: string[] = [];
    try {
      storedHashes = JSON.parse(userRow.mfa_recovery_codes_json || '[]') as string[];
    } catch {
      storedHashes = [];
    }

    const { matched, remainingHashedCodes } = verifyAndConsumeRecoveryCode(
      trimmed,
      storedHashes
    );
    if (!matched) {
      return { verified: false, usedRecoveryCode: false };
    }

    await this.db
      .prepare(`UPDATE users SET mfa_recovery_codes_json = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(remainingHashedCodes), new Date().toISOString(), userId)
      .run();

    return { verified: true, usedRecoveryCode: true };
  }

  async disableMfa(params: {
    userId: string;
    currentPassword: string;
    code: string;
    timestampMs?: number;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(params.userId)
      .first<DbUserRow>();

    if (!userRow) {
      throw new Error('User account not found.');
    }

    if (!verifyPassword(params.currentPassword, userRow.password_hash)) {
      throw new Error('INVALID_CREDENTIALS: Current password is incorrect.');
    }

    if (!userRow.mfa_enabled) {
      throw new Error('MFA_NOT_ENABLED: Multi-factor authentication is not currently enabled.');
    }

    const mfaCheck = await this.verifyUserMfaCode(
      params.userId,
      params.code,
      params.timestampMs ?? Date.now()
    );
    if (!mfaCheck.verified) {
      throw new Error('INVALID_MFA_CODE: Invalid authenticator code or recovery code.');
    }

    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE users
         SET mfa_enabled = 0,
             mfa_secret = NULL,
             mfa_pending_secret = NULL,
             mfa_recovery_codes_json = '[]',
             mfa_verified_at = NULL,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(nowIso, params.userId)
      .run();

    await this.recordSecurityEvent({
      userId: params.userId,
      eventType: 'mfa_disabled',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  }

  /* =========================================================================
     6. Multi-Business Organization Membership & Role Authorization
  ========================================================================= */

  async getUserWorkspaces(userId: string): Promise<UserWorkspaceMembership[]> {
    const { results } = await this.db
      .prepare(
        `SELECT
           om.id AS membership_id,
           om.organization_id,
           o.slug,
           o.name,
           om.role,
           COALESCE(om.status, om.membership_status, 'active') AS status,
           om.department,
           om.permissions_json,
           om.agent_identity_id,
           o.country,
           o.industry,
           o.website,
           o.onboarding_status,
           o.onboarding_step,
           o.is_active AS org_active,
           om.is_active AS member_active
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = ?
           AND om.is_active = 1
           AND COALESCE(om.status, om.membership_status, 'active') = 'active'
           AND o.is_active = 1
           AND COALESCE(o.onboarding_status, 'incomplete') != 'suspended'
         ORDER BY o.name ASC`
      )
      .bind(userId)
      .all<DbMemberOrgRow>();

    return results.map((r) => {
      const role = (r.role as UserRole) || UserRole.Viewer;
      const lifecycleStatus = (r.status as MembershipLifecycleStatus) || 'active';
      return {
        membershipId: r.membership_id,
        organizationId: r.organization_id,
        organizationSlug: r.slug,
        organizationName: r.name,
        role,
        status: lifecycleStatus,
        membershipStatus: lifecycleStatus,
        department: r.department ?? 'Support',
        permissions: parsePermissionsJson(r.permissions_json, role),
        agentIdentityId: r.agent_identity_id ?? null,
        country: r.country ?? 'United States',
        industry: r.industry ?? 'Technology',
        website: r.website ?? '',
        onboardingStatus: (r.onboarding_status as BusinessOnboardingStatus) ?? 'incomplete',
        onboardingStep: r.onboarding_step ?? 1,
      };
    });
  }

  async verifyOrganizationMembership(
    userId: string,
    organizationId: string,
    minimumRole: UserRole = UserRole.Viewer
  ): Promise<UserWorkspaceMembership | null> {
    const row = await this.db
      .prepare(
        `SELECT
           om.id AS membership_id,
           om.organization_id,
           o.slug,
           o.name,
           om.role,
           COALESCE(om.status, om.membership_status, 'active') AS status,
           om.department,
           om.permissions_json,
           om.agent_identity_id,
           o.country,
           o.industry,
           o.website,
           o.onboarding_status,
           o.onboarding_step,
           o.is_active AS org_active,
           om.is_active AS member_active
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = ? AND om.organization_id = ?`
      )
      .bind(userId, organizationId)
      .first<DbMemberOrgRow>();

    if (!row || !row.member_active || !row.org_active) {
      return null;
    }

    if (row.status && row.status !== 'active') {
      return null;
    }

    if (row.onboarding_status === 'suspended') {
      return null;
    }

    const memberRole = (row.role as UserRole) || UserRole.Viewer;
    if ((ROLE_WEIGHT[memberRole] ?? 0) < (ROLE_WEIGHT[minimumRole] ?? 0)) {
      return null;
    }

    const lifecycleStatus = (row.status as MembershipLifecycleStatus) || 'active';
    return {
      membershipId: row.membership_id,
      organizationId: row.organization_id,
      organizationSlug: row.slug,
      organizationName: row.name,
      role: memberRole,
      status: lifecycleStatus,
      membershipStatus: lifecycleStatus,
      department: row.department ?? 'Support',
      permissions: parsePermissionsJson(row.permissions_json, memberRole),
      agentIdentityId: row.agent_identity_id ?? null,
      country: row.country ?? 'United States',
      industry: row.industry ?? 'Technology',
      website: row.website ?? '',
      onboardingStatus: (row.onboarding_status as BusinessOnboardingStatus) ?? 'incomplete',
      onboardingStep: row.onboarding_step ?? 1,
    };
  }

  async upsertOrganizationMemberRole(params: {
    actorUserId: string;
    organizationId: string;
    targetUserId: string;
    role: UserRole.Owner | UserRole.Admin | UserRole.Supervisor | UserRole.Agent | UserRole.Viewer;
    department?: string;
    permissions?: WorkspacePermissionKey[];
  }): Promise<void> {
    const actorMembership = await this.verifyOrganizationMembership(
      params.actorUserId,
      params.organizationId,
      UserRole.Admin
    );

    if (!actorMembership) {
      throw new Error('FORBIDDEN: Only workspace Owners or Administrators can manage organization memberships.');
    }

    if (params.role === UserRole.Owner && actorMembership.role !== UserRole.Owner) {
      throw new Error('FORBIDDEN: Only an existing Owner can grant the Owner role.');
    }

    const nowIso = new Date().toISOString();
    const permissions = params.permissions ?? DEFAULT_PERMISSIONS_BY_ROLE[params.role];

    await this.db
      .prepare(
        `INSERT INTO organization_members (id, organization_id, user_id, role, status, membership_status, department, permissions_json, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', 'active', ?, ?, 1, ?, ?)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET
           role = excluded.role,
           status = 'active',
           membership_status = 'active',
           department = COALESCE(excluded.department, organization_members.department),
           permissions_json = excluded.permissions_json,
           is_active = 1,
           suspended_at = NULL,
           revoked_at = NULL,
           departed_at = NULL,
           updated_at = excluded.updated_at`
      )
      .bind(
        createAuthId('mem'),
        params.organizationId,
        params.targetUserId,
        params.role,
        params.department ?? 'Support',
        JSON.stringify(permissions),
        nowIso,
        nowIso
      )
      .run();
  }

  /* =========================================================================
     7. Workspace Audit Logs, Agent Invitations, Identity Linking & Lifecycle
  ========================================================================= */

  async recordWorkspaceAuditLog(params: {
    organizationId?: string | null;
    actorUserId?: string | null;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO workspace_audit_logs
           (id, organization_id, actor_user_id, actor_email, action, target_type, target_id, metadata_json, ip_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createAuthId('aud'),
        params.organizationId ?? null,
        params.actorUserId ?? null,
        params.actorEmail,
        params.action,
        params.targetType,
        params.targetId,
        JSON.stringify(params.metadata ?? {}),
        params.ipAddress ?? '',
        nowIso
      )
      .run();
  }

  async listWorkspaceAuditLogs(
    organizationId?: string | null,
    limit = 40
  ): Promise<WorkspaceAuditLogRecord[]> {
    interface DbAuditRow {
      id: string;
      organization_id: string | null;
      org_name: string | null;
      actor_user_id: string | null;
      actor_email: string;
      action: string;
      target_type: string;
      target_id: string;
      metadata_json: string;
      ip_address: string;
      created_at: string;
    }

    const query = organizationId
      ? `SELECT a.*, o.name AS org_name
         FROM workspace_audit_logs a
         LEFT JOIN organizations o ON o.id = a.organization_id
         WHERE a.organization_id = ?
         ORDER BY a.created_at DESC
         LIMIT ?`
      : `SELECT a.*, o.name AS org_name
         FROM workspace_audit_logs a
         LEFT JOIN organizations o ON o.id = a.organization_id
         ORDER BY a.created_at DESC
         LIMIT ?`;

    const stmt = organizationId
      ? this.db.prepare(query).bind(organizationId, limit)
      : this.db.prepare(query).bind(limit);

    const { results } = await stmt.all<DbAuditRow>();
    return results.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      organizationName: r.org_name,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_email,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      metadataJson: r.metadata_json,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    }));
  }

  async getAgentIdentityByEmail(emailInput: string): Promise<AgentIdentityRecord | null> {
    const email = emailInput.trim().toLowerCase();
    const row = await this.db
      .prepare(`SELECT * FROM agent_identities WHERE email = ?`)
      .bind(email)
      .first<DbAgentIdentityRow>();

    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      userId: row.user_id,
      emailVerified: Boolean(row.email_verified),
      department: row.department,
      specialty: row.specialty,
      accessMode: (row.access_mode as AgentAccessMode) || 'business_managed',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createWorkspaceInvitation(params: {
    actorUserId: string;
    organizationId: string;
    email: string;
    displayName?: string;
    role: UserRole.Admin | UserRole.Supervisor | UserRole.Agent | UserRole.Viewer;
    department?: string;
    specialty?: string;
    permissions?: WorkspacePermissionKey[];
    ttlSeconds?: number;
    nowMs?: number;
    appBaseUrl?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<WorkspaceInvitationRecord> {
    const actorMembership = await this.verifyOrganizationMembership(
      params.actorUserId,
      params.organizationId,
      UserRole.Admin
    );
    if (!actorMembership) {
      throw new Error('FORBIDDEN: Only workspace Owners or Administrators can invite agents.');
    }

    const actorUser = await this.db
      .prepare(`SELECT id, email, full_name FROM users WHERE id = ?`)
      .bind(params.actorUserId)
      .first<{ id: string; email: string; full_name: string }>();

    const email = params.email.trim().toLowerCase();
    if (!email.includes('@')) {
      throw new Error('VALIDATION_ERROR: A valid agent email address is required.');
    }

    const nowMs = params.nowMs ?? Date.now();
    const ttlSeconds = params.ttlSeconds ?? 72 * 60 * 60; // 72 hours default
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + ttlSeconds * 1000).toISOString();
    const department = params.department?.trim() || 'Support';
    const specialty = params.specialty?.trim() || 'General Support';
    const displayName =
      params.displayName?.trim() ||
      email.split('@')[0]?.replace(/[._-]/g, ' ') ||
      'Support Specialist';
    const permissions =
      params.permissions && params.permissions.length > 0
        ? params.permissions
        : DEFAULT_PERMISSIONS_BY_ROLE[params.role];

    // Revoke any previous pending invitations for the same (organization_id, email)
    await this.db
      .prepare(
        `UPDATE workspace_invitations
         SET status = 'revoked', revoked_at = ?, updated_at = ?
         WHERE organization_id = ? AND email = ? AND status = 'pending'`
      )
      .bind(nowIso, nowIso, params.organizationId, email)
      .run();

    const { rawToken, tokenHash } = generateSecureToken(32);
    const inviteId = createAuthId('inv');

    await this.db
      .prepare(
        `INSERT INTO workspace_invitations
           (id, organization_id, email, display_name, role, department, specialty, permissions_json, token_hash, invited_by_user_id, invited_by_name, status, expires_at, accepted_at, revoked_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, ?, ?)`
      )
      .bind(
        inviteId,
        params.organizationId,
        email,
        displayName,
        params.role,
        department,
        specialty,
        JSON.stringify(permissions),
        tokenHash,
        params.actorUserId,
        actorUser?.full_name || 'Workspace Administrator',
        expiresAt,
        nowIso,
        nowIso
      )
      .run();

    await this.recordSecurityEvent({
      userId: params.actorUserId,
      organizationId: params.organizationId,
      eventType: 'invitation_created',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: { invitationId: inviteId, email, role: params.role, department },
    });

    await this.recordWorkspaceAuditLog({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actorEmail: actorUser?.email || '',
      action: 'invitation_created',
      targetType: 'workspace_invitation',
      targetId: inviteId,
      metadata: { email, role: params.role, department, permissions },
      ipAddress: params.ipAddress,
    });

    const baseUrl = (params.appBaseUrl || 'https://getcustomcare.xyz').replace(/\/+$/, '');
    return {
      id: inviteId,
      organizationId: params.organizationId,
      organizationName: actorMembership.organizationName,
      organizationSlug: actorMembership.organizationSlug,
      email,
      displayName,
      role: params.role,
      department,
      specialty,
      permissions,
      invitedByUserId: params.actorUserId,
      invitedByName: actorUser?.full_name || 'Workspace Administrator',
      status: 'pending',
      expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: nowIso,
      rawToken,
      inviteUrl: `${baseUrl}/invite/${rawToken}`,
    };
  }

  async listWorkspaceInvitations(organizationId: string): Promise<WorkspaceInvitationRecord[]> {
    const nowIso = new Date().toISOString();
    // Auto-mark expired pending invitations
    await this.db
      .prepare(
        `UPDATE workspace_invitations
         SET status = 'expired', updated_at = ?
         WHERE organization_id = ? AND status = 'pending' AND expires_at <= ?`
      )
      .bind(nowIso, organizationId, nowIso)
      .run();

    const { results } = await this.db
      .prepare(
        `SELECT i.*, o.name AS org_name, o.slug AS org_slug
         FROM workspace_invitations i
         JOIN organizations o ON o.id = i.organization_id
         WHERE i.organization_id = ?
         ORDER BY i.created_at DESC`
      )
      .bind(organizationId)
      .all<DbInvitationRow>();

    return results.map((r) => {
      const role = (r.role as WorkspaceInvitationRecord['role']) || UserRole.Agent;
      return {
        id: r.id,
        organizationId: r.organization_id,
        organizationName: r.org_name,
        organizationSlug: r.org_slug,
        email: r.email,
        displayName: r.display_name,
        role,
        department: r.department,
        specialty: r.specialty,
        permissions: parsePermissionsJson(r.permissions_json, role),
        invitedByUserId: r.invited_by_user_id,
        invitedByName: r.invited_by_name,
        status: r.status as WorkspaceInvitationStatus,
        expiresAt: r.expires_at,
        acceptedAt: r.accepted_at,
        revokedAt: r.revoked_at,
        createdAt: r.created_at,
      };
    });
  }

  async listPendingInvitationsForEmail(emailInput: string): Promise<WorkspaceInvitationRecord[]> {
    const email = emailInput.trim().toLowerCase();
    const nowIso = new Date().toISOString();

    const { results } = await this.db
      .prepare(
        `SELECT i.*, o.name AS org_name, o.slug AS org_slug
         FROM workspace_invitations i
         JOIN organizations o ON o.id = i.organization_id
         WHERE i.email = ? AND i.status = 'pending' AND i.expires_at > ? AND o.is_active = 1
         ORDER BY i.created_at DESC`
      )
      .bind(email, nowIso)
      .all<DbInvitationRow>();

    return results.map((r) => {
      const role = (r.role as WorkspaceInvitationRecord['role']) || UserRole.Agent;
      return {
        id: r.id,
        organizationId: r.organization_id,
        organizationName: r.org_name,
        organizationSlug: r.org_slug,
        email: r.email,
        displayName: r.display_name,
        role,
        department: r.department,
        specialty: r.specialty,
        permissions: parsePermissionsJson(r.permissions_json, role),
        invitedByUserId: r.invited_by_user_id,
        invitedByName: r.invited_by_name,
        status: r.status as WorkspaceInvitationStatus,
        expiresAt: r.expires_at,
        acceptedAt: r.accepted_at,
        revokedAt: r.revoked_at,
        createdAt: r.created_at,
      };
    });
  }

  async revokeWorkspaceInvitation(params: {
    actorUserId: string;
    organizationId: string;
    invitationId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    const actorMembership = await this.verifyOrganizationMembership(
      params.actorUserId,
      params.organizationId,
      UserRole.Admin
    );
    if (!actorMembership) {
      throw new Error('FORBIDDEN: Only workspace Owners or Administrators can revoke invitations.');
    }

    const inv = await this.db
      .prepare(`SELECT * FROM workspace_invitations WHERE id = ? AND organization_id = ?`)
      .bind(params.invitationId, params.organizationId)
      .first<DbInvitationRow>();

    if (!inv) {
      throw new Error('NOT_FOUND: Invitation not found in this workspace.');
    }

    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE workspace_invitations
         SET status = 'revoked', revoked_at = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(nowIso, nowIso, params.invitationId, params.organizationId)
      .run();

    const actorUser = await this.db
      .prepare(`SELECT email FROM users WHERE id = ?`)
      .bind(params.actorUserId)
      .first<{ email: string }>();

    await this.recordSecurityEvent({
      userId: params.actorUserId,
      organizationId: params.organizationId,
      eventType: 'invitation_revoked',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: { invitationId: params.invitationId, email: inv.email },
    });

    await this.recordWorkspaceAuditLog({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actorEmail: actorUser?.email || '',
      action: 'invitation_revoked',
      targetType: 'workspace_invitation',
      targetId: params.invitationId,
      metadata: { email: inv.email },
      ipAddress: params.ipAddress,
    });
  }

  async inspectInvitationToken(
    rawToken: string,
    nowMs = Date.now()
  ): Promise<InvitationInspectionDto> {
    if (!rawToken || rawToken.trim().length < 16) {
      throw new Error('INVALID_INVITATION: Invitation token is invalid.');
    }

    const tokenHash = hashTokenSha256(rawToken.trim());
    const row = await this.db
      .prepare(
        `SELECT i.*, o.name AS org_name, o.slug AS org_slug, o.country AS org_country, o.industry AS org_industry, o.is_active AS org_active
         FROM workspace_invitations i
         JOIN organizations o ON o.id = i.organization_id
         WHERE i.token_hash = ?`
      )
      .bind(tokenHash)
      .first<DbInvitationRow & { org_active: number }>();

    if (!row || !row.org_active) {
      throw new Error('INVALID_INVITATION: Invitation link was not found or the business is inactive.');
    }

    const expiresMs = Date.parse(row.expires_at);
    if (row.status === 'pending' && (!Number.isFinite(expiresMs) || expiresMs <= nowMs)) {
      const nowIso = new Date(nowMs).toISOString();
      await this.db
        .prepare(`UPDATE workspace_invitations SET status = 'expired', updated_at = ? WHERE id = ?`)
        .bind(nowIso, row.id)
        .run();
      row.status = 'expired';
    }

    const role = (row.role as WorkspaceInvitationRecord['role']) || UserRole.Agent;
    const invitation: WorkspaceInvitationRecord = {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.org_name,
      organizationSlug: row.org_slug,
      email: row.email,
      displayName: row.display_name,
      role,
      department: row.department,
      specialty: row.specialty,
      permissions: parsePermissionsJson(row.permissions_json, role),
      invitedByUserId: row.invited_by_user_id,
      invitedByName: row.invited_by_name,
      status: row.status as WorkspaceInvitationStatus,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };

    const [agentIdentity, userRow] = await Promise.all([
      this.db
        .prepare(`SELECT * FROM agent_identities WHERE email = ?`)
        .bind(row.email)
        .first<DbAgentIdentityRow>(),
      this.db
        .prepare(`SELECT * FROM users WHERE email = ?`)
        .bind(row.email)
        .first<DbUserRow>(),
    ]);

    let activeWorkspaceCount = 0;
    if (userRow) {
      const ws = await this.getUserWorkspaces(userRow.id);
      activeWorkspaceCount = ws.length;
    }

    const hasPersonalAccountLinked = Boolean(
      (agentIdentity && agentIdentity.user_id) ||
        (userRow && userRow.is_personal_account !== 0)
    );

    const existingIdentityDetected = Boolean(agentIdentity || userRow);

    return {
      invitation,
      organization: {
        id: row.organization_id,
        name: row.org_name ?? 'Workspace',
        slug: row.org_slug ?? 'workspace',
        industry: row.org_industry ?? 'Technology',
        country: row.org_country ?? 'United States',
      },
      existingAgentIdentity: agentIdentity
        ? {
            id: agentIdentity.id,
            displayName: agentIdentity.display_name,
            emailVerified: Boolean(agentIdentity.email_verified),
            hasPersonalAccountLinked,
            activeWorkspaceCount,
          }
        : null,
      existingPersonalUser:
        userRow && userRow.is_personal_account !== 0
          ? {
              id: userRow.id,
              fullName: userRow.full_name,
              emailVerified: Boolean(userRow.email_verified),
            }
          : null,
      canLinkToPersonalAccount: existingIdentityDetected,
      linkPromptMessage: existingIdentityDetected
        ? 'You already have an agent identity associated with this email. Would you like to connect this workspace to a personal CustomCare account?'
        : undefined,
    };
  }

  async acceptWorkspaceInvitation(params: {
    rawToken: string;
    email?: string;
    displayName?: string;
    password?: string;
    accessMode?: AgentAccessMode;
    consentToLinkPersonalAccount?: boolean;
    nowMs?: number;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    user: CareFlowUserRecord;
    agentIdentity: AgentIdentityRecord;
    membership: UserWorkspaceMembership;
    workspaces: UserWorkspaceMembership[];
    accessMode: AgentAccessMode;
  }> {
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const inspection = await this.inspectInvitationToken(params.rawToken, nowMs);
    const inv = inspection.invitation;

    if (inv.status === 'accepted') {
      throw new Error('INVITATION_ALREADY_USED: This invitation link has already been used.');
    }
    if (inv.status === 'revoked') {
      throw new Error('INVITATION_REVOKED: This invitation has been revoked by the administrator.');
    }
    if (inv.status === 'expired' || Date.parse(inv.expiresAt) <= nowMs) {
      throw new Error('INVITATION_EXPIRED: This invitation link has expired.');
    }

    const providedEmail = (params.email?.trim() || inv.email).toLowerCase();
    if (providedEmail !== inv.email.toLowerCase()) {
      throw new Error(
        'EMAIL_MISMATCH: Invitation can only be accepted by the invited email address.'
      );
    }

    const desiredAccessMode: AgentAccessMode = params.accessMode ?? 'business_managed';
    const existingAgentRow = await this.db
      .prepare(`SELECT * FROM agent_identities WHERE email = ?`)
      .bind(providedEmail)
      .first<DbAgentIdentityRow>();

    const existingUserRow = await this.db
      .prepare(`SELECT * FROM users WHERE email = ?`)
      .bind(providedEmail)
      .first<DbUserRow>();

    // If converting an existing business-managed agent identity to a personal account,
    // require explicit consent!
    if (
      desiredAccessMode === 'personal_account' &&
      existingAgentRow &&
      !existingAgentRow.user_id &&
      !params.consentToLinkPersonalAccount
    ) {
      throw new Error(
        'CONSENT_REQUIRED: Explicit consent is required to connect an existing business-managed agent identity to a personal CustomCare account.'
      );
    }

    let userId: string;
    let agentIdentityId: string;
    let finalAccessMode: AgentAccessMode = desiredAccessMode;
    const displayName =
      params.displayName?.trim() ||
      existingAgentRow?.display_name ||
      existingUserRow?.full_name ||
      inv.displayName;

    if (existingUserRow) {
      // Verify existing password if user already has a password and supplied one,
      // OR if they are setting a password for the first time
      if (params.password && existingUserRow.password_hash) {
        const matches = verifyPassword(params.password, existingUserRow.password_hash);
        if (!matches && existingUserRow.is_personal_account !== 0) {
          throw new Error(
            'INVALID_CREDENTIALS: Incorrect password for the existing account associated with this email.'
          );
        }
      }

      userId = existingUserRow.id;
      const newPasswordHash = params.password
        ? hashPassword(params.password)
        : existingUserRow.password_hash;

      const nextIsPersonal =
        desiredAccessMode === 'personal_account' || existingUserRow.is_personal_account === 1
          ? 1
          : 0;
      finalAccessMode = nextIsPersonal === 1 ? 'personal_account' : 'business_managed';

      const currentAccountType = (existingUserRow.account_type as AccountRegistrationMode) || 'agent';
      if (currentAccountType === 'business') {
        throw new Error(
          'FORBIDDEN: Business owner accounts cannot accept support agent invitations. Business and Support Agent accounts work independently.'
        );
      }

      await this.db
        .prepare(
          `UPDATE users
           SET full_name = ?,
               password_hash = ?,
               email_verified = 1,
               is_personal_account = ?,
               account_type = 'agent',
               updated_at = ?
           WHERE id = ?`
        )
        .bind(displayName, newPasswordHash, nextIsPersonal, nowIso, userId)
        .run();
    } else {
      if (!params.password || params.password.length < 8) {
        throw new Error(
          'PASSWORD_REQUIRED: Please set a password of at least 8 characters to secure your workspace access.'
        );
      }
      const passwordHash = hashPassword(params.password);
      const isPersonal = desiredAccessMode === 'personal_account' ? 1 : 0;
      userId = existingAgentRow?.id || createAuthId(isPersonal ? 'usr' : 'agi');

      await this.db
        .prepare(
          `INSERT INTO users
             (id, email, full_name, password_hash, email_verified, mfa_enabled, account_type, is_platform_admin, is_personal_account, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, 0, 'agent', ?, ?, ?, ?)`
        )
        .bind(
          userId,
          providedEmail,
          displayName,
          passwordHash,
          isSuperAdminEmail(providedEmail) ? 1 : 0,
          isPersonal,
          nowIso,
          nowIso
        )
        .run();
    }

    const latestUserRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(userId)
      .first<DbUserRow>();
    const activePasswordHash = latestUserRow?.password_hash || '';

    if (existingAgentRow) {
      agentIdentityId = existingAgentRow.id;
      const linkedPersonalUserId =
        finalAccessMode === 'personal_account' ? userId : existingAgentRow.user_id;

      await this.db
        .prepare(
          `UPDATE agent_identities
           SET display_name = ?,
               password_hash = ?,
               user_id = ?,
               email_verified = 1,
               department = COALESCE(?, department),
               specialty = COALESCE(?, specialty),
               access_mode = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .bind(
          displayName,
          activePasswordHash,
          linkedPersonalUserId,
          inv.department,
          inv.specialty,
          finalAccessMode,
          nowIso,
          agentIdentityId
        )
        .run();
    } else {
      agentIdentityId = createAuthId('agi');
      const linkedPersonalUserId = finalAccessMode === 'personal_account' ? userId : null;
      await this.db
        .prepare(
          `INSERT INTO agent_identities
             (id, email, display_name, password_hash, user_id, email_verified, department, specialty, access_mode, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
        )
        .bind(
          agentIdentityId,
          providedEmail,
          displayName,
          activePasswordHash,
          linkedPersonalUserId,
          inv.department,
          inv.specialty,
          finalAccessMode,
          nowIso,
          nowIso
        )
        .run();
    }

    // Activate membership in organization_members
    await this.db
      .prepare(
        `INSERT INTO organization_members
           (id, organization_id, user_id, agent_identity_id, role, status, membership_status, department, permissions_json, invited_by_user_id, is_active, joined_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', 'active', ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET
           agent_identity_id = excluded.agent_identity_id,
           role = CASE WHEN organization_members.role = 'owner' THEN 'owner' ELSE excluded.role END,
           status = 'active',
           membership_status = 'active',
           department = excluded.department,
           permissions_json = excluded.permissions_json,
           is_active = 1,
           suspended_at = NULL,
           revoked_at = NULL,
           departed_at = NULL,
           updated_at = excluded.updated_at`
      )
      .bind(
        createAuthId('mem'),
        inv.organizationId,
        userId,
        agentIdentityId,
        inv.role,
        inv.department,
        JSON.stringify(inv.permissions),
        inv.invitedByUserId ?? null,
        nowIso,
        nowIso,
        nowIso
      )
      .run();

    // Upsert support_agents record for the workspace
    await this.db
      .prepare(
        `INSERT INTO support_agents
           (id, organization_id, user_id, agent_identity_id, display_name, email, role, department, specialty, availability, membership_status, permissions_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', 'active', ?, ?, ?)
         ON CONFLICT (organization_id, email) DO UPDATE SET
           user_id = excluded.user_id,
           agent_identity_id = excluded.agent_identity_id,
           display_name = excluded.display_name,
           role = CASE WHEN support_agents.role = 'owner' THEN 'owner' ELSE excluded.role END,
           department = excluded.department,
           specialty = excluded.specialty,
           availability = 'available',
           membership_status = 'active',
           permissions_json = excluded.permissions_json,
           updated_at = excluded.updated_at`
      )
      .bind(
        createAuthId('agt'),
        inv.organizationId,
        userId,
        agentIdentityId,
        displayName,
        providedEmail,
        inv.role,
        inv.department,
        inv.specialty,
        JSON.stringify(inv.permissions),
        nowIso,
        nowIso
      )
      .run();

    // Mark invitation accepted (single-use)
    await this.db
      .prepare(
        `UPDATE workspace_invitations
         SET status = 'accepted', accepted_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(nowIso, nowIso, inv.id)
      .run();

    await this.recordSecurityEvent({
      userId,
      organizationId: inv.organizationId,
      eventType: 'invitation_accepted',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: {
        invitationId: inv.id,
        role: inv.role,
        accessMode: finalAccessMode,
        linkedPersonalAccount: finalAccessMode === 'personal_account',
      },
    });

    await this.recordWorkspaceAuditLog({
      organizationId: inv.organizationId,
      actorUserId: userId,
      actorEmail: providedEmail,
      action: 'invitation_accepted',
      targetType: 'organization_member',
      targetId: userId,
      metadata: {
        invitationId: inv.id,
        role: inv.role,
        department: inv.department,
        accessMode: finalAccessMode,
      },
      ipAddress: params.ipAddress,
    });

    if (finalAccessMode === 'personal_account' && existingAgentRow && !existingAgentRow.user_id) {
      await this.recordSecurityEvent({
        userId,
        organizationId: inv.organizationId,
        eventType: 'identity_linked',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        metadata: { agentIdentityId },
      });
      await this.recordWorkspaceAuditLog({
        organizationId: inv.organizationId,
        actorUserId: userId,
        actorEmail: providedEmail,
        action: 'identity_linked',
        targetType: 'agent_identity',
        targetId: agentIdentityId,
        metadata: { email: providedEmail },
        ipAddress: params.ipAddress,
      });
    }

    const workspaces = await this.getUserWorkspaces(userId);
    const membership =
      workspaces.find((w) => w.organizationId === inv.organizationId) ?? workspaces[0]!;
    const agentIdentity = (await this.getAgentIdentityByEmail(providedEmail))!;

    return {
      user: {
        id: userId,
        email: providedEmail,
        fullName: displayName || providedEmail,
        emailVerified: true,
        mfaEnabled: Boolean(latestUserRow?.mfa_enabled),
        accountType: ((latestUserRow?.account_type as AccountRegistrationMode) || 'agent'),
        isPersonalAccount: finalAccessMode === 'personal_account',
        isPlatformAdmin: isRegisteredPlatformSuperAdminEmail(providedEmail),
        createdAt: latestUserRow?.created_at || nowIso,
      },
      agentIdentity,
      membership,
      workspaces,
      accessMode: finalAccessMode,
    };
  }

  /**
   * Converts a Business-Managed Agent identity into a Registered CustomCare Personal Account
   * with explicit consent and verified email ownership, preserving all existing workspace memberships
   * and permissions without modification.
   */
  async linkAgentIdentityToPersonalAccount(params: {
    userId: string;
    password?: string;
    consentConfirmed: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    user: CareFlowUserRecord;
    agentIdentity: AgentIdentityRecord;
    workspaces: UserWorkspaceMembership[];
  }> {
    if (!params.consentConfirmed) {
      throw new Error(
        'CONSENT_REQUIRED: Explicit consent is required to link your agent identity to a personal CustomCare account.'
      );
    }

    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(params.userId)
      .first<DbUserRow>();

    if (!userRow) {
      throw new Error('NOT_FOUND: Agent identity record not found.');
    }

    if (params.password) {
      const valid = verifyPassword(params.password, userRow.password_hash);
      if (!valid) {
        throw new Error('INVALID_CREDENTIALS: Password verification failed.');
      }
    }

    const nowIso = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE users
         SET is_personal_account = 1,
             email_verified = 1,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(nowIso, userRow.id)
      .run();

    const existingIdentity = await this.db
      .prepare(`SELECT * FROM agent_identities WHERE email = ?`)
      .bind(userRow.email)
      .first<DbAgentIdentityRow>();

    let agentIdentityId = existingIdentity?.id;
    if (existingIdentity) {
      await this.db
        .prepare(
          `UPDATE agent_identities
           SET user_id = ?,
               access_mode = 'personal_account',
               email_verified = 1,
               updated_at = ?
           WHERE id = ?`
        )
        .bind(userRow.id, nowIso, existingIdentity.id)
        .run();
    } else {
      agentIdentityId = createAuthId('agi');
      await this.db
        .prepare(
          `INSERT INTO agent_identities
             (id, email, display_name, password_hash, user_id, email_verified, department, specialty, access_mode, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 'Support', 'General Support', 'personal_account', ?, ?)`
        )
        .bind(
          agentIdentityId,
          userRow.email,
          userRow.full_name,
          userRow.password_hash,
          userRow.id,
          nowIso,
          nowIso
        )
        .run();
    }

    await this.recordSecurityEvent({
      userId: userRow.id,
      eventType: 'identity_linked',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: { agentIdentityId },
    });

    await this.recordWorkspaceAuditLog({
      actorUserId: userRow.id,
      actorEmail: userRow.email,
      action: 'identity_linked',
      targetType: 'agent_identity',
      targetId: agentIdentityId!,
      metadata: { email: userRow.email },
      ipAddress: params.ipAddress,
    });

    const agentIdentity = (await this.getAgentIdentityByEmail(userRow.email))!;
    const workspaces = await this.getUserWorkspaces(userRow.id);

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        emailVerified: true,
        mfaEnabled: Boolean(userRow.mfa_enabled),
        accountType: (userRow.account_type as AccountRegistrationMode) || 'agent',
        isPersonalAccount: true,
        isPlatformAdmin: isRegisteredPlatformSuperAdminEmail(userRow.email),
        createdAt: userRow.created_at,
      },
      agentIdentity,
      workspaces,
    };
  }

  /**
   * Suspends, Reactivates, or Revokes an agent's workspace membership.
   * Immediately invalidates active sessions for that workspace when suspended or revoked,
   * without affecting the agent's other workspaces or personal CustomCare account.
   */
  async updateWorkspaceMemberLifecycle(params: {
    actorUserId: string;
    organizationId: string;
    targetEmailOrUserId: string;
    action: 'suspend' | 'reactivate' | 'revoke';
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    status: MembershipLifecycleStatus;
    revokedSessionCount: number;
  }> {
    const actorMembership = await this.verifyOrganizationMembership(
      params.actorUserId,
      params.organizationId,
      UserRole.Admin
    );
    if (!actorMembership) {
      throw new Error(
        'FORBIDDEN: Only workspace Owners or Administrators can suspend, reactivate, or revoke members.'
      );
    }

    const identifier = params.targetEmailOrUserId.trim().toLowerCase();
    const targetUser = await this.db
      .prepare(`SELECT * FROM users WHERE id = ? OR LOWER(email) = ?`)
      .bind(params.targetEmailOrUserId.trim(), identifier)
      .first<DbUserRow>();

    const targetAgent = await this.db
      .prepare(
        `SELECT * FROM support_agents WHERE organization_id = ? AND (id = ? OR LOWER(email) = ? OR user_id = ?)`
      )
      .bind(
        params.organizationId,
        params.targetEmailOrUserId.trim(),
        identifier,
        targetUser?.id ?? ''
      )
      .first<{ id: string; user_id: string | null; email: string; display_name: string; role: string }>();

    const resolvedUserId = targetUser?.id ?? targetAgent?.user_id ?? null;
    const resolvedEmail = targetUser?.email ?? targetAgent?.email ?? identifier;

    if (resolvedUserId) {
      const targetMember = await this.db
        .prepare(
          `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ?`
        )
        .bind(params.organizationId, resolvedUserId)
        .first<{ role: string }>();
      if (targetMember?.role === UserRole.Owner) {
        throw new Error('FORBIDDEN: The primary Workspace Owner cannot be suspended or revoked.');
      }
    }

    const nowIso = new Date().toISOString();
    let nextStatus: MembershipLifecycleStatus = 'active';
    let revokedSessionCount = 0;

    if (params.action === 'suspend') {
      nextStatus = 'suspended';
      if (resolvedUserId) {
        await this.db
          .prepare(
            `UPDATE organization_members
             SET status = 'suspended', membership_status = 'suspended', is_active = 0, suspended_at = ?, updated_at = ?
             WHERE organization_id = ? AND user_id = ? AND role != 'owner'`
          )
          .bind(nowIso, nowIso, params.organizationId, resolvedUserId)
          .run();

        const sesRes = await this.db
          .prepare(
            `UPDATE auth_sessions
             SET revoked_at = ?
             WHERE user_id = ? AND organization_id = ? AND revoked_at IS NULL`
          )
          .bind(nowIso, resolvedUserId, params.organizationId)
          .run();
        revokedSessionCount = Number(sesRes.meta?.changes ?? 0);
      }

      await this.db
        .prepare(
          `UPDATE support_agents
           SET membership_status = 'suspended', availability = 'offline', updated_at = ?
           WHERE organization_id = ? AND (LOWER(email) = ? OR id = ?)`
        )
        .bind(nowIso, params.organizationId, resolvedEmail.toLowerCase(), params.targetEmailOrUserId)
        .run();
    } else if (params.action === 'reactivate') {
      nextStatus = 'active';
      if (resolvedUserId) {
        await this.db
          .prepare(
            `UPDATE organization_members
             SET status = 'active', membership_status = 'active', is_active = 1, suspended_at = NULL, revoked_at = NULL, updated_at = ?
             WHERE organization_id = ? AND user_id = ?`
          )
          .bind(nowIso, params.organizationId, resolvedUserId)
          .run();
      }

      await this.db
        .prepare(
          `UPDATE support_agents
           SET membership_status = 'active', availability = 'available', updated_at = ?
           WHERE organization_id = ? AND (LOWER(email) = ? OR id = ?)`
        )
        .bind(nowIso, params.organizationId, resolvedEmail.toLowerCase(), params.targetEmailOrUserId)
        .run();
    } else if (params.action === 'revoke') {
      nextStatus = 'revoked';
      if (resolvedUserId) {
        await this.db
          .prepare(
            `UPDATE organization_members
             SET status = 'revoked', membership_status = 'revoked', is_active = 0, revoked_at = ?, updated_at = ?
             WHERE organization_id = ? AND user_id = ? AND role != 'owner'`
          )
          .bind(nowIso, nowIso, params.organizationId, resolvedUserId)
          .run();

        const sesRes = await this.db
          .prepare(
            `UPDATE auth_sessions
             SET revoked_at = ?
             WHERE user_id = ? AND organization_id = ? AND revoked_at IS NULL`
          )
          .bind(nowIso, resolvedUserId, params.organizationId)
          .run();
        revokedSessionCount = Number(sesRes.meta?.changes ?? 0);

        await this.db
          .prepare(
            `UPDATE telegram_agent_links
             SET status = 'revoked', link_code_hash = NULL, telegram_user_id = NULL, telegram_chat_id = NULL, updated_at = ?
             WHERE organization_id = ? AND user_id = ?`
          )
          .bind(nowIso, params.organizationId, resolvedUserId)
          .run();
      }

      // Invalidate any pending invitations for this email in this business
      await this.db
        .prepare(
          `UPDATE workspace_invitations
           SET status = 'revoked', revoked_at = ?, updated_at = ?
           WHERE organization_id = ? AND LOWER(email) = ? AND status = 'pending'`
        )
        .bind(nowIso, nowIso, params.organizationId, resolvedEmail.toLowerCase())
        .run();

      await this.db
        .prepare(
          `UPDATE support_agents
           SET membership_status = 'revoked', availability = 'offline', updated_at = ?
           WHERE organization_id = ? AND (LOWER(email) = ? OR id = ?)`
        )
        .bind(nowIso, params.organizationId, resolvedEmail.toLowerCase(), params.targetEmailOrUserId)
        .run();

      if (targetAgent?.display_name) {
        await this.db
          .prepare(
            `UPDATE support_conversations
             SET assigned_agent_id = NULL, assigned_agent_name = NULL, updated_at = ?
             WHERE organization_id = ? AND LOWER(assigned_agent_name) = ? AND status NOT IN ('resolved', 'closed')`
          )
          .bind(nowIso, params.organizationId, targetAgent.display_name.toLowerCase())
          .run();
      }
    }

    const eventType =
      params.action === 'suspend'
        ? 'member_suspended'
        : params.action === 'reactivate'
          ? 'member_reactivated'
          : 'member_revoked';

    const actorUser = await this.db
      .prepare(`SELECT email FROM users WHERE id = ?`)
      .bind(params.actorUserId)
      .first<{ email: string }>();

    await this.recordSecurityEvent({
      userId: resolvedUserId ?? params.actorUserId,
      organizationId: params.organizationId,
      eventType,
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: { targetEmail: resolvedEmail, revokedSessionCount },
    });

    await this.recordWorkspaceAuditLog({
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      actorEmail: actorUser?.email || '',
      action: eventType,
      targetType: 'organization_member',
      targetId: resolvedUserId ?? resolvedEmail,
      metadata: { targetEmail: resolvedEmail, status: nextStatus, revokedSessionCount },
      ipAddress: params.ipAddress,
    });

    return { status: nextStatus, revokedSessionCount };
  }

  /**
   * Allows an agent to voluntarily leave a workspace.
   * Automatically unassigns their open conversations in that workspace back to the unassigned queue
   * and invalidates their sessions for that workspace without affecting their personal account or other workspaces.
   */
  async leaveWorkspaceVoluntarily(params: {
    userId: string;
    organizationId: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    departedOrganizationId: string;
    unassignedConversationCount: number;
    remainingWorkspaces: UserWorkspaceMembership[];
  }> {
    const member = await this.db
      .prepare(
        `SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? AND is_active = 1`
      )
      .bind(params.organizationId, params.userId)
      .first<{ role: string }>();

    if (!member) {
      throw new Error('NOT_FOUND: You do not have an active membership in this workspace.');
    }

    if (member.role === UserRole.Owner) {
      throw new Error(
        'FORBIDDEN: Workspace Owners cannot leave their own business workspace without transferring ownership first.'
      );
    }

    const userRow = await this.db
      .prepare(`SELECT id, email, full_name FROM users WHERE id = ?`)
      .bind(params.userId)
      .first<{ id: string; email: string; full_name: string }>();

    const nowIso = new Date().toISOString();

    await this.db
      .prepare(
        `UPDATE organization_members
         SET status = 'departed', membership_status = 'departed', is_active = 0, departed_at = ?, updated_at = ?
         WHERE organization_id = ? AND user_id = ?`
      )
      .bind(nowIso, nowIso, params.organizationId, params.userId)
      .run();

    await this.db
      .prepare(
        `UPDATE support_agents
         SET membership_status = 'departed', availability = 'offline', updated_at = ?
         WHERE organization_id = ? AND (user_id = ? OR LOWER(email) = ?)`
      )
      .bind(nowIso, params.organizationId, params.userId, (userRow?.email ?? '').toLowerCase())
      .run();

    // Auto-unassign open conversations assigned to this agent in this workspace
    let unassignedConversationCount = 0;
    if (userRow?.full_name) {
      const convRes = await this.db
        .prepare(
          `UPDATE support_conversations
           SET assigned_agent_id = NULL, assigned_agent_name = NULL, updated_at = ?
           WHERE organization_id = ?
             AND (assigned_agent_id = ? OR LOWER(assigned_agent_name) = ?)
             AND status NOT IN ('resolved', 'closed')`
        )
        .bind(nowIso, params.organizationId, params.userId, userRow.full_name.toLowerCase())
        .run();
      unassignedConversationCount = Number(convRes.meta?.changes ?? 0);
    }

    // Invalidate sessions and Telegram links for this specific workspace
    await this.db
      .prepare(
        `UPDATE auth_sessions
         SET revoked_at = ?
         WHERE user_id = ? AND organization_id = ? AND revoked_at IS NULL`
      )
      .bind(nowIso, params.userId, params.organizationId)
      .run();

    await this.db
      .prepare(
        `UPDATE telegram_agent_links
         SET status = 'revoked', link_code_hash = NULL, telegram_user_id = NULL, telegram_chat_id = NULL, updated_at = ?
         WHERE organization_id = ? AND user_id = ?`
      )
      .bind(nowIso, params.organizationId, params.userId)
      .run();

    await this.recordSecurityEvent({
      userId: params.userId,
      organizationId: params.organizationId,
      eventType: 'member_departed',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      metadata: { unassignedConversationCount },
    });

    await this.recordWorkspaceAuditLog({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      actorEmail: userRow?.email ?? '',
      action: 'member_departed',
      targetType: 'organization_member',
      targetId: params.userId,
      metadata: { unassignedConversationCount },
      ipAddress: params.ipAddress,
    });

    const remainingWorkspaces = await this.getUserWorkspaces(params.userId);
    return {
      departedOrganizationId: params.organizationId,
      unassignedConversationCount,
      remainingWorkspaces,
    };
  }

  async getAccountSecurityOverview(
    userId: string,
    activeRole: UserRole,
    currentSessionId?: string,
    envSource: Record<string, unknown> = typeof process !== 'undefined' ? process.env : {}
  ): Promise<AccountSecurityOverviewDto> {
    const userRow = await this.db
      .prepare(`SELECT * FROM users WHERE id = ?`)
      .bind(userId)
      .first<DbUserRow>();

    if (!userRow) {
      throw new Error('User account not found.');
    }

    let recoveryCodesRemaining = 0;
    try {
      const parsed = JSON.parse(userRow.mfa_recovery_codes_json || '[]') as string[];
      recoveryCodesRemaining = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      recoveryCodesRemaining = 0;
    }

    const [activeSessions, recentEvents] = await Promise.all([
      this.listActiveSessions(userId, currentSessionId),
      this.listRecentSecurityEvents(userId, 12),
    ]);

    const resendCfg = resolveResendConfig(undefined, envSource);
    const turnstileConfigured = Boolean(
      typeof envSource.TURNSTILE_SECRET_KEY === 'string' &&
        envSource.TURNSTILE_SECRET_KEY.trim().length > 0
    );

    const isPlatformAdmin = isRegisteredPlatformSuperAdminEmail(userRow.email);

    // Only central admin has a mandatory 2fa setup; others are optional
    const mfaRequiredForRole = isPlatformAdmin;
    const mfaEnforcementActive = isPlatformAdmin;

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        emailVerified: Boolean(userRow.email_verified),
        mfaEnabled: Boolean(userRow.mfa_enabled),
        accountType: (userRow.account_type as AccountRegistrationMode) || 'business',
        isPersonalAccount: Number(userRow.is_personal_account ?? 1) === 1,
        isPlatformAdmin,
        createdAt: userRow.created_at,
      },
      mfaEnabled: Boolean(userRow.mfa_enabled),
      mfaRequiredForRole,
      mfaEnforcementActive,
      recoveryCodesRemaining,
      activeSessions,
      recentEvents,
      infrastructure: {
        resendConfigured: resendCfg.isConfigured,
        customSenderDomainConfigured: resendCfg.hasCustomSenderDomain,
        turnstileConfigured,
        appBaseUrl: resendCfg.appBaseUrl,
      },
    };
  }
}

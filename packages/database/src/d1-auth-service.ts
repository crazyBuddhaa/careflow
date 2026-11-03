import {
  UserRole,
  type AccountSecurityOverviewDto,
  type AuthSecurityEventRecord,
  type AuthSessionRecord,
  type BusinessOnboardingStatus,
  type CareFlowUserRecord,
  type MfaEnrollmentSetupDto,
  type UserWorkspaceMembership,
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
  created_at: string;
  updated_at: string;
}

interface DbSessionRow {
  id: string;
  token_hash: string;
  user_id: string;
  organization_id: string;
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
  organization_id: string;
  slug: string;
  name: string;
  role: string;
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

    await this.db
      .prepare(
        `INSERT INTO auth_sessions
           (id, token_hash, user_id, organization_id, user_agent, ip_address, mfa_verified, expires_at, revoked_at, last_active_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      )
      .bind(
        sessionId,
        tokenHash,
        params.userId,
        params.organizationId,
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

    const workspaces = await this.getUserWorkspaces(userRow.id);
    if (workspaces.length === 0) {
      return null;
    }

    let activeMembership = workspaces.find(
      (w) => w.organizationId === sessionRow.organization_id
    );

    if (!activeMembership) {
      activeMembership = workspaces[0]!;
      await this.db
        .prepare(`UPDATE auth_sessions SET organization_id = ? WHERE id = ?`)
        .bind(activeMembership.organizationId, sessionRow.id)
        .run();
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
           om.organization_id,
           o.slug,
           o.name,
           om.role,
           o.country,
           o.industry,
           o.website,
           o.onboarding_status,
           o.onboarding_step,
           o.is_active AS org_active,
           om.is_active AS member_active
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = ? AND om.is_active = 1 AND o.is_active = 1
         ORDER BY o.name ASC`
      )
      .bind(userId)
      .all<DbMemberOrgRow>();

    return results.map((r) => ({
      organizationId: r.organization_id,
      organizationSlug: r.slug,
      organizationName: r.name,
      role: (r.role as UserRole) || UserRole.Viewer,
      country: r.country ?? 'United States',
      industry: r.industry ?? 'Technology',
      website: r.website ?? '',
      onboardingStatus: (r.onboarding_status as BusinessOnboardingStatus) ?? 'incomplete',
      onboardingStep: r.onboarding_step ?? 1,
    }));
  }

  async verifyOrganizationMembership(
    userId: string,
    organizationId: string,
    minimumRole: UserRole = UserRole.Viewer
  ): Promise<UserWorkspaceMembership | null> {
    const row = await this.db
      .prepare(
        `SELECT
           om.organization_id,
           o.slug,
           o.name,
           om.role,
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

    if (row.onboarding_status === 'suspended') {
      return null;
    }

    const memberRole = (row.role as UserRole) || UserRole.Viewer;
    if ((ROLE_WEIGHT[memberRole] ?? 0) < (ROLE_WEIGHT[minimumRole] ?? 0)) {
      return null;
    }

    return {
      organizationId: row.organization_id,
      organizationSlug: row.slug,
      organizationName: row.name,
      role: memberRole,
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
    await this.db
      .prepare(
        `INSERT INTO organization_members (id, organization_id, user_id, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET
           role = excluded.role,
           is_active = 1,
           updated_at = excluded.updated_at`
      )
      .bind(
        createAuthId('mem'),
        params.organizationId,
        params.targetUserId,
        params.role,
        nowIso,
        nowIso
      )
      .run();
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

    const mfaRequiredForRole =
      activeRole === UserRole.Owner || activeRole === UserRole.Admin;
    const mfaEnforcementActive =
      envSource.CAREFLOW_ENFORCE_ADMIN_MFA === 'true';

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        emailVerified: Boolean(userRow.email_verified),
        mfaEnabled: Boolean(userRow.mfa_enabled),
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

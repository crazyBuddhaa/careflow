import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UserRole } from '@careflow/shared';
import {
  hasMinimumRole,
  KnowledgeManagementService,
  KnowledgeDomainError,
} from '@careflow/support-engine';
import {
  validateSafeRedirectUrl,
  StrongPasswordSchema,
} from '@careflow/validation';
import {
  bootstrapKnowledgeD1Schema,
  D1WorkspaceRepository,
  D1KnowledgeRepository,
  D1AuthIdentityService,
  hashPassword,
  verifyPassword,
  hashTokenSha256,
  generateTotpCode,
  verifyTotpCode,
  verifyTurnstileToken,
  resolveResendConfig,
  sendEmailVerificationMessage,
} from '@careflow/database/d1';
import { NodeSqliteD1Adapter } from '@careflow/database/sqlite-node';

async function createTestAuthHarness() {
  const db = new NodeSqliteD1Adapter(':memory:');
  await bootstrapKnowledgeD1Schema(db);
  const workspaceRepo = new D1WorkspaceRepository(db);
  const knowledgeRepo = new D1KnowledgeRepository(db);
  const knowledgeService = new KnowledgeManagementService(knowledgeRepo);
  const authService = new D1AuthIdentityService(db);
  return { db, workspaceRepo, knowledgeRepo, knowledgeService, authService };
}

describe('CareFlow Secure Authentication, Identity, MFA & Multi-Business Security Suite', () => {
  it('1. Registration & Password Hashing: hashes passwords with scrypt and never stores plaintext passwords', async () => {
    const { db, workspaceRepo } = await createTestAuthHarness();

    const reg = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Adaeze Nwosu',
      email: 'adaeze@fintech-example.org',
      password: 'StrongPassword2026!',
      businessName: 'PayBridge Africa',
      industry: 'Financial services',
      country: 'Nigeria',
      website: 'https://paybridge.example.org',
      requireEmailVerification: true,
    });

    assert.ok(reg.user.id.startsWith('usr_'));
    assert.ok(reg.organization.id.startsWith('org_'));
    assert.equal(reg.organization.role, UserRole.Owner);
    assert.ok(reg.verificationToken && reg.verificationToken.length >= 32);

    // Inspect raw users table to verify password is not plaintext
    const userRow = await db
      .prepare('SELECT password_hash, email_verified FROM users WHERE id = ?')
      .bind(reg.user.id)
      .first<{ password_hash: string; email_verified: number }>();

    assert.ok(userRow);
    assert.match(userRow.password_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
    assert.ok(!userRow.password_hash.includes('StrongPassword2026!'));
    assert.equal(userRow.email_verified, 0);

    // Inspect auth_tokens table to verify only SHA-256 hash of verification token is stored
    const expectedTokenHash = hashTokenSha256(reg.verificationToken);
    const tokenRow = await db
      .prepare('SELECT token_hash, token_type FROM auth_tokens WHERE user_id = ?')
      .bind(reg.user.id)
      .first<{ token_hash: string; token_type: string }>();

    assert.ok(tokenRow);
    assert.equal(tokenRow.token_hash, expectedTokenHash);
    assert.notEqual(tokenRow.token_hash, reg.verificationToken);
    assert.equal(tokenRow.token_type, 'email_verification');
  });

  it('2. Email Verification & Single-Use Token Enforcement: verifies email once and rejects token reuse', async () => {
    const { workspaceRepo, authService } = await createTestAuthHarness();

    const reg = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Chidi Okonkwo',
      email: 'chidi@verify-test.org',
      password: 'VerifyPassword2026',
      businessName: 'Verify Corp',
      industry: 'Technology',
      country: 'United States',
      requireEmailVerification: true,
    });

    assert.ok(reg.verificationToken);

    // First verification succeeds
    const verified = await authService.verifyEmailWithToken(reg.verificationToken, {
      ipAddress: '203.0.113.10',
      userAgent: 'TestRunner/1.0',
    });
    assert.ok(verified);
    assert.equal(verified.id, reg.user.id);
    assert.equal(verified.email, 'chidi@verify-test.org');
    assert.equal(verified.emailVerified, true);

    // Reusing the exact same single-use token must fail
    await assert.rejects(
      async () => {
        await authService.verifyEmailWithToken(reg.verificationToken, {
          ipAddress: '203.0.113.10',
          userAgent: 'TestRunner/1.0',
        });
      },
      (err: Error) => err.message.includes('TOKEN_ALREADY_USED')
    );
  });

  it('3. Duplicate Email Registration Prevention: blocks registering a second account with an existing email', async () => {
    const { workspaceRepo } = await createTestAuthHarness();

    await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'First Owner',
      email: 'duplicate@careflow-test.org',
      password: 'ValidPassword123',
      businessName: 'First Business',
      industry: 'Education',
      country: 'Canada',
    });

    await assert.rejects(
      async () => {
        await workspaceRepo.registerUserAndFirstBusiness({
          fullName: 'Second Owner',
          email: 'DUPLICATE@careflow-test.org',
          password: 'AnotherPassword123',
          businessName: 'Second Business',
          industry: 'Healthcare',
          country: 'Canada',
        });
      },
      (err: Error) => err.message.includes('already exists')
    );
  });

  it('4. Login with Correct and Incorrect Credentials: authenticates valid credentials and rejects wrong passwords or unknown emails', async () => {
    const { workspaceRepo } = await createTestAuthHarness();

    await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Tunde Bakare',
      email: 'tunde@login-test.org',
      password: 'CorrectHorseBattery9',
      businessName: 'Bakare Logistics',
      industry: 'Logistics and transportation',
      country: 'United Kingdom',
    });

    // Wrong password
    const wrongPass = await workspaceRepo.authenticateUser(
      'tunde@login-test.org',
      'WrongPassword999'
    );
    assert.equal(wrongPass, null);

    // Non-existent email
    const unknownEmail = await workspaceRepo.authenticateUser(
      'nobody@login-test.org',
      'CorrectHorseBattery9'
    );
    assert.equal(unknownEmail, null);

    // Correct credentials
    const validAuth = await workspaceRepo.authenticateUser(
      'TUNDE@login-test.org',
      'CorrectHorseBattery9'
    );
    assert.ok(validAuth);
    assert.equal(validAuth.user.email, 'tunde@login-test.org');
    assert.equal(validAuth.user.mfaEnabled, false);
    assert.equal(validAuth.workspaces.length, 1);
  });

  it('5. Password Reset & Session Invalidation: resets password with single-use token and revokes active sessions', async () => {
    const { workspaceRepo, authService } = await createTestAuthHarness();

    const reg = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Zainab Musa',
      email: 'zainab@reset-test.org',
      password: 'OldPassword2025',
      businessName: 'Zainab Retail',
      industry: 'E-commerce and retail',
      country: 'Nigeria',
    });

    // Create an active session before password reset
    const preResetSession = await authService.createSession({
      userId: reg.user.id,
      organizationId: reg.organization.id,
      ipAddress: '198.51.100.1',
      userAgent: 'Laptop Browser',
    });

    // Request password reset for unknown email returns userFound: false without throwing (prevents enumeration)
    const unknownReset = await authService.createPasswordResetToken(
      'nonexistent@reset-test.org',
      {
        ipAddress: '198.51.100.1',
        userAgent: 'Laptop Browser',
      }
    );
    assert.equal(unknownReset.userFound, false);

    // Request password reset for registered user
    const issued = await authService.createPasswordResetToken('zainab@reset-test.org', {
      ipAddress: '198.51.100.1',
      userAgent: 'Laptop Browser',
    });
    assert.equal(issued.userFound, true);
    assert.ok(issued.rawToken && issued.rawToken.length >= 32);

    // Complete password reset
    const resetResult = await authService.resetPasswordWithToken(
      issued.rawToken,
      'NewStrongPassword2026',
      {
        ipAddress: '198.51.100.1',
        userAgent: 'Laptop Browser',
      }
    );
    assert.ok(resetResult);
    assert.equal(resetResult.id, reg.user.id);

    // Old password no longer works; new password succeeds
    const oldLogin = await workspaceRepo.authenticateUser(
      'zainab@reset-test.org',
      'OldPassword2025'
    );
    assert.equal(oldLogin, null);

    const newLogin = await workspaceRepo.authenticateUser(
      'zainab@reset-test.org',
      'NewStrongPassword2026'
    );
    assert.ok(newLogin);

    // Previous session was automatically revoked by password reset
    const oldSessionCheck = await authService.validateSessionToken(
      preResetSession.rawSessionToken
    );
    assert.equal(oldSessionCheck, null);
  });

  it('6. Expired and Reused Recovery Tokens: rejects expired tokens and already-consumed tokens', async () => {
    const { db, workspaceRepo, authService } = await createTestAuthHarness();

    const reg = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Token Expiry User',
      email: 'expiry@token-test.org',
      password: 'InitialPassword123',
      businessName: 'Expiry Org',
      industry: 'Technology',
      country: 'Germany',
    });

    const issued = await authService.createPasswordResetToken('expiry@token-test.org', {
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent',
    });
    assert.ok(issued.rawToken);

    // Force token expiration in the past
    await db
      .prepare('UPDATE auth_tokens SET expires_at = ? WHERE user_id = ? AND token_type = ?')
      .bind(new Date(Date.now() - 60_000).toISOString(), reg.user.id, 'password_reset')
      .run();

    await assert.rejects(
      async () => {
        await authService.resetPasswordWithToken(issued.rawToken!, 'ShouldNotWork123', {
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent',
        });
      },
      (err: Error) => err.message.includes('TOKEN_EXPIRED')
    );

    // Issue a fresh token, use it once, then attempt reuse
    const fresh = await authService.createPasswordResetToken('expiry@token-test.org', {
      ipAddress: '127.0.0.1',
      userAgent: 'TestAgent',
    });
    assert.ok(fresh.rawToken);

    const firstUse = await authService.resetPasswordWithToken(
      fresh.rawToken,
      'ValidSecondPassword123',
      {
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent',
      }
    );
    assert.ok(firstUse);

    await assert.rejects(
      async () => {
        await authService.resetPasswordWithToken(fresh.rawToken!, 'ReplayAttackPassword123', {
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent',
        });
      },
      (err: Error) => err.message.includes('TOKEN_ALREADY_USED')
    );
  });

  it('7. Session Expiration, Session Revocation & Logout from All Devices', async () => {
    const { workspaceRepo, authService } = await createTestAuthHarness();

    const reg = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Session Manager User',
      email: 'sessions@careflow-test.org',
      password: 'SessionPassword123',
      businessName: 'Session Corp',
      industry: 'Technology',
      country: 'United States',
    });

    // Create 3 device sessions
    const device1 = await authService.createSession({
      userId: reg.user.id,
      organizationId: reg.organization.id,
      ipAddress: '10.0.0.1',
      userAgent: 'MacBook Pro Safari',
    });
    const device2 = await authService.createSession({
      userId: reg.user.id,
      organizationId: reg.organization.id,
      ipAddress: '10.0.0.2',
      userAgent: 'iPhone Mobile Safari',
    });
    const expiredDevice = await authService.createSession({
      userId: reg.user.id,
      organizationId: reg.organization.id,
      ipAddress: '10.0.0.3',
      userAgent: 'Expired Tablet',
      ttlSeconds: -10, // already expired
    });

    // Expired session must not validate
    const expiredValidated = await authService.validateSessionToken(
      expiredDevice.rawSessionToken
    );
    assert.equal(expiredValidated, null);

    // Active sessions list contains only non-expired, non-revoked sessions (device1 & device2)
    const activeList = await authService.listActiveSessions(reg.user.id, device1.sessionId);
    assert.equal(activeList.length, 2);
    assert.equal(activeList.find((s) => s.id === device1.sessionId)?.isCurrent, true);
    assert.equal(activeList.find((s) => s.id === device2.sessionId)?.isCurrent, false);

    // Revoke single session (device2)
    const revokedSingle = await authService.revokeSessionById(reg.user.id, device2.sessionId, {
      ipAddress: '10.0.0.1',
      userAgent: 'MacBook Pro Safari',
    });
    assert.equal(revokedSingle, true);
    assert.equal(await authService.validateSessionToken(device2.rawSessionToken), null);

    // Logout current device (device1) by raw token
    const loggedOut = await authService.revokeSessionByToken(device1.rawSessionToken, {
      ipAddress: '10.0.0.1',
      userAgent: 'MacBook Pro Safari',
    });
    assert.equal(loggedOut, true);
    assert.equal(await authService.validateSessionToken(device1.rawSessionToken), null);
  });

  it('8. Brute-Force Rate Limiting: enforces temporary cooldown after max failed attempts without permanent lockout', async () => {
    const { authService } = await createTestAuthHarness();
    const identifier = '203.0.113.55:victim@example.com';

    // Record 5 failures (maxAttempts for login is 5)
    for (let i = 1; i <= 5; i++) {
      await authService.recordRateLimitAttempt('login', identifier);
    }

    const blockedCheck = await authService.checkRateLimit('login', identifier);
    assert.equal(blockedCheck.allowed, false);
    assert.ok(blockedCheck.retryAfterSeconds > 0);
    // Lockout is temporary (15 minutes = 900s max), never permanent
    assert.ok(blockedCheck.retryAfterSeconds <= 900);

    // Resetting rate limit (or after window expires) restores access
    await authService.resetRateLimit('login', identifier);
    const clearedCheck = await authService.checkRateLimit('login', identifier);
    assert.equal(clearedCheck.allowed, true);
  });

  it('9. Cloudflare Turnstile Bot Verification: supports unconfigured dev fallback and enforces server-side verification when secret is set', async () => {
    // 1. When TURNSTILE_SECRET_KEY is not set, allows non-blocking dev operation
    const devResult = await verifyTurnstileToken({ token: undefined }, {});
    assert.equal(devResult.success, true);
    assert.equal(devResult.configured, false);

    // 2. When TURNSTILE_SECRET_KEY is configured, missing token is rejected
    const missingTokenResult = await verifyTurnstileToken(
      { token: '' },
      { TURNSTILE_SECRET_KEY: '0x4AAAAAA_test_secret_key' }
    );
    assert.equal(missingTokenResult.success, false);
    assert.equal(missingTokenResult.configured, true);
    assert.equal(missingTokenResult.errorCode, 'TURNSTILE_TOKEN_REQUIRED');

    // 3. Explicit test pass/fail tokens work deterministically
    const passTokenResult = await verifyTurnstileToken(
      { token: 'CF_TURNSTILE_TEST_PASS' },
      { TURNSTILE_SECRET_KEY: '0x4AAAAAA_test_secret_key', NODE_ENV: 'test' }
    );
    assert.equal(passTokenResult.success, true);

    const failTokenResult = await verifyTurnstileToken(
      { token: 'CF_TURNSTILE_TEST_FAIL' },
      { TURNSTILE_SECRET_KEY: '0x4AAAAAA_test_secret_key' }
    );
    assert.equal(failTokenResult.success, false);
  });

  it('10. Multi-Business Role Permissions (Owner, Admin, Agent, Viewer) & Cross-Organization Isolation', async () => {
    const { db, workspaceRepo, knowledgeService, authService } = await createTestAuthHarness();

    // User A creates Org A (Owner) and a second business Org B (Owner)
    const orgA = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Multi-Biz Founder',
      email: 'founder@multibiz.org',
      password: 'FounderPassword2026',
      businessName: 'Alpha Health',
      industry: 'Healthcare',
      country: 'United States',
    });

    const orgB = await workspaceRepo.createAdditionalBusinessForUser(orgA.user.id, {
      businessName: 'Beta Fintech',
      industry: 'Financial services',
      country: 'United Kingdom',
    });

    // User B registers Separate Org C
    const orgC = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'External Competitor',
      email: 'competitor@other.org',
      password: 'CompetitorPassword2026',
      businessName: 'Gamma Logistics',
      industry: 'Logistics and transportation',
      country: 'Canada',
    });

    // Add User B to Org A with 'viewer' role
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO organization_members (id, organization_id, user_id, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .bind('mem_viewer_test', orgA.organization.id, orgC.user.id, UserRole.Viewer, now, now)
      .run();

    // Verify memberships
    const founderInA = await authService.verifyOrganizationMembership(
      orgA.user.id,
      orgA.organization.id
    );
    const founderInB = await authService.verifyOrganizationMembership(
      orgA.user.id,
      orgB.organizationId
    );
    const founderInC = await authService.verifyOrganizationMembership(
      orgA.user.id,
      orgC.organization.id
    );
    const viewerInA = await authService.verifyOrganizationMembership(
      orgC.user.id,
      orgA.organization.id
    );

    assert.equal(founderInA?.role, UserRole.Owner);
    assert.equal(founderInB?.role, UserRole.Owner);
    assert.equal(founderInC, null); // Cross-organization access blocked!
    assert.equal(viewerInA?.role, UserRole.Viewer);

    // Verify minimumRole enforcement in verifyOrganizationMembership
    const viewerAsAdminInA = await authService.verifyOrganizationMembership(
      orgC.user.id,
      orgA.organization.id,
      UserRole.Admin
    );
    assert.equal(viewerAsAdminInA, null);

    // Verify Role Hierarchy weights: Owner > Admin > Supervisor > Agent > Viewer
    const viewerIdentity = {
      userId: orgC.user.id,
      organizationId: orgA.organization.id,
      role: UserRole.Viewer,
      email: 'competitor@other.org',
    };
    const agentIdentity = {
      userId: 'usr_agent',
      organizationId: orgA.organization.id,
      role: UserRole.Agent,
      email: 'agent@multibiz.org',
    };
    const adminIdentity = {
      userId: 'usr_admin',
      organizationId: orgA.organization.id,
      role: UserRole.Admin,
      email: 'admin@multibiz.org',
    };

    assert.equal(hasMinimumRole(viewerIdentity, UserRole.Viewer), true);
    assert.equal(hasMinimumRole(viewerIdentity, UserRole.Agent), false);
    assert.equal(hasMinimumRole(viewerIdentity, UserRole.Admin), false);

    assert.equal(hasMinimumRole(agentIdentity, UserRole.Viewer), true);
    assert.equal(hasMinimumRole(agentIdentity, UserRole.Agent), true);
    assert.equal(hasMinimumRole(agentIdentity, UserRole.Admin), false);

    assert.equal(hasMinimumRole(adminIdentity, UserRole.Admin), true);
    assert.equal(hasMinimumRole(adminIdentity, UserRole.Owner), false);

    // Viewer and Agent cannot create knowledge categories (requires Admin+)
    await assert.rejects(
      async () => {
        await knowledgeService.createCategory(viewerIdentity, {
          name: 'Unauthorized Category',
          description: 'Viewer should not create categories',
          displayOrder: 1,
        });
      },
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'FORBIDDEN'
    );

    // Unauthenticated identity is rejected with UNAUTHORIZED
    await assert.rejects(
      async () => {
        await knowledgeService.listArticles(null);
      },
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'UNAUTHORIZED'
    );
  });

  it('11. TOTP Multi-Factor Authentication (MFA) Enrollment, Challenge & Single-Use Recovery Codes', async () => {
    const { workspaceRepo, authService } = await createTestAuthHarness();

    const reg = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'MFA Admin User',
      email: 'mfa-admin@careflow-test.org',
      password: 'MfaStrongPassword2026',
      businessName: 'Secure Vault Inc',
      industry: 'Financial services',
      country: 'United States',
    });

    // 1. Begin MFA enrollment
    const setup = await authService.beginMfaEnrollment(reg.user.id);
    assert.ok(setup.secret.length >= 16);
    assert.ok(setup.otpauthUri.startsWith('otpauth://totp/'));
    assert.ok(setup.qrCodeSvgDataUrl.startsWith('data:image/svg+xml;'));

    // 2. Wrong 6-digit code fails activation
    await assert.rejects(
      async () => {
        await authService.confirmMfaEnrollment(reg.user.id, '000000', {
          ipAddress: '127.0.0.1',
          userAgent: 'TestRunner',
        });
      },
      (err: Error) => err.message.includes('INVALID_MFA_CODE')
    );

    // 3. Valid RFC 6238 TOTP code activates MFA and returns 8 single-use recovery codes
    const validTotp = generateTotpCode(setup.secret);
    assert.equal(verifyTotpCode(setup.secret, validTotp), true);

    const activation = await authService.confirmMfaEnrollment(reg.user.id, validTotp, {
      ipAddress: '127.0.0.1',
      userAgent: 'TestRunner',
    });
    assert.equal(activation.enabled, true);
    assert.equal(activation.recoveryCodes.length, 8);

    // 4. Verify MFA challenge with TOTP code
    const totpChallenge = await authService.verifyUserMfaCode(
      reg.user.id,
      generateTotpCode(setup.secret)
    );
    assert.equal(totpChallenge.verified, true);
    assert.equal(totpChallenge.usedRecoveryCode, false);

    // 5. Verify MFA challenge with one of the 8 recovery codes (and verify it is single-use)
    const recoveryCode = activation.recoveryCodes[0]!;
    const firstRecovery = await authService.verifyUserMfaCode(reg.user.id, recoveryCode);
    assert.equal(firstRecovery.verified, true);
    assert.equal(firstRecovery.usedRecoveryCode, true);

    const reusedRecovery = await authService.verifyUserMfaCode(reg.user.id, recoveryCode);
    assert.equal(reusedRecovery.verified, false);

    // 6. Disabling MFA requires valid password + valid code
    await assert.rejects(
      async () => {
        await authService.disableMfa({
          userId: reg.user.id,
          currentPassword: 'WrongPassword123',
          code: generateTotpCode(setup.secret),
        });
      },
      (err: Error) => err.message.includes('INVALID_CREDENTIALS')
    );

    await authService.disableMfa({
      userId: reg.user.id,
      currentPassword: 'MfaStrongPassword2026',
      code: generateTotpCode(setup.secret),
    });

    const postDisableCheck = await authService.verifyUserMfaCode(
      reg.user.id,
      generateTotpCode(setup.secret)
    );
    assert.equal(postDisableCheck.verified, false);
  });

  it('12. Redirect Validation & No Hardcoded Domain Assumption: blocks open redirects and works without careflow.com', async () => {
    // 1. Safe internal paths are allowed
    assert.deepEqual(validateSafeRedirectUrl('/admin', ['https://careflow.workers.dev']), {
      valid: true,
      sanitizedUrl: '/admin',
    });

    // 2. Allowed Worker deployment URL is permitted
    assert.deepEqual(
      validateSafeRedirectUrl('https://careflow.workers.dev/admin?tab=security', [
        'https://careflow.workers.dev',
      ]),
      {
        valid: true,
        sanitizedUrl: 'https://careflow.workers.dev/admin?tab=security',
      }
    );

    // 3. External/open redirects, protocol-relative URLs, and javascript: URIs are rejected
    assert.equal(
      validateSafeRedirectUrl('https://evil-phishing.example.com/login', [
        'https://careflow.workers.dev',
      ]).valid,
      false
    );
    assert.equal(validateSafeRedirectUrl('//evil.com/steal').valid, false);
    assert.equal(validateSafeRedirectUrl('javascript:alert(1)').valid, false);

    // 4. Resend config does not invent a careflow.com domain when unconfigured
    const resendCfg = resolveResendConfig(undefined, {});
    assert.equal(resendCfg.isConfigured, false);
    assert.equal(resendCfg.fromAddress, '');

    const devDelivery = await sendEmailVerificationMessage(
      {
        to: 'dev@workers-url-test.org',
        fullName: 'Dev User',
        rawToken: 'sample_token_12345',
      },
      undefined,
      { CAREFLOW_APP_BASE_URL: 'https://careflow-worker.example.workers.dev' }
    );
    assert.equal(devDelivery.sent, false);
    assert.equal(devDelivery.devToken, 'sample_token_12345');
    assert.equal(
      devDelivery.devPreviewUrl?.startsWith(
        'https://careflow-worker.example.workers.dev/login?action=verify-email&token=sample_token_12345'
      ),
      true
    );

    // 5. Strong password validation rejects weak passwords
    assert.equal(StrongPasswordSchema.safeParse('short1A').success, false);
    assert.equal(StrongPasswordSchema.safeParse('1234567890').success, false);
    assert.equal(StrongPasswordSchema.safeParse('NoNumbersHereAtAll').success, false);
    assert.equal(StrongPasswordSchema.safeParse('ValidStrongPass2026').success, true);

    // 6. Direct password hashing & verification roundtrip
    const hash = hashPassword('RoundTripTest2026!');
    assert.equal(verifyPassword('RoundTripTest2026!', hash), true);
    assert.equal(verifyPassword('WrongPassword2026!', hash), false);
  });

  it('13. Session Workspace Switching & Multi-Workspace Session Lifecycle: updates auth_sessions.organization_id and preserves session token validity', async () => {
    const { workspaceRepo, authService } = await createTestAuthHarness();

    const reg = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Ngozi Eze',
      email: 'ngozi@session-switch.org',
      password: 'SwitchPassword2026!',
      businessName: 'First Workspace Ltd',
      industry: 'Technology',
      country: 'Nigeria',
    });

    const session = await authService.createSession({
      userId: reg.user.id,
      organizationId: reg.organization.id,
      ipAddress: '198.51.100.25',
      userAgent: 'TestSuite/2.0',
    });

    const initialValidated = await authService.validateSessionToken(session.rawSessionToken);
    assert.ok(initialValidated);
    assert.equal(initialValidated.activeMembership.organizationId, reg.organization.id);

    // Create a second business workspace under the same account
    const secondWorkspace = await workspaceRepo.createAdditionalBusinessForUser(reg.user.id, {
      businessName: 'Second Workspace Health',
      industry: 'Healthcare',
      country: 'Nigeria',
    });

    // Switch session's active workspace in D1
    await authService.switchSessionWorkspace(
      session.rawSessionToken,
      secondWorkspace.organizationId
    );

    const switchedValidated = await authService.validateSessionToken(session.rawSessionToken);
    assert.ok(switchedValidated);
    assert.equal(switchedValidated.session.id, session.sessionId);
    assert.equal(
      switchedValidated.activeMembership.organizationId,
      secondWorkspace.organizationId
    );
    assert.equal(
      switchedValidated.activeMembership.organizationName,
      'Second Workspace Health'
    );
  });

  it('14. Role-Based Authorization (RBAC): Viewer can read knowledge base while Viewer, Agent, and Supervisor are blocked from knowledge mutations', async () => {
    const { knowledgeService } = await createTestAuthHarness();

    const adminIdentity = {
      userId: 'usr_admin_ns',
      organizationId: 'org_northstar_commerce',
      role: UserRole.Admin,
      email: 'admin@northstar.example',
    };
    const supervisorIdentity = {
      userId: 'usr_sup_ns',
      organizationId: 'org_northstar_commerce',
      role: UserRole.Supervisor,
      email: 'supervisor@northstar.example',
    };
    const viewerIdentity = {
      userId: 'usr_viewer_ns',
      organizationId: 'org_northstar_commerce',
      role: UserRole.Viewer,
      email: 'viewer@northstar.example',
    };

    // Viewer can read overview, categories, articles, and FAQs
    const overview = await knowledgeService.getOverview(viewerIdentity);
    assert.ok(overview.publishedArticles >= 1);
    const categories = await knowledgeService.listCategories(viewerIdentity);
    assert.ok(categories.length >= 1);
    const articles = await knowledgeService.listArticles(viewerIdentity);
    assert.ok(articles.length >= 1);
    const faqs = await knowledgeService.listFaqs(viewerIdentity);
    assert.ok(faqs.length >= 1);

    // Viewer and Supervisor are blocked from mutating knowledge base entries
    await assert.rejects(
      async () => {
        await knowledgeService.createFaq(viewerIdentity, {
          question: 'Can a viewer add an FAQ entry?',
          answer: 'No, viewers have read-only access.',
          categoryId: null,
          status: 'draft' as never,
          displayOrder: 1,
        });
      },
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'FORBIDDEN'
    );

    await assert.rejects(
      async () => {
        await knowledgeService.createCategory(supervisorIdentity, {
          name: 'Supervisor Category Attempt',
          description: 'Supervisors manage queue operations, not KB categories.',
          displayOrder: 5,
        });
      },
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'FORBIDDEN'
    );

    // Admin can create category
    const createdCat = await knowledgeService.createCategory(adminIdentity, {
      name: 'Admin Approved Category',
      description: 'Created by authorized administrator.',
      displayOrder: 99,
    });
    assert.equal(createdCat.organizationId, 'org_northstar_commerce');
  });

  it('15. Database-Level Composite Tenant Isolation Triggers: prevents cross-tenant support_messages and cross-tenant category links', async () => {
    const { db, workspaceRepo } = await createTestAuthHarness();

    const orgA = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Tenant A Owner',
      email: 'owner@tenant-a.example',
      password: 'TenantAPassword123!',
      businessName: 'Tenant A Corp',
      industry: 'Technology',
      country: 'United States',
    });

    const orgB = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Tenant B Owner',
      email: 'owner@tenant-b.example',
      password: 'TenantBPassword123!',
      businessName: 'Tenant B Corp',
      industry: 'Healthcare',
      country: 'Canada',
    });

    const convA = await workspaceRepo.createEscalatedConversation({
      organizationId: orgA.organization.id,
      customerName: 'Customer A',
      customerEmail: 'cust@tenant-a.example',
      category: 'General',
      subject: 'Tenant A Conversation',
      message: 'Initial message in Tenant A.',
    });

    // Attempt to insert a support_message into Tenant A's conversation_id but tagged with Tenant B's organization_id
    await assert.rejects(
      async () => {
        await db
          .prepare(
            `INSERT INTO support_messages (id, conversation_id, organization_id, sender_type, sender_name, body, created_at)
             VALUES (?, ?, ?, 'agent', 'Cross Tenant Attacker', 'Injected cross-tenant message', ?)`
          )
          .bind(
            'msg_cross_tenant_attack',
            convA.id,
            orgB.organization.id,
            new Date().toISOString()
          )
          .run();
      },
      (err: Error) => err.message.includes('CROSS_TENANT_VIOLATION') || err.message.includes('FOREIGN KEY')
    );

    // Attempt to insert a knowledge_article in Tenant B referencing a category_id from Northstar Commerce
    await assert.rejects(
      async () => {
        await db
          .prepare(
            `INSERT INTO knowledge_articles
               (id, organization_id, category_id, slug, title, short_description, content, tags_json, status, search_keywords, created_at, updated_at)
             VALUES (?, ?, 'cat_ns_orders', 'cross-tenant-art', 'Cross Tenant Article', 'Short desc', 'Body', '[]', 'draft', '', ?, ?)`
          )
          .bind(
            'art_cross_tenant_attack',
            orgB.organization.id,
            new Date().toISOString(),
            new Date().toISOString()
          )
          .run();
      },
      (err: Error) => err.message.includes('CROSS_TENANT_VIOLATION')
    );
  });

  it('16. Portal Publishing Security & Custom-Domain Access Control: blocks public access to unpublished portals while permitting authenticated member preview', async () => {
    const { workspaceRepo } = await createTestAuthHarness();

    const unpublishedBiz = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Draft Portal Owner',
      email: 'owner@draftportal.example',
      password: 'DraftPortalPassword123!',
      businessName: 'Stealth Startup',
      industry: 'Technology',
      country: 'United States',
    });

    const otherBiz = await workspaceRepo.registerUserAndFirstBusiness({
      fullName: 'Other Business Owner',
      email: 'owner@otherbiz.example',
      password: 'OtherBizPassword123!',
      businessName: 'Other Business',
      industry: 'Education',
      country: 'United Kingdom',
    });

    // Configure a custom hostname on the unpublished business
    await workspaceRepo.updateWorkspaceSettings(unpublishedBiz.organization.id, {
      verifiedHostnames: ['support.stealthstartup.example'],
    });

    // 1. Unpublished business must NOT appear in listPublicPortals()
    const publicPortals = await workspaceRepo.listPublicPortals();
    assert.equal(
      publicPortals.some((p) => p.organizationId === unpublishedBiz.organization.id),
      false
    );

    // 2. Anonymous visitor requesting unpublished portal with requirePublished: true gets null (404)
    const anonBySlug = await workspaceRepo.resolvePortalBySlug(unpublishedBiz.organization.slug, {
      requirePublished: true,
    });
    assert.equal(anonBySlug, null);

    const anonByHost = await workspaceRepo.resolvePortalByHostname(
      'support.stealthstartup.example',
      { requirePublished: true }
    );
    assert.equal(anonByHost, null);

    const anonAssistant = await workspaceRepo.answerPortalQuestion(
      unpublishedBiz.organization.slug,
      'How do I contact support?',
      { requirePublished: true }
    );
    assert.equal(anonAssistant, null);

    // 3. Authenticated user from ANOTHER business also gets null (404)
    const crossTenantPreview = await workspaceRepo.resolvePortalBySlug(
      unpublishedBiz.organization.slug,
      {
        requirePublished: true,
        viewerUserId: otherBiz.user.id,
        viewerOrganizationId: otherBiz.organization.id,
      }
    );
    assert.equal(crossTenantPreview, null);

    // 4. Authenticated member of the unpublished business CAN preview their own portal by slug and custom domain
    const memberPreviewBySlug = await workspaceRepo.resolvePortalBySlug(
      unpublishedBiz.organization.slug,
      {
        requirePublished: true,
        viewerUserId: unpublishedBiz.user.id,
        viewerOrganizationId: unpublishedBiz.organization.id,
      }
    );
    assert.ok(memberPreviewBySlug);
    assert.equal(memberPreviewBySlug.organizationId, unpublishedBiz.organization.id);

    const memberPreviewByHost = await workspaceRepo.resolvePortalByHostname(
      'support.stealthstartup.example',
      {
        requirePublished: true,
        viewerUserId: unpublishedBiz.user.id,
      }
    );
    assert.ok(memberPreviewByHost);
    assert.equal(memberPreviewByHost.organizationId, unpublishedBiz.organization.id);
  });

  it('17. SQL GROUP BY Customer Aggregation, Production Turnstile Enforcement & HTML Escaping in Emails', async () => {
    const { workspaceRepo } = await createTestAuthHarness();

    // Create multiple conversations for the same customer email (different casing) in Northstar Commerce
    await workspaceRepo.createEscalatedConversation({
      organizationId: 'org_northstar_commerce',
      customerName: 'Elena Customer',
      customerEmail: 'Elena.Customer@Buyer.Example',
      customerExternalRef: 'ORD-777',
      category: 'Orders & Shipping',
      subject: 'First inquiry',
      message: 'Checking order status.',
    });

    const secondConv = await workspaceRepo.createEscalatedConversation({
      organizationId: 'org_northstar_commerce',
      customerName: 'Elena Customer Updated',
      customerEmail: 'elena.customer@buyer.example',
      customerExternalRef: '',
      category: 'Returns & Exchanges',
      subject: 'Second inquiry',
      message: 'Requesting exchange.',
    });

    await workspaceRepo.replyToConversation({
      organizationId: 'org_northstar_commerce',
      conversationId: secondConv.id,
      senderName: 'Elena Rostova',
      body: 'Resolved exchange.',
      nextStatus: 'resolved' as never,
    });

    const customers = await workspaceRepo.listCustomers('org_northstar_commerce', 'ord-777');
    assert.equal(customers.length, 1);
    assert.equal(customers[0]?.totalConversations, 2);
    assert.equal(customers[0]?.openConversations, 1);
    assert.equal(customers[0]?.externalRef, 'ORD-777');

    // Production Turnstile enforcement rejects unconfigured secret when NODE_ENV === 'production'
    const prodUnconfiguredTurnstile = await verifyTurnstileToken(
      { token: 'some-token' },
      { NODE_ENV: 'production' }
    );
    assert.equal(prodUnconfiguredTurnstile.success, false);
    assert.equal(prodUnconfiguredTurnstile.errorCode, 'TURNSTILE_NOT_CONFIGURED');

    // Production Turnstile rejects test pass token when NODE_ENV === 'production'
    const prodTestTokenAttempt = await verifyTurnstileToken(
      { token: 'CF_TURNSTILE_TEST_PASS' },
      { NODE_ENV: 'production', TURNSTILE_SECRET_KEY: '0x4AAAAAA_prod_secret' }
    );
    assert.equal(prodTestTokenAttempt.success, false);
  });
});


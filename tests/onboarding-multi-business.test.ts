import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRole, isRegisteredPlatformSuperAdminEmail } from '@careflow/shared';
import {
  D1WorkspaceRepository,
  bootstrapKnowledgeD1Schema,
  hashPassword,
  verifyPassword,
} from '@careflow/database/d1';
import { NodeSqliteD1Adapter } from '@careflow/database/sqlite-node';

async function createTestService() {
  const adapter = new NodeSqliteD1Adapter(':memory:');
  await bootstrapKnowledgeD1Schema(adapter);
  const workspaceRepo = new D1WorkspaceRepository(adapter);
  return { adapter, workspaceRepo };
}

test('1. User registration with personal account and initial business provisioning', async () => {
  const { workspaceRepo } = await createTestService();

  const reg = await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'Jane Doe',
    email: 'jane@fintechcorp.example',
    password: 'SecurePass123!',
    businessName: 'Fintech Corp',
    industry: 'Financial services',
    country: 'United Kingdom',
    website: 'https://fintechcorp.example',
  });

  assert.ok(reg.user.id.startsWith('usr_'));
  assert.equal(reg.user.email, 'jane@fintechcorp.example');
  assert.equal(reg.user.fullName, 'Jane Doe');
  assert.equal(reg.user.emailVerified, true);

  assert.ok(reg.organization.id.startsWith('org_'));
  assert.equal(reg.organization.name, 'Fintech Corp');
  assert.equal(reg.organization.role, UserRole.Owner);
  assert.equal(reg.organization.country, 'United Kingdom');
  assert.equal(reg.organization.industry, 'Financial services');
  assert.equal(reg.organization.website, 'https://fintechcorp.example');
  assert.equal(reg.organization.onboardingStatus, 'incomplete');
});

test('2. Duplicate user email registration rejection', async () => {
  const { workspaceRepo } = await createTestService();

  await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'David Smith',
    email: 'david@retailflow.example',
    password: 'Password999!',
    businessName: 'Retail Flow',
    industry: 'E-commerce and retail',
    country: 'United States',
  });

  await assert.rejects(
    async () => {
      await workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'David Duplicate',
        email: 'david@retailflow.example',
        password: 'AnotherPassword1!',
        businessName: 'Second Business',
        industry: 'Technology',
        country: 'Canada',
      });
    },
    { message: /already exists/ }
  );
});

test('3. User authentication via email and password with workspace resolution', async () => {
  const { workspaceRepo } = await createTestService();

  await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'Sam Taylor',
    email: 'sam@techstack.example',
    password: 'MySecretPassword1#',
    businessName: 'TechStack Inc',
    industry: 'Technology',
    country: 'Canada',
  });

  // Successful auth
  const auth = await workspaceRepo.authenticateUser('sam@techstack.example', 'MySecretPassword1#');
  assert.ok(auth);
  assert.equal(auth.user.email, 'sam@techstack.example');
  assert.equal(auth.activeMembership.organizationName, 'TechStack Inc');
  assert.equal(auth.activeMembership.role, UserRole.Owner);
  assert.equal(auth.workspaces.length, 1);

  // Failed auth: bad password
  const badAuth = await workspaceRepo.authenticateUser('sam@techstack.example', 'WrongPassword1!');
  assert.equal(badAuth, null);

  // Failed auth: unknown email
  const unknownAuth = await workspaceRepo.authenticateUser('nonexistent@example.com', 'Pass123!');
  assert.equal(unknownAuth, null);
});

test('4. Multi-business workspace ownership and seamless workspace switching', async () => {
  const { workspaceRepo } = await createTestService();

  const reg = await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'Marcus Vance',
    email: 'marcus@vancegroup.example',
    password: 'VancePassword2026$',
    businessName: 'Vance Logistics',
    industry: 'Logistics and transportation',
    country: 'United States',
  });

  const userId = reg.user.id;
  const firstOrgId = reg.organization.id;

  // Create second business under same user
  const secondOrg = await workspaceRepo.createAdditionalBusinessForUser(userId, {
    businessName: 'Vance Healthcare',
    industry: 'Healthcare',
    country: 'United States',
    website: 'https://vancehealth.example',
  });

  assert.ok(secondOrg.organizationId.startsWith('org_'));
  assert.equal(secondOrg.organizationName, 'Vance Healthcare');
  assert.equal(secondOrg.role, UserRole.Owner);
  assert.notEqual(secondOrg.organizationId, firstOrgId);

  // User now owns both businesses
  const userWorkspaces = await workspaceRepo.getUserWorkspaces(userId);
  assert.equal(userWorkspaces.length, 2);
  assert.ok(userWorkspaces.some((w) => w.organizationName === 'Vance Logistics' && w.role === UserRole.Owner));
  assert.ok(userWorkspaces.some((w) => w.organizationName === 'Vance Healthcare' && w.role === UserRole.Owner));

  // Switch active workspace
  const switched = await workspaceRepo.switchUserActiveWorkspace(userId, secondOrg.organizationId);
  assert.equal(switched.organizationId, secondOrg.organizationId);
  assert.equal(switched.organizationName, 'Vance Healthcare');
});

test('5. Multi-tenant security: user cannot access or switch to an organization they do not belong to', async () => {
  const { workspaceRepo } = await createTestService();

  const userA = await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'Alice Walker',
    email: 'alice@corp-a.example',
    password: 'PasswordAlpha1!',
    businessName: 'Alpha Solutions',
    industry: 'Technology',
    country: 'United States',
  });

  const userB = await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'Bob Roberts',
    email: 'bob@corp-b.example',
    password: 'PasswordBeta1!',
    businessName: 'Beta Dynamics',
    industry: 'Hospitality',
    country: 'Australia',
  });

  // User B tries to switch to User A's organization
  await assert.rejects(
    async () => {
      await workspaceRepo.switchUserActiveWorkspace(userB.user.id, userA.organization.id);
    },
    { message: /do not have active membership/ }
  );

  // Membership check for non-member returns null
  const unauthorizedMembership = await workspaceRepo.getUserActiveMembership(
    userB.user.id,
    userA.organization.id
  );
  assert.equal(unauthorizedMembership, null);
});

test('6. 7-Step guided onboarding progress calculation, step saving, and publish gating', async () => {
  const { workspaceRepo } = await createTestService();

  const reg = await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'Claire Redfield',
    email: 'claire@terrasave.example',
    password: 'ClaireSecurePass1@',
    businessName: 'TerraSave Aid',
    industry: 'Healthcare',
    country: 'United States',
  });

  const orgId = reg.organization.id;

  // Initial progress inspection
  const initialProgress = await workspaceRepo.getOnboardingProgress(orgId);
  assert.equal(initialProgress.status, 'incomplete');
  assert.equal(initialProgress.country, 'United States');
  assert.equal(initialProgress.industry, 'Healthcare');
  assert.equal(initialProgress.totalStepsCount, 7);
  assert.equal(initialProgress.canPublish, false);
  assert.ok(initialProgress.missingRequirements.length > 0);

  // Portal config should reflect draft status before publishing
  const draftPortal = await workspaceRepo.resolvePortalBySlug(reg.organization.slug);
  assert.ok(draftPortal);
  assert.equal(draftPortal.onboardingStatus, 'incomplete');

  // Cannot publish yet
  await assert.rejects(
    async () => {
      await workspaceRepo.publishWorkspacePortal(orgId);
    },
    { message: /Cannot publish portal yet/ }
  );

  // Save Step 1: Business Profile
  const step1Result = await workspaceRepo.saveOnboardingStep(orgId, 1, {
    profile: {
      description: 'Comprehensive emergency response and community medical guidance.',
      contactEmail: 'contact@terrasave.example',
      country: 'United States',
      industry: 'Healthcare',
      website: 'https://terrasave.example',
    },
  });
  assert.equal(step1Result.status, 'in_progress');
  assert.equal(step1Result.website, 'https://terrasave.example');
  const step1Item = step1Result.steps.find((s) => s.step === 1);
  assert.equal(step1Item?.completed, true);

  // Save Step 2: Branding (including logoUrl, primaryColor, secondaryColor)
  const sampleLogoDataUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PC9zdmc+';
  const step2Result = await workspaceRepo.saveOnboardingStep(orgId, 2, {
    branding: {
      displayName: 'TerraSave Support Center',
      logoText: 'TerraSave Direct',
      logoUrl: sampleLogoDataUrl,
      primaryColor: '#0f766e',
      secondaryColor: '#0284c7',
      accentTheme: 'teal-slate',
      welcomeMessage: 'Get immediate answers to emergency relief inquiries.',
    },
  });
  const step2Item = step2Result.steps.find((s) => s.step === 2);
  assert.equal(step2Item?.completed, true);

  // Save Step 5: Human Support
  const step5Result = await workspaceRepo.saveOnboardingStep(orgId, 5, {
    humanSupport: {
      operatingHours: '24/7 Priority Emergency Support',
      timezone: 'UTC',
      escalationConditions: 'Immediately connect with on-call triage coordinators.',
      humanSupportAvailable: true,
    },
  });
  const step5Item = step5Result.steps.find((s) => s.step === 5);
  assert.equal(step5Item?.completed, true);

  // Save Step 6: Chatbot Configuration
  const step6Result = await workspaceRepo.saveOnboardingStep(orgId, 6, {
    chatbot: {
      assistantName: 'TerraSave Responder',
      greetingMessage: 'Welcome to TerraSave Support. What emergency assistance do you require?',
      communicationStyle: 'warm-helpful',
    },
  });
  const step6Item = step6Result.steps.find((s) => s.step === 6);
  assert.equal(step6Item?.completed, true);

  // Check readiness now
  const readyProgress = await workspaceRepo.getOnboardingProgress(orgId);
  assert.equal(readyProgress.canPublish, true);
  assert.equal(readyProgress.missingRequirements.length, 0);

  // Publish portal explicitly
  const publishedProgress = await workspaceRepo.publishWorkspacePortal(orgId);
  assert.equal(publishedProgress.status, 'published');
  const step7Item = publishedProgress.steps.find((s) => s.step === 7);
  assert.equal(step7Item?.completed, true);

  // Portal config should reflect published status and saved branding
  const livePortal = await workspaceRepo.resolvePortalBySlug(reg.organization.slug);
  assert.ok(livePortal);
  assert.equal(livePortal.onboardingStatus, 'published');
  assert.equal(livePortal.branding.logoUrl, sampleLogoDataUrl);
  assert.equal(livePortal.branding.primaryColor, '#0f766e');
  assert.equal(livePortal.branding.secondaryColor, '#0284c7');
});

test('7. Password hashing utility produces salted scrypt hashes and verifies constant time', () => {
  const raw = 'SuperSecret2026!@#';
  const hashed = hashPassword(raw);
  assert.ok(hashed.includes(':'));

  assert.equal(verifyPassword(raw, hashed), true);
  assert.equal(verifyPassword('WrongPass', hashed), false);
  assert.equal(verifyPassword('', hashed), false);
  assert.equal(verifyPassword(raw, 'invalid_format'), false);
});

test('8. UltimateTechApp is not pre-seeded and registers through normal registration & onboarding', async () => {
  const { workspaceRepo } = await createTestService();

  // Before registration, ultimatetechapp does not exist
  const preExisting = await workspaceRepo.resolvePortalBySlug('ultimatetechapp');
  assert.equal(preExisting, null);

  // Register UltimateTechApp through normal registration flow
  const reg = await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'Adaeze Obi',
    email: 'adaeze@ultimatetechapp.com',
    password: 'UltimatePass2026!',
    businessName: 'UltimateTechApp',
    industry: 'Financial services',
    country: 'Nigeria',
    website: 'https://ultimatetechapp.com',
  });

  assert.equal(reg.organization.slug, 'ultimatetechapp');
  assert.equal(reg.organization.name, 'UltimateTechApp');
  assert.equal(reg.organization.role, UserRole.Owner);
  assert.equal(reg.organization.onboardingStatus, 'incomplete');

  const resolvedAfter = await workspaceRepo.resolvePortalBySlug('ultimatetechapp');
  assert.ok(resolvedAfter);
  assert.equal(resolvedAfter.branding.displayName, 'UltimateTechApp');
  assert.equal(resolvedAfter.onboardingStatus, 'incomplete');
});

test('9. Central Platform Admin link and privileges are strictly restricted to registered platform super admin accounts', async () => {
  const { workspaceRepo } = await createTestService();

  // 1. Registered super admin accounts
  assert.equal(isRegisteredPlatformSuperAdminEmail('oluwafemiadekanmi76@gmail.com'), true);
  assert.equal(isRegisteredPlatformSuperAdminEmail('asuracorps@gmail.com'), true);
  assert.equal(isRegisteredPlatformSuperAdminEmail('admin@getcustomcare.xyz'), true);
  assert.equal(isRegisteredPlatformSuperAdminEmail('  OLUWAFEMIADEKANMI76@GMAIL.COM  '), true);

  // 2. Non-super-admin accounts are rejected
  assert.equal(isRegisteredPlatformSuperAdminEmail('normaluser@business.example'), false);
  assert.equal(isRegisteredPlatformSuperAdminEmail('admin@anyothercompany.com'), false);
  assert.equal(isRegisteredPlatformSuperAdminEmail(''), false);
  assert.equal(isRegisteredPlatformSuperAdminEmail(undefined), false);

  // 3. Register a normal business user and verify isPlatformAdmin is false
  const regNormal = await workspaceRepo.registerUserAndFirstBusiness({
    fullName: 'Regular Owner',
    email: 'regularowner@store.example',
    password: 'Password123!',
    businessName: 'Regular Store',
    industry: 'Retail',
    country: 'United States',
  });

  assert.equal(regNormal.user.isPlatformAdmin, false);
  const isSuperAdminNormal = await workspaceRepo.isUserPlatformAdmin(
    regNormal.user.id,
    'regularowner@store.example'
  );
  assert.equal(isSuperAdminNormal, false);

  // 4. Authenticate registered super-admin account
  const isSuperAdminRegistered = await workspaceRepo.isUserPlatformAdmin(
    'dummy_super_id',
    'oluwafemiadekanmi76@gmail.com'
  );
  assert.equal(isSuperAdminRegistered, true);
});


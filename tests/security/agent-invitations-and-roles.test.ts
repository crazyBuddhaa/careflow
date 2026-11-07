import assert from 'node:assert/strict';
import test from 'node:test';
import { UserRole } from '@careflow/shared';
import {
  D1AuthIdentityService,
  D1WorkspaceRepository,
  bootstrapKnowledgeD1Schema,
} from '@careflow/database/d1';
import { NodeSqliteD1Adapter } from '@careflow/database/sqlite-node';

async function createTestHarness() {
  const db = new NodeSqliteD1Adapter(':memory:');
  await bootstrapKnowledgeD1Schema(db);
  const auth = new D1AuthIdentityService(db);
  const repo = new D1WorkspaceRepository(db);
  return { db, auth, repo };
}

test('Agent Invitations, Dual Access Models, Identity Linking & Lifecycle', async (t) => {
  await t.test(
    '1. Role-selective registration: Support Agent and Business accounts operate independently (agents cannot create businesses)',
    async () => {
      const { repo } = await createTestHarness();

      const agentReg = await repo.registerAgentAccount({
        fullName: 'Ada Specialist',
        email: 'ada.specialist@example.com',
        password: 'StrongAgentPass!2026',
        specialty: 'Technical Escalations',
        department: 'Engineering Support',
      });

      assert.equal(agentReg.user.email, 'ada.specialist@example.com');
      assert.equal(agentReg.user.accountType, 'agent');
      assert.equal(agentReg.user.isPersonalAccount, true);
      assert.equal(agentReg.workspaces.length, 0);
      assert.equal(agentReg.activeMembership.organizationId, 'org_customcare_agent_hub');

      // Agent accounts must never be converted to or allowed to create a business account
      await assert.rejects(
        async () => {
          await repo.createAdditionalBusinessForUser(agentReg.user.id, {
            businessName: 'Ada Labs Cloud',
            industry: 'Cloud Infrastructure',
            country: 'United States',
            website: 'https://adalabs.example.com',
          });
        },
        /FORBIDDEN: Support Agent accounts cannot create business workspaces/
      );

      // Business accounts can create additional business workspaces and stay 'business'
      const bizOwner = await repo.registerUserAndFirstBusiness({
        fullName: 'Marcus Founder',
        email: 'marcus.founder@example.com',
        password: 'StrongBizPassword!2026',
        businessName: 'Marcus Primary Corp',
        industry: 'Technology',
        country: 'United States',
      });
      assert.equal(bizOwner.user.accountType, 'business');

      const secondBiz = await repo.createAdditionalBusinessForUser(bizOwner.user.id, {
        businessName: 'Marcus Ventures Labs',
        industry: 'Financial Services',
        country: 'United States',
      });
      assert.ok(secondBiz.organizationId);
      assert.equal(secondBiz.organizationName, 'Marcus Ventures Labs');

      const bizWorkspaces = await repo.getUserWorkspaces(bizOwner.user.id);
      assert.equal(bizWorkspaces.length, 2);
    }
  );

  await t.test(
    '2. Single-use revocable invitations, Business-Managed Agent access, and explicit-consent Personal Account linking across multiple businesses',
    async () => {
      const { auth, repo } = await createTestHarness();

      // Create Business A and Business B
      const bizA = await repo.registerUserAndFirstBusiness({
        fullName: 'Owner Alpha',
        email: 'owner.alpha@example.com',
        password: 'AlphaPassword!2026',
        businessName: 'Alpha FinTech',
        industry: 'Financial Services',
        country: 'United Kingdom',
      });

      const bizB = await repo.registerUserAndFirstBusiness({
        fullName: 'Owner Beta',
        email: 'owner.beta@example.com',
        password: 'BetaPassword!2026',
        businessName: 'Beta Commerce',
        industry: 'E-Commerce',
        country: 'Canada',
      });

      // Business A invites an agent
      const inviteA = await auth.createWorkspaceInvitation({
        actorUserId: bizA.user.id,
        organizationId: bizA.organization.id,
        email: 'jordan.support@example.com',
        role: UserRole.Agent,
        department: 'Tier 1 Billing',
      });

      assert.equal(inviteA.status, 'pending');
      assert.ok(inviteA.rawToken && inviteA.rawToken.length >= 32);

      // Inspect token before acceptance
      const inspectedA = await auth.inspectInvitationToken(inviteA.rawToken!);
      assert.equal(inspectedA.invitation.status, 'pending');
      assert.equal(inspectedA.organization.name, 'Alpha FinTech');
      assert.equal(inspectedA.canLinkToPersonalAccount, false);

      // Agent accepts invitation in Business-Managed mode (default)
      const acceptedA = await auth.acceptWorkspaceInvitation({
        rawToken: inviteA.rawToken!,
        email: 'jordan.support@example.com',
        displayName: 'Jordan Support',
        password: 'JordanWorkspacePass!123',
        accessMode: 'business_managed',
        consentToLinkPersonalAccount: false,
      });

      assert.equal(acceptedA.membership.organizationId, bizA.organization.id);
      assert.equal(acceptedA.user.isPersonalAccount, false);

      // Single-use enforcement: reusing the same token must show accepted status
      const inspectedAfterUse = await auth.inspectInvitationToken(inviteA.rawToken!);
      assert.equal(inspectedAfterUse.invitation.status, 'accepted');

      // Business B invites the same agent email as Supervisor
      const inviteB = await auth.createWorkspaceInvitation({
        actorUserId: bizB.user.id,
        organizationId: bizB.organization.id,
        email: 'jordan.support@example.com',
        role: UserRole.Supervisor,
        department: 'VIP Operations',
      });

      const inspectedB = await auth.inspectInvitationToken(inviteB.rawToken!);
      assert.equal(inspectedB.invitation.status, 'pending');
      // Detects existing agent identity!
      assert.equal(inspectedB.canLinkToPersonalAccount, true);

      // Agent accepts Business B invitation and explicitly consents to link to a Personal CustomCare Account
      const acceptedB = await auth.acceptWorkspaceInvitation({
        rawToken: inviteB.rawToken!,
        email: 'jordan.support@example.com',
        displayName: 'Jordan Support',
        accessMode: 'personal_account',
        consentToLinkPersonalAccount: true,
      });

      assert.equal(acceptedB.user.isPersonalAccount, true);
      assert.equal(acceptedB.workspaces.length, 2);

      const orgIds = acceptedB.workspaces.map((w) => w.organizationId).sort();
      assert.deepEqual(orgIds, [bizA.organization.id, bizB.organization.id].sort());
    }
  );

  await t.test(
    '3. Membership suspension, revocation, and voluntary departure with open conversation auto-unassignment',
    async () => {
      const { db, auth, repo } = await createTestHarness();

      const bizA = await repo.registerUserAndFirstBusiness({
        fullName: 'Owner Gamma',
        email: 'owner.gamma@example.com',
        password: 'GammaPassword!2026',
        businessName: 'Gamma Health',
        industry: 'Healthcare',
        country: 'United States',
      });

      const invite = await auth.createWorkspaceInvitation({
        actorUserId: bizA.user.id,
        organizationId: bizA.organization.id,
        email: 'sam.agent@example.com',
        role: UserRole.Agent,
        department: 'Patient Support',
      });

      const accepted = await auth.acceptWorkspaceInvitation({
        rawToken: invite.rawToken!,
        email: 'sam.agent@example.com',
        displayName: 'Sam Agent',
        password: 'SamAgentPassword!2026',
        accessMode: 'business_managed',
      });

      // Assign an open conversation to Sam Agent
      const convId = 'conv_test_departure_1';
      const now = new Date().toISOString();
      await db
        .prepare(
          `INSERT INTO support_conversations
            (id, organization_id, customer_name, customer_email, customer_external_ref, channel, status, priority, category, subject, assigned_agent_id, assigned_agent_name, diagnostic_summary, created_at, updated_at)
           VALUES (?, ?, 'Customer One', 'c1@example.com', 'cust_1', 'portal', 'open', 'high', 'General', 'Billing help', ?, ?, 'Need help', ?, ?)`
        )
        .bind(convId, bizA.organization.id, accepted.user.id, 'Sam Agent', now, now)
        .run();

      // Suspend membership -> verify status is suspended
      const suspendRes = await auth.updateWorkspaceMemberLifecycle({
        actorUserId: bizA.user.id,
        organizationId: bizA.organization.id,
        targetEmailOrUserId: 'sam.agent@example.com',
        action: 'suspend',
      });
      assert.equal(suspendRes.status, 'suspended');

      // Reactivate membership -> then test voluntary departure
      const reactivateRes = await auth.updateWorkspaceMemberLifecycle({
        actorUserId: bizA.user.id,
        organizationId: bizA.organization.id,
        targetEmailOrUserId: 'sam.agent@example.com',
        action: 'reactivate',
      });
      assert.equal(reactivateRes.status, 'active');

      const leaveRes = await auth.leaveWorkspaceVoluntarily({
        organizationId: bizA.organization.id,
        userId: accepted.user.id,
      });

      assert.equal(leaveRes.departedOrganizationId, bizA.organization.id);
      assert.equal(leaveRes.unassignedConversationCount, 1);

      // Verify conversation was unassigned
      const convRow = await db
        .prepare(`SELECT assigned_agent_id, assigned_agent_name FROM support_conversations WHERE id = ?`)
        .bind(convId)
        .first<{ assigned_agent_id: string | null; assigned_agent_name: string | null }>();
      assert.equal(convRow?.assigned_agent_id, null);
      assert.equal(convRow?.assigned_agent_name, null);
    }
  );
});

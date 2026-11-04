import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ConversationStatus,
  EscalationPriority,
  KnowledgeStatus,
  MessageSenderType,
  SupportChannel,
  UserRole,
} from '@careflow/shared';
import {
  D1AuthIdentityService,
  D1ChannelIntegrationService,
  D1KnowledgeRepository,
  D1WorkspaceRepository,
  bootstrapKnowledgeD1Schema,
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
  type TelegramOutboundMessagePayload,
} from '@careflow/database/d1';
import { NodeSqliteD1Adapter } from '@careflow/database/sqlite-node';

async function createIsolatedTestContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careflow-multichannel-'));
  const sqlitePath = path.join(tempDir, 'multichannel-test.sqlite');
  const db = new NodeSqliteD1Adapter(sqlitePath);
  await bootstrapKnowledgeD1Schema(db);

  const outboundTelegramLog: TelegramOutboundMessagePayload[] = [];
  const authService = new D1AuthIdentityService(db);
  const workspaceRepo = new D1WorkspaceRepository(db);
  const knowledgeRepo = new D1KnowledgeRepository(db);
  const channelService = new D1ChannelIntegrationService(db, {
    centralBotUsername: 'CustomCareBot',
    encryptionKey: 'test-integration-encryption-key-32-chars-minimum!!',
    telegramSender: async (payload) => {
      outboundTelegramLog.push(payload);
      return {
        ok: true,
        externalMessageId: `tg_out_${outboundTelegramLog.length}`,
      };
    },
  });

  return {
    db,
    authService,
    workspaceRepo,
    knowledgeRepo,
    channelService,
    outboundTelegramLog,
    cleanup() {
      try {
        db.close();
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    },
  };
}

describe('CustomCare Unified Multi-Channel Support OS (Phases 2–11)', () => {
  it('1. Registration does NOT auto-publish portals or auto-activate external integrations', async () => {
    const ctx = await createIsolatedTestContext();
    try {
      const reg = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Alice Owner',
        email: 'alice@lumina-optics.com',
        password: 'StrongPassword!2026',
        businessName: 'Lumina Optics',
        industry: 'E-commerce and retail',
        country: 'United States',
      });

      const orgId = reg.organization.id;

      // Portal must NOT be publicly accessible after registration
      const publicPortal = await ctx.workspaceRepo.resolvePortalBySlug(reg.organization.slug, {
        requirePublished: true,
      });
      assert.equal(publicPortal, null, 'Newly registered business portal must remain private');

      // External integrations must not auto-activate
      const integrations = await ctx.channelService.listChannelIntegrations(orgId);
      const tg = integrations.find((i) => i.channel === 'telegram');
      const portal = integrations.find((i) => i.channel === 'portal');
      const widget = integrations.find((i) => i.channel === 'web_widget');
      const whatsapp = integrations.find((i) => i.channel === 'whatsapp');
      const webhooks = integrations.find((i) => i.channel === 'api_webhooks');

      assert.equal(tg?.status, 'not_activated');
      assert.equal(portal?.status, 'setup_required');
      assert.equal(widget?.status, 'not_activated');
      assert.equal(whatsapp?.availabilityLabel, 'Planned');
      assert.equal(webhooks?.availabilityLabel, 'Planned');
    } finally {
      ctx.cleanup();
    }
  });

  it('2. Central CustomCare Telegram Customer Bot: /start token, business KB, escalation, deduplication, token rotation, and multi-business customer switching', async () => {
    const ctx = await createIsolatedTestContext();
    try {
      // Provision Business A (Aurora Solar) and Business B (Zenith Logistics)
      const regA = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Aria Solar',
        email: 'aria@aurorasolar.io',
        password: 'StrongPassword!2026',
        businessName: 'Aurora Solar',
        industry: 'Technology',
        country: 'United States',
      });
      const regB = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Zack Zenith',
        email: 'zack@zenithlogistics.io',
        password: 'StrongPassword!2026',
        businessName: 'Zenith Logistics',
        industry: 'Logistics and transportation',
        country: 'Canada',
      });

      const orgA = regA.organization.id;
      const orgB = regB.organization.id;

      // Seed distinct published Knowledge Base FAQs for Business A and Business B
      const catA = await ctx.knowledgeRepo.createCategory(orgA, {
        name: 'Solar Warranty',
        slug: 'solar-warranty',
        description: 'Solar panel coverage',
        displayOrder: 1,
      });
      await ctx.knowledgeRepo.createFaq(orgA, {
        categoryId: catA.id,
        question: 'What is the Aurora inverter warranty period?',
        answer: 'Aurora inverters include a 25-year comprehensive warranty.',
        status: KnowledgeStatus.Published,
        searchKeywords: 'aurora inverter warranty',
        displayOrder: 1,
      });

      const catB = await ctx.knowledgeRepo.createCategory(orgB, {
        name: 'Freight Customs',
        slug: 'freight-customs',
        description: 'Customs clearance',
        displayOrder: 1,
      });
      await ctx.knowledgeRepo.createFaq(orgB, {
        categoryId: catB.id,
        question: 'How long does Zenith customs clearance take?',
        answer: 'Zenith customs clearance completes within 12 business hours.',
        status: KnowledgeStatus.Published,
        searchKeywords: 'zenith customs clearance',
        displayOrder: 1,
      });

      // Activate Telegram for both businesses
      const tgA = await ctx.channelService.configureChannelIntegration(orgA, {
        channel: 'telegram',
        action: 'activate',
        telegramConfig: {
          welcomeMessage: 'Welcome to Aurora Solar Support!',
          supportCategories: ['Solar Warranty', 'Installation'],
        },
      });
      const tgB = await ctx.channelService.configureChannelIntegration(orgB, {
        channel: 'telegram',
        action: 'activate',
        telegramConfig: {
          welcomeMessage: 'Welcome to Zenith Logistics Support!',
          supportCategories: ['Freight Customs', 'Tracking'],
        },
      });

      assert.ok(tgA.publicToken?.startsWith('tg_'));
      assert.ok(tgB.publicToken?.startsWith('tg_'));
      assert.notEqual(tgA.publicToken, tgB.publicToken);
      assert.ok(!tgA.publicToken!.includes(orgA), 'Public token must never expose organization_id');
      assert.ok(tgA.qrCodeSvgDataUrl?.startsWith('data:image/svg+xml;utf8,'));

      // 2a. Invalid token is rejected gracefully
      const invalidStart = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 1001,
        message: {
          message_id: 1,
          from: { id: 555001, first_name: 'Carlos', username: 'carlos_cust' },
          chat: { id: 555001, type: 'private' },
          text: '/start tg_invalid_token_xyz123',
        },
      });
      assert.equal(invalidStart.mode, 'customer');
      assert.ok(invalidStart.replyText?.includes('invalid, inactive, or has been revoked'));

      // 2b. Customer starts Business A via `/start <TOKEN_A>`
      const startA = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 1002,
        message: {
          message_id: 2,
          from: { id: 555001, first_name: 'Carlos', username: 'carlos_cust' },
          chat: { id: 555001, type: 'private' },
          text: `/start ${tgA.publicToken}`,
        },
      });
      assert.equal(startA.organizationId, orgA);
      assert.ok(startA.replyText?.includes('Welcome to Aurora Solar Support!'));

      // 2c. Duplicate Telegram update_id is deduplicated and ignored
      const outCountBeforeDup = ctx.outboundTelegramLog.length;
      const dupResult = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 1002,
        message: {
          message_id: 2,
          from: { id: 555001, first_name: 'Carlos', username: 'carlos_cust' },
          chat: { id: 555001, type: 'private' },
          text: `/start ${tgA.publicToken}`,
        },
      });
      assert.equal(dupResult.deduplicated, true);
      assert.equal(ctx.outboundTelegramLog.length, outCountBeforeDup);

      // 2d. Customer asks Business A a knowledge base question
      const askA = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 1003,
        message: {
          message_id: 3,
          from: { id: 555001, first_name: 'Carlos', username: 'carlos_cust' },
          chat: { id: 555001, type: 'private' },
          text: 'What is the Aurora inverter warranty period?',
        },
      });
      assert.equal(askA.organizationId, orgA);
      assert.ok(askA.conversationId);
      assert.ok(askA.replyText?.includes('25-year comprehensive warranty'));

      // Verify Business B cannot see Business A's conversation
      const convsB = await ctx.workspaceRepo.listConversations(orgB);
      assert.ok(!convsB.some((c) => c.id === askA.conversationId));

      // 2e. Customer escalates to a human specialist in Business A
      const escalateA = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 1004,
        message: {
          message_id: 4,
          from: { id: 555001, first_name: 'Carlos', username: 'carlos_cust' },
          chat: { id: 555001, type: 'private' },
          text: '/human I need a technician to inspect my inverter serial number',
        },
      });
      assert.equal(escalateA.conversationId, askA.conversationId);
      const convAAfterEscalate = await ctx.workspaceRepo.getConversationById(
        orgA,
        askA.conversationId!
      );
      assert.equal(convAAfterEscalate?.status, ConversationStatus.Escalated);

      // 2f. Same customer switches context to Business B via `/start <TOKEN_B>`
      const startB = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 1005,
        message: {
          message_id: 5,
          from: { id: 555001, first_name: 'Carlos', username: 'carlos_cust' },
          chat: { id: 555001, type: 'private' },
          text: `/start ${tgB.publicToken}`,
        },
      });
      assert.equal(startB.organizationId, orgB);
      assert.ok(startB.replyText?.includes('Welcome to Zenith Logistics Support!'));

      const askB = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 1006,
        message: {
          message_id: 6,
          from: { id: 555001, first_name: 'Carlos', username: 'carlos_cust' },
          chat: { id: 555001, type: 'private' },
          text: 'How long does Zenith customs clearance take?',
        },
      });
      assert.equal(askB.organizationId, orgB);
      assert.notEqual(askB.conversationId, askA.conversationId);
      assert.ok(askB.replyText?.includes('12 business hours'));

      // 2g. Rotating Business B's public token invalidates the previous token context
      const rotatedB = await ctx.channelService.configureChannelIntegration(orgB, {
        channel: 'telegram',
        action: 'rotate_token',
      });
      assert.notEqual(rotatedB.publicToken, tgB.publicToken);

      const msgAfterRotate = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 1007,
        message: {
          message_id: 7,
          from: { id: 555001, first_name: 'Carlos', username: 'carlos_cust' },
          chat: { id: 555001, type: 'private' },
          text: 'Still there?',
        },
      });
      assert.ok(
        msgAfterRotate.replyText?.includes('open a valid business support link'),
        'Rotated token must require customer to open the new business link'
      );
    } finally {
      ctx.cleanup();
    }
  });

  it('3. Telegram Agent Linking, Single-Use/Expiry Security, Agent Commands, Web <-> Telegram Sync, and RBAC', async () => {
    const ctx = await createIsolatedTestContext();
    try {
      // Create Business A and Business B under the same user (multi-business specialist)
      const regA = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Maya Specialist',
        email: 'maya@omnicare.io',
        password: 'StrongPassword!2026',
        businessName: 'OmniCare Health',
        industry: 'Healthcare',
        country: 'United States',
      });
      const orgA = regA.organization.id;
      const userId = regA.user.id;

      const createdB = await ctx.workspaceRepo.createAdditionalBusinessForUser(userId, {
        businessName: 'OmniCare Pharmacy',
        industry: 'Healthcare',
        country: 'United States',
      });
      const orgB = createdB.organizationId;

      // Activate Telegram for Business A
      const tgA = await ctx.channelService.configureChannelIntegration(orgA, {
        channel: 'telegram',
        action: 'activate',
      });

      // Customer creates an escalated conversation on Business A via Telegram
      await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2001,
        message: {
          message_id: 10,
          from: { id: 777100, first_name: 'Elena', last_name: 'Patient', username: 'elena_p' },
          chat: { id: 777100, type: 'private' },
          text: `/start ${tgA.publicToken}`,
        },
      });
      const custMsg = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2002,
        message: {
          message_id: 11,
          from: { id: 777100, first_name: 'Elena', last_name: 'Patient', username: 'elena_p' },
          chat: { id: 777100, type: 'private' },
          text: '/human Need prescription refill help urgently',
        },
      });
      const convId = custMsg.conversationId!;
      assert.ok(convId);

      // 3a. Unlinked Telegram user cannot execute agent commands
      const unlinkedAttempt = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2003,
        message: {
          message_id: 12,
          from: { id: 999888, first_name: 'Stranger', username: 'stranger_tg' },
          chat: { id: 999888, type: 'private' },
          text: '/unassigned',
        },
      });
      assert.ok(unlinkedAttempt.replyText?.includes('Agent access denied'));

      // 3b. Expired linking code fails
      const baseTime = Date.now();
      const codeResp1 = await ctx.channelService.generateAgentTelegramLinkCode({
        organizationId: orgA,
        userId,
        nowMs: baseTime,
      });
      const expiredAttempt = await ctx.channelService.processTelegramWebhookUpdate(
        {
          update_id: 2004,
          message: {
            message_id: 13,
            from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
            chat: { id: 888111, type: 'private' },
            text: `/link ${codeResp1.linkingCode}`,
          },
        },
        { nowMs: baseTime + 11 * 60 * 1000 } // 11 minutes later (> 10 min TTL)
      );
      assert.ok(expiredAttempt.replyText?.includes('expired'));

      // 3c. Valid linking code succeeds, and reusing the same single-use code fails
      const codeResp2 = await ctx.channelService.generateAgentTelegramLinkCode({
        organizationId: orgA,
        userId,
        nowMs: baseTime,
      });
      const validLink = await ctx.channelService.processTelegramWebhookUpdate(
        {
          update_id: 2005,
          message: {
            message_id: 14,
            from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
            chat: { id: 888111, type: 'private' },
            text: `/link ${codeResp2.linkingCode}`,
          },
        },
        { nowMs: baseTime + 60 * 1000 }
      );
      assert.ok(validLink.replyText?.includes('Linked to CustomCare Agent Workspace!'));

      const reuseAttempt = await ctx.channelService.processTelegramWebhookUpdate(
        {
          update_id: 2006,
          message: {
            message_id: 15,
            from: { id: 888222, first_name: 'Other', username: 'other_agent' },
            chat: { id: 888222, type: 'private' },
            text: `/link ${codeResp2.linkingCode}`,
          },
        },
        { nowMs: baseTime + 90 * 1000 }
      );
      assert.ok(reuseAttempt.replyText?.includes('Agent Link Failed'));

      // 3d. Agent uses `/my` (auto-assigned on creation), unassigns to test `/unassigned` + `/accept`, then `/open`, `/note` (private), and `/reply` (public)
      const myCmd = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2007,
        message: {
          message_id: 16,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: '/my',
        },
      });
      assert.ok(myCmd.replyText?.includes(convId));

      // Unassign conversation to verify `/unassigned` queue and `/accept` command
      await ctx.workspaceRepo.updateConversationStatus({
        organizationId: orgA,
        conversationId: convId,
        assignedAgentName: null,
      });

      const unassignedCmd = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 20075,
        message: {
          message_id: 165,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: '/unassigned',
        },
      });
      assert.ok(unassignedCmd.replyText?.includes(convId));

      const acceptCmd = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2008,
        message: {
          message_id: 17,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: `/accept ${convId}`,
        },
      });
      assert.ok(acceptCmd.replyText?.includes('assigned to Maya Specialist'));

      // Private internal note via Telegram `/note` must NOT be sent to the customer chat (777100)
      const customerMsgsBeforeNote = ctx.outboundTelegramLog.filter(
        (m) => m.chatId === '777100'
      ).length;
      const noteCmd = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2009,
        message: {
          message_id: 18,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: `/note ${convId} Internal chart check: patient verified DOB.`,
        },
      });
      assert.ok(noteCmd.replyText?.includes('Internal note saved'));
      const customerMsgsAfterNote = ctx.outboundTelegramLog.filter(
        (m) => m.chatId === '777100'
      ).length;
      assert.equal(
        customerMsgsAfterNote,
        customerMsgsBeforeNote,
        'Internal note must never be sent to the customer on Telegram'
      );

      // Public reply via Telegram `/reply` IS delivered to customer (777100) via central bot and synced to web workspace
      const replyCmd = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2010,
        message: {
          message_id: 19,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: `/reply ${convId} Hello Elena, your refill has been approved and sent to the pharmacy.`,
        },
      });
      assert.ok(replyCmd.replyText?.includes('Reply sent to Elena Patient'));
      const lastCustomerOutbound = ctx.outboundTelegramLog
        .filter((m) => m.chatId === '777100')
        .pop();
      assert.ok(
        lastCustomerOutbound?.text.includes('your refill has been approved'),
        'Customer must receive the specialist reply via the central CustomCare bot'
      );
      assert.ok(
        !lastCustomerOutbound?.text.includes('maya_agent'),
        'Agent personal Telegram username must never be exposed to the customer'
      );

      // 3e. Web Workspace -> Telegram Customer & Telegram Agent synchronization
      const webReplyConv = await ctx.workspaceRepo.replyToConversation({
        organizationId: orgA,
        conversationId: convId,
        senderName: 'Maya Specialist',
        senderUserId: userId,
        senderType: MessageSenderType.Agent,
        body: 'Web workspace follow-up: pickup is ready after 3 PM.',
        isInternalNote: false,
      });
      const latestWebMsg = webReplyConv.messages[webReplyConv.messages.length - 1]!;
      const delivery = await ctx.channelService.deliverAgentReplyToExternalChannel({
        organizationId: orgA,
        conversation: webReplyConv,
        messageId: latestWebMsg.id,
        agentDisplayName: 'Maya Specialist',
        body: latestWebMsg.body,
        isInternalNote: false,
      });
      assert.equal(delivery.delivered, true);

      // Inspect from Telegram Agent `/open <conv_id>` — both internal note and web reply appear
      const openCmd = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2011,
        message: {
          message_id: 20,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: `/open ${convId}`,
        },
      });
      assert.ok(openCmd.replyText?.includes('Internal chart check: patient verified DOB.'));
      assert.ok(openCmd.replyText?.includes('Web workspace follow-up: pickup is ready after 3 PM.'));

      // 3f. Multi-business agent workspace switching via `/workspace`
      const codeRespB = await ctx.channelService.generateAgentTelegramLinkCode({
        organizationId: orgB,
        userId,
      });
      await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2012,
        message: {
          message_id: 21,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: `/link ${codeRespB.linkingCode}`,
        },
      });

      const switchCmd = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2013,
        message: {
          message_id: 22,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: `/workspace ${createdB.organizationSlug}`,
        },
      });
      assert.equal(switchCmd.organizationId, orgB);

      // While in Business B context, attempting `/open <convId_from_A>` must be blocked
      const crossTenantOpen = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2014,
        message: {
          message_id: 23,
          from: { id: 888111, first_name: 'Maya', username: 'maya_agent' },
          chat: { id: 888111, type: 'private' },
          text: `/open ${convId}`,
        },
      });
      assert.ok(crossTenantOpen.replyText?.includes('not found'));

      // 3g. Removing a specialist immediately revokes their Telegram Agent link
      const staffReg = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Temp Agent',
        email: 'temp@omnicare.io',
        password: 'StrongPassword!2026',
        businessName: 'Temp Personal Org',
        industry: 'Other',
        country: 'United States',
      });
      const addedAgent = await ctx.workspaceRepo.createAgent(orgA, {
        displayName: 'Temp Agent',
        email: 'temp@omnicare.io',
        role: UserRole.Agent,
        specialty: 'Triage',
        availability: 'available',
      });
      const tempCode = await ctx.channelService.generateAgentTelegramLinkCode({
        organizationId: orgA,
        userId: staffReg.user.id,
      });
      await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2015,
        message: {
          message_id: 24,
          from: { id: 666777, first_name: 'Temp', username: 'temp_agent' },
          chat: { id: 666777, type: 'private' },
          text: `/link ${tempCode.linkingCode}`,
        },
      });

      // Remove agent from Business A
      await ctx.workspaceRepo.deleteAgent(orgA, addedAgent.id);

      const revokedAttempt = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 2016,
        message: {
          message_id: 25,
          from: { id: 666777, first_name: 'Temp', username: 'temp_agent' },
          chat: { id: 666777, type: 'private' },
          text: '/my',
        },
      });
      assert.ok(
        revokedAttempt.replyText?.includes('Agent access denied'),
        'Removed specialist must immediately lose Telegram agent access'
      );
    } finally {
      ctx.cleanup();
    }
  });

  it('4. Portal Publish/Unpublish, Optional Website Chat Widget Lifecycle, Internal Note Privacy, Saved Replies, and Credential Encryption', async () => {
    const ctx = await createIsolatedTestContext();
    try {
      const reg = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Victor Founder',
        email: 'victor@vanguardcloud.io',
        password: 'StrongPassword!2026',
        businessName: 'Vanguard Cloud',
        industry: 'Technology',
        country: 'United States',
      });
      const orgId = reg.organization.id;
      const slug = reg.organization.slug;

      // Complete required onboarding steps before publishing portal
      await ctx.workspaceRepo.saveOnboardingStep(orgId, 6, {
        profile: {
          description: 'Enterprise cloud infrastructure and managed Kubernetes support.',
          contactEmail: 'support@vanguardcloud.io',
        },
        humanSupport: {
          operatingHours: 'Mon–Fri, 8:00 AM – 8:00 PM EST',
          escalationConditions: 'Escalate production outages and billing disputes.',
        },
      });

      // 4a. Publish and Unpublish Portal
      await ctx.workspaceRepo.publishWorkspacePortal(orgId);
      const publishedPortal = await ctx.workspaceRepo.resolvePortalBySlug(slug, {
        requirePublished: true,
      });
      assert.ok(publishedPortal, 'Published portal must be publicly accessible');

      await ctx.workspaceRepo.unpublishWorkspacePortal(orgId);
      const unpublishedPortal = await ctx.workspaceRepo.resolvePortalBySlug(slug, {
        requirePublished: true,
      });
      assert.equal(unpublishedPortal, null, 'Unpublished portal must return null for public visitors');

      // 4b. Activate Website Chat Widget independently of the portal
      const activeWidget = await ctx.channelService.configureChannelIntegration(orgId, {
        channel: 'web_widget',
        action: 'activate',
        widgetConfig: {
          launcherTitle: 'Vanguard Cloud Live Help',
          welcomeGreeting: 'Ask us anything about Vanguard Cloud!',
        },
      });
      assert.equal(activeWidget.status, 'active');
      assert.ok(activeWidget.publicToken?.startsWith('wgt_'));

      // Send a widget message
      const wgtMsg = await ctx.channelService.handlePublicWidgetMessage({
        publicToken: activeWidget.publicToken!,
        message: 'How do I configure SSO on Vanguard Cloud?',
        sessionRef: 'wgt_session_test_1',
        customerName: 'Nina Visitor',
        customerEmail: 'nina@visitor.io',
        idempotencyKey: 'idem_wgt_1',
      });
      assert.ok(wgtMsg.conversation.id);
      assert.equal(wgtMsg.deduplicated, false);

      // Duplicate idempotencyKey does not create duplicate messages
      const wgtDup = await ctx.channelService.handlePublicWidgetMessage({
        publicToken: activeWidget.publicToken!,
        message: 'How do I configure SSO on Vanguard Cloud?',
        sessionRef: 'wgt_session_test_1',
        customerName: 'Nina Visitor',
        customerEmail: 'nina@visitor.io',
        idempotencyKey: 'idem_wgt_1',
      });
      assert.equal(wgtDup.deduplicated, true);
      assert.equal(wgtDup.conversation.messages.length, wgtMsg.conversation.messages.length);

      // Add a private internal note in the web workspace and verify public widget queries NEVER expose it
      await ctx.workspaceRepo.replyToConversation({
        organizationId: orgId,
        conversationId: wgtMsg.conversation.id,
        senderName: 'Victor Founder',
        senderUserId: reg.user.id,
        senderType: MessageSenderType.Agent,
        body: 'SECRET INTERNAL TEAM NOTE: enterprise discount tier approved',
        isInternalNote: true,
      });

      const publicView = await ctx.channelService.getPublicWidgetConversationBySession(
        activeWidget.publicToken!,
        'wgt_session_test_1'
      );
      assert.ok(publicView);
      assert.ok(
        !publicView!.messages.some((m) => m.body.includes('SECRET INTERNAL TEAM NOTE')),
        'Public widget conversation view must strictly exclude internal notes'
      );

      // Deactivating the widget immediately stops accepting messages
      await ctx.channelService.configureChannelIntegration(orgId, {
        channel: 'web_widget',
        action: 'deactivate',
      });
      await assert.rejects(
        () =>
          ctx.channelService.handlePublicWidgetMessage({
            publicToken: activeWidget.publicToken!,
            message: 'Another message after deactivation',
            sessionRef: 'wgt_session_test_1',
          }),
        /WIDGET_INACTIVE/
      );

      // 4c. Saved Replies CRUD & Tenant Isolation
      const sr = await ctx.workspaceRepo.createSavedReply(orgId, {
        title: 'SSO Setup Guide',
        category: 'Security',
        body: 'You can enable SAML 2.0 SSO under Settings -> Security.',
        createdByUserId: reg.user.id,
      });
      const replies = await ctx.workspaceRepo.listSavedReplies(orgId);
      assert.equal(replies.length, 1);
      assert.equal(replies[0]!.id, sr.id);
      await ctx.workspaceRepo.deleteSavedReply(orgId, sr.id);
      assert.equal((await ctx.workspaceRepo.listSavedReplies(orgId)).length, 0);

      // 4d. AES-256-GCM Credential Encryption at rest
      const secretKey = 'production-separate-integration-encryption-key-2026';
      const encrypted = encryptIntegrationCredentials(
        JSON.stringify({ webhookSigningSecret: 'whsec_live_987654321' }),
        secretKey
      );
      assert.ok(!encrypted.includes('whsec_live_987654321'));
      const decryptedRaw = decryptIntegrationCredentials(encrypted, secretKey);
      assert.ok(decryptedRaw);
      const decrypted = JSON.parse(decryptedRaw!) as { webhookSigningSecret: string };
      assert.equal(decrypted.webhookSigningSecret, 'whsec_live_987654321');
    } finally {
      ctx.cleanup();
    }
  });

  it('5. Complete Telegram Customer Support Experience: Interactive Category Flows, Payment Safety, Product/Technical Support, Attachments, Multi-Conversation Continuity, AI Fallback, and Status Sync', async () => {
    const ctx = await createIsolatedTestContext();
    try {
      const reg = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Samuel Director',
        email: 'samuel@paystream.io',
        password: 'StrongPassword!2026',
        businessName: 'PayStream FinTech',
        industry: 'Financial Services',
        country: 'United States',
      });
      const orgId = reg.organization.id;

      // Seed a product knowledge article & FAQ
      const catProd = await ctx.knowledgeRepo.createCategory(orgId, {
        name: 'PayStream Virtual Cards',
        slug: 'virtual-cards',
        description: 'Virtual card issuance and limits',
        displayOrder: 1,
      });
      await ctx.knowledgeRepo.createFaq(orgId, {
        categoryId: catProd.id,
        question: 'What is the daily spending limit on PayStream Virtual Cards?',
        answer: 'PayStream Virtual Cards support up to $10,000 USD per day for verified business accounts.',
        status: KnowledgeStatus.Published,
        searchKeywords: 'virtual card daily spending limit',
        displayOrder: 1,
      });

      // Activate Telegram for PayStream FinTech
      const tg = await ctx.channelService.configureChannelIntegration(orgId, {
        channel: 'telegram',
        action: 'activate',
        telegramConfig: {
          welcomeMessage: 'Welcome to PayStream FinTech Official Support!',
          supportCategories: ['PayStream Virtual Cards', 'Wire Transfers'],
        },
      });

      // 5a. Customer opens `/start tg_<TOKEN>` -> receives personalized welcome + inline keyboard
      const startRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5001,
        message: {
          message_id: 501,
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          chat: { id: 333444, type: 'private' },
          text: `/start ${tg.publicToken}`,
        },
      });
      assert.equal(startRes.organizationId, orgId);
      assert.ok(startRes.replyText?.includes('Welcome to PayStream FinTech! 👋'));
      const welcomeOutbound = ctx.outboundTelegramLog[ctx.outboundTelegramLog.length - 1]!;
      assert.ok(welcomeOutbound.replyMarkup, 'Welcome message must include inline keyboard buttons');
      const keyboardJson = JSON.stringify(welcomeOutbound.replyMarkup);
      assert.ok(keyboardJson.includes('Payment or Deposit Issues'));
      assert.ok(keyboardJson.includes('Product Support'));
      assert.ok(keyboardJson.includes('Technical Issues'));
      assert.ok(keyboardJson.includes('Speak to an Agent'));

      // 5b. Customer taps "💳 Payment or Deposit Issues" (`cc:cat:payment`) -> sub-options + security notice
      const payCatRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5002,
        callback_query: {
          id: 'cbq_1',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 501, chat: { id: 333444 } },
          data: 'cc:cat:payment',
        },
      });
      assert.ok(payCatRes.replyText?.includes('NEVER ask for your password, PIN, OTP'));
      const paySubMarkup = JSON.stringify(
        ctx.outboundTelegramLog[ctx.outboundTelegramLog.length - 1]!.replyMarkup
      );
      assert.ok(paySubMarkup.includes('cc:pay:pending'));
      assert.ok(paySubMarkup.includes('cc:pay:debited'));

      // Customer selects "My account was debited but not credited" (`cc:pay:debited`)
      const paySubRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5003,
        callback_query: {
          id: 'cbq_2',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 502, chat: { id: 333444 } },
          data: 'cc:pay:debited',
        },
      });
      assert.ok(paySubRes.replyText?.includes('My account was debited but not credited'));
      assert.ok(paySubRes.replyText?.includes('transaction reference'));

      // Customer submits transaction reference + date/amount -> creates escalated payment conversation without falsely claiming verification
      const payDetailsRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5004,
        message: {
          message_id: 503,
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          chat: { id: 333444, type: 'private' },
          text: 'Ref: TXN-99887766, Amount: $450.00 on Nov 3',
        },
      });
      const paymentConvId = payDetailsRes.conversationId!;
      assert.ok(paymentConvId);
      assert.ok(
        payDetailsRes.replyText?.includes('pending specialist verification and has not yet been confirmed'),
        'Bot must never claim a payment has been verified automatically'
      );

      // 5c. Customer uploads a payment confirmation screenshot (photo attachment) and a PDF receipt (document attachment)
      const photoRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5005,
        message: {
          message_id: 504,
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          chat: { id: 333444, type: 'private' },
          caption: 'Here is my bank transfer screenshot',
          photo: [
            { file_id: 'tg_file_small', file_unique_id: 'u_small', width: 320, height: 240, file_size: 18400 },
            { file_id: 'tg_file_large', file_unique_id: 'u_large', width: 1280, height: 960, file_size: 145000 },
          ],
        },
      });
      assert.equal(photoRes.conversationId, paymentConvId);
      assert.ok(photoRes.replyText?.includes('Attachment received'));

      // Invalid attachment (executable .exe) is rejected safely
      const badDocRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5006,
        message: {
          message_id: 505,
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          chat: { id: 333444, type: 'private' },
          document: {
            file_id: 'tg_bad_exe',
            file_name: 'malware.exe',
            mime_type: 'application/x-msdownload',
            file_size: 55000,
          },
        },
      });
      assert.ok(badDocRes.replyText?.includes('Unsupported file type'));

      // Oversized attachment (>10 MB) is rejected safely
      const oversizedDocRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5007,
        message: {
          message_id: 506,
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          chat: { id: 333444, type: 'private' },
          document: {
            file_id: 'tg_huge_pdf',
            file_name: 'huge_statement.pdf',
            mime_type: 'application/pdf',
            file_size: 15 * 1024 * 1024,
          },
        },
      });
      assert.ok(oversizedDocRes.replyText?.includes('exceeds the 10 MB size limit'));

      // Verify valid photo attachment is stored in D1 and linked to the conversation message
      const updatedPayConv = await ctx.workspaceRepo.getConversationById(orgId, paymentConvId);
      const msgsWithAttachments = updatedPayConv!.messages.filter(
        (m) => m.attachments && m.attachments.length > 0
      );
      assert.equal(msgsWithAttachments.length, 1);
      const savedAttachment = msgsWithAttachments[0]!.attachments![0]!;
      assert.equal(savedAttachment.externalFileId, 'tg_file_large');
      assert.equal(savedAttachment.mimeType, 'image/jpeg');

      // Cross-tenant attachment retrieval must return null
      const crossTenantAtt = await ctx.workspaceRepo.getConversationAttachmentById(
        'org_other_tenant',
        paymentConvId,
        savedAttachment.id
      );
      assert.equal(crossTenantAtt, null, 'Attachment retrieval must enforce tenant ownership');

      // 5d. Multi-Conversation Continuity: Customer taps "🆕 Start New Enquiry" (`cc:conv:new`), explores Product Support & Technical Support, then switches between active conversations
      await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5008,
        callback_query: {
          id: 'cbq_3',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 507, chat: { id: 333444 } },
          data: 'cc:conv:new',
        },
      });

      // Tap Product Support (`cc:cat:product`) -> select product 0 -> ask product question
      const prodCatRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5009,
        callback_query: {
          id: 'cbq_4',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 508, chat: { id: 333444 } },
          data: 'cc:cat:product',
        },
      });
      assert.ok(prodCatRes.replyText?.includes('Product & Service Support'));

      await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5010,
        callback_query: {
          id: 'cbq_5',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 509, chat: { id: 333444 } },
          data: 'cc:prod:0',
        },
      });

      const prodAskRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5011,
        message: {
          message_id: 510,
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          chat: { id: 333444, type: 'private' },
          text: 'What is the daily spending limit on PayStream Virtual Cards?',
        },
      });
      const productConvId = prodAskRes.conversationId!;
      assert.ok(productConvId);
      assert.notEqual(
        productConvId,
        paymentConvId,
        'Starting a new enquiry must create a distinct conversation'
      );
      assert.ok(prodAskRes.replyText?.includes('$10,000 USD per day'));

      // Tap Technical Issues (`cc:cat:technical`) -> select `cc:tech:login`
      const techMenuRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5012,
        callback_query: {
          id: 'cbq_6',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 511, chat: { id: 333444 } },
          data: 'cc:cat:technical',
        },
      });
      assert.ok(techMenuRes.replyText?.includes('Technical Support'));

      const techSubRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5013,
        callback_query: {
          id: 'cbq_7',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 512, chat: { id: 333444 } },
          data: 'cc:tech:login',
        },
      });
      assert.ok(techSubRes.replyText?.includes('Login problems'));
      assert.ok(techSubRes.replyText?.includes('Recommended Troubleshooting Steps'));

      // Customer lists active conversations (`cc:conv:list`) and switches back to the Payment conversation
      const listConvRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5014,
        callback_query: {
          id: 'cbq_8',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 513, chat: { id: 333444 } },
          data: 'cc:conv:list',
        },
      });
      assert.ok(listConvRes.replyText?.includes(paymentConvId));
      assert.ok(listConvRes.replyText?.includes(productConvId));

      const switchConvRes = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5015,
        callback_query: {
          id: 'cbq_9',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 514, chat: { id: 333444 } },
          data: `cc:conv:sel:${paymentConvId}`,
        },
      });
      assert.equal(switchConvRes.conversationId, paymentConvId);
      assert.ok(switchConvRes.replyText?.includes(`Switched to conversation ${paymentConvId}`));

      // 5e. Honest Offline Agent Status when all specialists are offline
      const agents = await ctx.workspaceRepo.listAgents(orgId);
      for (const ag of agents) {
        await ctx.workspaceRepo.updateAgent(orgId, ag.id, { availability: 'offline' });
      }
      const offlineEscalate = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 5016,
        callback_query: {
          id: 'cbq_10',
          from: { id: 333444, first_name: 'Diana', last_name: 'Prince', username: 'diana_p' },
          message: { message_id: 515, chat: { id: 333444 } },
          data: 'cc:human',
        },
      });
      assert.ok(
        offlineEscalate.replyText?.includes('No human support agents are currently online'),
        'Must honestly inform customer when no human agents are currently online'
      );

      // 5f. Status notification back to customer when conversation is resolved
      const resolvedConv = await ctx.workspaceRepo.updateConversationStatus({
        organizationId: orgId,
        conversationId: paymentConvId,
        status: ConversationStatus.Resolved,
        actorName: 'Samuel Director',
      });
      const notifyRes = await ctx.channelService.notifyCustomerOfConversationStatusChange({
        organizationId: orgId,
        conversation: resolvedConv,
        previousStatus: ConversationStatus.Escalated,
        nextStatus: ConversationStatus.Resolved,
        actorName: 'Samuel Director',
      });
      assert.equal(notifyRes.notified, true);
      const lastOutbound = ctx.outboundTelegramLog[ctx.outboundTelegramLog.length - 1]!;
      assert.ok(lastOutbound.text.includes('has been marked as resolved by Samuel Director'));
    } finally {
      ctx.cleanup();
    }
  });
});

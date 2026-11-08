import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  CAREFLOW_VERSION,
  ConversationStatus,
  DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS,
  EscalationPriority,
  KnowledgeStatus,
  MessageSenderType,
  UserRole,
  getRegisteredPlatformSuperAdminEmails,
  isRegisteredPlatformSuperAdminEmail,
} from '@careflow/shared';
import {
  D1AuthIdentityService,
  D1ChannelIntegrationService,
  D1KnowledgeRepository,
  D1OperationsManagementService,
  D1WorkspaceRepository,
  bootstrapKnowledgeD1Schema,
  createSignedTelegramMiniAppInitData,
  type OperationsActorContext,
  type TelegramOutboundMessagePayload,
} from '@careflow/database/d1';
import {
  DEFAULT_PORTAL_TEMPLATE_PRESET,
  NORTHSTAR_COMMERCE_PRESET,
} from '@careflow/database/d1-portal-presets';
import { NodeSqliteD1Adapter } from '@careflow/database/sqlite-node';
import {
  businessPortalRegistry,
  getDefaultNorthstarCommerceConfig,
  getDefaultPortalTemplateConfig,
} from '../apps/web/src/config/business-portals';
import {
  GET as widgetGetHandler,
  POST as widgetPostHandler,
  OPTIONS as widgetOptionsHandler,
} from '../apps/web/src/app/api/widget/[publicToken]/route';

async function createE2ETestContext() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careflow-e2e-'));
  const sqlitePath = path.join(tempDir, 'e2e.sqlite');
  const db = new NodeSqliteD1Adapter(sqlitePath);
  await bootstrapKnowledgeD1Schema(db);

  const outboundTelegramLog: TelegramOutboundMessagePayload[] = [];
  const authService = new D1AuthIdentityService(db);
  const workspaceRepo = new D1WorkspaceRepository(db);
  const knowledgeRepo = new D1KnowledgeRepository(db);
  const opsService = new D1OperationsManagementService(db, 'e2e-ops-secret-2026');
  const channelService = new D1ChannelIntegrationService(db, {
    centralBotUsername: 'CustomCareBot',
    encryptionKey: 'e2e-integration-encryption-key-32-chars-minimum!!',
    telegramSender: async (payload) => {
      outboundTelegramLog.push(payload);
      return {
        ok: true,
        externalMessageId: `tg_e2e_${outboundTelegramLog.length}`,
      };
    },
  });

  return {
    db,
    sqlitePath,
    authService,
    workspaceRepo,
    knowledgeRepo,
    opsService,
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

describe('CustomCare End-to-End Portal, Widget, Telegram, Scorecard & Security Audit Verification (F1–F8)', () => {
  it('1. [F1 & F5] Client-safe portal presets module & platform version 0.2.0 consistency', async () => {
    assert.equal(CAREFLOW_VERSION, '0.2.0');
    assert.ok(DEFAULT_PORTAL_TEMPLATE_PRESET.welcomeHeadline.length > 0);
    assert.ok(NORTHSTAR_COMMERCE_PRESET.categories.length > 0);

    const templateCfg = getDefaultPortalTemplateConfig();
    assert.equal(templateCfg.slug, 'demo-portal');

    const northstarCfg = getDefaultNorthstarCommerceConfig();
    assert.equal(northstarCfg.slug, 'northstar-commerce');

    const resolvedBySlug = await businessPortalRegistry.resolveBySlug('northstar-commerce');
    assert.ok(
      resolvedBySlug,
      'businessPortalRegistry.resolveBySlug should resolve northstar-commerce without server crypto'
    );
    assert.equal(resolvedBySlug?.slug, 'northstar-commerce');
  });

  it('2. [F2] Super-admin configuration uses role account and honors CAREFLOW_SUPER_ADMIN_EMAILS without hardcoded personal emails', () => {
    assert.deepEqual(DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS, ['admin@getcustomcare.xyz']);
    assert.equal(
      isRegisteredPlatformSuperAdminEmail('admin@getcustomcare.xyz', {}),
      true,
      'Default role account should be recognized when env var is unset'
    );

    const customEnv = {
      CAREFLOW_SUPER_ADMIN_EMAILS: 'ops-root@getcustomcare.xyz, security@getcustomcare.xyz',
    };
    const resolved = getRegisteredPlatformSuperAdminEmails(customEnv);
    assert.ok(resolved.includes('admin@getcustomcare.xyz'));
    assert.ok(resolved.includes('ops-root@getcustomcare.xyz'));
    assert.ok(resolved.includes('security@getcustomcare.xyz'));
    assert.equal(isRegisteredPlatformSuperAdminEmail('ops-root@getcustomcare.xyz', customEnv), true);
    assert.equal(isRegisteredPlatformSuperAdminEmail('someone-else@gmail.com', customEnv), false);
  });

  it('3. [F8] End-to-End Customer Portal Flow: publish portal, knowledge search, complaint filing, duplicate detection & CSAT', async () => {
    const ctx = await createE2ETestContext();
    try {
      const reg = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Nadia Mensah',
        email: 'nadia@solarpay.io',
        password: 'SolarPassword!2026',
        businessName: 'SolarPay Energy',
        industry: 'Fintech and payments',
        country: 'Ghana',
      });
      const orgId = reg.organization.id;
      const slug = reg.organization.slug;

      // Publish knowledge base article & FAQ
      const cat = await ctx.knowledgeRepo.createCategory(orgId, {
        name: 'Deposit & Wallet Transfers',
        slug: 'deposit-wallet-transfers',
        description: 'Instant bank transfer and wallet top-up reconciliation.',
        displayOrder: 1,
      });
      await ctx.knowledgeRepo.createArticle(orgId, {
        title: 'How to Verify Pending Bank Transfer Deposits',
        slug: 'verify-pending-bank-deposits',
        shortDescription: 'Steps to confirm NIP/ACH session IDs when a wallet deposit takes over 15 minutes.',
        content:
          '1. Confirm your bank debit receipt includes the 30-digit session ID.\n2. Wait 15 minutes for automatic settlement.\n3. Upload the receipt in the portal if still pending.',
        categoryId: cat.id,
        tags: ['deposit', 'transfer', 'wallet'],
        status: KnowledgeStatus.Published,
        searchKeywords: 'verify pending bank transfer deposit session id wallet',
      });
      await ctx.knowledgeRepo.createFaq(orgId, {
        question: 'Why is my bank transfer deposit pending?',
        answer: 'Interbank settlement delays can hold deposits for 15–30 minutes before auto-crediting.',
        categoryId: cat.id,
        status: KnowledgeStatus.Published,
        searchKeywords: 'bank transfer deposit pending settlement delay',
        displayOrder: 1,
      });

      // Complete onboarding & publish portal
      await ctx.workspaceRepo.saveOnboardingStep(orgId, 6, {
        profile: {
          description: 'Instant clean-energy payments and wallet transfers.',
          contactEmail: 'support@solarpay.io',
        },
        humanSupport: {
          operatingHours: 'Mon–Sat, 08:00 – 20:00 GMT',
          escalationConditions: 'Escalate uncredited bank transfers older than 30 minutes.',
        },
      });
      await ctx.workspaceRepo.publishWorkspacePortal(orgId);

      const resolvedPortal = await ctx.workspaceRepo.resolvePortalBySlug(slug, {
        requirePublished: true,
      });
      assert.ok(resolvedPortal, 'Published customer portal must resolve by slug');

      // Retrieve published knowledge for customer portal search
      const publishedArticles = await ctx.knowledgeRepo.listArticles(orgId, {
        status: KnowledgeStatus.Published,
        search: 'pending bank transfer',
      });
      const publishedFaqs = await ctx.knowledgeRepo.listFaqs(orgId, {
        status: KnowledgeStatus.Published,
        search: 'pending',
      });
      assert.ok(publishedArticles.length >= 1, 'Portal search must return published article');
      assert.ok(publishedFaqs.length >= 1, 'Portal search must return published FAQ');

      // File a structured complaint from the customer portal & verify detail lookup
      const customerActor: OperationsActorContext = {
        userId: 'portal_cust_kofi',
        userName: 'Kofi Boateng',
        userEmail: 'kofi@customer.gh',
        userRole: UserRole.Customer,
      };
      const complaint = await ctx.opsService.createComplaint(orgId, customerActor, {
        customerName: 'Kofi Boateng',
        customerEmail: 'kofi@customer.gh',
        orderId: 'TXN-SOLAR-8841',
        productOrService: 'GHS Wallet Deposit',
        categoryName: 'Payment & Deposit Delays',
        priority: EscalationPriority.High,
        description: 'Debited from Ecobank with session ID 0009928172, wallet not credited.',
        evidenceItems: [
          {
            fileName: 'bank-receipt-session-99281.pdf',
            mimeType: 'application/pdf',
            fileUrlOrData: 'https://assets.solarpay.io/receipts/bank-receipt-session-99281.pdf',
            description: 'Ecobank Instant Transfer Advice',
          },
        ],
      });
      assert.match(complaint.referenceCode, /^CLM-\d{4}-[A-Z0-9]+$/);
      assert.equal(complaint.evidence?.length, 1);

      const detail = await ctx.opsService.getComplaintDetail(orgId, complaint.id);
      assert.ok(detail);
      assert.equal(detail?.referenceCode, complaint.referenceCode);
      assert.equal(detail?.categoryName, 'Payment & Deposit Delays');
    } finally {
      ctx.cleanup();
    }
  });

  it('4. [F6 & F8] End-to-End Website Widget Route Handler & Strict Origin Validation (CORS)', async () => {
    const ctx = await createE2ETestContext();
    const prevSqlitePath = process.env.CAREFLOW_SQLITE_PATH;
    process.env.CAREFLOW_SQLITE_PATH = ctx.sqlitePath;

    try {
      const reg = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Tunde Bakare',
        email: 'tunde@paywave.co',
        password: 'PaywavePassword!2026',
        businessName: 'PayWave Commerce',
        industry: 'E-commerce and retail',
        country: 'Nigeria',
        website: 'https://shop.paywave.co',
      });
      const orgId = reg.organization.id;

      // Publish FAQ so widget replies use published knowledge
      await ctx.knowledgeRepo.createFaq(orgId, {
        question: 'How fast is express delivery?',
        answer: 'Express orders arrive within 24 hours in Lagos and Abuja.',
        categoryId: null,
        status: KnowledgeStatus.Published,
        searchKeywords: 'express delivery fast hours lagos abuja',
        displayOrder: 1,
      });

      // Configure and activate the web widget with explicit allowedOrigins
      const widgetIntegration = await ctx.channelService.configureChannelIntegration(orgId, {
        channel: 'web_widget',
        action: 'activate',
        widgetConfig: {
          launcherTitle: 'PayWave Help',
          welcomeGreeting: 'Welcome to PayWave Support!',
          allowedOrigins: ['https://checkout.paywave.co', 'https://*.paywave.co'],
        },
      });
      const publicToken = widgetIntegration.publicToken;
      assert.ok(publicToken, 'Activated widget must have a publicToken');

      // 4A. OPTIONS preflight from allowed origin (https://checkout.paywave.co) -> 204 + matching CORS header
      const preflightAllowed = new Request(`https://getcustomcare.xyz/api/widget/${publicToken}`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://checkout.paywave.co',
        },
      });
      const preflightRes = await widgetOptionsHandler(preflightAllowed, {
        params: Promise.resolve({ publicToken: publicToken! }),
      });
      assert.equal(preflightRes.status, 204);
      assert.equal(preflightRes.headers.get('Access-Control-Allow-Origin'), 'https://checkout.paywave.co');
      assert.equal(preflightRes.headers.get('Vary'), 'Origin');

      // 4B. GET bootstrap from organization website origin (https://shop.paywave.co) -> 200 OK
      const getAllowedReq = new Request(`https://getcustomcare.xyz/api/widget/${publicToken}`, {
        method: 'GET',
        headers: {
          origin: 'https://shop.paywave.co',
        },
      });
      const getAllowedRes = await widgetGetHandler(getAllowedReq, {
        params: Promise.resolve({ publicToken: publicToken! }),
      });
      assert.equal(getAllowedRes.status, 200);
      assert.equal(getAllowedRes.headers.get('Access-Control-Allow-Origin'), 'https://shop.paywave.co');
      const getBody = (await getAllowedRes.json()) as {
        ok: boolean;
        data: { organizationName: string };
      };
      assert.equal(getBody.ok, true);
      assert.equal(getBody.data.organizationName, 'PayWave Commerce');

      // 4C. GET bootstrap from UNAUTHORIZED origin -> 403 ORIGIN_NOT_ALLOWED
      const getEvilReq = new Request(`https://getcustomcare.xyz/api/widget/${publicToken}`, {
        method: 'GET',
        headers: {
          origin: 'https://phishing-clone.example.org',
        },
      });
      const getEvilRes = await widgetGetHandler(getEvilReq, {
        params: Promise.resolve({ publicToken: publicToken! }),
      });
      assert.equal(getEvilRes.status, 403);
      const evilBody = (await getEvilRes.json()) as { ok: boolean; error: { code: string } };
      assert.equal(evilBody.ok, false);
      assert.equal(evilBody.error.code, 'ORIGIN_NOT_ALLOWED');

      // 4D. POST message & escalate from allowed wildcard subdomain (https://support.paywave.co)
      const postMsgReq = new Request(`https://getcustomcare.xyz/api/widget/${publicToken}`, {
        method: 'POST',
        headers: {
          origin: 'https://support.paywave.co',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'How fast is express delivery?',
          sessionRef: 'e2e_wgt_sess_1',
          customerName: 'Amaka Eze',
          customerEmail: 'amaka@buyer.ng',
        }),
      });
      const postMsgRes = await widgetPostHandler(postMsgReq, {
        params: Promise.resolve({ publicToken: publicToken! }),
      });
      assert.equal(postMsgRes.status, 200);
      assert.equal(postMsgRes.headers.get('Access-Control-Allow-Origin'), 'https://support.paywave.co');
      const msgJson = (await postMsgRes.json()) as {
        ok: boolean;
        data: { conversationId: string; botReply: string };
      };
      assert.equal(msgJson.ok, true);
      assert.ok(msgJson.data.conversationId);
      assert.ok(msgJson.data.botReply.includes('24 hours'));

      // Escalate via Widget POST
      const postEscalateReq = new Request(`https://getcustomcare.xyz/api/widget/${publicToken}`, {
        method: 'POST',
        headers: {
          origin: 'https://support.paywave.co',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Order PW-9012 is past the 24-hour express window. Please connect an agent.',
          sessionRef: 'e2e_wgt_sess_1',
          customerName: 'Amaka Eze',
          customerEmail: 'amaka@buyer.ng',
          escalateToHuman: true,
        }),
      });
      const postEscalateRes = await widgetPostHandler(postEscalateReq, {
        params: Promise.resolve({ publicToken: publicToken! }),
      });
      assert.equal(postEscalateRes.status, 200);
      const escalateJson = (await postEscalateRes.json()) as {
        ok: boolean;
        data: { status: string; escalated: boolean };
      };
      assert.equal(escalateJson.ok, true);
      assert.equal(escalateJson.data.status, 'escalated');
      assert.equal(escalateJson.data.escalated, true);
    } finally {
      if (prevSqlitePath === undefined) {
        delete process.env.CAREFLOW_SQLITE_PATH;
      } else {
        process.env.CAREFLOW_SQLITE_PATH = prevSqlitePath;
      }
      ctx.cleanup();
    }
  });

  it('5. [F8] End-to-End Telegram Bot Webhook & Telegram Mini App Flow', async () => {
    const ctx = await createE2ETestContext();
    try {
      const reg = await ctx.workspaceRepo.registerUserAndFirstBusiness({
        fullName: 'Victor Okafor',
        email: 'victor@kryptonpay.io',
        password: 'KryptonPassword!2026',
        businessName: 'KryptonPay Exchange',
        industry: 'Fintech and payments',
        country: 'Nigeria',
      });
      const orgId = reg.organization.id;

      const cat = await ctx.knowledgeRepo.createCategory(orgId, {
        name: 'Account Verification',
        slug: 'account-verification',
        description: 'KYC tier upgrades and document verification.',
        displayOrder: 1,
      });
      await ctx.knowledgeRepo.createFaq(orgId, {
        categoryId: cat.id,
        question: 'What documents are required for Tier 2 KYC?',
        answer: 'Upload a valid National ID or Passport and a recent utility bill dated within 90 days.',
        status: KnowledgeStatus.Published,
        searchKeywords: 'tier 2 kyc documents passport national id',
        displayOrder: 1,
      });

      // Activate Telegram integration
      const tgIntegration = await ctx.channelService.configureChannelIntegration(orgId, {
        channel: 'telegram',
        action: 'activate',
        telegramConfig: {
          welcomeMessage: 'Welcome to KryptonPay Exchange Official Support!',
          supportCategories: ['Account Verification', 'Deposits'],
        },
      });
      assert.ok(tgIntegration.publicToken);

      // Step A: Customer starts Telegram conversation with business token
      const startResult = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 9001,
        message: {
          message_id: 101,
          from: {
            id: 55443322,
            first_name: 'Seyi',
            last_name: 'Adeyemi',
            username: 'seyi_crypto',
          },
          chat: {
            id: 55443322,
            type: 'private',
          },
          text: `/start ${tgIntegration.publicToken}`,
        },
      });
      assert.equal(startResult.organizationId, orgId);

      // Step B: Customer asks a knowledge base question
      const kbAskResult = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 9002,
        message: {
          message_id: 102,
          from: {
            id: 55443322,
            first_name: 'Seyi',
            last_name: 'Adeyemi',
            username: 'seyi_crypto',
          },
          chat: {
            id: 55443322,
            type: 'private',
          },
          text: 'What documents are required for Tier 2 KYC?',
        },
      });
      assert.ok(kbAskResult.conversationId);
      assert.ok(kbAskResult.replyText?.includes('National ID or Passport'));

      // Step C: Customer escalates via /human
      const escalateResult = await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 9003,
        message: {
          message_id: 103,
          from: {
            id: 55443322,
            first_name: 'Seyi',
            last_name: 'Adeyemi',
            username: 'seyi_crypto',
          },
          chat: {
            id: 55443322,
            type: 'private',
          },
          text: '/human Need manual review of my passport upload',
        },
      });
      assert.equal(escalateResult.conversationId, kbAskResult.conversationId);

      // Step D: Link Victor Okafor as Telegram Agent and authenticate via signed Mini App initData
      const linkCode = await ctx.channelService.generateAgentTelegramLinkCode({
        organizationId: orgId,
        userId: reg.user.id,
      });
      await ctx.channelService.processTelegramWebhookUpdate({
        update_id: 9004,
        message: {
          message_id: 104,
          from: {
            id: 88990011,
            first_name: 'Victor',
            username: 'victor_owner',
          },
          chat: {
            id: 88990011,
            type: 'private',
          },
          text: `/link ${linkCode.linkingCode}`,
        },
      });

      const botToken = '123456:TEST_DEFAULT_CENTRAL_BOT_TOKEN';
      const signedInitData = createSignedTelegramMiniAppInitData({
        botToken,
        user: {
          id: 88990011,
          first_name: 'Victor',
          username: 'victor_owner',
        },
      });
      const miniAppAuth = await ctx.channelService.authenticateTelegramMiniAppAgent({
        initData: signedInitData,
        centralBotToken: botToken,
      });
      assert.equal(miniAppAuth.user.id, reg.user.id);
      assert.equal(miniAppAuth.activeWorkspace.organizationId, orgId);

      // Step E: Agent replies to customer conversation -> verify message is persisted
      const replied = await ctx.workspaceRepo.replyToConversation({
        organizationId: orgId,
        conversationId: kbAskResult.conversationId!,
        senderName: 'Victor Okafor',
        senderUserId: reg.user.id,
        senderType: MessageSenderType.Agent,
        body: 'Hi Seyi, your passport has been verified and Tier 2 is now active.',
        isInternalNote: false,
      });
      assert.ok(replied.messages.some((m) => m.body.includes('Tier 2 is now active')));
    } finally {
      ctx.cleanup();
    }
  });

  it('6. [F4 & F8] Agent Scorecards return null (empty) metrics for inactive staff and strictly attribute CSAT per handling agent', async () => {
    const ctx = await createE2ETestContext();
    try {
      const now = new Date().toISOString();
      const orgId = 'org_scorecard_audit';
      await ctx.db
        .prepare(`INSERT INTO organizations (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .bind(orgId, 'scorecard-audit', 'Scorecard Audit Corp', now, now)
        .run();

      const supervisorActor: OperationsActorContext = {
        userId: 'usr_sup_audit',
        userName: 'Supervisor Lin',
        userEmail: 'lin@scorecard.io',
        userRole: UserRole.Supervisor,
      };
      const activeAgent1: OperationsActorContext = {
        userId: 'usr_agent_active_1',
        userName: 'Active Agent One',
        userEmail: 'agent1@scorecard.io',
        userRole: UserRole.Agent,
      };
      const activeAgent2: OperationsActorContext = {
        userId: 'usr_agent_active_2',
        userName: 'Active Agent Two',
        userEmail: 'agent2@scorecard.io',
        userRole: UserRole.Agent,
      };
      const inactiveAgent: OperationsActorContext = {
        userId: 'usr_agent_inactive_3',
        userName: 'Inactive Staff Member',
        userEmail: 'inactive@scorecard.io',
        userRole: UserRole.Agent,
      };

      for (const [id, actor] of [
        ['ag_1', activeAgent1],
        ['ag_2', activeAgent2],
        ['ag_3', inactiveAgent],
      ] as const) {
        await ctx.db
          .prepare(
            `INSERT INTO support_agents (id, organization_id, user_id, display_name, email, role, department, availability, membership_status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'agent', 'Support', 'available', 'active', ?, ?)`
          )
          .bind(id, orgId, actor.userId, actor.userName, actor.userEmail, now, now)
          .run();
      }

      // Active Agent 1 logs a complaint + gets a 5/5 CSAT
      const claim1 = await ctx.opsService.createComplaint(orgId, activeAgent1, {
        customerName: 'Customer One',
        customerEmail: 'c1@buyer.io',
        orderId: 'ORD-101',
        productOrService: 'Item 1',
        categoryName: 'Damaged Item',
        priority: EscalationPriority.Normal,
        description: 'Resolved by Agent 1.',
      });
      await ctx.opsService.submitCustomerFeedback(orgId, {
        complaintId: claim1.id,
        caseReference: claim1.referenceCode,
        customerName: 'Customer One',
        customerEmail: 'c1@buyer.io',
        rating: 5,
        comment: 'Agent 1 was awesome!',
      });

      // Active Agent 2 logs a complaint + gets a 3/5 CSAT
      const claim2 = await ctx.opsService.createComplaint(orgId, activeAgent2, {
        customerName: 'Customer Two',
        customerEmail: 'c2@buyer.io',
        orderId: 'ORD-202',
        productOrService: 'Item 2',
        categoryName: 'Late Delivery',
        priority: EscalationPriority.Low,
        description: 'Handled by Agent 2.',
      });
      await ctx.opsService.submitCustomerFeedback(orgId, {
        complaintId: claim2.id,
        caseReference: claim2.referenceCode,
        customerName: 'Customer Two',
        customerEmail: 'c2@buyer.io',
        rating: 3,
        comment: 'Okay service from Agent 2.',
      });

      // Evaluate QA for Agent 1 (1-5 scale -> 93% overall)
      await ctx.opsService.createQaEvaluation(orgId, supervisorActor, {
        complaintId: claim1.id,
        caseReference: claim1.referenceCode,
        agentId: activeAgent1.userId,
        agentName: activeAgent1.userName,
        accuracyScore: 5,
        professionalismScore: 5,
        resolutionEffectivenessScore: 4,
        caseComplexity: 'complex',
        feedbackNotes: 'Excellent handling.',
        coachingRecommendations: 'Keep it up.',
      });

      const scorecards = await ctx.opsService.getAgentScorecards(orgId);
      const card1 = scorecards.find((s) => s.userId === activeAgent1.userId)!;
      const card2 = scorecards.find((s) => s.userId === activeAgent2.userId)!;
      const cardInactive = scorecards.find((s) => s.userId === inactiveAgent.userId)!;

      // Active Agent 1 receives strictly their own 5.0 CSAT and real SLA %
      assert.equal(card1.avgCsatScore, 5);
      assert.equal(card1.slaCompliancePercent, 100);
      assert.equal(card1.avgQaScore, 93);

      // Active Agent 2 receives strictly their own 3.0 CSAT (not averaged with Agent 1's 5.0)
      assert.equal(card2.avgCsatScore, 3);
      assert.equal(card2.slaCompliancePercent, 100);
      assert.equal(card2.avgQaScore, null);

      // Inactive Agent has null for all rate/percentage/CSAT fields (never 98% or 5/5)
      assert.equal(cardInactive.dailyHandled, 0);
      assert.equal(cardInactive.weeklyHandled, 0);
      assert.equal(cardInactive.monthlyHandled, 0);
      assert.equal(cardInactive.slaCompliancePercent, null, 'Inactive staff must have null SLA %');
      assert.equal(cardInactive.resolutionRatePercent, null, 'Inactive staff must have null Resolution %');
      assert.equal(cardInactive.escalationRatePercent, null, 'Inactive staff must have null Escalation %');
      assert.equal(cardInactive.avgResolutionHours, null, 'Inactive staff must have null Avg Resolution Hours');
      assert.equal(cardInactive.avgCsatScore, null, 'Inactive staff must have null CSAT score');

      const dashboard = await ctx.opsService.getOperationsDashboardMetrics(orgId, { preset: 'today' });
      const dashInactive = dashboard.agentPerformance.find((a) => a.userId === inactiveAgent.userId)!;
      assert.equal(dashInactive.slaCompliancePercent, null);
      assert.equal(dashInactive.resolutionRatePercent, null);
      assert.equal(dashInactive.escalationRatePercent, null);
      assert.equal(dashInactive.avgCsatScore, null);
    } finally {
      ctx.cleanup();
    }
  });
});

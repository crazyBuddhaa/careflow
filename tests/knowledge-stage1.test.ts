import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConversationStatus, KnowledgeStatus, UserRole } from '@careflow/shared';
import {
  CreateKnowledgeArticleSchema,
  CreateKnowledgeCategorySchema,
  CreateKnowledgeFaqSchema,
} from '@careflow/validation';
import {
  D1KnowledgeRepository,
  D1WorkspaceRepository,
  bootstrapKnowledgeD1Schema,
} from '@careflow/database/d1';
import { NodeSqliteD1Adapter } from '@careflow/database/sqlite-node';
import {
  KnowledgeDomainError,
  KnowledgeManagementService,
  type AuthSessionIdentity,
} from '@careflow/support-engine';

const ADMIN_ORG_A: AuthSessionIdentity = {
  userId: 'admin_uta_1',
  email: 'admin@ultimatetechapp.example',
  organizationId: 'org_ultimatetechapp',
  role: UserRole.Admin,
};

const ADMIN_ORG_B: AuthSessionIdentity = {
  userId: 'admin_ns_1',
  email: 'admin@northstar.example',
  organizationId: 'org_northstar_commerce',
  role: UserRole.Admin,
};

const AGENT_ORG_A: AuthSessionIdentity = {
  userId: 'agent_uta_1',
  email: 'agent@ultimatetechapp.example',
  organizationId: 'org_ultimatetechapp',
  role: UserRole.Agent,
};

async function createIsolatedTestService(sqlitePath = ':memory:') {
  const adapter = new NodeSqliteD1Adapter(sqlitePath);
  await bootstrapKnowledgeD1Schema(adapter);
  const repository = new D1KnowledgeRepository(adapter);
  const workspaceRepo = new D1WorkspaceRepository(adapter);
  const service = new KnowledgeManagementService(repository);

  // Seed test-only fixture organization for Org A isolation tests (not pre-seeded by production bootstrap)
  const existingUta = await workspaceRepo.resolvePortalBySlug('ultimatetechapp');
  if (!existingUta) {
    const now = '2026-04-01T10:00:00.000Z';

    await adapter
      .prepare(
        `INSERT OR IGNORE INTO organizations (id, slug, name, country, industry, onboarding_status, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'published', 1, ?, ?)`
      )
      .bind(
        'org_ultimatetechapp',
        'ultimatetechapp',
        'UltimateTechApp',
        'Nigeria',
        'Financial services',
        now,
        now
      )
      .run();

    const baseSettings = await workspaceRepo.getWorkspaceSettings('org_ultimatetechapp');
    await workspaceRepo.updateWorkspaceSettings('org_ultimatetechapp', {
      chatbot: {
        ...baseSettings.chatbot,
        supportedTopics: ['Deposit Assistance', 'Account & Login Help'],
        restrictedTopics: ['Investment or financial trading advice'],
      },
    });

    await adapter
      .prepare(
        `INSERT OR IGNORE INTO knowledge_categories (id, organization_id, slug, name, description, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'cat_uta_deposits',
        'org_ultimatetechapp',
        'deposit-assistance',
        'Deposit Assistance',
        'Payment confirmation timelines and transfer verification.',
        10,
        now,
        now
      )
      .run();

    await adapter
      .prepare(
        `INSERT OR IGNORE INTO knowledge_categories (id, organization_id, slug, name, description, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        'cat_uta_account',
        'org_ultimatetechapp',
        'account-login-help',
        'Account & Login Help',
        'Password resets and profile security.',
        20,
        now,
        now
      )
      .run();

    await adapter
      .prepare(
        `INSERT OR IGNORE INTO knowledge_articles
          (id, organization_id, category_id, slug, title, short_description, content, tags_json, status, search_keywords, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`
      )
      .bind(
        'art_uta_deposit_checklist',
        'org_ultimatetechapp',
        'cat_uta_deposits',
        'deposit-verification-checklist',
        'How to Verify a Pending Deposit or Transfer',
        'Step-by-step checklist when a bank transfer or card deposit has not reflected in your balance.',
        'Check your payment receipt reference and bank transfer status before escalating.',
        JSON.stringify(['Deposits', 'Payment Receipt', 'Reference']),
        'deposit verification checklist payment receipt reference bank transfer balance',
        now,
        now
      )
      .run();
  }

  return { adapter, repository, workspaceRepo, service };
}

test('1. Category creation, editing, duplicate slug guard, and safe deletion', async () => {
  const { adapter, service } = await createIsolatedTestService();
  try {
    const created = await service.createCategory(ADMIN_ORG_A, {
      name: 'Withdrawals & Payouts',
      slug: 'withdrawals-payouts',
      description: 'Settlement schedules and payout destination checks.',
      displayOrder: 50,
    });

    assert.equal(created.organizationId, 'org_ultimatetechapp');
    assert.equal(created.slug, 'withdrawals-payouts');
    assert.equal(created.name, 'Withdrawals & Payouts');

    // Duplicate slug within same organization is rejected
    await assert.rejects(
      () =>
        service.createCategory(ADMIN_ORG_A, {
          name: 'Withdrawals Duplicate',
          slug: 'withdrawals-payouts',
          description: 'Duplicate test',
          displayOrder: 60,
        }),
      (err: unknown) =>
        err instanceof KnowledgeDomainError && err.code === 'CONFLICT'
    );

    // Same slug in a DIFFERENT organization is allowed (tenant-scoped uniqueness)
    const orgBCategory = await service.createCategory(ADMIN_ORG_B, {
      name: 'Withdrawals & Payouts',
      slug: 'withdrawals-payouts',
      description: 'Northstar seller payouts',
      displayOrder: 20,
    });
    assert.equal(orgBCategory.organizationId, 'org_northstar_commerce');

    // Edit category
    const updated = await service.updateCategory(ADMIN_ORG_A, created.id, {
      name: 'Withdrawals and Settlements',
      description: 'Updated description for payout settlements.',
    });
    assert.equal(updated.name, 'Withdrawals and Settlements');

    // Attach an article to this category, then delete category -> article remains intact with null categoryId
    const article = await service.createArticle(ADMIN_ORG_A, {
      title: 'Checking Settlement Cut-Off Windows',
      shortDescription: 'Standard settlement processing windows for verified accounts.',
      content:
        'Settlements submitted before the daily cut-off window are processed the same business day.',
      categoryId: created.id,
      tags: ['settlements', 'payouts'],
      status: KnowledgeStatus.Draft,
    });
    assert.equal(article.categoryId, created.id);

    await service.deleteCategory(ADMIN_ORG_A, created.id);
    const reloadedArticle = await service.getArticle(ADMIN_ORG_A, article.id);
    assert.equal(reloadedArticle.categoryId, null);
  } finally {
    adapter.close();
  }
});

test('2. Article creation, editing, search/filter, publish/unpublish/archive, and deletion', async () => {
  const { adapter, service } = await createIsolatedTestService();
  try {
    const draftArticle = await service.createArticle(ADMIN_ORG_A, {
      title: 'Resolving Missing Bank Transfer References',
      shortDescription: 'How to submit proof of payment when a transfer omits your reference.',
      content:
        'Provide your bank transfer receipt showing the timestamp, sender name, and exact transfer amount so our team can reconcile the deposit.',
      categoryId: 'cat_uta_deposits',
      tags: ['Bank Transfer', 'Missing Reference'],
      status: KnowledgeStatus.Draft,
    });

    assert.equal(draftArticle.status, KnowledgeStatus.Draft);
    assert.equal(draftArticle.organizationId, 'org_ultimatetechapp');

    // Filter by Draft status
    const drafts = await service.listArticles(ADMIN_ORG_A, {
      status: KnowledgeStatus.Draft,
    });
    assert.equal(drafts.some((a) => a.id === draftArticle.id), true);

    // Search by keyword
    const searchHits = await service.listArticles(ADMIN_ORG_A, {
      search: 'reconcile',
    });
    assert.equal(searchHits.length, 1);
    assert.equal(searchHits[0]?.id, draftArticle.id);

    // Edit content and publish
    const published = await service.updateArticle(ADMIN_ORG_A, draftArticle.id, {
      title: 'Resolving Missing Transfer References Quickly',
      status: KnowledgeStatus.Published,
    });
    assert.equal(published.status, KnowledgeStatus.Published);
    assert.equal(published.title, 'Resolving Missing Transfer References Quickly');

    // Unpublish back to draft
    const unpublished = await service.updateArticle(ADMIN_ORG_A, draftArticle.id, {
      status: KnowledgeStatus.Draft,
    });
    assert.equal(unpublished.status, KnowledgeStatus.Draft);

    // Archive article
    const archived = await service.updateArticle(ADMIN_ORG_A, draftArticle.id, {
      status: KnowledgeStatus.Archived,
    });
    assert.equal(archived.status, KnowledgeStatus.Archived);

    // Delete article
    await service.deleteArticle(ADMIN_ORG_A, draftArticle.id);
    await assert.rejects(
      () => service.getArticle(ADMIN_ORG_A, draftArticle.id),
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'NOT_FOUND'
    );
  } finally {
    adapter.close();
  }
});

test('3. FAQ creation, editing, categorization, publish/archive, search, and deletion', async () => {
  const { adapter, service } = await createIsolatedTestService();
  try {
    const faq = await service.createFaq(ADMIN_ORG_A, {
      question: 'Can I update my registered account email address?',
      answer: 'Yes. Open Account Settings and verify your new email address to complete the update.',
      categoryId: 'cat_uta_account',
      status: KnowledgeStatus.Draft,
      displayOrder: 15,
    });

    assert.equal(faq.organizationId, 'org_ultimatetechapp');
    assert.equal(faq.status, KnowledgeStatus.Draft);
    assert.equal(faq.categoryId, 'cat_uta_account');

    const editedFaq = await service.updateFaq(ADMIN_ORG_A, faq.id, {
      answer: 'Yes. Visit Account Settings and confirm the verification link sent to your new email.',
      status: KnowledgeStatus.Published,
    });
    assert.equal(editedFaq.status, KnowledgeStatus.Published);

    const searchFaqs = await service.listFaqs(ADMIN_ORG_A, {
      search: 'verification link',
      categoryId: 'cat_uta_account',
    });
    assert.equal(searchFaqs.length, 1);
    assert.equal(searchFaqs[0]?.id, faq.id);

    const archivedFaq = await service.updateFaq(ADMIN_ORG_A, faq.id, {
      status: KnowledgeStatus.Archived,
    });
    assert.equal(archivedFaq.status, KnowledgeStatus.Archived);

    await service.deleteFaq(ADMIN_ORG_A, faq.id);
    const afterDelete = await service.listFaqs(ADMIN_ORG_A, { search: 'verification link' });
    assert.equal(afterDelete.length, 0);
  } finally {
    adapter.close();
  }
});

test('4. Input validation rejects malformed payloads via @careflow/validation', () => {
  const badArticle = CreateKnowledgeArticleSchema.safeParse({
    title: 'Hi',
    shortDescription: 'Too short',
    content: 'Short',
    tags: [],
    status: 'invalid_status',
  });
  assert.equal(badArticle.success, false);

  const badCategory = CreateKnowledgeCategorySchema.safeParse({
    name: 'A',
    slug: 'INVALID SLUG!!',
  });
  assert.equal(badCategory.success, false);

  const badFaq = CreateKnowledgeFaqSchema.safeParse({
    question: 'Why?',
    answer: 'No.',
  });
  assert.equal(badFaq.success, false);
});

test('5. Unauthorized and non-admin access prevention', async () => {
  const { adapter, service } = await createIsolatedTestService();
  try {
    // Null session -> UNAUTHORIZED
    await assert.rejects(
      () => service.listArticles(null),
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'UNAUTHORIZED'
    );

    // Agent role (below Admin) -> FORBIDDEN
    await assert.rejects(
      () =>
        service.createFaq(AGENT_ORG_A, {
          question: 'Should an agent without admin permissions create knowledge?',
          answer: 'No, knowledge mutations require business administrator authorization.',
          categoryId: null,
          status: KnowledgeStatus.Draft,
          displayOrder: 0,
        }),
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'FORBIDDEN'
    );
  } finally {
    adapter.close();
  }
});

test('6. Strict multi-business isolation & chatbot retrieval boundaries', async () => {
  const { adapter, service } = await createIsolatedTestService();
  try {
    // Org B cannot list Org A articles or FAQs
    const orgBArticles = await service.listArticles(ADMIN_ORG_B);
    assert.equal(
      orgBArticles.some((a) => a.organizationId === 'org_ultimatetechapp'),
      false
    );

    // Org B cannot fetch, edit, or delete Org A's seeded article
    await assert.rejects(
      () => service.getArticle(ADMIN_ORG_B, 'art_uta_deposit_checklist'),
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'NOT_FOUND'
    );

    await assert.rejects(
      () =>
        service.updateArticle(ADMIN_ORG_B, 'art_uta_deposit_checklist', {
          title: 'Cross-Tenant Tamper Attempt',
        }),
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'NOT_FOUND'
    );

    await assert.rejects(
      () => service.deleteArticle(ADMIN_ORG_B, 'art_uta_deposit_checklist'),
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'NOT_FOUND'
    );

    // Org B cannot assign Org A's category ID to an Org B article
    await assert.rejects(
      () =>
        service.createArticle(ADMIN_ORG_B, {
          title: 'Cross-Tenant Category Hijack Attempt',
          shortDescription: 'Trying to link an UltimateTechApp category to Northstar.',
          content: 'This must fail with INVALID_CATEGORY because cat_uta_deposits belongs to Org A.',
          categoryId: 'cat_uta_deposits',
          tags: [],
          status: KnowledgeStatus.Published,
        }),
      (err: unknown) => err instanceof KnowledgeDomainError && err.code === 'INVALID_CATEGORY'
    );

    // Create a Draft article in Org A containing "secretinternaldraft" — must NOT appear in chatbot retrieval
    await service.createArticle(ADMIN_ORG_A, {
      title: 'Internal Draft Procedure secretinternaldraft',
      shortDescription: 'Unpublished draft instructions.',
      content: 'This contains secretinternaldraft and must never be returned to customer retrieval.',
      categoryId: 'cat_uta_deposits',
      tags: ['internal'],
      status: KnowledgeStatus.Draft,
    });

    const draftRetrieval = await service.retrievePublishedKnowledge({
      organizationId: 'org_ultimatetechapp',
      query: 'secretinternaldraft',
    });
    assert.equal(draftRetrieval.length, 0);

    // Published knowledge in Org A IS returned for Org A, with source citations, and NEVER leaks Org B knowledge
    const utaMatches = await service.retrievePublishedKnowledge({
      organizationId: 'org_ultimatetechapp',
      query: 'deposit payment receipt reference',
    });
    assert.equal(utaMatches.length >= 1, true);
    assert.equal(
      utaMatches.every(
        (m) =>
          (m.citation.sourceType === 'article' || m.citation.sourceType === 'faq') &&
          m.citation.organizationId === 'org_ultimatetechapp'
      ),
      true
    );

    // Querying Org A for Northstar's published FAQ returns 0 matches
    const crossOrgMatches = await service.retrievePublishedKnowledge({
      organizationId: 'org_ultimatetechapp',
      query: 'northstar parcel dispatch',
    });
    assert.equal(crossOrgMatches.length, 0);

    // Category restriction filtering works for future restricted-topic enforcement
    const restrictedMatches = await service.retrievePublishedKnowledge({
      organizationId: 'org_ultimatetechapp',
      query: 'deposit payment receipt',
      excludedCategoryIds: ['cat_uta_deposits'],
    });
    assert.equal(restrictedMatches.length, 0);
  } finally {
    adapter.close();
  }
});

test('7. File-backed SQLite database persistence across connection restarts', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careflow-d1-test-'));
  const dbFilePath = path.join(tempDir, 'persistence.sqlite');

  try {
    const first = await createIsolatedTestService(dbFilePath);
    const createdFaq = await first.service.createFaq(ADMIN_ORG_B, {
      question: 'How long does Northstar standard parcel delivery take?',
      answer: 'Standard parcel delivery takes three to five business days after dispatch.',
      categoryId: 'cat_ns_orders',
      status: KnowledgeStatus.Published,
      displayOrder: 25,
    });
    first.adapter.close();

    // Reopen fresh adapter against the same SQLite file
    const second = await createIsolatedTestService(dbFilePath);
    const persistedFaqs = await second.service.listFaqs(ADMIN_ORG_B, {
      search: 'three to five business days',
    });
    assert.equal(persistedFaqs.length, 1);
    assert.equal(persistedFaqs[0]?.id, createdFaq.id);
    assert.equal(persistedFaqs[0]?.status, KnowledgeStatus.Published);
    second.adapter.close();
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('8. Multi-business support portals, settings updates, and new workspace onboarding', async () => {
  const { adapter, workspaceRepo } = await createIsolatedTestService();
  try {
    const portals = await workspaceRepo.listPublicPortals();
    assert.equal(portals.length >= 2, true);
    assert.equal(portals.some((p) => p.slug === 'ultimatetechapp'), true);
    assert.equal(portals.some((p) => p.slug === 'northstar-commerce'), true);

    const existingUta = await workspaceRepo.getWorkspaceSettings('org_ultimatetechapp');

    // Update UltimateTechApp chatbot greeting & branding without affecting Northstar
    const updatedUta = await workspaceRepo.updateWorkspaceSettings('org_ultimatetechapp', {
      branding: {
        ...existingUta.branding,
        accentTheme: 'teal-slate',
      },
      chatbot: {
        ...existingUta.chatbot,
        initialGreeting: 'Welcome to UltimateTechApp Verified Support. How can we assist?',
      },
    });
    assert.equal(updatedUta.branding.accentTheme, 'teal-slate');
    assert.equal(
      updatedUta.chatbot.initialGreeting,
      'Welcome to UltimateTechApp Verified Support. How can we assist?'
    );

    const northstar = await workspaceRepo.resolvePortalBySlug('northstar-commerce');
    assert.ok(northstar);
    assert.equal(northstar.branding.accentTheme, 'teal-slate');
    assert.equal(northstar.branding.displayName, 'Northstar Commerce');
    assert.notEqual(northstar.chatbot.initialGreeting, updatedUta.chatbot.initialGreeting);

    // Provision a brand-new business workspace
    const onboarded = await workspaceRepo.provisionNewBusinessWorkspace({
      businessName: 'Helios Cloud Systems',
      slug: 'helios-cloud',
      contactEmail: 'support@helioscloud.example',
      accentTheme: 'indigo-sky',
      welcomeHeadline: 'Fast answers for Helios Cloud customers.',
      welcomeDescription: 'Search infrastructure guides or connect with a cloud specialist.',
      initialGreeting: 'Hello! How can Helios Cloud support help you today?',
      supportedTopics: ['Cluster Provisioning', 'Invoice Reconciliation', 'API Tokens'],
      restrictedTopics: ['Legal advice', 'Tax filing advice'],
      communicationStyle: 'technical-precise',
    });
    assert.equal(onboarded.slug, 'helios-cloud');
    assert.equal(onboarded.displayName, 'Helios Cloud Systems');

    const resolvedHelios = await workspaceRepo.resolvePortalBySlug('helios-cloud');
    assert.ok(resolvedHelios);
    assert.equal(resolvedHelios.branding.displayName, 'Helios Cloud Systems');
    assert.equal(resolvedHelios.branding.accentTheme, 'indigo-sky');
  } finally {
    adapter.close();
  }
});

test('9. Natural-language chatbot response priority and restricted-topic boundaries', async () => {
  const { adapter, workspaceRepo } = await createIsolatedTestService();
  try {
    // Restricted topic is blocked immediately before retrieval
    const restrictedReply = await workspaceRepo.answerPortalQuestion(
      'ultimatetechapp',
      'Can you give me investment advice on which crypto asset to buy?'
    );
    assert.ok(restrictedReply);
    assert.equal(restrictedReply.resolutionLayer, 'boundary-guard');
    assert.equal(restrictedReply.suggestEscalation, false);

    // Knowledge-base / procedure match for UltimateTechApp deposit question
    const depositReply = await workspaceRepo.answerPortalQuestion(
      'ultimatetechapp',
      'My bank deposit payment receipt has not credited my balance yet'
    );
    assert.ok(depositReply);
    assert.equal(
      depositReply.resolutionLayer === 'knowledge-base' ||
        depositReply.resolutionLayer === 'guided-troubleshooting' ||
        depositReply.resolutionLayer === 'business-rules',
      true
    );

    // Cross-tenant query on UltimateTechApp for Northstar parcel dispatch does NOT leak Northstar articles
    const crossTenantReply = await workspaceRepo.answerPortalQuestion(
      'ultimatetechapp',
      'Where is my Northstar parcel courier dispatch tracking?'
    );
    assert.ok(crossTenantReply);
    assert.equal(
      crossTenantReply.matchedSourceTitle?.toLowerCase().includes('northstar') ?? false,
      false
    );
  } finally {
    adapter.close();
  }
});

test('10. Customer escalation, conversation queue, agent management, and analytics isolation', async () => {
  const { adapter, workspaceRepo } = await createIsolatedTestService();
  try {
    const utaBefore = await workspaceRepo.listConversations('org_ultimatetechapp');
    const nsBefore = await workspaceRepo.listConversations('org_northstar_commerce');

    const createdConv = await workspaceRepo.createEscalatedConversation({
      organizationId: 'org_ultimatetechapp',
      customerName: 'Tunde Adeyemi',
      customerEmail: 'tunde.adeyemi@example.com',
      subject: 'Missing instant transfer credit TXN-99412',
      category: 'Deposit Assistance',
      message: 'Transferred funds 45 minutes ago and have my PDF receipt ready.',
    });
    assert.equal(createdConv.organizationId, 'org_ultimatetechapp');
    assert.equal(createdConv.status, ConversationStatus.Escalated);

    const utaAfter = await workspaceRepo.listConversations('org_ultimatetechapp');
    const nsAfter = await workspaceRepo.listConversations('org_northstar_commerce');
    assert.equal(utaAfter.length, utaBefore.length + 1);
    assert.equal(nsAfter.length, nsBefore.length);

    // Reply as specialist and transition status
    const replied = await workspaceRepo.replyToConversation({
      organizationId: 'org_ultimatetechapp',
      conversationId: createdConv.id,
      senderName: 'Amara Okafor',
      body: 'Thank you Tunde. We have verified TXN-99412 and credited your wallet.',
      nextStatus: ConversationStatus.Resolved,
    });
    assert.equal(replied.status, ConversationStatus.Resolved);
    assert.equal(replied.messages.length, 2);

    // Cross-tenant reply attempt fails cleanly
    await assert.rejects(() =>
      workspaceRepo.replyToConversation({
        organizationId: 'org_northstar_commerce',
        conversationId: createdConv.id,
        senderName: 'Intruder',
        body: 'Should never succeed',
      })
    );

    // Specialist CRUD & analytics summary
    const specialist = await workspaceRepo.createAgent('org_ultimatetechapp', {
      displayName: 'Kemi Balogun',
      email: 'kemi.balogun@ultimatetechapp.example',
      role: UserRole.Agent,
      specialty: 'Deposit Escalations',
      availability: 'available',
    });
    assert.equal(specialist.organizationId, 'org_ultimatetechapp');

    const analytics = await workspaceRepo.getAnalyticsSummary('org_ultimatetechapp');
    assert.equal(analytics.organizationId, 'org_ultimatetechapp');
    assert.equal(analytics.conversations.resolved >= 1, true);
    assert.equal(analytics.knowledge.publishedArticles >= 1, true);
  } finally {
    adapter.close();
  }
});


import {
  ConversationStatus,
  EscalationPriority,
  MessageSenderType,
  SupportChannel,
  UserRole,
  type AgentAvailability,
  type BusinessOnboardingStatus,
  type BusinessPortalConfig,
  type CareFlowUserRecord,
  type CommunicationStyle,
  type OnboardingProgressReport,
  type OnboardingStepItemStatus,
  type PortalAccentTheme,
  type PortalAssistantResponseDto,
  type PortalFaqItem,
  type PortalKnowledgePreviewItem,
  type PublicPortalSummary,
  type SupportProcedureItem,
  type UserWorkspaceMembership,
  type WorkspaceAgentRecord,
  type WorkspaceAnalyticsSummary,
  type WorkspaceConversationItem,
  type WorkspaceCustomerRecord,
  type WorkspaceMessageItem,
} from '@careflow/shared';
import type { D1DatabaseLike } from './d1-types';
import {
  NORTHSTAR_COMMERCE_PRESET,
  ULTIMATE_TECH_APP_PRESET,
  buildDefaultPortalConfigForNewBusiness,
} from './d1-portal-presets';
import {
  generateSecureToken,
  hashPassword,
  hashTokenSha256,
  verifyPassword,
} from './password-auth';

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  country?: string;
  industry?: string;
  website?: string;
  onboarding_status?: string;
  onboarding_step?: number;
  created_by_user_id?: string | null;
  is_active: number;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  email_verified: number;
  mfa_enabled?: number;
  created_at: string;
  updated_at: string;
}

interface MemberJoinOrgRow {
  organization_id: string;
  slug: string;
  name: string;
  role: string;
  country: string | null;
  industry: string | null;
  website: string | null;
  onboarding_status: string | null;
  onboarding_step: number | null;
}

interface SettingsRow {
  organization_id: string;
  settings_json: string;
  updated_at: string;
}

interface PublishedArticleJoinRow {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  content: string;
  tags_json: string;
  updated_at: string;
  category_name: string | null;
}

interface PublishedFaqJoinRow {
  id: string;
  question: string;
  answer: string;
  category_id: string | null;
  category_name: string | null;
}

interface ConversationRow {
  id: string;
  organization_id: string;
  customer_name: string;
  customer_email: string;
  customer_external_ref: string;
  channel: string;
  status: string;
  priority: string;
  category: string;
  subject: string;
  assigned_agent_name: string | null;
  diagnostic_summary: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_type: string;
  sender_name: string;
  body: string;
  created_at: string;
}

interface AgentRow {
  id: string;
  organization_id: string;
  display_name: string;
  email: string;
  role: string;
  specialty: string;
  availability: string;
  created_at: string;
}

function createId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

function tokenizeWords(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function getFallbackPresetForOrg(org: OrgRow): BusinessPortalConfig {
  if (org.slug === 'ultimatetechapp') {
    return structuredClone(ULTIMATE_TECH_APP_PRESET);
  }
  if (org.slug === 'northstar-commerce') {
    return structuredClone(NORTHSTAR_COMMERCE_PRESET);
  }
  return buildDefaultPortalConfigForNewBusiness({
    organizationId: org.id,
    slug: org.slug,
    businessName: org.name,
    contactEmail: `support@${org.slug}.example`,
    accentTheme: 'blue-teal',
    welcomeHeadline: `How can ${org.name} help you today?`,
    welcomeDescription:
      'Browse guided answers, search published help articles, or connect with our human support team.',
    initialGreeting: `Welcome to ${org.name} Support! How can I assist you today?`,
    supportedTopics: ['Product support', 'Account enquiries', 'Billing assistance'],
    restrictedTopics: ['Unrelated off-topic questions'],
    communicationStyle: 'warm-helpful',
  });
}

export class D1WorkspaceRepository {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  private async getActiveOrgBySlug(slug: string): Promise<OrgRow | null> {
    const normalized = slug.trim().toLowerCase();
    return this.db
      .prepare(
        `SELECT id, slug, name, country, industry, website, onboarding_status, onboarding_step, created_by_user_id, is_active
         FROM organizations
         WHERE slug = ? AND is_active = 1`
      )
      .bind(normalized)
      .first<OrgRow>();
  }

  private async getActiveOrgById(organizationId: string): Promise<OrgRow | null> {
    return this.db
      .prepare(
        `SELECT id, slug, name, country, industry, website, onboarding_status, onboarding_step, created_by_user_id, is_active
         FROM organizations
         WHERE id = ? AND is_active = 1`
      )
      .bind(organizationId)
      .first<OrgRow>();
  }

  private async loadBaseSettingsForOrg(org: OrgRow): Promise<BusinessPortalConfig> {
    const row = await this.db
      .prepare(
        `SELECT organization_id, settings_json, updated_at
         FROM organization_portal_settings
         WHERE organization_id = ?`
      )
      .bind(org.id)
      .first<SettingsRow>();

    if (!row) {
      return getFallbackPresetForOrg(org);
    }

    try {
      const parsed = JSON.parse(row.settings_json) as BusinessPortalConfig;
      return {
        ...getFallbackPresetForOrg(org),
        ...parsed,
        organizationId: org.id,
        slug: org.slug,
      };
    } catch {
      return getFallbackPresetForOrg(org);
    }
  }

  private async hydrateLiveKnowledgeIntoPortal(
    org: OrgRow,
    baseConfig: BusinessPortalConfig
  ): Promise<BusinessPortalConfig> {
    const [articleRows, faqRows] = await Promise.all([
      this.db
        .prepare(
          `SELECT a.id, a.slug, a.title, a.short_description, a.content, a.tags_json, a.updated_at,
                  c.name AS category_name
           FROM knowledge_articles a
           LEFT JOIN knowledge_categories c
             ON a.category_id = c.id AND a.organization_id = c.organization_id
           WHERE a.organization_id = ? AND a.status = 'published'
           ORDER BY a.updated_at DESC`
        )
        .bind(org.id)
        .all<PublishedArticleJoinRow>(),
      this.db
        .prepare(
          `SELECT f.id, f.question, f.answer, f.category_id, c.name AS category_name
           FROM knowledge_faqs f
           LEFT JOIN knowledge_categories c
             ON f.category_id = c.id AND f.organization_id = c.organization_id
           WHERE f.organization_id = ? AND f.status = 'published'
           ORDER BY f.display_order ASC, f.updated_at DESC`
        )
        .bind(org.id)
        .all<PublishedFaqJoinRow>(),
    ]);

    const liveArticles: PortalKnowledgePreviewItem[] = articleRows.results.map((r) => {
      let tags: string[] = [];
      try {
        const parsed = JSON.parse(r.tags_json);
        if (Array.isArray(parsed)) {
          tags = parsed.filter((t): t is string => typeof t === 'string');
        }
      } catch {
        tags = [];
      }

      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        category: r.category_name ?? 'General',
        summary: r.short_description,
        content: r.content,
        tags,
        updatedAt: r.updated_at,
      };
    });

    const liveFaqs: PortalFaqItem[] = faqRows.results.map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
      categoryId: f.category_id ?? 'general',
      categoryName: f.category_name ?? 'General',
    }));

    return {
      ...baseConfig,
      onboardingStatus: (org.onboarding_status as BusinessOnboardingStatus) ?? 'published',
      publishedKnowledge:
        liveArticles.length > 0 ? liveArticles : baseConfig.publishedKnowledge,
      faqs: liveFaqs.length > 0 ? liveFaqs : baseConfig.faqs,
    };
  }

  async resolvePortalBySlug(slug: string): Promise<BusinessPortalConfig | null> {
    const org = await this.getActiveOrgBySlug(slug);
    if (!org) {
      return null;
    }
    const base = await this.loadBaseSettingsForOrg(org);
    return this.hydrateLiveKnowledgeIntoPortal(org, base);
  }

  async resolvePortalByHostname(hostname: string): Promise<BusinessPortalConfig | null> {
    const normalizedHost = hostname.trim().toLowerCase().split(':')[0] ?? '';
    if (!normalizedHost) return null;

    const { results: orgs } = await this.db
      .prepare(
        `SELECT id, slug, name, is_active
         FROM organizations
         WHERE is_active = 1`
      )
      .all<OrgRow>();

    for (const org of orgs) {
      const base = await this.loadBaseSettingsForOrg(org);
      if (
        base.verifiedHostnames.some((h) => h.toLowerCase() === normalizedHost) ||
        normalizedHost === `${org.slug}.getcustomcare.xyz` ||
        normalizedHost === `${org.slug}.careflow.com` ||
        normalizedHost === `${org.slug}.localhost`
      ) {
        return this.hydrateLiveKnowledgeIntoPortal(org, base);
      }
    }
    return null;
  }

  async listPublicPortals(): Promise<PublicPortalSummary[]> {
    const { results: orgs } = await this.db
      .prepare(
        `SELECT id, slug, name, is_active
         FROM organizations
         WHERE is_active = 1
         ORDER BY created_at ASC, name ASC`
      )
      .all<OrgRow>();

    const summaries: PublicPortalSummary[] = [];

    for (const org of orgs) {
      const [base, artCountRow, faqCountRow] = await Promise.all([
        this.loadBaseSettingsForOrg(org),
        this.db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM knowledge_articles
             WHERE organization_id = ? AND status = 'published'`
          )
          .bind(org.id)
          .first<{ cnt: number }>(),
        this.db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM knowledge_faqs
             WHERE organization_id = ? AND status = 'published'`
          )
          .bind(org.id)
          .first<{ cnt: number }>(),
      ]);

      summaries.push({
        organizationId: org.id,
        slug: org.slug,
        displayName: base.branding.displayName,
        portalSubtitle: base.branding.portalSubtitle,
        welcomeHeadline: base.welcomeHeadline,
        accentTheme: base.branding.accentTheme,
        verifiedHostname: base.verifiedHostnames[0] ?? `${org.slug}.getcustomcare.xyz`,
        publishedArticleCount: Number(artCountRow?.cnt ?? 0),
        publishedFaqCount: Number(faqCountRow?.cnt ?? 0),
      });
    }

    return summaries;
  }

  async getWorkspaceSettings(organizationId: string): Promise<BusinessPortalConfig> {
    const org = await this.getActiveOrgById(organizationId);
    if (!org) {
      throw new Error('Organization workspace not found.');
    }
    const base = await this.loadBaseSettingsForOrg(org);
    return this.hydrateLiveKnowledgeIntoPortal(org, base);
  }

  async updateWorkspaceSettings(
    organizationId: string,
    patch: {
      contactEmail?: string;
      supportHours?: string;
      verifiedHostnames?: string[];
      branding?: BusinessPortalConfig['branding'];
      welcomeHeadline?: string;
      welcomeDescription?: string;
      primaryCtaLabel?: string;
      secondaryCtaLabel?: string;
      chatbot?: Omit<BusinessPortalConfig['chatbot'], 'nodes'>;
      escalation?: Omit<
        BusinessPortalConfig['escalation'],
        'customerTriggerPrompt' | 'targetNodeId'
      >;
      procedures?: SupportProcedureItem[];
    }
  ): Promise<BusinessPortalConfig> {
    const org = await this.getActiveOrgById(organizationId);
    if (!org) {
      throw new Error('Organization workspace not found.');
    }

    const existing = await this.loadBaseSettingsForOrg(org);
    const now = new Date().toISOString();

    const nextGreeting =
      patch.chatbot?.initialGreeting ?? existing.chatbot.initialGreeting;

    const existingRootNode = existing.chatbot.nodes.root;
    const updatedNodes = {
      ...existing.chatbot.nodes,
      ...(existingRootNode
        ? {
            root: {
              ...existingRootNode,
              reply: nextGreeting,
            },
          }
        : {}),
    };

    const merged: BusinessPortalConfig = {
      ...existing,
      contactEmail: patch.contactEmail ?? existing.contactEmail,
      supportHours: patch.supportHours ?? existing.supportHours,
      verifiedHostnames: patch.verifiedHostnames ?? existing.verifiedHostnames,
      branding: patch.branding ?? existing.branding,
      welcomeHeadline: patch.welcomeHeadline ?? existing.welcomeHeadline,
      welcomeDescription: patch.welcomeDescription ?? existing.welcomeDescription,
      primaryCtaLabel: patch.primaryCtaLabel ?? existing.primaryCtaLabel,
      secondaryCtaLabel: patch.secondaryCtaLabel ?? existing.secondaryCtaLabel,
      procedures: patch.procedures ?? existing.procedures ?? [],
      chatbot: patch.chatbot
        ? {
            ...existing.chatbot,
            ...patch.chatbot,
            nodes: updatedNodes,
          }
        : existing.chatbot,
      escalation: patch.escalation
        ? {
            ...existing.escalation,
            ...patch.escalation,
          }
        : existing.escalation,
    };

    await this.db
      .prepare(
        `INSERT INTO organization_portal_settings (organization_id, settings_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT (organization_id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = excluded.updated_at`
      )
      .bind(org.id, JSON.stringify(merged), now)
      .run();

    if (patch.branding?.displayName && patch.branding.displayName !== org.name) {
      await this.db
        .prepare(`UPDATE organizations SET name = ?, updated_at = ? WHERE id = ?`)
        .bind(patch.branding.displayName, now, org.id)
        .run();
    }

    return this.hydrateLiveKnowledgeIntoPortal(
      { ...org, name: patch.branding?.displayName ?? org.name },
      merged
    );
  }

  async provisionNewBusinessWorkspace(input: {
    businessName: string;
    slug: string;
    contactEmail: string;
    accentTheme: PortalAccentTheme;
    welcomeHeadline: string;
    welcomeDescription: string;
    initialGreeting: string;
    supportedTopics: string[];
    restrictedTopics: string[];
    communicationStyle: CommunicationStyle;
  }): Promise<{ organizationId: string; slug: string; displayName: string }> {
    const slug = input.slug.trim().toLowerCase();
    const reservedSlugs = new Set(['www', 'app', 'admin', 'api', 'portal', 'portals', 'login', 'onboarding']);
    if (reservedSlugs.has(slug)) {
      throw new Error(`The portal slug "${slug}" is reserved by CustomCare.`);
    }

    const existing = await this.db
      .prepare(`SELECT id FROM organizations WHERE slug = ?`)
      .bind(slug)
      .first<{ id: string }>();

    if (existing) {
      throw new Error(`A business workspace with slug "${slug}" already exists.`);
    }

    const organizationId = `org_${slug.replace(/-/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO organizations (id, slug, name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`
      )
      .bind(organizationId, slug, input.businessName, now, now)
      .run();

    const portalConfig = buildDefaultPortalConfigForNewBusiness({
      organizationId,
      slug,
      businessName: input.businessName,
      contactEmail: input.contactEmail,
      accentTheme: input.accentTheme,
      welcomeHeadline: input.welcomeHeadline,
      welcomeDescription: input.welcomeDescription,
      initialGreeting: input.initialGreeting,
      supportedTopics: input.supportedTopics,
      restrictedTopics: input.restrictedTopics,
      communicationStyle: input.communicationStyle,
    });

    await this.db
      .prepare(
        `INSERT INTO organization_portal_settings (organization_id, settings_json, updated_at)
         VALUES (?, ?, ?)`
      )
      .bind(organizationId, JSON.stringify(portalConfig), now)
      .run();

    // Seed starter categories, article, FAQ, and admin specialist for the new business
    const primaryCatId = createId('cat');
    const primaryTopic = input.supportedTopics[0] ?? 'General Support';
    const primarySlug = primaryTopic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'general-support';

    await this.db
      .prepare(
        `INSERT INTO knowledge_categories
           (id, organization_id, slug, name, description, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 10, ?, ?)`
      )
      .bind(
        primaryCatId,
        organizationId,
        primarySlug,
        primaryTopic,
        `Published guidance and FAQs for ${primaryTopic}.`,
        now,
        now
      )
      .run();

    await this.db
      .prepare(
        `INSERT INTO knowledge_articles
           (id, organization_id, category_id, slug, title, short_description, content, tags_json, status, search_keywords, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`
      )
      .bind(
        createId('art'),
        organizationId,
        primaryCatId,
        `getting-started-with-${slug}`,
        `Getting Started with ${input.businessName} Support`,
        `How to find answers and request assistance on the ${input.businessName} customer portal.`,
        `Welcome to ${input.businessName}'s official support portal.\n\n1. Browse help topics or ask a natural-language question in the support assistant.\n2. Follow step-by-step guided checks for ${input.supportedTopics.join(', ')}.\n3. Submit an escalation request anytime you need a human specialist.`,
        JSON.stringify(['getting-started', slug]),
        `getting started ${input.businessName.toLowerCase()} ${input.supportedTopics.join(' ').toLowerCase()}`,
        now,
        now
      )
      .run();

    await this.db
      .prepare(
        `INSERT INTO knowledge_faqs
           (id, organization_id, category_id, question, answer, status, search_keywords, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'published', ?, 10, ?, ?)`
      )
      .bind(
        createId('faq'),
        organizationId,
        primaryCatId,
        `How do I reach a human specialist at ${input.businessName}?`,
        `Use the guided assistant or click Contact Support to submit your question directly to ${input.businessName}'s support queue (${input.contactEmail}).`,
        `human specialist contact support ${input.businessName.toLowerCase()}`,
        now,
        now
      )
      .run();

    await this.db
      .prepare(
        `INSERT INTO support_agents
           (id, organization_id, display_name, email, role, specialty, availability, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', ?, 'available', ?, ?)`
      )
      .bind(
        createId('agt'),
        organizationId,
        `${input.businessName} Lead Admin`,
        input.contactEmail,
        primaryTopic,
        now,
        now
      )
      .run();

    return {
      organizationId,
      slug,
      displayName: input.businessName,
    };
  }

  /* =========================================================================
     Natural-Language & Priority-Ordered Portal Assistant Engine
     Priority: 1. Business Boundaries -> 2. Approved FAQs & KB -> 3. Procedures -> 4. Escalation
  ========================================================================= */
  async answerPortalQuestion(
    slug: string,
    rawQuestion: string
  ): Promise<PortalAssistantResponseDto | null> {
    const portal = await this.resolvePortalBySlug(slug);
    if (!portal) {
      return null;
    }

    const questionLower = rawQuestion.trim().toLowerCase();
    const queryWords = tokenizeWords(rawQuestion);

    // 1. Business Boundary Guard (Restricted Topics)
    for (const restricted of portal.chatbot.restrictedTopics) {
      const restrictedTokens = tokenizeWords(restricted).filter(
        (t) => !['unrelated', 'general', 'external', 'questions', 'advice', 'topics'].includes(t)
      );
      if (
        restrictedTokens.length > 0 &&
        restrictedTokens.some((tok) => questionLower.includes(tok))
      ) {
        return {
          reply: `I can only assist with ${portal.branding.displayName} topics (${portal.chatbot.supportedTopics.slice(0, 3).join(', ')}). I'm not able to answer questions regarding ${restricted.toLowerCase()}.`,
          resolutionLayer: 'boundary-guard',
          suggestEscalation: false,
        };
      }
    }

    // Direct human escalation intent check
    if (
      /\b(human|agent|person|representative|specialist|talk to someone|live support)\b/i.test(
        questionLower
      )
    ) {
      return {
        reply: `Certainly. Use the "Send to Human Support" button right below to share your details with ${portal.branding.displayName}'s team—your conversation context will be included automatically.`,
        resolutionLayer: 'human-escalation',
        suggestEscalation: true,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    // 2. Approved FAQ & Published Knowledge Base Retrieval
    let bestFaq: { item: PortalFaqItem; score: number } | null = null;
    for (const faq of portal.faqs) {
      const hay = `${faq.question} ${faq.answer}`.toLowerCase();
      let score = 0;
      for (const w of queryWords) {
        if (faq.question.toLowerCase().includes(w)) score += 3;
        else if (hay.includes(w)) score += 1;
      }
      if (score > (bestFaq?.score ?? 0)) {
        bestFaq = { item: faq, score };
      }
    }

    let bestArticle: { item: PortalKnowledgePreviewItem; score: number } | null = null;
    for (const art of portal.publishedKnowledge) {
      const hay = `${art.title} ${art.summary} ${art.content ?? ''} ${(art.tags ?? []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const w of queryWords) {
        if (art.title.toLowerCase().includes(w)) score += 3;
        else if (art.summary.toLowerCase().includes(w)) score += 2;
        else if (hay.includes(w)) score += 1;
      }
      if (score > (bestArticle?.score ?? 0)) {
        bestArticle = { item: art, score };
      }
    }

    // 3. Guided Troubleshooting Procedures Match
    let bestProc: { item: SupportProcedureItem; score: number } | null = null;
    for (const proc of portal.procedures ?? []) {
      if (!proc.isPublished) continue;
      let score = 0;
      for (const phrase of proc.triggerPhrases) {
        if (questionLower.includes(phrase.toLowerCase())) {
          score += 5;
        }
      }
      const procHay = `${proc.title} ${proc.category}`.toLowerCase();
      for (const w of queryWords) {
        if (procHay.includes(w)) score += 2;
      }
      if (score > (bestProc?.score ?? 0)) {
        bestProc = { item: proc, score };
      }
    }

    if (bestProc && bestProc.score >= 5 && bestProc.score >= (bestFaq?.score ?? 0)) {
      const formattedSteps = bestProc.item.steps
        .map((s) => `${s.stepNumber}. ${s.instruction}`)
        .join(' ');
      return {
        reply: `${bestProc.item.title}: ${formattedSteps} If this does not resolve the issue, you can escalate directly to human support below.`,
        resolutionLayer: 'guided-troubleshooting',
        matchedSourceTitle: bestProc.item.title,
        suggestEscalation: true,
        suggestedTopic: bestProc.item.category,
      };
    }

    if (bestFaq && bestFaq.score >= 3 && bestFaq.score >= (bestArticle?.score ?? 0)) {
      return {
        reply: bestFaq.item.answer,
        resolutionLayer: 'business-rules',
        matchedSourceTitle: bestFaq.item.question,
        suggestEscalation: false,
        suggestedTopic: bestFaq.item.categoryName ?? 'General',
      };
    }

    if (bestArticle && bestArticle.score >= 3) {
      const snippet = bestArticle.item.content
        ? bestArticle.item.content.split('\n\n')[0] ?? bestArticle.item.summary
        : bestArticle.item.summary;
      return {
        reply: `${bestArticle.item.summary} — ${snippet}`,
        resolutionLayer: 'knowledge-base',
        matchedSourceTitle: bestArticle.item.title,
        matchedArticleSlug: bestArticle.item.slug,
        suggestEscalation: false,
        suggestedTopic: bestArticle.item.category,
      };
    }

    // 4/5. Safe Fallback -> Offer Supported Topics or Human Escalation (Never hallucinate!)
    return {
      reply: `I don't see a verified article matching that exact question in ${portal.branding.displayName}'s knowledge base. I can help with ${portal.chatbot.supportedTopics.join(', ')}, or pass your question directly to a human support representative.`,
      resolutionLayer: 'human-escalation',
      suggestEscalation: true,
      suggestedTopic: portal.categories[0]?.title ?? 'General Support',
    };
  }

  /* =========================================================================
     Workspace Operations: Conversations, Messages, Customers, Agents, Analytics
  ========================================================================= */

  async listConversations(
    organizationId: string,
    filters?: { status?: string; search?: string }
  ): Promise<WorkspaceConversationItem[]> {
    const clauses = ['organization_id = ?'];
    const params: unknown[] = [organizationId];

    if (filters?.status && filters.status !== 'all') {
      clauses.push('status = ?');
      params.push(filters.status);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      clauses.push(
        '(LOWER(subject) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_email) LIKE ? OR LOWER(category) LIKE ?)'
      );
      params.push(q, q, q, q);
    }

    const { results: convRows } = await this.db
      .prepare(
        `SELECT *
         FROM support_conversations
         WHERE ${clauses.join(' AND ')}
         ORDER BY updated_at DESC`
      )
      .bind(...params)
      .all<ConversationRow>();

    if (convRows.length === 0) {
      return [];
    }

    const { results: msgRows } = await this.db
      .prepare(
        `SELECT *
         FROM support_messages
         WHERE organization_id = ?
         ORDER BY created_at ASC`
      )
      .bind(organizationId)
      .all<MessageRow>();

    const messagesByConv = new Map<string, WorkspaceMessageItem[]>();
    for (const m of msgRows) {
      const list = messagesByConv.get(m.conversation_id) ?? [];
      list.push({
        id: m.id,
        conversationId: m.conversation_id,
        senderType: m.sender_type as MessageSenderType,
        senderName: m.sender_name,
        body: m.body,
        createdAt: m.created_at,
      });
      messagesByConv.set(m.conversation_id, list);
    }

    return convRows.map((c) => ({
      id: c.id,
      organizationId: c.organization_id,
      customerName: c.customer_name,
      customerEmail: c.customer_email,
      customerExternalRef: c.customer_external_ref,
      channel: c.channel as SupportChannel,
      status: c.status as ConversationStatus,
      priority: c.priority as EscalationPriority,
      category: c.category,
      subject: c.subject,
      assignedAgentName: c.assigned_agent_name,
      diagnosticSummary: c.diagnostic_summary,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      messages: messagesByConv.get(c.id) ?? [],
    }));
  }

  async createEscalatedConversation(params: {
    organizationId: string;
    customerName: string;
    customerEmail: string;
    customerExternalRef?: string;
    channel?: SupportChannel;
    status?: ConversationStatus;
    priority?: EscalationPriority;
    category: string;
    subject: string;
    message: string;
    transcriptSummary?: string;
  }): Promise<WorkspaceConversationItem> {
    const now = new Date().toISOString();
    const convId = createId('conv');

    // Auto-assign an available specialist if one exists in this organization
    const availableAgent = await this.db
      .prepare(
        `SELECT display_name FROM support_agents
         WHERE organization_id = ? AND availability = 'available'
         ORDER BY created_at ASC LIMIT 1`
      )
      .bind(params.organizationId)
      .first<{ display_name: string }>();

    const status = params.status ?? ConversationStatus.Escalated;
    const channel = params.channel ?? SupportChannel.Portal;
    const priority = params.priority ?? EscalationPriority.Normal;
    const assignedAgentName = availableAgent?.display_name ?? null;

    await this.db
      .prepare(
        `INSERT INTO support_conversations
           (id, organization_id, customer_name, customer_email, customer_external_ref, channel, status, priority, category, subject, assigned_agent_name, diagnostic_summary, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        convId,
        params.organizationId,
        params.customerName,
        params.customerEmail,
        params.customerExternalRef ?? '',
        channel,
        status,
        priority,
        params.category,
        params.subject,
        assignedAgentName,
        params.transcriptSummary ?? '',
        now,
        now
      )
      .run();

    if (params.transcriptSummary && params.transcriptSummary.trim().length > 0) {
      await this.db
        .prepare(
          `INSERT INTO support_messages
             (id, conversation_id, organization_id, sender_type, sender_name, body, created_at)
           VALUES (?, ?, ?, 'system', 'CareFlow Handoff Context', ?, ?)`
        )
        .bind(
          createId('msg'),
          convId,
          params.organizationId,
          `Attached guided support context: ${params.transcriptSummary.trim()}`,
          now
        )
        .run();
    }

    await this.db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, body, created_at)
         VALUES (?, ?, ?, 'customer', ?, ?, ?)`
      )
      .bind(
        createId('msg'),
        convId,
        params.organizationId,
        params.customerName,
        params.message,
        now
      )
      .run();

    const list = await this.listConversations(params.organizationId);
    const created = list.find((c) => c.id === convId);
    if (!created) {
      throw new Error('Failed to load newly created support conversation.');
    }
    return created;
  }

  async replyToConversation(params: {
    organizationId: string;
    conversationId: string;
    senderName: string;
    body: string;
    nextStatus?: ConversationStatus;
  }): Promise<WorkspaceConversationItem> {
    const existing = await this.db
      .prepare(
        `SELECT id, status FROM support_conversations
         WHERE id = ? AND organization_id = ?`
      )
      .bind(params.conversationId, params.organizationId)
      .first<{ id: string; status: string }>();

    if (!existing) {
      throw new Error('Conversation not found in this business workspace.');
    }

    const now = new Date().toISOString();
    const targetStatus = params.nextStatus ?? (existing.status as ConversationStatus);

    await this.db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, body, created_at)
         VALUES (?, ?, ?, 'agent', ?, ?, ?)`
      )
      .bind(
        createId('msg'),
        params.conversationId,
        params.organizationId,
        params.senderName,
        params.body,
        now
      )
      .run();

    await this.db
      .prepare(
        `UPDATE support_conversations
         SET status = ?, assigned_agent_name = COALESCE(assigned_agent_name, ?), updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(targetStatus, params.senderName, now, params.conversationId, params.organizationId)
      .run();

    const list = await this.listConversations(params.organizationId);
    const updated = list.find((c) => c.id === params.conversationId);
    if (!updated) {
      throw new Error('Failed to reload updated conversation.');
    }
    return updated;
  }

  async updateConversationStatus(params: {
    organizationId: string;
    conversationId: string;
    status: ConversationStatus;
    assignedAgentName?: string | null;
  }): Promise<WorkspaceConversationItem> {
    const existing = await this.db
      .prepare(
        `SELECT id, assigned_agent_name FROM support_conversations
         WHERE id = ? AND organization_id = ?`
      )
      .bind(params.conversationId, params.organizationId)
      .first<{ id: string; assigned_agent_name: string | null }>();

    if (!existing) {
      throw new Error('Conversation not found in this business workspace.');
    }

    const now = new Date().toISOString();
    const nextAgent =
      params.assignedAgentName !== undefined
        ? params.assignedAgentName
        : existing.assigned_agent_name;

    await this.db
      .prepare(
        `UPDATE support_conversations
         SET status = ?, assigned_agent_name = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(params.status, nextAgent, now, params.conversationId, params.organizationId)
      .run();

    const list = await this.listConversations(params.organizationId);
    const updated = list.find((c) => c.id === params.conversationId);
    if (!updated) {
      throw new Error('Failed to reload updated conversation.');
    }
    return updated;
  }

  async listCustomers(organizationId: string, search?: string): Promise<WorkspaceCustomerRecord[]> {
    const conversations = await this.listConversations(organizationId);
    const byEmail = new Map<string, WorkspaceCustomerRecord>();

    for (const conv of conversations) {
      const key = conv.customerEmail.toLowerCase();
      const existing = byEmail.get(key);
      const isOpen =
        conv.status !== ConversationStatus.Resolved && conv.status !== ConversationStatus.Closed;

      if (!existing) {
        byEmail.set(key, {
          id: `cust_${key.replace(/[^a-z0-9]/g, '').slice(0, 12)}`,
          organizationId,
          displayName: conv.customerName,
          email: conv.customerEmail,
          externalRef: conv.customerExternalRef,
          preferredChannel: conv.channel,
          totalConversations: 1,
          openConversations: isOpen ? 1 : 0,
          lastInteractionAt: conv.updatedAt,
        });
      } else {
        existing.totalConversations += 1;
        if (isOpen) existing.openConversations += 1;
        if (conv.updatedAt > existing.lastInteractionAt) {
          existing.lastInteractionAt = conv.updatedAt;
        }
        if (!existing.externalRef && conv.customerExternalRef) {
          existing.externalRef = conv.customerExternalRef;
        }
      }
    }

    let records = Array.from(byEmail.values()).sort((a, b) =>
      b.lastInteractionAt.localeCompare(a.lastInteractionAt)
    );

    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      records = records.filter(
        (r) =>
          r.displayName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.externalRef.toLowerCase().includes(q)
      );
    }

    return records;
  }

  async listAgents(organizationId: string): Promise<WorkspaceAgentRecord[]> {
    const [{ results: agentRows }, { results: openCounts }] = await Promise.all([
      this.db
        .prepare(
          `SELECT * FROM support_agents
           WHERE organization_id = ?
           ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'supervisor' THEN 2 ELSE 3 END, display_name ASC`
        )
        .bind(organizationId)
        .all<AgentRow>(),
      this.db
        .prepare(
          `SELECT assigned_agent_name, COUNT(*) AS cnt
           FROM support_conversations
           WHERE organization_id = ? AND status NOT IN ('resolved', 'closed') AND assigned_agent_name IS NOT NULL
           GROUP BY assigned_agent_name`
        )
        .bind(organizationId)
        .all<{ assigned_agent_name: string; cnt: number }>(),
    ]);

    const loadMap = new Map<string, number>();
    for (const row of openCounts) {
      loadMap.set(row.assigned_agent_name, Number(row.cnt));
    }

    return agentRows.map((a) => ({
      id: a.id,
      organizationId: a.organization_id,
      displayName: a.display_name,
      email: a.email,
      role: a.role as WorkspaceAgentRecord['role'],
      specialty: a.specialty,
      availability: a.availability as AgentAvailability,
      activeConversations: loadMap.get(a.display_name) ?? 0,
      createdAt: a.created_at,
    }));
  }

  async createAgent(
    organizationId: string,
    input: {
      displayName: string;
      email: string;
      role: UserRole.Agent | UserRole.Supervisor | UserRole.Admin;
      specialty: string;
      availability: AgentAvailability;
    }
  ): Promise<WorkspaceAgentRecord> {
    const now = new Date().toISOString();
    const id = createId('agt');

    await this.db
      .prepare(
        `INSERT INTO support_agents
           (id, organization_id, display_name, email, role, specialty, availability, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        organizationId,
        input.displayName,
        input.email.toLowerCase(),
        input.role,
        input.specialty,
        input.availability,
        now,
        now
      )
      .run();

    const agents = await this.listAgents(organizationId);
    const created = agents.find((a) => a.id === id);
    if (!created) throw new Error('Failed to load created specialist.');
    return created;
  }

  async updateAgent(
    organizationId: string,
    agentId: string,
    patch: {
      role?: UserRole.Agent | UserRole.Supervisor | UserRole.Admin;
      specialty?: string;
      availability?: AgentAvailability;
    }
  ): Promise<WorkspaceAgentRecord> {
    const existing = await this.db
      .prepare(`SELECT * FROM support_agents WHERE id = ? AND organization_id = ?`)
      .bind(agentId, organizationId)
      .first<AgentRow>();

    if (!existing) {
      throw new Error('Support specialist not found in this workspace.');
    }

    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE support_agents
         SET role = ?, specialty = ?, availability = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(
        patch.role ?? existing.role,
        patch.specialty ?? existing.specialty,
        patch.availability ?? existing.availability,
        now,
        agentId,
        organizationId
      )
      .run();

    const agents = await this.listAgents(organizationId);
    const updated = agents.find((a) => a.id === agentId);
    if (!updated) throw new Error('Failed to reload specialist.');
    return updated;
  }

  async deleteAgent(organizationId: string, agentId: string): Promise<void> {
    await this.db
      .prepare(`DELETE FROM support_agents WHERE id = ? AND organization_id = ?`)
      .bind(agentId, organizationId)
      .run();
  }

  async getAnalyticsSummary(organizationId: string): Promise<WorkspaceAnalyticsSummary> {
    const [settings, articlesAgg, faqsAgg, catCount, convAgg, channelAgg, topCatAgg, agents] =
      await Promise.all([
        this.getWorkspaceSettings(organizationId),
        this.db
          .prepare(
            `SELECT status, COUNT(*) AS cnt FROM knowledge_articles
             WHERE organization_id = ? GROUP BY status`
          )
          .bind(organizationId)
          .all<{ status: string; cnt: number }>(),
        this.db
          .prepare(
            `SELECT status, COUNT(*) AS cnt FROM knowledge_faqs
             WHERE organization_id = ? GROUP BY status`
          )
          .bind(organizationId)
          .all<{ status: string; cnt: number }>(),
        this.db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM knowledge_categories WHERE organization_id = ?`
          )
          .bind(organizationId)
          .first<{ cnt: number }>(),
        this.db
          .prepare(
            `SELECT status, COUNT(*) AS cnt FROM support_conversations
             WHERE organization_id = ? GROUP BY status`
          )
          .bind(organizationId)
          .all<{ status: string; cnt: number }>(),
        this.db
          .prepare(
            `SELECT channel, COUNT(*) AS cnt FROM support_conversations
             WHERE organization_id = ? GROUP BY channel ORDER BY cnt DESC`
          )
          .bind(organizationId)
          .all<{ channel: string; cnt: number }>(),
        this.db
          .prepare(
            `SELECT category, COUNT(*) AS cnt FROM support_conversations
             WHERE organization_id = ? GROUP BY category ORDER BY cnt DESC LIMIT 6`
          )
          .bind(organizationId)
          .all<{ category: string; cnt: number }>(),
        this.listAgents(organizationId),
      ]);

    const artMap = new Map(articlesAgg.results.map((r) => [r.status, Number(r.cnt)]));
    const faqMap = new Map(faqsAgg.results.map((r) => [r.status, Number(r.cnt)]));
    const convMap = new Map(convAgg.results.map((r) => [r.status, Number(r.cnt)]));

    const publishedArticles = artMap.get('published') ?? 0;
    const draftArticles = artMap.get('draft') ?? 0;
    const archivedArticles = artMap.get('archived') ?? 0;

    const publishedFaqs = faqMap.get('published') ?? 0;
    const draftFaqs = faqMap.get('draft') ?? 0;
    const archivedFaqs = faqMap.get('archived') ?? 0;

    const open = convMap.get('open') ?? 0;
    const troubleshooting = convMap.get('troubleshooting') ?? 0;
    const escalated = convMap.get('escalated') ?? 0;
    const resolved = (convMap.get('resolved') ?? 0) + (convMap.get('closed') ?? 0);

    return {
      organizationId,
      knowledge: {
        totalArticles: publishedArticles + draftArticles + archivedArticles,
        publishedArticles,
        draftArticles,
        totalFaqs: publishedFaqs + draftFaqs + archivedFaqs,
        publishedFaqs,
        totalCategories: Number(catCount?.cnt ?? 0),
        publishedProcedures: (settings.procedures ?? []).filter((p) => p.isPublished).length,
      },
      conversations: {
        total: open + troubleshooting + escalated + resolved,
        open,
        troubleshooting,
        escalated,
        resolved,
      },
      channels: channelAgg.results.map((r) => ({
        channel: r.channel as SupportChannel,
        count: Number(r.cnt),
      })),
      topCategories: topCatAgg.results.map((r) => ({
        category: r.category,
        count: Number(r.cnt),
      })),
      team: {
        totalSpecialists: agents.length,
        availableSpecialists: agents.filter((a) => a.availability === 'available').length,
      },
    };
  }

  /* -------------------------------------------------------------------------
   * Multi-Business Account & Workspace Management
   * ------------------------------------------------------------------------- */

  async registerUserAndFirstBusiness(input: {
    fullName: string;
    email: string;
    password: string;
    businessName: string;
    industry: string;
    country: string;
    website?: string;
    requireEmailVerification?: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    user: CareFlowUserRecord;
    organization: {
      id: string;
      slug: string;
      name: string;
      role: UserRole;
      country: string;
      industry: string;
      website?: string;
      onboardingStatus: BusinessOnboardingStatus;
    };
    verificationToken: string;
    verificationExpiresAt: string;
  }> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string }>();

    if (existingUser) {
      throw new Error('An account with this email address already exists. Please sign in.');
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const userId = `usr_${Math.random().toString(36).slice(2, 10)}`;
    const passwordHash = hashPassword(input.password);
    const initialVerifiedFlag = input.requireEmailVerification ? 0 : 1;

    await this.db
      .prepare(
        `INSERT INTO users (id, email, full_name, password_hash, email_verified, mfa_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .bind(userId, email, input.fullName.trim(), passwordHash, initialVerifiedFlag, now, now)
      .run();

    // Generate cryptographically random single-use email verification token (store only SHA-256 hash)
    const { rawToken: verificationToken, tokenHash } = generateSecureToken(32);
    const verificationExpiresAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();

    await this.db
      .prepare(
        `INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, used_at, created_at)
         VALUES (?, ?, ?, 'email_verification', ?, NULL, ?)`
      )
      .bind(createId('tok'), userId, tokenHash, verificationExpiresAt, now)
      .run();

    // Generate unique slug
    let baseSlug = input.businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36);
    if (!baseSlug || ['admin', 'api', 'login', 'onboarding', 'portals', 'www'].includes(baseSlug)) {
      baseSlug = `biz-${Math.random().toString(36).slice(2, 6)}`;
    }

    let finalSlug = baseSlug;
    const existingOrg = await this.db
      .prepare(`SELECT id FROM organizations WHERE slug = ?`)
      .bind(finalSlug)
      .first<{ id: string }>();

    if (existingOrg) {
      finalSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const organizationId = `org_${finalSlug.replace(/-/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;
    const website = input.website?.trim() ?? '';

    await this.db
      .prepare(
        `INSERT INTO organizations
          (id, slug, name, country, industry, website, onboarding_status, onboarding_step, created_by_user_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'incomplete', 1, ?, 1, ?, ?)`
      )
      .bind(
        organizationId,
        finalSlug,
        input.businessName.trim(),
        input.country.trim(),
        input.industry.trim(),
        website,
        userId,
        now,
        now
      )
      .run();

    // Assign registering user as owner of the organization
    const memberId = `mem_${Math.random().toString(36).slice(2, 10)}`;
    await this.db
      .prepare(
        `INSERT INTO organization_members
          (id, organization_id, user_id, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 1, ?, ?)`
      )
      .bind(memberId, organizationId, userId, now, now)
      .run();

    // Record account registration security event
    await this.db
      .prepare(
        `INSERT INTO auth_security_events
           (id, user_id, organization_id, event_type, ip_address, user_agent, metadata_json, created_at)
         VALUES (?, ?, ?, 'account_registered', ?, ?, ?, ?)`
      )
      .bind(
        createId('sec'),
        userId,
        organizationId,
        input.ipAddress ?? '',
        input.userAgent ?? '',
        JSON.stringify({ businessName: input.businessName.trim() }),
        now
      )
      .run();

    // Initialize default portal settings
    const portalConfig = buildDefaultPortalConfigForNewBusiness({
      organizationId,
      slug: finalSlug,
      businessName: input.businessName.trim(),
      contactEmail: email,
      accentTheme: 'blue-teal',
      welcomeHeadline: `Welcome to ${input.businessName.trim()} Support`,
      welcomeDescription: '',
      initialGreeting: `Hi! Welcome to ${input.businessName.trim()} support center. What can I help you with today?`,
      supportedTopics: ['General Questions', 'Service Support', 'Account Inquiries'],
      restrictedTopics: ['Unrelated third-party topics'],
      communicationStyle: 'warm-helpful',
    });

    await this.db
      .prepare(
        `INSERT INTO organization_portal_settings (organization_id, settings_json, updated_at)
         VALUES (?, ?, ?)`
      )
      .bind(organizationId, JSON.stringify(portalConfig), now)
      .run();

    // Seed empty knowledge category & owner support agent entry
    const initialCatId = `cat_${Math.random().toString(36).slice(2, 10)}`;
    await this.db
      .prepare(
        `INSERT INTO knowledge_categories
          (id, organization_id, slug, name, description, display_order, created_at, updated_at)
         VALUES (?, ?, 'general', 'General Support', 'Core guidance and general information.', 10, ?, ?)`
      )
      .bind(initialCatId, organizationId, now, now)
      .run();

    const agentId = `agt_${Math.random().toString(36).slice(2, 10)}`;
    await this.db
      .prepare(
        `INSERT INTO support_agents
          (id, organization_id, display_name, email, role, specialty, availability, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'admin', 'Primary Administrator', 'available', ?, ?)`
      )
      .bind(agentId, organizationId, input.fullName.trim(), email, now, now)
      .run();

    return {
      user: {
        id: userId,
        email,
        fullName: input.fullName.trim(),
        emailVerified: Boolean(initialVerifiedFlag),
        mfaEnabled: false,
        createdAt: now,
      },
      organization: {
        id: organizationId,
        slug: finalSlug,
        name: input.businessName.trim(),
        role: UserRole.Owner,
        country: input.country.trim(),
        industry: input.industry.trim(),
        website,
        onboardingStatus: 'incomplete',
      },
      verificationToken,
      verificationExpiresAt,
    };
  }

  async authenticateUser(
    emailInput: string,
    passwordInput: string
  ): Promise<{
    user: CareFlowUserRecord;
    activeMembership: UserWorkspaceMembership;
    workspaces: UserWorkspaceMembership[];
  } | null> {
    const email = emailInput.trim().toLowerCase();
    const userRow = await this.db
      .prepare(
        `SELECT id, email, full_name, password_hash, email_verified, mfa_enabled, created_at, updated_at
         FROM users WHERE email = ?`
      )
      .bind(email)
      .first<UserRow>();

    if (!userRow) {
      return null;
    }

    const isValid = verifyPassword(passwordInput, userRow.password_hash);
    if (!isValid) {
      return null;
    }

    const workspaces = await this.getUserWorkspaces(userRow.id);
    if (workspaces.length === 0) {
      return null;
    }

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        emailVerified: Boolean(userRow.email_verified),
        mfaEnabled: Boolean(userRow.mfa_enabled),
        createdAt: userRow.created_at,
      },
      activeMembership: workspaces[0],
      workspaces,
    };
  }

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
           o.onboarding_step
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = ? AND om.is_active = 1 AND o.is_active = 1
         ORDER BY o.name ASC`
      )
      .bind(userId)
      .all<MemberJoinOrgRow>();

    return results.map((r) => ({
      organizationId: r.organization_id,
      organizationSlug: r.slug,
      organizationName: r.name,
      role: (r.role as UserRole) || UserRole.Admin,
      country: r.country ?? 'United States',
      industry: r.industry ?? 'Technology',
      website: r.website ?? '',
      onboardingStatus: (r.onboarding_status as BusinessOnboardingStatus) ?? 'incomplete',
      onboardingStep: r.onboarding_step ?? 1,
    }));
  }

  async getUserActiveMembership(
    userId: string,
    organizationId: string
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
           o.onboarding_step
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = ? AND om.organization_id = ? AND om.is_active = 1 AND o.is_active = 1`
      )
      .bind(userId, organizationId)
      .first<MemberJoinOrgRow>();

    if (!row) return null;

    return {
      organizationId: row.organization_id,
      organizationSlug: row.slug,
      organizationName: row.name,
      role: (row.role as UserRole) || UserRole.Admin,
      country: row.country ?? 'United States',
      industry: row.industry ?? 'Technology',
      website: row.website ?? '',
      onboardingStatus: (row.onboarding_status as BusinessOnboardingStatus) ?? 'incomplete',
      onboardingStep: row.onboarding_step ?? 1,
    };
  }

  async createAdditionalBusinessForUser(
    userId: string,
    input: {
      businessName: string;
      industry: string;
      country: string;
      website?: string;
    }
  ): Promise<UserWorkspaceMembership> {
    const user = await this.db
      .prepare(`SELECT id, email, full_name FROM users WHERE id = ?`)
      .bind(userId)
      .first<UserRow>();

    if (!user) {
      throw new Error('User account not found.');
    }

    const now = new Date().toISOString();
    let baseSlug = input.businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36);
    if (!baseSlug || ['admin', 'api', 'login', 'onboarding', 'portals', 'www'].includes(baseSlug)) {
      baseSlug = `biz-${Math.random().toString(36).slice(2, 6)}`;
    }

    let finalSlug = baseSlug;
    const existing = await this.db
      .prepare(`SELECT id FROM organizations WHERE slug = ?`)
      .bind(finalSlug)
      .first<{ id: string }>();

    if (existing) {
      finalSlug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const organizationId = `org_${finalSlug.replace(/-/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;
    const website = input.website?.trim() ?? '';

    await this.db
      .prepare(
        `INSERT INTO organizations
          (id, slug, name, country, industry, website, onboarding_status, onboarding_step, created_by_user_id, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'incomplete', 1, ?, 1, ?, ?)`
      )
      .bind(
        organizationId,
        finalSlug,
        input.businessName.trim(),
        input.country.trim(),
        input.industry.trim(),
        website,
        userId,
        now,
        now
      )
      .run();

    const memberId = `mem_${Math.random().toString(36).slice(2, 10)}`;
    await this.db
      .prepare(
        `INSERT INTO organization_members
          (id, organization_id, user_id, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 1, ?, ?)`
      )
      .bind(memberId, organizationId, userId, now, now)
      .run();

    const portalConfig = buildDefaultPortalConfigForNewBusiness({
      organizationId,
      slug: finalSlug,
      businessName: input.businessName.trim(),
      contactEmail: user.email,
      accentTheme: 'blue-teal',
      welcomeHeadline: `Welcome to ${input.businessName.trim()} Support`,
      welcomeDescription: '',
      initialGreeting: `Hi! Welcome to ${input.businessName.trim()} support. How can we help you?`,
      supportedTopics: ['General Questions', 'Service Support'],
      restrictedTopics: ['Unrelated third-party topics'],
      communicationStyle: 'warm-helpful',
    });

    await this.db
      .prepare(
        `INSERT INTO organization_portal_settings (organization_id, settings_json, updated_at)
         VALUES (?, ?, ?)`
      )
      .bind(organizationId, JSON.stringify(portalConfig), now)
      .run();

    return {
      organizationId,
      organizationSlug: finalSlug,
      organizationName: input.businessName.trim(),
      role: UserRole.Owner,
      country: input.country.trim(),
      industry: input.industry.trim(),
      website,
      onboardingStatus: 'incomplete',
      onboardingStep: 1,
    };
  }

  async switchUserActiveWorkspace(
    userId: string,
    targetOrganizationId: string
  ): Promise<UserWorkspaceMembership> {
    const membership = await this.getUserActiveMembership(userId, targetOrganizationId);
    if (!membership) {
      throw new Error('You do not have active membership in this workspace.');
    }
    return membership;
  }

  /* -------------------------------------------------------------------------
   * 7-Step Guided Onboarding Progress & Publishing
   * ------------------------------------------------------------------------- */

  async getOnboardingProgress(organizationId: string): Promise<OnboardingProgressReport> {
    const org = await this.getActiveOrgById(organizationId);
    if (!org) {
      throw new Error('Organization workspace not found.');
    }

    const settings = await this.loadBaseSettingsForOrg(org);
    const [articleCount, faqCount, agentCount] = await Promise.all([
      this.db
        .prepare(`SELECT COUNT(*) AS total FROM knowledge_articles WHERE organization_id = ?`)
        .bind(organizationId)
        .first<{ total: number }>(),
      this.db
        .prepare(`SELECT COUNT(*) AS total FROM knowledge_faqs WHERE organization_id = ?`)
        .bind(organizationId)
        .first<{ total: number }>(),
      this.db
        .prepare(`SELECT COUNT(*) AS total FROM support_agents WHERE organization_id = ?`)
        .bind(organizationId)
        .first<{ total: number }>(),
    ]);

    const totalArticles = Number(articleCount?.total ?? 0);
    const totalFaqs = Number(faqCount?.total ?? 0);
    const totalAgents = Number(agentCount?.total ?? 0);

    // Step 1: Profile (Requires business description and contact email)
    const profileComplete = Boolean(
      (org.country && org.country.trim().length > 0) &&
      (org.industry && org.industry.trim().length > 0) &&
      (settings.contactEmail && settings.contactEmail.includes('@')) &&
      (settings.welcomeDescription && settings.welcomeDescription.trim().length >= 10)
    );

    // Step 2: Branding
    const brandingComplete = Boolean(
      settings.branding.displayName.trim().length >= 2 &&
      settings.branding.accentTheme &&
      settings.welcomeHeadline.trim().length >= 4
    );

    // Step 3: Support Configuration
    const supportConfigComplete = Boolean(
      settings.chatbot.supportedTopics.length >= 1 &&
      settings.categories.length >= 1
    );

    // Step 4: Knowledge Base Setup (at least 1 article or FAQ created)
    const knowledgeBaseComplete = totalArticles > 0 || totalFaqs > 0;

    // Step 5: Human Support Configuration (Operating hours must come from business itself)
    const humanSupportComplete = Boolean(
      settings.supportHours && settings.supportHours.trim().length >= 3
    );

    // Step 6: Chatbot Configuration
    const chatbotComplete = Boolean(
      settings.chatbot.assistantName.trim().length >= 2 &&
      settings.chatbot.initialGreeting.trim().length >= 4 &&
      settings.chatbot.supportedTopics.length >= 1
    );

    // Step 7: Publishing status
    const isPublished = org.onboarding_status === 'published';

    const missingRequirements: string[] = [];
    if (!profileComplete) missingRequirements.push('Complete business profile and description.');
    if (!brandingComplete) missingRequirements.push('Configure brand display name and welcome headline.');
    if (!supportConfigComplete) missingRequirements.push('Define at least one supported support topic.');
    if (!humanSupportComplete) missingRequirements.push('Configure operating hours or human support escalation.');
    if (!chatbotComplete) missingRequirements.push('Configure assistant display name and initial greeting.');

    const canPublish = missingRequirements.length === 0;

    let computedStatus: BusinessOnboardingStatus = (org.onboarding_status as BusinessOnboardingStatus) || 'incomplete';
    if (computedStatus === 'incomplete') {
      if (org.onboarding_step && org.onboarding_step > 1) {
        computedStatus = canPublish ? 'ready_to_publish' : 'in_progress';
      }
    } else if (computedStatus !== 'published' && computedStatus !== 'suspended') {
      computedStatus = canPublish ? 'ready_to_publish' : 'in_progress';
    }

    const steps: OnboardingStepItemStatus[] = [
      {
        step: 1,
        id: 'business-profile',
        title: 'Complete Business Profile',
        description: 'Provide your business description, dedicated support email, country, and primary industry.',
        completed: profileComplete,
        isOptional: false,
        summary: profileComplete
          ? `${org.name} · ${org.industry} · ${org.country}`
          : 'Profile information incomplete',
      },
      {
        step: 2,
        id: 'branding',
        title: 'Business Branding',
        description: 'Customize support portal colors, logo presentation, welcome headline, and display name.',
        completed: brandingComplete,
        isOptional: false,
        summary: brandingComplete
          ? `Portal: ${settings.branding.displayName} (${settings.branding.accentTheme})`
          : 'Branding not fully customized',
      },
      {
        step: 3,
        id: 'support-configuration',
        title: 'Support Configuration',
        description: 'Define supported products, issue types, languages, and handled topics.',
        completed: supportConfigComplete,
        isOptional: false,
        summary: `${settings.chatbot.supportedTopics.length} supported topics configured`,
      },
      {
        step: 4,
        id: 'knowledge-base',
        title: 'Knowledge Base Setup',
        description: 'Add knowledge articles and FAQs. Your assistant relies on approved business information.',
        completed: knowledgeBaseComplete,
        isOptional: false,
        summary: knowledgeBaseComplete
          ? `${totalArticles} articles · ${totalFaqs} FAQs available`
          : 'Knowledge base is currently empty (assistant relies on approved docs)',
      },
      {
        step: 5,
        id: 'human-support',
        title: 'Human Support Configuration',
        description: 'Set operating hours, time zone, escalation conditions, and specialist coverage.',
        completed: humanSupportComplete,
        isOptional: false,
        summary: humanSupportComplete
          ? `${settings.supportHours || 'Escalation configured'} · ${totalAgents} specialists`
          : 'Operating hours and escalation rules pending',
      },
      {
        step: 6,
        id: 'chatbot-configuration',
        title: 'Assistant Configuration',
        description: 'Set assistant display name, greeting, communication tone, and approved topics.',
        completed: chatbotComplete,
        isOptional: false,
        summary: `${settings.chatbot.assistantName} (${settings.chatbot.communicationStyle})`,
      },
      {
        step: 7,
        id: 'test-and-publish',
        title: 'Test and Publish Support Portal',
        description: 'Preview portal, test guided assistant responses, and publish your branded portal live.',
        completed: isPublished,
        isOptional: false,
        summary: isPublished
          ? 'Portal is live and published'
          : canPublish
            ? 'Ready for final review and publication'
            : `${missingRequirements.length} required setup items remaining`,
      },
    ];

    const completedStepsCount = steps.filter((s) => s.completed).length;
    const completionPercentage = Math.round((completedStepsCount / steps.length) * 100);

    return {
      organizationId,
      organizationName: org.name,
      organizationSlug: org.slug,
      country: org.country ?? 'United States',
      industry: org.industry ?? 'Technology',
      website: org.website ?? '',
      status: computedStatus,
      currentStep: org.onboarding_step ?? 1,
      completedStepsCount,
      totalStepsCount: steps.length,
      completionPercentage,
      canPublish,
      missingRequirements,
      steps,
      lastSavedAt: new Date().toISOString(),
    };
  }

  async saveOnboardingStep(
    organizationId: string,
    step: number,
    data: {
      profile?: {
        description?: string;
        contactEmail?: string;
        country?: string;
        industry?: string;
        website?: string;
        phoneNumber?: string;
        address?: string;
        socialLinks?: Record<string, string>;
      };
      branding?: {
        displayName?: string;
        logoText?: string;
        logoUrl?: string;
        accentTheme?: PortalAccentTheme;
        primaryColor?: string;
        secondaryColor?: string;
        welcomeMessage?: string;
      };
      supportConfig?: {
        supportedProducts?: string[];
        handledIssues?: string[];
        supportedTopics?: string[];
        restrictedTopics?: string[];
        languages?: string[];
        communicationStyle?: CommunicationStyle;
      };
      humanSupport?: {
        contactInfo?: string;
        operatingHours?: string;
        timezone?: string;
        escalationConditions?: string;
        humanSupportAvailable?: boolean;
      };
      chatbot?: {
        assistantName?: string;
        greetingMessage?: string;
        communicationStyle?: CommunicationStyle;
        supportedLanguages?: string[];
        approvedTopics?: string[];
        restrictedTopics?: string[];
        escalationRules?: string | string[];
        aiProviderConfigured?: boolean;
      };
    }
  ): Promise<OnboardingProgressReport> {
    const org = await this.getActiveOrgById(organizationId);
    if (!org) {
      throw new Error('Organization workspace not found.');
    }

    const currentSettings = await this.loadBaseSettingsForOrg(org);
    const now = new Date().toISOString();

    // 1. Update organizations table columns if provided in profile
    if (data.profile) {
      const country = data.profile.country?.trim() || org.country || 'United States';
      const industry = data.profile.industry?.trim() || org.industry || 'Technology';
      const website = data.profile.website?.trim() ?? org.website ?? '';

      await this.db
        .prepare(
          `UPDATE organizations
           SET country = ?, industry = ?, website = ?, onboarding_step = MAX(onboarding_step, ?), updated_at = ?
           WHERE id = ?`
        )
        .bind(country, industry, website, step, now, organizationId)
        .run();
    } else {
      await this.db
        .prepare(
          `UPDATE organizations
           SET onboarding_step = MAX(onboarding_step, ?), updated_at = ?
           WHERE id = ?`
        )
        .bind(step, now, organizationId)
        .run();
    }

    // 2. Patch portal settings
    const updatedBranding = {
      ...currentSettings.branding,
      ...(data.branding?.displayName ? { displayName: data.branding.displayName.trim() } : {}),
      ...(data.branding?.logoText ? { logoText: data.branding.logoText.trim() } : {}),
      ...(data.branding?.logoUrl !== undefined ? { logoUrl: data.branding.logoUrl.trim() } : {}),
      ...(data.branding?.primaryColor ? { primaryColor: data.branding.primaryColor.trim() } : {}),
      ...(data.branding?.secondaryColor ? { secondaryColor: data.branding.secondaryColor.trim() } : {}),
      ...(data.branding?.accentTheme ? { accentTheme: data.branding.accentTheme } : {}),
    };

    const updatedChatbot = {
      ...currentSettings.chatbot,
      ...(data.chatbot?.assistantName ? { assistantName: data.chatbot.assistantName.trim() } : {}),
      ...(data.chatbot?.greetingMessage ? { initialGreeting: data.chatbot.greetingMessage.trim() } : {}),
      ...(data.chatbot?.communicationStyle ? { communicationStyle: data.chatbot.communicationStyle } : {}),
      ...(data.supportConfig?.communicationStyle ? { communicationStyle: data.supportConfig.communicationStyle } : {}),
      ...(data.supportConfig?.supportedTopics ? { supportedTopics: data.supportConfig.supportedTopics } : {}),
      ...(data.supportConfig?.restrictedTopics ? { restrictedTopics: data.supportConfig.restrictedTopics } : {}),
      ...(data.chatbot?.approvedTopics ? { supportedTopics: data.chatbot.approvedTopics } : {}),
      ...(data.chatbot?.restrictedTopics ? { restrictedTopics: data.chatbot.restrictedTopics } : {}),
    };

    const updatedSettings: BusinessPortalConfig = {
      ...currentSettings,
      contactEmail: data.profile?.contactEmail?.trim() || currentSettings.contactEmail,
      supportHours: data.humanSupport?.operatingHours?.trim() || currentSettings.supportHours,
      welcomeDescription: data.profile?.description?.trim() || currentSettings.welcomeDescription,
      welcomeHeadline: data.branding?.welcomeMessage?.trim() || currentSettings.welcomeHeadline,
      branding: updatedBranding,
      chatbot: updatedChatbot,
      escalation: {
        ...currentSettings.escalation,
        ...(data.humanSupport?.escalationConditions
          ? { supportInstructions: data.humanSupport.escalationConditions.trim() }
          : {}),
      },
    };

    await this.db
      .prepare(
        `INSERT INTO organization_portal_settings (organization_id, settings_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT (organization_id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = excluded.updated_at`
      )
      .bind(organizationId, JSON.stringify(updatedSettings), now)
      .run();

    // 3. Mark status as in_progress if currently incomplete
    if (org.onboarding_status === 'incomplete') {
      await this.db
        .prepare(`UPDATE organizations SET onboarding_status = 'in_progress', updated_at = ? WHERE id = ?`)
        .bind(now, organizationId)
        .run();
    }

    return this.getOnboardingProgress(organizationId);
  }

  async publishWorkspacePortal(organizationId: string): Promise<OnboardingProgressReport> {
    const progress = await this.getOnboardingProgress(organizationId);
    if (!progress.canPublish) {
      throw new Error(
        `Cannot publish portal yet. Missing requirements: ${progress.missingRequirements.join(' ')}`
      );
    }

    const now = new Date().toISOString();
    await this.db
      .prepare(`UPDATE organizations SET onboarding_status = 'published', updated_at = ? WHERE id = ?`)
      .bind(now, organizationId)
      .run();

    return this.getOnboardingProgress(organizationId);
  }
}

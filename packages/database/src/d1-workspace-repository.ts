import {
  ConversationStatus,
  EscalationPriority,
  MessageSenderType,
  SupportChannel,
  UserRole,
  type AgentAvailability,
  type BusinessPortalConfig,
  type CommunicationStyle,
  type PortalAccentTheme,
  type PortalAssistantResponseDto,
  type PortalFaqItem,
  type PortalKnowledgePreviewItem,
  type PublicPortalSummary,
  type SupportProcedureItem,
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

interface OrgRow {
  id: string;
  slug: string;
  name: string;
  is_active: number;
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
        `SELECT id, slug, name, is_active
         FROM organizations
         WHERE slug = ? AND is_active = 1`
      )
      .bind(normalized)
      .first<OrgRow>();
  }

  private async getActiveOrgById(organizationId: string): Promise<OrgRow | null> {
    return this.db
      .prepare(
        `SELECT id, slug, name, is_active
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
        verifiedHostname: base.verifiedHostnames[0] ?? `${org.slug}.careflow.com`,
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
      throw new Error(`The portal slug "${slug}" is reserved by CareFlow.`);
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
}

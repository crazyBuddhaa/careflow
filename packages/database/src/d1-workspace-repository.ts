import {
  ConversationStatus,
  DEFAULT_PERMISSIONS_BY_ROLE,
  DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS,
  isRegisteredPlatformSuperAdminEmail,
  EscalationPriority,
  MessageSenderType,
  SupportChannel,
  UserRole,
  type AccountRegistrationMode,
  type AgentAccessMode,
  type AgentAvailability,
  type BusinessOnboardingStatus,
  type BusinessPortalConfig,
  type CareFlowUserRecord,
  type CommunicationStyle,
  type ConversationActivityLogItem,
  type ConversationAttachmentRecord,
  type ExternalAiProviderKey,
  type MembershipLifecycleStatus,
  type MessageDeliveryStatus,
  type OnboardingProgressReport,
  type OnboardingStepItemStatus,
  type PlatformAdminOverviewDto,
  type PortalAccentTheme,
  type PortalAssistantResponseDto,
  type PortalFaqItem,
  type PortalKnowledgePreviewItem,
  type PublicPortalSummary,
  type SavedReplyRecord,
  type SupportProcedureItem,
  type UserWorkspaceMembership,
  type WorkspaceAgentRecord,
  type WorkspaceAnalyticsSummary,
  type WorkspaceAuditLogRecord,
  type WorkspaceConversationItem,
  type WorkspaceCustomerRecord,
  type WorkspaceInvitationRecord,
  type WorkspaceMessageItem,
  type WorkspacePermissionKey,
} from '@careflow/shared';
import type { D1DatabaseLike } from './d1-types';
import {
  NORTHSTAR_COMMERCE_PRESET,
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
  created_at?: string;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  email_verified: number;
  mfa_enabled?: number;
  account_type?: string;
  is_personal_account?: number;
  is_platform_admin?: number;
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
  membership_status?: string | null;
  department?: string | null;
  permissions_json?: string | null;
  agent_identity_id?: string | null;
}

interface SettingsRow {
  organization_id: string;
  settings_json: string;
  updated_at: string;
}

interface OrgWithSettingsRow extends OrgRow {
  settings_json: string | null;
  published_article_count?: number;
  published_faq_count?: number;
}

export interface ConversationHistoryTurn {
  role: 'customer' | 'bot' | 'agent';
  text: string;
}

export interface PortalResolutionAccessOptions {
  requirePublished?: boolean;
  viewerUserId?: string;
  viewerOrganizationId?: string;
  aiCompletionHandler?: ExternalAiCompletionHandler;
  conversationHistory?: ConversationHistoryTurn[];
  interactiveConversation?: boolean;
}

const DUMMY_TIMING_PASSWORD_HASH = hashPassword('careflow-constant-time-dummy-secret-2026');

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
  customer_identity_id?: string | null;
  source_channel_ref?: string;
  channel: string;
  status: string;
  priority: string;
  category: string;
  subject: string;
  assigned_agent_id?: string | null;
  assigned_agent_name: string | null;
  diagnostic_summary: string;
  escalation_count?: number;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  organization_id: string;
  sender_type: string;
  sender_user_id?: string | null;
  sender_name: string;
  body: string;
  is_internal_note?: number;
  external_message_id?: string | null;
  delivery_status?: string;
  delivery_error?: string | null;
  created_at: string;
}

interface ActivityLogRow {
  id: string;
  conversation_id: string;
  organization_id: string;
  actor_user_id: string | null;
  actor_name: string;
  actor_type: 'customer' | 'agent' | 'system' | 'bot';
  action_type: ConversationActivityLogItem['actionType'];
  details: string;
  created_at: string;
}

interface AttachmentRow {
  id: string;
  organization_id: string;
  conversation_id: string;
  message_id: string | null;
  channel: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  external_file_id: string | null;
  created_at: string;
}

export type ExternalAiCompletionHandler = (params: {
  provider: ExternalAiProviderKey;
  businessName: string;
  question: string;
  systemInstructions: string;
  supportedTopics: string[];
  restrictedTopics: string[];
  knowledgeContext: string;
  conversationHistory?: ConversationHistoryTurn[];
}) => Promise<string | null>;

interface AgentRow {
  id: string;
  organization_id: string;
  user_id?: string | null;
  agent_identity_id?: string | null;
  display_name: string;
  email: string;
  role: string;
  department?: string;
  specialty: string;
  availability: string;
  membership_status?: string;
  created_at: string;
}

function createId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${rand}`;
}

const CONVERSATIONAL_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'your',
  'you',
  'are',
  'was',
  'were',
  'have',
  'has',
  'had',
  'not',
  'but',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'whose',
  'why',
  'how',
  'can',
  'could',
  'would',
  'should',
  'will',
  'shall',
  'may',
  'might',
  'must',
  'need',
  'want',
  'like',
  'know',
  'more',
  'about',
  'into',
  'onto',
  'upon',
  'over',
  'under',
  'some',
  'any',
  'all',
  'just',
  'very',
  'too',
  'also',
  'only',
  'even',
  'still',
  'already',
  'there',
  'here',
  'they',
  'them',
  'their',
  'ours',
  'mine',
  'his',
  'her',
  'its',
  'does',
  'did',
  'done',
  'doing',
  'been',
  'being',
  'get',
  'got',
  'getting',
  'make',
  'made',
  'making',
  'issue',
  'issues',
  'problem',
  'problems',
  'help',
  'please',
  'thanks',
  'thank',
  'hello',
  'hey',
  'correct',
  'wrong',
  'working',
  'work',
  'something',
  'anything',
  'everything',
  'nothing',
  'details',
  'detail',
  'info',
  'information',
  'tell',
  'ask',
  'asked',
  'question',
  'questions',
]);

function tokenizeWords(input: string, includeStopWords = false): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && (includeStopWords || !CONVERSATIONAL_STOP_WORDS.has(w)));
}

export function sanitizeCustomerFacingText(rawText: string): string {
  if (!rawText) return '';
  let text = rawText;

  // Convert third-person agent instructions into polite second-person customer responses
  text = text.replace(
    /\bAsk the customer to contact\s+([^\s.,;]+)\s+with\s+/gi,
    'Please contact $1 and include '
  );
  text = text.replace(/\bAsk the customer to contact\s+/gi, 'Please contact ');
  text = text.replace(
    /\bAsk the customer to provide\s+/gi,
    'Could you please share '
  );
  text = text.replace(/\bAsk the customer to\s+/gi, 'Please ');
  text = text.replace(/\bAsk the customer for\s+/gi, 'Could you please share ');
  text = text.replace(/\bAsk the user to\s+/gi, 'Please ');
  text = text.replace(/\bAsk the user for\s+/gi, 'Could you please share ');
  text = text.replace(
    /\bApologise and explain that\s+/gi,
    "We're sorry for the inconvenience — "
  );
  text = text.replace(
    /\bApologize and explain that\s+/gi,
    "We're sorry for the inconvenience — "
  );
  text = text.replace(/\bDirect the customer to\s+/gi, 'Please check ');
  text = text.replace(/\bAdvise the customer to\s+/gi, 'Please ');
  text = text.replace(/\bRemind the customer that\s+/gi, 'Please note that ');
  text = text.replace(/\bInform the customer that\s+/gi, '');
  text = text.replace(/\bTell the customer that\s+/gi, '');
  text = text.replace(/\bExplain to the customer that\s+/gi, '');
  text = text.replace(
    /\b(?:They|The customer)\s+should not send\s+/gi,
    'For your security, please do not send '
  );
  text = text.replace(
    /\b(?:They|The customer)\s+should never send\s+/gi,
    'For your security, please never send '
  );
  text = text.replace(/\b(?:They|The customer)\s+should\s+/gi, 'Please ');
  text = text.replace(/\bthe customer's\b/gi, 'your');
  text = text.replace(/\bThe customer's\b/g, 'Your');
  text = text.replace(/\bthe customer\b/gi, 'you');

  // Remove or rewrite internal escalation / prohibition directives meant only for the bot/agent
  text = text.replace(
    /\bEscalate for payment-provider and subscription-status verification\.?/gi,
    'Our support team can verify your payment provider and subscription status once you share those details.'
  );
  text = text.replace(
    /\bEscalate(?:\s+the\s+issue|\s+to\s+human\s+support|\s+for\s+[^.!\n]+)[.!]?/gi,
    'Our support team can review this for you once you share those details.'
  );
  text = text.replace(
    /\bDo not promise[^.!\n]*[.!]?/gi,
    ''
  );
  text = text.replace(
    /\bDo not invent[^.!\n]*[.!]?/gi,
    ''
  );
  text = text.replace(
    /\bDo not claim[^.!\n]*[.!]?/gi,
    ''
  );

  return text
    .replace(/\s{2,}/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();
}

function isInternalMetaGuidelineTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    /instructions?\s+for\s+the\s+.*ai/i.test(lower) ||
    /bot\s+instructions|system\s+prompt|agent\s+guidelines/i.test(lower) ||
    /known\s+limitations.*must\s+not\s+invent/i.test(lower) ||
    /facts\s+the\s+ai\s+must\s+not/i.test(lower) ||
    /official\s+source\s+pages/i.test(lower) ||
    /escalation\s+and\s+safe\s+handling\s+rules/i.test(lower)
  );
}

function getFallbackPresetForOrg(org: OrgRow): BusinessPortalConfig {
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
  private readonly defaultAiCompletionHandler?: ExternalAiCompletionHandler;

  constructor(
    db: D1DatabaseLike,
    options?: { aiCompletionHandler?: ExternalAiCompletionHandler }
  ) {
    this.db = db;
    this.defaultAiCompletionHandler = options?.aiCompletionHandler;
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

  private parseSettingsJsonForOrg(
    org: OrgRow,
    settingsJson: string | null | undefined
  ): BusinessPortalConfig {
    if (!settingsJson) {
      return getFallbackPresetForOrg(org);
    }

    try {
      const parsed = JSON.parse(settingsJson) as BusinessPortalConfig;
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

  private async loadBaseSettingsForOrg(org: OrgRow): Promise<BusinessPortalConfig> {
    const row = await this.db
      .prepare(
        `SELECT organization_id, settings_json, updated_at
         FROM organization_portal_settings
         WHERE organization_id = ?`
      )
      .bind(org.id)
      .first<SettingsRow>();

    return this.parseSettingsJsonForOrg(org, row?.settings_json);
  }

  private async canAccessPortalRow(
    org: OrgRow,
    options?: PortalResolutionAccessOptions
  ): Promise<boolean> {
    if (!options?.requirePublished) {
      return true;
    }

    const status = (org.onboarding_status as BusinessOnboardingStatus) ?? 'published';
    if (status === 'published') {
      return true;
    }

    if (options.viewerOrganizationId && options.viewerOrganizationId === org.id) {
      return true;
    }

    if (options.viewerUserId) {
      const membership = await this.getUserActiveMembership(options.viewerUserId, org.id);
      if (membership) {
        return true;
      }
    }

    return false;
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

    const liveArticles: PortalKnowledgePreviewItem[] = articleRows.results
      .filter((r) => !isInternalMetaGuidelineTitle(r.title))
      .map((r) => {
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
          summary: sanitizeCustomerFacingText(r.short_description),
          content: sanitizeCustomerFacingText(r.content),
          tags,
          updatedAt: r.updated_at,
        };
      });

    const liveFaqs: PortalFaqItem[] = faqRows.results
      .filter((f) => !isInternalMetaGuidelineTitle(f.question))
      .map((f) => ({
        id: f.id,
        question: f.question,
        answer: sanitizeCustomerFacingText(f.answer),
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

  async resolvePortalBySlug(
    slug: string,
    options?: PortalResolutionAccessOptions
  ): Promise<BusinessPortalConfig | null> {
    const org = await this.getActiveOrgBySlug(slug);
    if (!org) {
      return null;
    }
    if (!(await this.canAccessPortalRow(org, options))) {
      return null;
    }
    const base = await this.loadBaseSettingsForOrg(org);
    return this.hydrateLiveKnowledgeIntoPortal(org, base);
  }

  async resolvePortalByHostname(
    hostname: string,
    options?: PortalResolutionAccessOptions
  ): Promise<BusinessPortalConfig | null> {
    const normalizedHost = hostname.trim().toLowerCase().split(':')[0] ?? '';
    if (!normalizedHost) return null;

    const { results: orgRows } = await this.db
      .prepare(
        `SELECT
           o.id,
           o.slug,
           o.name,
           o.country,
           o.industry,
           o.website,
           o.onboarding_status,
           o.onboarding_step,
           o.created_by_user_id,
           o.is_active,
           s.settings_json
         FROM organizations o
         LEFT JOIN organization_portal_settings s
           ON s.organization_id = o.id
         WHERE o.is_active = 1`
      )
      .all<OrgWithSettingsRow>();

    for (const org of orgRows) {
      const base = this.parseSettingsJsonForOrg(org, org.settings_json);
      if (
        base.verifiedHostnames.some((h) => h.toLowerCase() === normalizedHost) ||
        normalizedHost === `${org.slug}.getcustomcare.xyz` ||
        normalizedHost === `${org.slug}.careflow.com` ||
        normalizedHost === `${org.slug}.localhost`
      ) {
        if (!(await this.canAccessPortalRow(org, options))) {
          return null;
        }
        return this.hydrateLiveKnowledgeIntoPortal(org, base);
      }
    }
    return null;
  }

  async listPublicPortals(): Promise<PublicPortalSummary[]> {
    const { results: rows } = await this.db
      .prepare(
        `SELECT
           o.id,
           o.slug,
           o.name,
           o.country,
           o.industry,
           o.website,
           o.onboarding_status,
           o.onboarding_step,
           o.created_by_user_id,
           o.is_active,
           s.settings_json,
           COALESCE(art.published_article_count, 0) AS published_article_count,
           COALESCE(faq.published_faq_count, 0) AS published_faq_count
         FROM organizations o
         LEFT JOIN organization_portal_settings s
           ON s.organization_id = o.id
         LEFT JOIN (
           SELECT organization_id, COUNT(*) AS published_article_count
           FROM knowledge_articles
           WHERE status = 'published'
           GROUP BY organization_id
         ) art ON art.organization_id = o.id
         LEFT JOIN (
           SELECT organization_id, COUNT(*) AS published_faq_count
           FROM knowledge_faqs
           WHERE status = 'published'
           GROUP BY organization_id
         ) faq ON faq.organization_id = o.id
         WHERE o.is_active = 1 AND o.onboarding_status = 'published'
         ORDER BY o.created_at ASC, o.name ASC`
      )
      .all<OrgWithSettingsRow>();

    return rows.map((row) => {
      const base = this.parseSettingsJsonForOrg(row, row.settings_json);
      return {
        organizationId: row.id,
        slug: row.slug,
        displayName: base.branding.displayName,
        portalSubtitle: base.branding.portalSubtitle,
        welcomeHeadline: base.welcomeHeadline,
        accentTheme: base.branding.accentTheme,
        verifiedHostname: base.verifiedHostnames[0] ?? `${row.slug}.getcustomcare.xyz`,
        publishedArticleCount: Number(row.published_article_count ?? 0),
        publishedFaqCount: Number(row.published_faq_count ?? 0),
      };
    });
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
    rawQuestion: string,
    options?: PortalResolutionAccessOptions
  ): Promise<PortalAssistantResponseDto | null> {
    const portal =
      (await this.resolvePortalBySlug(slug, options)) ??
      (slug.includes('.') ? await this.resolvePortalByHostname(slug, options) : null);
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
        reply: `Your conversation has been escalated to ${portal.branding.displayName}'s human support team. A specialist will reply here shortly.`,
        resolutionLayer: 'human-escalation',
        suggestEscalation: true,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    // 1b. Conversational Casual Chat & Pleasantries (Natural chat parity with web bot)
    if (
      /^(?:hi+|hello+|hey+|howdy|hola|greetings|yo|sup|good\s*(?:morning|afternoon|evening|day)|hi\s+there|hello\s+there|hey\s+there)[!.?,\s]*$/i.test(
        questionLower
      )
    ) {
      return {
        reply: `Hi there! How can ${portal.branding.displayName} help you today?`,
        resolutionLayer: 'business-rules',
        suggestEscalation: false,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    if (
      /^(?:thanks?|thank\s+you|thank\s+you\s+so\s+much|thanks\s+a\s+lot|many\s+thanks|much\s+appreciated|appreciate\s+it|cheers)[!.?,\s]*$/i.test(
        questionLower
      )
    ) {
      return {
        reply: `You're very welcome! Feel free to ask if you need help with anything else.`,
        resolutionLayer: 'business-rules',
        suggestEscalation: false,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    if (
      /^(?:how\s+are\s+you(?:\s+doing)?|how\s+is\s+it\s+going|hows\s+it\s+going|how\s+are\s+things|how\s+do\s+you\s+do)[!.?,\s]*$/i.test(
        questionLower
      )
    ) {
      return {
        reply: `I'm doing well, thank you! How can I assist you with ${portal.branding.displayName} today?`,
        resolutionLayer: 'business-rules',
        suggestEscalation: false,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    if (
      /^(?:ok|okay|k|cool|great|awesome|perfect|sounds\s+good|got\s+it|understood|alright|fine)[!.?,\s]*$/i.test(
        questionLower
      )
    ) {
      return {
        reply: `Great! Let me know whenever you need assistance.`,
        resolutionLayer: 'business-rules',
        suggestEscalation: false,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    if (
      /^(?:bye|goodbye|bye\s+bye|see\s+ya|see\s+you|have\s+a\s+great\s+day|have\s+a\s+nice\s+day|take\s+care)[!.?,\s]*$/i.test(
        questionLower
      )
    ) {
      return {
        reply: `Goodbye! Have a great day and feel free to reach out anytime.`,
        resolutionLayer: 'business-rules',
        suggestEscalation: false,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    if (
      /^(?:who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|who\s+made\s+you|what\s+is\s+your\s+name)[!.?,\s]*$/i.test(
        questionLower
      )
    ) {
      return {
        reply: `I'm ${portal.branding.displayName}'s support assistant. You can ask me questions about our services or account, or I can connect you directly with a specialist.`,
        resolutionLayer: 'business-rules',
        suggestEscalation: false,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    // 1c. Business Overview / "What is {Business}" / "I want to know more about {Business}"
    const bizNameLower = portal.branding.displayName.toLowerCase();
    const bizBaseLower = bizNameLower.replace(/s$/, '');
    const slugPlain = portal.slug.replace(/-/g, ' ').toLowerCase();
    const isAboutBusinessQuery =
      /\b(?:what\s+is|tell\s+me\s+(?:more\s+)?about|know\s+more\s+about|learn\s+(?:more\s+)?about|how\s+does\s+.*\s+work|what\s+does\s+.*\s+do|explain\s+what)\b/i.test(
        questionLower
      ) &&
      (questionLower.includes(bizBaseLower) ||
        questionLower.includes(slugPlain) ||
        /\b(?:this\s+(?:platform|service|site|app|company|business)|your\s+(?:platform|service|company|product))\b/i.test(
          questionLower
        ));

    if (isAboutBusinessQuery) {
      const overviewFaq = portal.faqs.find((f) =>
        /\b(?:what\s+is|how\s+does\s+.*\s+work|what\s+does\s+.*\s+do)\b/i.test(f.question)
      );
      if (overviewFaq) {
        return {
          reply: sanitizeCustomerFacingText(overviewFaq.answer),
          resolutionLayer: 'business-rules',
          matchedSourceTitle: overviewFaq.question,
          suggestEscalation: false,
          suggestedTopic: overviewFaq.categoryName ?? 'General',
        };
      }

      const overviewArticle = portal.publishedKnowledge.find(
        (a) =>
          /\b(?:overview|what\s+is|getting\s+started|about)\b/i.test(a.title) ||
          /\b(?:overview|general)\b/i.test(a.category)
      );
      if (overviewArticle) {
        const snippet = overviewArticle.content
          ? overviewArticle.content.split('\n\n')[0] ?? overviewArticle.summary
          : overviewArticle.summary;
        return {
          reply: sanitizeCustomerFacingText(snippet),
          resolutionLayer: 'knowledge-base',
          matchedSourceTitle: overviewArticle.title,
          matchedArticleSlug: overviewArticle.slug,
          suggestEscalation: false,
          suggestedTopic: overviewArticle.category,
        };
      }

      return {
        reply: `${portal.branding.displayName} — ${portal.welcomeDescription} We can help you with ${portal.chatbot.supportedTopics.join(', ')}. What would you like to explore?`,
        resolutionLayer: 'business-rules',
        suggestEscalation: false,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    // 1d. Broad / Underspecified Issue Clarifier
    // When a customer makes a broad trouble statement (e.g. "I have an issue with my account",
    // "My product details is not correct", "I have a payment issue", "I need help") without
    // specifying the concrete sub-problem, ask a natural clarifying question instead of guessing a random FAQ.
    const specificSubtopicRegex =
      /\b(?:password|reset|forgot|verification|verify|otp|code|create|register|signup|sign\s+up|delete|close|cancel|refund|twice|duplicate|double|price|pricing|cost|how\s+much|free|pro\s+plan|subscription\s+plan|guarantee|guaranteed|sure\s+win|fixed\s+match|accuracy|football|soccer|basketball|tennis|halftime|over|under|btts|privacy|terms|cookie|hours|warranty|inverter|customs|clearance|delivery|lagos|limit|virtual\s+card|sso|saml)\b/i;

    const history = options?.conversationHistory ?? [];
    const lastBotTurn = [...history]
      .reverse()
      .find((t) => t.role === 'bot');
    const botAlreadyAskedForDetails = Boolean(
      lastBotTurn &&
        /\b(?:could\s+you\s+(?:share|tell|let\s+me\s+know|provide)|please\s+(?:share|let\s+me\s+know|tell\s+me)|which\s+specific|what\s+is\s+happening|are\s+you\s+having\s+trouble|so\s+i\s+can\s+pass|before\s+i\s+escalate|once\s+you\s+share\s+those\s+details)\b/i.test(
          lastBotTurn.text
        )
    );

    if (!specificSubtopicRegex.test(questionLower) && !botAlreadyAskedForDetails) {
      const isBroadAccountIssue =
        /\b(?:account|login|sign\s*in|profile)\b/i.test(questionLower) &&
        /\b(?:issue|issues|problem|problems|trouble|wrong|incorrect|not\s+correct|error|help|not\s+working|fix|broken)\b/i.test(
          questionLower
        ) &&
        queryWords.length <= 3;

      if (isBroadAccountIssue) {
        return {
          reply: `I'd be happy to help with your account! Could you share a bit more about what's happening — for example, are you having trouble signing in, resetting your password, receiving a verification email, or checking your subscription status?`,
          resolutionLayer: 'guided-troubleshooting',
          suggestEscalation: false,
          suggestedTopic: 'Account & Login',
        };
      }

      const isBroadProductOrDataIssue =
        /\b(?:product|detail|details|stat|stats|statistic|statistics|data|prediction|predictions|match|score|info|information|page|feature)\b/i.test(
          questionLower
        ) &&
        /\b(?:not\s+correct|incorrect|wrong|inaccurate|error|issue|issues|problem|problems|missing|outdated|broken|bad|weird)\b/i.test(
          questionLower
        ) &&
        queryWords.length <= 4;

      if (isBroadProductOrDataIssue) {
        return {
          reply: `I'm sorry to hear something looks inaccurate. Could you tell me which specific feature, page, or item detail looks incorrect, along with what you expected to see? Once you share those details, I can check this for you or pass it straight to our support team.`,
          resolutionLayer: 'guided-troubleshooting',
          suggestEscalation: false,
          suggestedTopic: 'Product Support',
        };
      }

      const isBroadPaymentIssue =
        /\b(?:payment|billing|subscription|charge|charged|card|deposit|upgrade)\b/i.test(
          questionLower
        ) &&
        /\b(?:issue|issues|problem|problems|trouble|wrong|incorrect|not\s+correct|error|help|not\s+working|failed|pending)\b/i.test(
          questionLower
        ) &&
        queryWords.length <= 3;

      if (isBroadPaymentIssue) {
        return {
          reply: `I can help with billing and subscription questions. Could you let me know what happened — for example, did you complete a payment that hasn't reflected on your account yet, or did you encounter a checkout error? (For your security, please never share full card numbers, CVV, PINs, or OTPs.)`,
          resolutionLayer: 'guided-troubleshooting',
          suggestEscalation: false,
          suggestedTopic: 'Billing & Subscriptions',
        };
      }

      const isGenericHelpRequest =
        /^(?:i\s+need\s+help|help\s+me|can\s+you\s+help(?:\s+me)?|i\s+have\s+an?\s+(?:issue|problem|question)|something\s+is\s+(?:wrong|not\s+working|broken)|is\s+anyone\s+there|anyone\s+online)[!.?,\s]*$/i.test(
          questionLower
        );

      if (isGenericHelpRequest) {
        return {
          reply: `I'm here to help! Could you tell me a little more about what you're experiencing or what question you have regarding ${portal.branding.displayName}?`,
          resolutionLayer: 'guided-troubleshooting',
          suggestEscalation: false,
          suggestedTopic: portal.categories[0]?.title ?? 'General Support',
        };
      }
    }

    // 2. Approved FAQ & Published Knowledge Base Retrieval
    // Remove the business name itself from generic scoring unless no other words exist
    const nonBizQueryWords = queryWords.filter(
      (w) => w !== bizNameLower && w !== bizBaseLower && w !== slugPlain
    );
    const effectiveQueryWords =
      nonBizQueryWords.length > 0 ? nonBizQueryWords : queryWords;

    let bestFaq: { item: PortalFaqItem; score: number } | null = null;
    for (const faq of portal.faqs) {
      const qLower = faq.question.toLowerCase();
      const hay = `${qLower} ${faq.answer.toLowerCase()}`;
      let score = 0;
      let matchedQuestionWords = 0;
      for (const w of effectiveQueryWords) {
        if (qLower.includes(w)) {
          score += 3;
          matchedQuestionWords += 1;
        } else if (hay.includes(w)) {
          score += 1;
        }
      }
      // Require either at least one keyword in the FAQ question itself, or 3+ answer keyword hits
      if (matchedQuestionWords === 0 && score < 3) {
        score = 0;
      }
      if (score > (bestFaq?.score ?? 0)) {
        bestFaq = { item: faq, score };
      }
    }

    let bestArticle: { item: PortalKnowledgePreviewItem; score: number } | null = null;
    for (const art of portal.publishedKnowledge) {
      const titleLower = art.title.toLowerCase();
      const summaryLower = art.summary.toLowerCase();
      const hay = `${titleLower} ${summaryLower} ${(art.content ?? '').toLowerCase()} ${(art.tags ?? []).join(' ').toLowerCase()}`;
      let score = 0;
      let matchedHeaderWords = 0;
      for (const w of effectiveQueryWords) {
        if (titleLower.includes(w)) {
          score += 3;
          matchedHeaderWords += 1;
        } else if (summaryLower.includes(w)) {
          score += 2;
          matchedHeaderWords += 1;
        } else if (hay.includes(w)) {
          score += 1;
        }
      }
      if (matchedHeaderWords === 0 && score < 3) {
        score = 0;
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
      for (const w of effectiveQueryWords) {
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
        reply: sanitizeCustomerFacingText(
          `${bestProc.item.title}: ${formattedSteps} If this does not resolve the issue, please share your account details here and I can connect you with our support team.`
        ),
        resolutionLayer: 'guided-troubleshooting',
        matchedSourceTitle: bestProc.item.title,
        suggestEscalation: true,
        suggestedTopic: bestProc.item.category,
      };
    }

    if (bestFaq && bestFaq.score >= 3 && bestFaq.score >= (bestArticle?.score ?? 0)) {
      return {
        reply: sanitizeCustomerFacingText(bestFaq.item.answer),
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
      const cleanSummary = sanitizeCustomerFacingText(bestArticle.item.summary);
      const cleanSnippet = sanitizeCustomerFacingText(snippet);
      const combinedReply =
        cleanSnippet.toLowerCase().startsWith(cleanSummary.toLowerCase().slice(0, 30))
          ? cleanSnippet
          : `${cleanSummary} — ${cleanSnippet}`;
      return {
        reply: combinedReply,
        resolutionLayer: 'knowledge-base',
        matchedSourceTitle: bestArticle.item.title,
        matchedArticleSlug: bestArticle.item.slug,
        suggestEscalation: false,
        suggestedTopic: bestArticle.item.category,
      };
    }

    // 4. Conversational AI Synthesis & Grounded Fallback
    const aiHandler = options?.aiCompletionHandler ?? this.defaultAiCompletionHandler;
    if (
      (portal.chatbot.aiFallback?.enabled ?? true) &&
      aiHandler
    ) {
      const kbSnippets = [
        ...portal.faqs.slice(0, 12).map((f) => `FAQ: Q: ${f.question} | A: ${f.answer}`),
        ...portal.publishedKnowledge
          .slice(0, 8)
          .map((a) => `Article (${a.title}): ${a.summary} ${a.content ?? ''}`),
        ...(portal.procedures ?? [])
          .filter((p) => p.isPublished)
          .slice(0, 4)
          .map(
            (p) =>
              `Procedure (${p.title}): ${p.steps.map((s) => `${s.stepNumber}. ${s.instruction}`).join(' ')}`
          ),
      ].join('\n');

      try {
        const aiReply = await aiHandler({
          provider: portal.chatbot.aiFallback?.provider ?? 'gemini',
          businessName: portal.branding.displayName,
          question: rawQuestion,
          systemInstructions: portal.chatbot.aiFallback?.systemInstructions ?? '',
          supportedTopics: portal.chatbot.supportedTopics,
          restrictedTopics: portal.chatbot.restrictedTopics,
          knowledgeContext: kbSnippets,
          conversationHistory: history,
        });
        if (aiReply && aiReply.trim().length > 0) {
          const sanitizedAiReply = sanitizeCustomerFacingText(aiReply.trim());
          const aiSuggestsEscalation =
            botAlreadyAskedForDetails ||
            /\b(?:escalat(?:ed|ing)|human\s+support\s+team|specialist\s+will\s+reply)\b/i.test(
              sanitizedAiReply
            );
          return {
            reply: sanitizedAiReply,
            resolutionLayer: aiSuggestsEscalation ? 'human-escalation' : 'ai-fallback',
            matchedSourceTitle: `${portal.branding.displayName} Assistant`,
            suggestEscalation: aiSuggestsEscalation,
            suggestedTopic: portal.categories[0]?.title ?? 'General Support',
          };
        }
      } catch {
        // Fall through safely to pre-escalation detail gathering or human-escalation
      }
    }

    // 5. Interactive Pre-Escalation Detail Gathering vs. Final Human Escalation
    // If we are in an interactive chat session (Telegram or Web Widget) and the bot has not yet
    // asked the customer for key issue details (and the customer hasn't already provided an email or transaction ref),
    // gather key details first before escalating to a human agent.
    const customerProvidedConcreteDetails =
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(rawQuestion) ||
      /\b(?:ref|txn|transaction|order|invoice|receipt)[:\s#-]*[a-z0-9-]{4,}\b/i.test(
        rawQuestion
      );

    if (
      options?.interactiveConversation &&
      !botAlreadyAskedForDetails &&
      !customerProvidedConcreteDetails
    ) {
      return {
        reply: `I want to make sure our team helps you accurately with this. Could you share a few key details — such as your account email (if applicable) and the exact page, feature, or issue you're experiencing — so I can pass everything directly to a ${portal.branding.displayName} specialist?`,
        resolutionLayer: 'guided-troubleshooting',
        suggestEscalation: false,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

    if (botAlreadyAskedForDetails || customerProvidedConcreteDetails) {
      return {
        reply: `Thank you for sharing those details. I have recorded your information and escalated your conversation to ${portal.branding.displayName}'s human support team. A specialist will review your details and reply here shortly.`,
        resolutionLayer: 'human-escalation',
        suggestEscalation: true,
        suggestedTopic: portal.categories[0]?.title ?? 'General Support',
      };
    }

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

  async logConversationActivity(params: {
    conversationId: string;
    organizationId: string;
    actorUserId?: string | null;
    actorName: string;
    actorType: 'customer' | 'agent' | 'system' | 'bot';
    actionType: ConversationActivityLogItem['actionType'];
    details: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO conversation_activity_logs
           (id, conversation_id, organization_id, actor_user_id, actor_name, actor_type, action_type, details, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        createId('act'),
        params.conversationId,
        params.organizationId,
        params.actorUserId ?? null,
        params.actorName,
        params.actorType,
        params.actionType,
        params.details,
        now
      )
      .run();
  }

  async listConversations(
    organizationId: string,
    filters?: {
      status?: string;
      search?: string;
      assignedAgentName?: string;
      unassignedOnly?: boolean;
      priority?: string;
      channel?: string;
      includeInternalNotes?: boolean;
    }
  ): Promise<WorkspaceConversationItem[]> {
    const clauses = ['organization_id = ?'];
    const params: unknown[] = [organizationId];

    if (filters?.status && filters.status !== 'all') {
      clauses.push('status = ?');
      params.push(filters.status);
    }

    if (filters?.unassignedOnly) {
      clauses.push('(assigned_agent_name IS NULL OR TRIM(assigned_agent_name) = \'\')');
    } else if (filters?.assignedAgentName && filters.assignedAgentName.trim().length > 0) {
      clauses.push('LOWER(assigned_agent_name) = ?');
      params.push(filters.assignedAgentName.trim().toLowerCase());
    }

    if (filters?.priority && filters.priority !== 'all') {
      if (filters.priority === 'high_or_urgent') {
        clauses.push(`priority IN ('high', 'urgent')`);
      } else {
        clauses.push('priority = ?');
        params.push(filters.priority);
      }
    }

    if (filters?.channel && filters.channel !== 'all') {
      clauses.push('channel = ?');
      params.push(filters.channel);
    }

    if (filters?.search && filters.search.trim().length > 0) {
      const q = `%${filters.search.trim().toLowerCase()}%`;
      clauses.push(
        '(LOWER(subject) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_email) LIKE ? OR LOWER(category) LIKE ? OR LOWER(customer_external_ref) LIKE ?)'
      );
      params.push(q, q, q, q, q);
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

    const includeInternal = filters?.includeInternalNotes !== false;

    const [{ results: msgRows }, { results: activityRows }, { results: attachmentRows }] =
      await Promise.all([
        this.db
          .prepare(
            `SELECT *
             FROM support_messages
             WHERE organization_id = ?${includeInternal ? '' : ' AND COALESCE(is_internal_note, 0) = 0'}
             ORDER BY created_at ASC`
          )
          .bind(organizationId)
          .all<MessageRow>(),
        this.db
          .prepare(
            `SELECT *
             FROM conversation_activity_logs
             WHERE organization_id = ?
             ORDER BY created_at ASC`
          )
          .bind(organizationId)
          .all<ActivityLogRow>(),
        this.db
          .prepare(
            `SELECT *
             FROM conversation_attachments
             WHERE organization_id = ?
             ORDER BY created_at ASC`
          )
          .bind(organizationId)
          .all<AttachmentRow>()
          .catch(() => ({ results: [] as AttachmentRow[] })),
      ]);

    const attachmentsByMessage = new Map<string, ConversationAttachmentRecord[]>();
    for (const att of attachmentRows) {
      if (!att.message_id) continue;
      const list = attachmentsByMessage.get(att.message_id) ?? [];
      list.push({
        id: att.id,
        organizationId: att.organization_id,
        conversationId: att.conversation_id,
        messageId: att.message_id,
        channel: (att.channel as SupportChannel) || SupportChannel.Telegram,
        fileName: att.file_name,
        mimeType: att.mime_type,
        fileSize: Number(att.file_size ?? 0),
        externalFileId: att.external_file_id,
        createdAt: att.created_at,
      });
      attachmentsByMessage.set(att.message_id, list);
    }

    const messagesByConv = new Map<string, WorkspaceMessageItem[]>();
    for (const m of msgRows) {
      const list = messagesByConv.get(m.conversation_id) ?? [];
      const msgAttachments = attachmentsByMessage.get(m.id);
      list.push({
        id: m.id,
        conversationId: m.conversation_id,
        senderType: m.sender_type as MessageSenderType,
        senderName: m.sender_name,
        senderUserId: m.sender_user_id ?? null,
        body: m.body,
        isInternalNote: Boolean(m.is_internal_note),
        externalMessageId: m.external_message_id ?? null,
        deliveryStatus: (m.delivery_status as MessageDeliveryStatus) ?? 'delivered',
        deliveryError: m.delivery_error ?? null,
        ...(msgAttachments && msgAttachments.length > 0 ? { attachments: msgAttachments } : {}),
        createdAt: m.created_at,
      });
      messagesByConv.set(m.conversation_id, list);
    }

    const activityByConv = new Map<string, ConversationActivityLogItem[]>();
    for (const a of activityRows) {
      const list = activityByConv.get(a.conversation_id) ?? [];
      list.push({
        id: a.id,
        conversationId: a.conversation_id,
        organizationId: a.organization_id,
        actorUserId: a.actor_user_id,
        actorName: a.actor_name,
        actorType: a.actor_type as ConversationActivityLogItem['actorType'],
        actionType: a.action_type as ConversationActivityLogItem['actionType'],
        details: a.details,
        createdAt: a.created_at,
      });
      activityByConv.set(a.conversation_id, list);
    }

    return convRows.map((c) => ({
      id: c.id,
      organizationId: c.organization_id,
      customerName: c.customer_name,
      customerEmail: c.customer_email,
      customerExternalRef: c.customer_external_ref,
      customerIdentityId: c.customer_identity_id ?? null,
      sourceChannelRef: c.source_channel_ref ?? '',
      channel: c.channel as SupportChannel,
      status: c.status as ConversationStatus,
      priority: c.priority as EscalationPriority,
      category: c.category,
      subject: c.subject,
      assignedAgentId: c.assigned_agent_id ?? null,
      assignedAgentName: c.assigned_agent_name,
      diagnosticSummary: c.diagnostic_summary,
      escalationCount: Number(c.escalation_count ?? 0),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      messages: messagesByConv.get(c.id) ?? [],
      activityLogs: activityByConv.get(c.id) ?? [],
    }));
  }

  async getConversationById(
    organizationId: string,
    conversationId: string,
    options?: { includeInternalNotes?: boolean }
  ): Promise<WorkspaceConversationItem | null> {
    const list = await this.listConversations(organizationId, {
      includeInternalNotes: options?.includeInternalNotes,
    });
    return list.find((c) => c.id === conversationId) ?? null;
  }

  async createEscalatedConversation(params: {
    organizationId: string;
    customerName: string;
    customerEmail: string;
    customerExternalRef?: string;
    customerIdentityId?: string | null;
    sourceChannelRef?: string;
    channel?: SupportChannel;
    status?: ConversationStatus;
    priority?: EscalationPriority;
    category: string;
    subject: string;
    message: string;
    transcriptSummary?: string;
    externalMessageId?: string;
  }): Promise<WorkspaceConversationItem> {
    const now = new Date().toISOString();
    const convId = createId('conv');

    // Auto-assign an available specialist if one exists in this organization
    const availableAgent = await this.db
      .prepare(
        `SELECT id, display_name FROM support_agents
         WHERE organization_id = ? AND availability = 'available'
         ORDER BY created_at ASC LIMIT 1`
      )
      .bind(params.organizationId)
      .first<{ id: string; display_name: string }>();

    const status = params.status ?? ConversationStatus.Escalated;
    const channel = params.channel ?? SupportChannel.Portal;
    const priority = params.priority ?? EscalationPriority.Normal;
    const assignedAgentId = availableAgent?.id ?? null;
    const assignedAgentName = availableAgent?.display_name ?? null;
    const isEscalated = status === ConversationStatus.Escalated ? 1 : 0;

    await this.db
      .prepare(
        `INSERT INTO support_conversations
           (id, organization_id, customer_name, customer_email, customer_external_ref, customer_identity_id, source_channel_ref, channel, status, priority, category, subject, assigned_agent_id, assigned_agent_name, diagnostic_summary, escalation_count, last_message_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        convId,
        params.organizationId,
        params.customerName,
        params.customerEmail,
        params.customerExternalRef ?? '',
        params.customerIdentityId ?? null,
        params.sourceChannelRef ?? '',
        channel,
        status,
        priority,
        params.category,
        params.subject,
        assignedAgentId,
        assignedAgentName,
        params.transcriptSummary ?? '',
        isEscalated,
        now,
        now,
        now
      )
      .run();

    if (params.transcriptSummary && params.transcriptSummary.trim().length > 0) {
      await this.db
        .prepare(
          `INSERT INTO support_messages
             (id, conversation_id, organization_id, sender_type, sender_name, body, is_internal_note, delivery_status, created_at)
           VALUES (?, ?, ?, 'system', 'CustomCare Handoff Context', ?, 0, 'delivered', ?)`
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
           (id, conversation_id, organization_id, sender_type, sender_name, body, is_internal_note, external_message_id, delivery_status, created_at)
         VALUES (?, ?, ?, 'customer', ?, ?, 0, ?, 'delivered', ?)`
      )
      .bind(
        createId('msg'),
        convId,
        params.organizationId,
        params.customerName,
        params.message,
        params.externalMessageId ?? null,
        now
      )
      .run();

    await this.logConversationActivity({
      conversationId: convId,
      organizationId: params.organizationId,
      actorName: params.customerName,
      actorType: 'customer',
      actionType: 'conversation_created',
      details: `Opened via ${channel} (${params.category})${assignedAgentName ? ` · Auto-assigned to ${assignedAgentName}` : ''}`,
    });

    const created = await this.getConversationById(params.organizationId, convId);
    if (!created) {
      throw new Error('Failed to load newly created support conversation.');
    }
    return created;
  }

  async replyToConversation(params: {
    organizationId: string;
    conversationId: string;
    senderName: string;
    senderUserId?: string | null;
    senderType?: MessageSenderType;
    body: string;
    isInternalNote?: boolean;
    externalMessageId?: string | null;
    deliveryStatus?: MessageDeliveryStatus;
    deliveryError?: string | null;
    nextStatus?: ConversationStatus;
  }): Promise<WorkspaceConversationItem> {
    const existing = await this.db
      .prepare(
        `SELECT id, status, assigned_agent_name FROM support_conversations
         WHERE id = ? AND organization_id = ?`
      )
      .bind(params.conversationId, params.organizationId)
      .first<{ id: string; status: string; assigned_agent_name: string | null }>();

    if (!existing) {
      throw new Error('Conversation not found in this business workspace.');
    }

    const now = new Date().toISOString();
    const isInternal = Boolean(params.isInternalNote);
    const senderType = params.senderType ?? MessageSenderType.Agent;
    const deliveryStatus: MessageDeliveryStatus = isInternal
      ? 'internal'
      : (params.deliveryStatus ?? 'delivered');
    const targetStatus = params.nextStatus ?? (existing.status as ConversationStatus);
    const messageId = createId('msg');

    await this.db
      .prepare(
        `INSERT INTO support_messages
           (id, conversation_id, organization_id, sender_type, sender_name, sender_user_id, body, is_internal_note, external_message_id, delivery_status, delivery_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        messageId,
        params.conversationId,
        params.organizationId,
        senderType,
        params.senderName,
        params.senderUserId ?? null,
        params.body,
        isInternal ? 1 : 0,
        params.externalMessageId ?? null,
        deliveryStatus,
        params.deliveryError ?? null,
        now
      )
      .run();

    if (isInternal) {
      await this.db
        .prepare(
          `UPDATE support_conversations
           SET updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(now, params.conversationId, params.organizationId)
        .run();

      await this.logConversationActivity({
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        actorUserId: params.senderUserId ?? null,
        actorName: params.senderName,
        actorType: 'agent',
        actionType: 'internal_note_added',
        details: 'Added private internal team note',
      });
    } else {
      const nextAssigned =
        senderType === MessageSenderType.Agent
          ? existing.assigned_agent_name ?? params.senderName
          : existing.assigned_agent_name;

      await this.db
        .prepare(
          `UPDATE support_conversations
           SET status = ?, assigned_agent_name = ?, last_message_at = ?, updated_at = ?
           WHERE id = ? AND organization_id = ?`
        )
        .bind(targetStatus, nextAssigned, now, now, params.conversationId, params.organizationId)
        .run();

      if (targetStatus !== existing.status) {
        await this.logConversationActivity({
          conversationId: params.conversationId,
          organizationId: params.organizationId,
          actorUserId: params.senderUserId ?? null,
          actorName: params.senderName,
          actorType: senderType === MessageSenderType.Bot ? 'bot' : senderType === MessageSenderType.Customer ? 'customer' : 'agent',
          actionType: 'status_changed',
          details: `Status changed from ${existing.status} to ${targetStatus}`,
        });
      }
    }

    const updated = await this.getConversationById(params.organizationId, params.conversationId);
    if (!updated) {
      throw new Error('Failed to reload updated conversation.');
    }
    return updated;
  }

  async createConversationAttachment(params: {
    organizationId: string;
    conversationId: string;
    messageId?: string | null;
    channel?: SupportChannel;
    fileName: string;
    mimeType: string;
    fileSize: number;
    externalFileId?: string | null;
  }): Promise<ConversationAttachmentRecord> {
    const conv = await this.db
      .prepare(`SELECT id FROM support_conversations WHERE id = ? AND organization_id = ?`)
      .bind(params.conversationId, params.organizationId)
      .first<{ id: string }>();

    if (!conv) {
      throw new Error('CROSS_TENANT_VIOLATION: Conversation does not belong to this organization.');
    }

    const id = createId('att');
    const now = new Date().toISOString();
    const channel = params.channel ?? SupportChannel.Telegram;

    await this.db
      .prepare(
        `INSERT INTO conversation_attachments
           (id, organization_id, conversation_id, message_id, channel, file_name, mime_type, file_size, external_file_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        params.organizationId,
        params.conversationId,
        params.messageId ?? null,
        channel,
        params.fileName,
        params.mimeType,
        params.fileSize,
        params.externalFileId ?? null,
        now
      )
      .run();

    return {
      id,
      organizationId: params.organizationId,
      conversationId: params.conversationId,
      messageId: params.messageId ?? null,
      channel,
      fileName: params.fileName,
      mimeType: params.mimeType,
      fileSize: params.fileSize,
      externalFileId: params.externalFileId ?? null,
      createdAt: now,
    };
  }

  async getConversationAttachmentById(
    organizationId: string,
    conversationId: string,
    attachmentId: string
  ): Promise<ConversationAttachmentRecord | null> {
    const row = await this.db
      .prepare(
        `SELECT *
         FROM conversation_attachments
         WHERE id = ? AND conversation_id = ? AND organization_id = ?`
      )
      .bind(attachmentId, conversationId, organizationId)
      .first<AttachmentRow>();

    if (!row) return null;

    return {
      id: row.id,
      organizationId: row.organization_id,
      conversationId: row.conversation_id,
      messageId: row.message_id,
      channel: (row.channel as SupportChannel) || SupportChannel.Telegram,
      fileName: row.file_name,
      mimeType: row.mime_type,
      fileSize: Number(row.file_size ?? 0),
      externalFileId: row.external_file_id,
      createdAt: row.created_at,
    };
  }

  async updateMessageDeliveryStatus(params: {
    organizationId: string;
    messageId: string;
    deliveryStatus: MessageDeliveryStatus;
    externalMessageId?: string | null;
    deliveryError?: string | null;
  }): Promise<void> {
    await this.db
      .prepare(
        `UPDATE support_messages
         SET delivery_status = ?,
             external_message_id = COALESCE(?, external_message_id),
             delivery_error = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(
        params.deliveryStatus,
        params.externalMessageId ?? null,
        params.deliveryError ?? null,
        params.messageId,
        params.organizationId
      )
      .run();
  }

  async updateConversationStatus(params: {
    organizationId: string;
    conversationId: string;
    status?: ConversationStatus;
    priority?: EscalationPriority;
    category?: string;
    assignedAgentName?: string | null;
    assignedAgentId?: string | null;
    actorUserId?: string | null;
    actorName?: string;
  }): Promise<WorkspaceConversationItem> {
    const existing = await this.db
      .prepare(
        `SELECT id, status, priority, category, assigned_agent_id, assigned_agent_name, escalation_count
         FROM support_conversations
         WHERE id = ? AND organization_id = ?`
      )
      .bind(params.conversationId, params.organizationId)
      .first<{
        id: string;
        status: string;
        priority: string;
        category: string;
        assigned_agent_id: string | null;
        assigned_agent_name: string | null;
        escalation_count: number;
      }>();

    if (!existing) {
      throw new Error('Conversation not found in this business workspace.');
    }

    const now = new Date().toISOString();
    const nextStatus = (params.status ?? existing.status) as ConversationStatus;
    const nextPriority = (params.priority ?? existing.priority) as EscalationPriority;
    const nextCategory = params.category?.trim() || existing.category;
    const nextAgentName =
      params.assignedAgentName !== undefined
        ? params.assignedAgentName
        : existing.assigned_agent_name;
    const nextAgentId =
      params.assignedAgentId !== undefined
        ? params.assignedAgentId
        : existing.assigned_agent_id;
    const nextEscalationCount =
      nextStatus === ConversationStatus.Escalated && existing.status !== ConversationStatus.Escalated
        ? Number(existing.escalation_count ?? 0) + 1
        : Number(existing.escalation_count ?? 0);

    await this.db
      .prepare(
        `UPDATE support_conversations
         SET status = ?, priority = ?, category = ?, assigned_agent_id = ?, assigned_agent_name = ?, escalation_count = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(
        nextStatus,
        nextPriority,
        nextCategory,
        nextAgentId,
        nextAgentName,
        nextEscalationCount,
        now,
        params.conversationId,
        params.organizationId
      )
      .run();

    const actorName = params.actorName || nextAgentName || 'Support Specialist';

    if (params.assignedAgentName !== undefined && nextAgentName !== existing.assigned_agent_name) {
      await this.logConversationActivity({
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        actorName,
        actorType: 'agent',
        actionType: existing.assigned_agent_name ? 'transferred' : 'assigned',
        details: nextAgentName
          ? existing.assigned_agent_name
            ? `Transferred from ${existing.assigned_agent_name} to ${nextAgentName}`
            : `Assigned to ${nextAgentName}`
          : `Unassigned from ${existing.assigned_agent_name}`,
      });
    }

    if (params.priority !== undefined && nextPriority !== existing.priority) {
      await this.logConversationActivity({
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        actorName,
        actorType: 'agent',
        actionType: 'priority_changed',
        details: `Priority changed from ${existing.priority} to ${nextPriority}`,
      });
    }

    if (params.status !== undefined && nextStatus !== existing.status) {
      const wasResolvedOrClosed =
        existing.status === ConversationStatus.Resolved ||
        existing.status === ConversationStatus.Closed;
      const actionType =
        wasResolvedOrClosed && nextStatus === ConversationStatus.Open
          ? 'reopened'
          : nextStatus === ConversationStatus.Escalated
            ? 'escalated'
            : 'status_changed';

      await this.logConversationActivity({
        conversationId: params.conversationId,
        organizationId: params.organizationId,
        actorUserId: params.actorUserId ?? null,
        actorName,
        actorType: 'agent',
        actionType,
        details: `Status changed from ${existing.status} to ${nextStatus}`,
      });
    }

    const updated = await this.getConversationById(params.organizationId, params.conversationId);
    if (!updated) {
      throw new Error('Failed to reload updated conversation.');
    }
    return updated;
  }

  /* =========================================================================
     Saved Replies (Tenant-Isolated Canned Responses)
  ========================================================================= */

  async listSavedReplies(organizationId: string): Promise<SavedReplyRecord[]> {
    interface SavedReplyRow {
      id: string;
      organization_id: string;
      title: string;
      category: string;
      body: string;
      shortcut: string;
      created_by_user_id: string | null;
      created_at: string;
      updated_at: string;
    }

    const { results } = await this.db
      .prepare(
        `SELECT * FROM saved_replies
         WHERE organization_id = ?
         ORDER BY category ASC, title ASC`
      )
      .bind(organizationId)
      .all<SavedReplyRow>();

    return results.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      title: r.title,
      category: r.category,
      body: r.body,
      shortcut: r.shortcut || undefined,
      createdByUserId: r.created_by_user_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async createSavedReply(
    organizationId: string,
    input: {
      title: string;
      category: string;
      body: string;
      shortcut?: string;
      createdByUserId?: string | null;
    }
  ): Promise<SavedReplyRecord> {
    const id = createId('srp');
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO saved_replies
           (id, organization_id, title, category, body, shortcut, created_by_user_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        organizationId,
        input.title.trim(),
        input.category.trim() || 'General',
        input.body.trim(),
        input.shortcut?.trim() ?? '',
        input.createdByUserId ?? null,
        now,
        now
      )
      .run();

    return {
      id,
      organizationId,
      title: input.title.trim(),
      category: input.category.trim() || 'General',
      body: input.body.trim(),
      shortcut: input.shortcut?.trim() || undefined,
      createdByUserId: input.createdByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async deleteSavedReply(organizationId: string, savedReplyId: string): Promise<void> {
    await this.db
      .prepare(`DELETE FROM saved_replies WHERE id = ? AND organization_id = ?`)
      .bind(savedReplyId, organizationId)
      .run();
  }

  async listCustomers(organizationId: string, search?: string): Promise<WorkspaceCustomerRecord[]> {
    interface AggregatedCustomerRow {
      email_key: string;
      customer_name: string;
      customer_email: string;
      customer_external_ref: string;
      preferred_channel: string;
      total_conversations: number;
      open_conversations: number;
      last_interaction_at: string;
    }

    const havingClauses: string[] = [];
    const params: unknown[] = [organizationId];

    if (search && search.trim().length > 0) {
      const q = `%${search.trim().toLowerCase()}%`;
      havingClauses.push(
        `(LOWER(MAX(c.customer_name)) LIKE ? OR LOWER(MIN(c.customer_email)) LIKE ? OR LOWER(COALESCE(MAX(CASE WHEN c.customer_external_ref != '' THEN c.customer_external_ref ELSE NULL END), '')) LIKE ?)`
      );
      params.push(q, q, q);
    }

    const havingSql = havingClauses.length > 0 ? `HAVING ${havingClauses.join(' AND ')}` : '';

    const { results } = await this.db
      .prepare(
        `SELECT
           LOWER(c.customer_email) AS email_key,
           (
             SELECT c2.customer_name
             FROM support_conversations c2
             WHERE c2.organization_id = c.organization_id
               AND LOWER(c2.customer_email) = LOWER(c.customer_email)
             ORDER BY c2.updated_at DESC
             LIMIT 1
           ) AS customer_name,
           MIN(c.customer_email) AS customer_email,
           COALESCE(
             MAX(CASE WHEN c.customer_external_ref != '' THEN c.customer_external_ref ELSE NULL END),
             ''
           ) AS customer_external_ref,
           (
             SELECT c3.channel
             FROM support_conversations c3
             WHERE c3.organization_id = c.organization_id
               AND LOWER(c3.customer_email) = LOWER(c.customer_email)
             ORDER BY c3.updated_at DESC
             LIMIT 1
           ) AS preferred_channel,
           COUNT(*) AS total_conversations,
           SUM(CASE WHEN c.status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS open_conversations,
           MAX(c.updated_at) AS last_interaction_at
         FROM support_conversations c
         WHERE c.organization_id = ?
         GROUP BY c.organization_id, LOWER(c.customer_email)
         ${havingSql}
         ORDER BY last_interaction_at DESC`
      )
      .bind(...params)
      .all<AggregatedCustomerRow>();

    return results.map((row) => ({
      id: `cust_${row.email_key.replace(/[^a-z0-9]/g, '').slice(0, 12)}`,
      organizationId,
      displayName: row.customer_name,
      email: row.customer_email,
      externalRef: row.customer_external_ref ?? '',
      preferredChannel: (row.preferred_channel as SupportChannel) || SupportChannel.Portal,
      totalConversations: Number(row.total_conversations ?? 0),
      openConversations: Number(row.open_conversations ?? 0),
      lastInteractionAt: row.last_interaction_at,
    }));
  }

  async listAgents(organizationId: string): Promise<WorkspaceAgentRecord[]> {
    interface TgLinkJoinRow {
      user_email: string;
      user_id: string;
      telegram_username: string | null;
      status: string;
    }

    interface MemberExtrasRow {
      user_id: string;
      email: string;
      membership_status: string | null;
      department: string | null;
      permissions_json: string | null;
      agent_identity_id: string | null;
      is_personal_account: number | null;
      access_mode: string | null;
    }

    const [{ results: agentRows }, { results: openCounts }, { results: tgLinks }, { results: memberExtras }] =
      await Promise.all([
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
        this.db
          .prepare(
            `SELECT l.user_id, u.email AS user_email, l.telegram_username, l.status
             FROM telegram_agent_links l
             JOIN users u ON u.id = l.user_id
             WHERE l.organization_id = ? AND l.status = 'linked'`
          )
          .bind(organizationId)
          .all<TgLinkJoinRow>(),
        this.db
          .prepare(
            `SELECT om.user_id, u.email, COALESCE(om.status, om.membership_status, 'active') AS membership_status, om.department, om.permissions_json, om.agent_identity_id, u.is_personal_account, ai.access_mode
             FROM organization_members om
             JOIN users u ON u.id = om.user_id
             LEFT JOIN agent_identities ai ON ai.id = om.agent_identity_id OR LOWER(ai.email) = LOWER(u.email)
             WHERE om.organization_id = ?`
          )
          .bind(organizationId)
          .all<MemberExtrasRow>(),
      ]);

    const loadMap = new Map<string, number>();
    for (const row of openCounts) {
      loadMap.set(row.assigned_agent_name, Number(row.cnt));
    }

    const tgByEmail = new Map<string, TgLinkJoinRow>();
    for (const link of tgLinks) {
      tgByEmail.set(link.user_email.toLowerCase(), link);
    }

    const memByEmail = new Map<string, MemberExtrasRow>();
    for (const m of memberExtras) {
      memByEmail.set(m.email.toLowerCase(), m);
    }

    return agentRows.map((a) => {
      const emailKey = a.email.toLowerCase();
      const tg = tgByEmail.get(emailKey);
      const mem = memByEmail.get(emailKey);
      let parsedPermissions: WorkspacePermissionKey[] = [];
      if (mem?.permissions_json) {
        try {
          parsedPermissions = JSON.parse(mem.permissions_json) as WorkspacePermissionKey[];
        } catch {
          parsedPermissions = [];
        }
      }
      const resolvedRole = (a.role as UserRole) || UserRole.Agent;
      if (parsedPermissions.length === 0) {
        parsedPermissions = DEFAULT_PERMISSIONS_BY_ROLE[resolvedRole] ?? DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent];
      }

      const accessMode: AgentAccessMode =
        mem?.access_mode === 'business_managed' || mem?.is_personal_account === 0
          ? 'business_managed'
          : 'personal_account';

      return {
        id: a.id,
        organizationId: a.organization_id,
        userId: a.user_id ?? mem?.user_id ?? tg?.user_id ?? null,
        agentIdentityId: a.agent_identity_id ?? mem?.agent_identity_id ?? null,
        displayName: a.display_name,
        email: a.email,
        role: a.role as WorkspaceAgentRecord['role'],
        department: a.department || mem?.department || '',
        specialty: a.specialty,
        availability: a.availability as AgentAvailability,
        membershipStatus: ((a.membership_status || mem?.membership_status || 'active') as MembershipLifecycleStatus),
        accessMode,
        permissions: parsedPermissions,
        activeConversations: loadMap.get(a.display_name) ?? 0,
        telegramLinked: Boolean(tg),
        telegramUsername: tg?.telegram_username ?? null,
        createdAt: a.created_at,
      };
    });
  }

  async createAgent(
    organizationId: string,
    input: {
      displayName: string;
      email: string;
      role: UserRole.Agent | UserRole.Supervisor | UserRole.Admin;
      department?: string;
      specialty: string;
      availability: AgentAvailability;
      permissions?: WorkspacePermissionKey[];
    }
  ): Promise<WorkspaceAgentRecord> {
    const now = new Date().toISOString();
    const id = createId('agt');
    const normalizedEmail = input.email.trim().toLowerCase();
    const department = input.department?.trim() ?? '';

    const existingUser = await this.db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .bind(normalizedEmail)
      .first<{ id: string }>();

    await this.db
      .prepare(
        `INSERT INTO support_agents
           (id, organization_id, user_id, display_name, email, role, department, specialty, availability, membership_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      )
      .bind(
        id,
        organizationId,
        existingUser?.id ?? null,
        input.displayName.trim(),
        normalizedEmail,
        input.role,
        department,
        input.specialty.trim(),
        input.availability,
        now,
        now
      )
      .run();

    if (existingUser) {
      const permissionsJson = JSON.stringify(
        input.permissions && input.permissions.length > 0
          ? input.permissions
          : DEFAULT_PERMISSIONS_BY_ROLE[input.role] ?? DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent]
      );
      await this.db
        .prepare(
          `INSERT INTO organization_members (id, organization_id, user_id, role, department, permissions_json, status, membership_status, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'active', 'active', 1, ?, ?)
           ON CONFLICT (organization_id, user_id) DO UPDATE SET
             role = CASE WHEN organization_members.role = 'owner' THEN 'owner' ELSE excluded.role END,
             department = excluded.department,
             permissions_json = excluded.permissions_json,
             status = 'active',
             membership_status = 'active',
             is_active = 1,
             updated_at = excluded.updated_at`
        )
        .bind(createId('mem'), organizationId, existingUser.id, input.role, department, permissionsJson, now, now)
        .run();
    }

    const agents = await this.listAgents(organizationId);
    const created = agents.find((a) => a.id === id);
    if (!created) throw new Error('Failed to load created specialist.');
    return created;
  }

  async updateAgent(
    organizationId: string,
    agentId: string,
    patch: {
      displayName?: string;
      email?: string;
      role?: UserRole.Agent | UserRole.Supervisor | UserRole.Admin;
      department?: string;
      specialty?: string;
      availability?: AgentAvailability;
      permissions?: WorkspacePermissionKey[];
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
    const nextRole = patch.role ?? existing.role;
    const nextEmail = patch.email ? patch.email.trim().toLowerCase() : existing.email;
    const nextDepartment = patch.department !== undefined ? patch.department.trim() : (existing.department ?? '');

    await this.db
      .prepare(
        `UPDATE support_agents
         SET display_name = ?, email = ?, role = ?, department = ?, specialty = ?, availability = ?, updated_at = ?
         WHERE id = ? AND organization_id = ?`
      )
      .bind(
        patch.displayName?.trim() || existing.display_name,
        nextEmail,
        nextRole,
        nextDepartment,
        patch.specialty ?? existing.specialty,
        patch.availability ?? existing.availability,
        now,
        agentId,
        organizationId
      )
      .run();

    if (patch.role || patch.department !== undefined || patch.permissions) {
      const targetUser = await this.db
        .prepare(`SELECT id FROM users WHERE email = ?`)
        .bind(nextEmail)
        .first<{ id: string }>();
      if (targetUser) {
        const nextPermsJson = patch.permissions
          ? JSON.stringify(patch.permissions)
          : JSON.stringify(DEFAULT_PERMISSIONS_BY_ROLE[nextRole as UserRole] ?? DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent]);
        await this.db
          .prepare(
            `UPDATE organization_members
             SET role = CASE WHEN role = 'owner' THEN 'owner' ELSE ? END,
                 department = ?,
                 permissions_json = COALESCE(?, permissions_json),
                 updated_at = ?
             WHERE organization_id = ? AND user_id = ?`
          )
          .bind(
            nextRole,
            nextDepartment,
            patch.permissions ? nextPermsJson : null,
            now,
            organizationId,
            targetUser.id
          )
          .run();
      }
    }

    const agents = await this.listAgents(organizationId);
    const updated = agents.find((a) => a.id === agentId);
    if (!updated) throw new Error('Failed to reload specialist.');
    return updated;
  }

  async deleteAgent(organizationId: string, agentId: string): Promise<void> {
    const existing = await this.db
      .prepare(`SELECT * FROM support_agents WHERE id = ? AND organization_id = ?`)
      .bind(agentId, organizationId)
      .first<AgentRow>();

    if (existing) {
      const now = new Date().toISOString();
      const targetUser = existing.user_id
        ? { id: existing.user_id }
        : await this.db
            .prepare(`SELECT id FROM users WHERE email = ?`)
            .bind(existing.email.toLowerCase())
            .first<{ id: string }>();

      if (targetUser) {
        // Revoke non-owner membership, sessions, and any active Telegram agent link for this business
        await this.db
          .prepare(
            `UPDATE organization_members
             SET is_active = CASE WHEN role = 'owner' THEN 1 ELSE 0 END,
                 status = CASE WHEN role = 'owner' THEN 'active' ELSE 'revoked' END,
                 membership_status = CASE WHEN role = 'owner' THEN 'active' ELSE 'revoked' END,
                 revoked_at = CASE WHEN role = 'owner' THEN NULL ELSE ? END,
                 updated_at = ?
             WHERE organization_id = ? AND user_id = ?`
          )
          .bind(now, now, organizationId, targetUser.id)
          .run();

        await this.db
          .prepare(
            `UPDATE auth_sessions
             SET revoked_at = ?
             WHERE user_id = ? AND organization_id = ? AND revoked_at IS NULL`
          )
          .bind(now, targetUser.id, organizationId)
          .run();

        await this.db
          .prepare(
            `UPDATE telegram_agent_links
             SET status = 'revoked',
                 link_code_hash = NULL,
                 telegram_user_id = NULL,
                 telegram_chat_id = NULL,
                 updated_at = ?
             WHERE organization_id = ? AND user_id = ?`
          )
          .bind(now, organizationId, targetUser.id)
          .run();
      }
    }

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
    const pending = convMap.get('pending') ?? 0;
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
        total: open + pending + troubleshooting + escalated + resolved,
        open,
        pending,
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
      .prepare(`SELECT id, is_personal_account, account_type FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string; is_personal_account: number; account_type: string }>();

    if (existingUser && Number(existingUser.is_personal_account ?? 1) === 1) {
      throw new Error('An account with this email address already exists. Please sign in.');
    }
    if (existingUser && existingUser.account_type === 'agent') {
      throw new Error(
        'This email is registered as a Support Agent account. Business and Support Agent accounts work independently.'
      );
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const userId = existingUser?.id ?? `usr_${Math.random().toString(36).slice(2, 10)}`;
    const passwordHash = hashPassword(input.password);
    const initialVerifiedFlag = input.requireEmailVerification ? 0 : 1;
    const isSuperAdmin = (DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS as readonly string[]).includes(email) ? 1 : 0;

    if (existingUser) {
      await this.db
        .prepare(
          `UPDATE users
           SET full_name = ?, password_hash = ?, email_verified = MAX(email_verified, ?),
               account_type = 'business', is_personal_account = 1, is_platform_admin = MAX(is_platform_admin, ?), updated_at = ?
           WHERE id = ?`
        )
        .bind(input.fullName.trim(), passwordHash, initialVerifiedFlag, isSuperAdmin, now, userId)
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO users
             (id, email, full_name, password_hash, email_verified, mfa_enabled, account_type, is_personal_account, is_platform_admin, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 'business', 1, ?, ?, ?)`
        )
        .bind(userId, email, input.fullName.trim(), passwordHash, initialVerifiedFlag, isSuperAdmin, now, now)
        .run();
    }

    // Ensure personal agent_identities record exists for cross-workspace use
    const agentIdentityId = createId('aid');
    await this.db
      .prepare(
        `INSERT INTO agent_identities
           (id, email, display_name, password_hash, email_verified, user_id, access_mode, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'personal_account', 'active', ?, ?)
         ON CONFLICT (email) DO UPDATE SET
           user_id = excluded.user_id,
           access_mode = 'personal_account',
           updated_at = excluded.updated_at`
      )
      .bind(agentIdentityId, email, input.fullName.trim(), passwordHash, initialVerifiedFlag, userId, now, now)
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
    if (!baseSlug || ['admin', 'api', 'login', 'onboarding', 'portals', 'www', 'platform-admin', 'invite', 'privacy', 'terms', 'compliance'].includes(baseSlug)) {
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
    const ownerPermissions = JSON.stringify(DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Owner]);
    await this.db
      .prepare(
        `INSERT INTO organization_members
          (id, organization_id, user_id, agent_identity_id, role, department, permissions_json, status, membership_status, is_active, joined_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'owner', 'Executive & Leadership', ?, 'active', 'active', 1, ?, ?, ?)`
      )
      .bind(memberId, organizationId, userId, agentIdentityId, ownerPermissions, now, now, now)
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
        JSON.stringify({ businessName: input.businessName.trim(), registrationRole: 'business' }),
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
          (id, organization_id, user_id, agent_identity_id, display_name, email, role, department, specialty, availability, membership_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'admin', 'Executive & Leadership', 'Primary Administrator', 'available', 'active', ?, ?)`
      )
      .bind(agentId, organizationId, userId, agentIdentityId, input.fullName.trim(), email, now, now)
      .run();

    return {
      user: {
        id: userId,
        email,
        fullName: input.fullName.trim(),
        emailVerified: Boolean(initialVerifiedFlag),
        mfaEnabled: false,
        accountType: 'business',
        isPersonalAccount: true,
        isPlatformAdmin: Boolean(isSuperAdmin),
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

  /**
   * Registers an independent personal CustomCare Support Agent account without forcing them to create a business.
   * If they already had a Business-Managed Agent identity for that email, upgrades it to a personal CustomCare account
   * while preserving all existing workspace memberships and permissions.
   */
  async registerAgentAccount(input: {
    fullName: string;
    email: string;
    password: string;
    specialty?: string;
    department?: string;
    requireEmailVerification?: boolean;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<{
    user: CareFlowUserRecord;
    activeMembership: UserWorkspaceMembership;
    workspaces: UserWorkspaceMembership[];
    verificationToken: string;
    verificationExpiresAt: string;
  }> {
    const email = input.email.trim().toLowerCase();
    const existingUser = await this.db
      .prepare(`SELECT id, is_personal_account, account_type FROM users WHERE email = ?`)
      .bind(email)
      .first<{ id: string; is_personal_account: number; account_type: string }>();

    if (existingUser && Number(existingUser.is_personal_account ?? 1) === 1) {
      throw new Error('An account with this email address already exists. Please sign in.');
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    const userId = existingUser?.id ?? `usr_${Math.random().toString(36).slice(2, 10)}`;
    const passwordHash = hashPassword(input.password);
    const initialVerifiedFlag = input.requireEmailVerification ? 0 : 1;
    const isSuperAdmin = (DEFAULT_PLATFORM_SUPER_ADMIN_EMAILS as readonly string[]).includes(email) ? 1 : 0;

    if (existingUser) {
      await this.db
        .prepare(
          `UPDATE users
           SET full_name = ?, password_hash = ?, email_verified = MAX(email_verified, ?),
               account_type = 'agent', is_personal_account = 1, is_platform_admin = MAX(is_platform_admin, ?), updated_at = ?
           WHERE id = ?`
        )
        .bind(input.fullName.trim(), passwordHash, initialVerifiedFlag, isSuperAdmin, now, userId)
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO users
             (id, email, full_name, password_hash, email_verified, mfa_enabled, account_type, is_personal_account, is_platform_admin, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, 'agent', 1, ?, ?, ?)`
        )
        .bind(userId, email, input.fullName.trim(), passwordHash, initialVerifiedFlag, isSuperAdmin, now, now)
        .run();
    }

    const agentIdentityId = createId('aid');
    await this.db
      .prepare(
        `INSERT INTO agent_identities
           (id, email, display_name, password_hash, email_verified, user_id, access_mode, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'personal_account', 'active', ?, ?)
         ON CONFLICT (email) DO UPDATE SET
           display_name = excluded.display_name,
           password_hash = excluded.password_hash,
           user_id = excluded.user_id,
           access_mode = 'personal_account',
           updated_at = excluded.updated_at`
      )
      .bind(agentIdentityId, email, input.fullName.trim(), passwordHash, initialVerifiedFlag, userId, now, now)
      .run();

    // Generate cryptographically random single-use email verification token
    const { rawToken: verificationToken, tokenHash } = generateSecureToken(32);
    const verificationExpiresAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();

    await this.db
      .prepare(
        `INSERT INTO auth_tokens (id, user_id, token_hash, token_type, expires_at, used_at, created_at)
         VALUES (?, ?, ?, 'email_verification', ?, NULL, ?)`
      )
      .bind(createId('tok'), userId, tokenHash, verificationExpiresAt, now)
      .run();

    const workspaces = await this.getUserWorkspaces(userId);
    const defaultHubMembership: UserWorkspaceMembership = {
      organizationId: 'org_customcare_agent_hub',
      organizationSlug: 'customcare-agent-hub',
      organizationName: 'CustomCare Agent Hub',
      role: UserRole.Agent,
      country: 'Global',
      industry: 'Customer Support',
      website: '',
      onboardingStatus: 'published',
      onboardingStep: 7,
      membershipStatus: 'active',
      department: input.department?.trim() || 'Support Operations',
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent],
    };

    const activeMembership = workspaces[0] ?? defaultHubMembership;

    await this.db
      .prepare(
        `INSERT INTO auth_security_events
           (id, user_id, organization_id, event_type, ip_address, user_agent, metadata_json, created_at)
         VALUES (?, ?, ?, 'account_registered', ?, ?, ?, ?)`
      )
      .bind(
        createId('sec'),
        userId,
        activeMembership.organizationId,
        input.ipAddress ?? '',
        input.userAgent ?? '',
        JSON.stringify({ registrationRole: 'agent', specialty: input.specialty ?? '' }),
        now
      )
      .run();

    return {
      user: {
        id: userId,
        email,
        fullName: input.fullName.trim(),
        emailVerified: Boolean(initialVerifiedFlag),
        mfaEnabled: false,
        accountType: 'agent',
        isPersonalAccount: true,
        isPlatformAdmin: Boolean(isSuperAdmin),
        createdAt: now,
      },
      activeMembership,
      workspaces,
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
        `SELECT id, email, full_name, password_hash, email_verified, mfa_enabled, account_type, is_personal_account, is_platform_admin, created_at, updated_at
         FROM users WHERE email = ?`
      )
      .bind(email)
      .first<UserRow>();

    if (!userRow) {
      // Mitigate timing-oracle account enumeration by running scrypt verification against a dummy hash
      verifyPassword(passwordInput, DUMMY_TIMING_PASSWORD_HASH);
      return null;
    }

    const isValid = verifyPassword(passwordInput, userRow.password_hash);
    if (!isValid) {
      return null;
    }

    const isPersonalAccount = Number(userRow.is_personal_account ?? 1) === 1;
    const isPlatformAdmin = isRegisteredPlatformSuperAdminEmail(email);

    const workspaces = await this.getUserWorkspaces(userRow.id);
    if (workspaces.length === 0) {
      // Business-Managed Agents with no active workspace membership cannot sign in
      if (!isPersonalAccount && !isPlatformAdmin) {
        return null;
      }
      // Registered personal CustomCare agents can sign in to their Agent Hub even with 0 active workspaces
      const hubMembership: UserWorkspaceMembership = {
        organizationId: 'org_customcare_agent_hub',
        organizationSlug: 'customcare-agent-hub',
        organizationName: 'CustomCare Agent Hub',
        role: UserRole.Agent,
        country: 'Global',
        industry: 'Customer Support',
        website: '',
        onboardingStatus: 'published',
        onboardingStep: 7,
        membershipStatus: 'active',
        department: 'Support Operations',
        permissions: DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent],
      };

      return {
        user: {
          id: userRow.id,
          email: userRow.email,
          fullName: userRow.full_name,
          emailVerified: Boolean(userRow.email_verified),
          mfaEnabled: Boolean(userRow.mfa_enabled),
          accountType: (userRow.account_type as AccountRegistrationMode) || 'agent',
          isPersonalAccount,
          isPlatformAdmin,
          createdAt: userRow.created_at,
        },
        activeMembership: hubMembership,
        workspaces: [],
      };
    }

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        fullName: userRow.full_name,
        emailVerified: Boolean(userRow.email_verified),
        mfaEnabled: Boolean(userRow.mfa_enabled),
        accountType: (userRow.account_type as AccountRegistrationMode) || 'business',
        isPersonalAccount,
        isPlatformAdmin,
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
           o.onboarding_step,
           COALESCE(om.status, om.membership_status, 'active') AS membership_status,
           om.department,
           om.permissions_json,
           om.agent_identity_id
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
      .all<MemberJoinOrgRow>();

    return results.map((r) => {
      const role = (r.role as UserRole) || UserRole.Admin;
      let permissions: WorkspacePermissionKey[] = DEFAULT_PERMISSIONS_BY_ROLE[role] ?? DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent];
      if (r.permissions_json) {
        try {
          const parsed = JSON.parse(r.permissions_json) as WorkspacePermissionKey[];
          if (Array.isArray(parsed) && parsed.length > 0) permissions = parsed;
        } catch {
          // fallback to role defaults
        }
      }
      const lifecycleStatus = (r.membership_status as MembershipLifecycleStatus) || 'active';
      return {
        organizationId: r.organization_id,
        organizationSlug: r.slug,
        organizationName: r.name,
        role,
        country: r.country ?? 'United States',
        industry: r.industry ?? 'Technology',
        website: r.website ?? '',
        onboardingStatus: (r.onboarding_status as BusinessOnboardingStatus) ?? 'incomplete',
        onboardingStep: r.onboarding_step ?? 1,
        status: lifecycleStatus,
        membershipStatus: lifecycleStatus,
        department: r.department ?? '',
        permissions,
        agentIdentityId: r.agent_identity_id ?? null,
      };
    });
  }

  async getUserActiveMembership(
    userId: string,
    organizationId: string
  ): Promise<UserWorkspaceMembership | null> {
    if (organizationId === 'org_customcare_agent_hub') {
      const user = await this.db
        .prepare(`SELECT id, is_personal_account, is_platform_admin FROM users WHERE id = ?`)
        .bind(userId)
        .first<{ id: string; is_personal_account: number; is_platform_admin: number }>();
      if (user && (Number(user.is_personal_account ?? 1) === 1 || Number(user.is_platform_admin ?? 0) === 1)) {
        return {
          organizationId: 'org_customcare_agent_hub',
          organizationSlug: 'customcare-agent-hub',
          organizationName: 'CustomCare Agent Hub',
          role: UserRole.Agent,
          country: 'Global',
          industry: 'Customer Support',
          website: '',
          onboardingStatus: 'published',
          onboardingStep: 7,
          status: 'active',
          membershipStatus: 'active',
          department: 'Support Operations',
          permissions: DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent],
        };
      }
    }

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
           COALESCE(om.status, om.membership_status, 'active') AS membership_status,
           om.department,
           om.permissions_json,
           om.agent_identity_id
         FROM organization_members om
         JOIN organizations o ON o.id = om.organization_id
         WHERE om.user_id = ?
           AND om.organization_id = ?
           AND om.is_active = 1
           AND COALESCE(om.status, om.membership_status, 'active') = 'active'
           AND o.is_active = 1
           AND COALESCE(o.onboarding_status, 'incomplete') != 'suspended'`
      )
      .bind(userId, organizationId)
      .first<MemberJoinOrgRow>();

    if (!row) return null;

    const role = (row.role as UserRole) || UserRole.Admin;
    let permissions: WorkspacePermissionKey[] = DEFAULT_PERMISSIONS_BY_ROLE[role] ?? DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Agent];
    if (row.permissions_json) {
      try {
        const parsed = JSON.parse(row.permissions_json) as WorkspacePermissionKey[];
        if (Array.isArray(parsed) && parsed.length > 0) permissions = parsed;
      } catch {
        // fallback to role defaults
      }
    }

    const lifecycleStatus = (row.membership_status as MembershipLifecycleStatus) || 'active';
    return {
      organizationId: row.organization_id,
      organizationSlug: row.slug,
      organizationName: row.name,
      role,
      country: row.country ?? 'United States',
      industry: row.industry ?? 'Technology',
      website: row.website ?? '',
      onboardingStatus: (row.onboarding_status as BusinessOnboardingStatus) ?? 'incomplete',
      onboardingStep: row.onboarding_step ?? 1,
      status: lifecycleStatus,
      membershipStatus: lifecycleStatus,
      department: row.department ?? '',
      permissions,
      agentIdentityId: row.agent_identity_id ?? null,
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
      .prepare(`SELECT id, email, full_name, account_type FROM users WHERE id = ?`)
      .bind(userId)
      .first<UserRow>();

    if (!user) {
      throw new Error('User account not found.');
    }

    if (user.account_type === 'agent') {
      throw new Error(
        'FORBIDDEN: Support Agent accounts cannot create business workspaces. Business and Agent accounts operate independently.'
      );
    }

    const now = new Date().toISOString();
    let baseSlug = input.businessName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36);
    if (!baseSlug || ['admin', 'api', 'login', 'onboarding', 'portals', 'www', 'platform-admin', 'invite', 'privacy', 'terms', 'compliance'].includes(baseSlug)) {
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

    await this.db
      .prepare(
        `UPDATE users
         SET account_type = 'business', is_personal_account = 1, updated_at = ?
         WHERE id = ?`
      )
      .bind(now, userId)
      .run();

    const memberId = `mem_${Math.random().toString(36).slice(2, 10)}`;
    const ownerPermissions = JSON.stringify(DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Owner]);
    await this.db
      .prepare(
        `INSERT INTO organization_members
          (id, organization_id, user_id, role, department, permissions_json, status, membership_status, is_active, joined_at, created_at, updated_at)
         VALUES (?, ?, ?, 'owner', 'Executive & Leadership', ?, 'active', 'active', 1, ?, ?, ?)`
      )
      .bind(memberId, organizationId, userId, ownerPermissions, now, now, now)
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

    // Seed initial knowledge category & owner specialist record
    await this.db
      .prepare(
        `INSERT INTO knowledge_categories
          (id, organization_id, slug, name, description, display_order, created_at, updated_at)
         VALUES (?, ?, 'general', 'General Support', 'Core guidance and general information.', 10, ?, ?)`
      )
      .bind(createId('cat'), organizationId, now, now)
      .run();

    await this.db
      .prepare(
        `INSERT INTO support_agents
          (id, organization_id, user_id, display_name, email, role, department, specialty, availability, membership_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'admin', 'Executive & Leadership', 'Primary Administrator', 'available', 'active', ?, ?)`
      )
      .bind(createId('agt'), organizationId, userId, user.full_name, user.email.toLowerCase(), now, now)
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
      membershipStatus: 'active',
      department: 'Executive & Leadership',
      permissions: DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Owner],
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
   * Central CustomCare Platform Super-Admin Command Center
   * ------------------------------------------------------------------------- */

  async isUserPlatformAdmin(userId: string, email?: string): Promise<boolean> {
    if (email && !isRegisteredPlatformSuperAdminEmail(email)) {
      return false;
    }
    if (email && isRegisteredPlatformSuperAdminEmail(email)) {
      return true;
    }
    const row = await this.db
      .prepare(`SELECT email, is_platform_admin FROM users WHERE id = ?`)
      .bind(userId)
      .first<{ email: string; is_platform_admin: number }>();
    if (!row) return false;
    return isRegisteredPlatformSuperAdminEmail(row.email);
  }

  async getPlatformAdminOverview(params: {
    centralTelegramBotUsername: string;
    centralTelegramTokenConfigured: boolean;
    centralTelegramSecretConfigured: boolean;
  }): Promise<PlatformAdminOverviewDto> {
    const [
      { results: orgRows },
      { results: userRows },
      { results: identityRows },
      { results: inviteRows },
      { results: auditRows },
      { results: securityRows },
      { results: webhookRows },
      { results: rateLimitRows },
      convAgg,
      activeSessionsCount,
      tgChannelCount,
    ] = await Promise.all([
      this.db
        .prepare(
          `SELECT
             o.id, o.slug, o.name, o.country, o.industry, o.website, o.onboarding_status, o.onboarding_step, o.is_active, o.created_at,
             u.email AS owner_email, u.full_name AS owner_name,
             (SELECT COUNT(*) FROM support_agents sa WHERE sa.organization_id = o.id) AS total_agents,
             (SELECT COUNT(*) FROM support_conversations sc WHERE sc.organization_id = o.id) AS total_conversations,
             (SELECT COUNT(*) FROM support_conversations sc WHERE sc.organization_id = o.id AND sc.status NOT IN ('resolved', 'closed')) AS open_conversations,
             (SELECT COUNT(*) FROM knowledge_articles ka WHERE ka.organization_id = o.id AND ka.status = 'published') AS published_articles,
             (SELECT COUNT(*) FROM knowledge_faqs kf WHERE kf.organization_id = o.id AND kf.status = 'published') AS published_faqs,
             (SELECT ci.status FROM channel_integrations ci WHERE ci.organization_id = o.id AND ci.channel = 'telegram' LIMIT 1) AS telegram_status
           FROM organizations o
           LEFT JOIN users u ON u.id = o.created_by_user_id
           WHERE o.id != 'org_customcare_agent_hub'
           ORDER BY o.created_at DESC`
        )
        .all<{
          id: string;
          slug: string;
          name: string;
          country: string | null;
          industry: string | null;
          website: string | null;
          onboarding_status: string | null;
          onboarding_step: number | null;
          is_active: number;
          created_at: string;
          owner_email: string | null;
          owner_name: string | null;
          total_agents: number;
          total_conversations: number;
          open_conversations: number;
          published_articles: number;
          published_faqs: number;
          telegram_status: string | null;
        }>(),
      this.db
        .prepare(
          `SELECT
             u.id, u.email, u.full_name, u.account_type, u.is_personal_account, u.is_platform_admin, u.email_verified, u.mfa_enabled, u.created_at,
             (SELECT COUNT(*) FROM organization_members om WHERE om.user_id = u.id AND om.is_active = 1 AND om.organization_id != 'org_customcare_agent_hub') AS workspace_count,
             (SELECT GROUP_CONCAT(o.name || ' (' || om.role || ')') FROM organization_members om JOIN organizations o ON o.id = om.organization_id WHERE om.user_id = u.id AND om.is_active = 1 AND om.organization_id != 'org_customcare_agent_hub') AS workspaces_summary,
             (SELECT s.created_at FROM auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL ORDER BY s.created_at DESC LIMIT 1) AS last_active_at,
             (SELECT COUNT(*) FROM auth_sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL) AS active_sessions
           FROM users u
           ORDER BY u.created_at DESC`
        )
        .all<{
          id: string;
          email: string;
          full_name: string;
          account_type: string | null;
          is_personal_account: number | null;
          is_platform_admin: number | null;
          email_verified: number;
          mfa_enabled: number | null;
          created_at: string;
          workspace_count: number;
          workspaces_summary: string | null;
          last_active_at: string | null;
          active_sessions: number;
        }>(),
      this.db
        .prepare(
          `SELECT
             ai.id, ai.email, ai.display_name, ai.access_mode, ai.email_verified, ai.user_id, ai.status, ai.created_at,
             (SELECT COUNT(*) FROM organization_members om JOIN users u ON u.id = om.user_id WHERE LOWER(u.email) = LOWER(ai.email) AND om.is_active = 1 AND om.organization_id != 'org_customcare_agent_hub') AS workspace_count
           FROM agent_identities ai
           ORDER BY ai.created_at DESC
           LIMIT 200`
        )
        .all<{
          id: string;
          email: string;
          display_name: string;
          access_mode: string;
          email_verified: number;
          user_id: string | null;
          status: string;
          created_at: string;
          workspace_count: number;
        }>(),
      this.db
        .prepare(
          `SELECT i.*, o.name AS organization_name, o.slug AS organization_slug
           FROM workspace_invitations i
           JOIN organizations o ON o.id = i.organization_id
           ORDER BY i.created_at DESC
           LIMIT 100`
        )
        .all<{
          id: string;
          organization_id: string;
          organization_name: string;
          organization_slug: string;
          email: string;
          role: string;
          department: string;
          permissions_json: string;
          invited_by_user_id: string | null;
          invited_by_name: string;
          status: string;
          expires_at: string;
          accepted_at: string | null;
          revoked_at: string | null;
          created_at: string;
        }>(),
      this.db
        .prepare(
          `SELECT * FROM workspace_audit_logs
           ORDER BY created_at DESC
           LIMIT 100`
        )
        .all<{
          id: string;
          organization_id: string | null;
          actor_user_id: string | null;
          actor_email: string;
          action: string;
          target_type: string;
          target_id: string;
          metadata_json: string;
          ip_address: string;
          created_at: string;
        }>(),
      this.db
        .prepare(
          `SELECT * FROM auth_security_events
           ORDER BY created_at DESC
           LIMIT 100`
        )
        .all<{
          id: string;
          user_id: string | null;
          organization_id: string | null;
          event_type: string;
          ip_address: string;
          user_agent: string;
          metadata_json: string;
          created_at: string;
        }>(),
      this.db
        .prepare(
          `SELECT w.*, o.name AS organization_name
           FROM webhook_event_logs w
           LEFT JOIN organizations o ON o.id = w.organization_id
           ORDER BY w.processed_at DESC
           LIMIT 80`
        )
        .all<{
          id: string;
          provider: string;
          idempotency_key: string;
          organization_id: string | null;
          organization_name: string | null;
          event_type: string;
          status: string;
          error_message: string | null;
          processed_at: string;
        }>(),
      this.db
        .prepare(
          `SELECT key AS bucket_key, attempt_count, window_started_at, locked_until AS blocked_until, updated_at
           FROM auth_rate_limits
           ORDER BY updated_at DESC
           LIMIT 50`
        )
        .all<{
          bucket_key: string;
          attempt_count: number;
          window_started_at: string;
          blocked_until: string | null;
          updated_at: string;
        }>(),
      this.db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) AS open_cnt
           FROM support_conversations`
        )
        .first<{ total: number; open_cnt: number }>(),
      this.db
        .prepare(`SELECT COUNT(*) AS cnt FROM auth_sessions WHERE revoked_at IS NULL`)
        .first<{ cnt: number }>(),
      this.db
        .prepare(`SELECT COUNT(*) AS cnt FROM channel_integrations WHERE channel = 'telegram' AND status IN ('connected', 'active')`)
        .first<{ cnt: number }>(),
    ]);

    const businesses = orgRows.map((o) => ({
      id: o.id,
      slug: o.slug,
      name: o.name,
      country: o.country ?? 'United States',
      industry: o.industry ?? 'Technology',
      website: o.website ?? '',
      onboardingStatus: (o.onboarding_status as BusinessOnboardingStatus) ?? 'incomplete',
      onboardingStep: Number(o.onboarding_step ?? 1),
      isActive: Boolean(o.is_active),
      ownerEmail: o.owner_email ?? null,
      ownerName: o.owner_name ?? null,
      totalAgents: Number(o.total_agents ?? 0),
      totalConversations: Number(o.total_conversations ?? 0),
      openConversations: Number(o.open_conversations ?? 0),
      publishedArticles: Number(o.published_articles ?? 0),
      publishedFaqs: Number(o.published_faqs ?? 0),
      telegramConnected: o.telegram_status === 'active' || o.telegram_status === 'connected',
      createdAt: o.created_at ?? new Date().toISOString(),
    }));

    const users = userRows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      accountType: ((u.account_type as AccountRegistrationMode) || 'business'),
      isPersonalAccount: Number(u.is_personal_account ?? 1) === 1,
      isPlatformAdmin: isRegisteredPlatformSuperAdminEmail(u.email),
      emailVerified: Boolean(u.email_verified),
      mfaEnabled: Boolean(u.mfa_enabled),
      workspaceCount: Number(u.workspace_count ?? 0),
      workspacesSummary: u.workspaces_summary || null,
      lastActiveAt: u.last_active_at || null,
      activeSessions: Number(u.active_sessions ?? 0),
      createdAt: u.created_at,
    }));

    const agentIdentities = identityRows.map((ai) => ({
      id: ai.id,
      email: ai.email,
      displayName: ai.display_name,
      accessMode: (ai.access_mode as AgentAccessMode) || 'business_managed',
      emailVerified: Boolean(ai.email_verified),
      userId: ai.user_id,
      status: (ai.status as 'active' | 'suspended' | 'revoked') || 'active',
      workspaceCount: Number(ai.workspace_count ?? 0),
      createdAt: ai.created_at,
    }));

    const recentInvitations: WorkspaceInvitationRecord[] = inviteRows.map((r) => {
      let permissions: WorkspacePermissionKey[] = [];
      try {
        permissions = JSON.parse(r.permissions_json) as WorkspacePermissionKey[];
      } catch {
        permissions = [];
      }
      return {
        id: r.id,
        organizationId: r.organization_id,
        organizationName: r.organization_name,
        organizationSlug: r.organization_slug,
        email: r.email,
        role: r.role as WorkspaceInvitationRecord['role'],
        department: r.department ?? '',
        permissions,
        invitedByUserId: r.invited_by_user_id,
        invitedByName: r.invited_by_name,
        status: r.status as WorkspaceInvitationRecord['status'],
        expiresAt: r.expires_at,
        acceptedAt: r.accepted_at,
        revokedAt: r.revoked_at,
        createdAt: r.created_at,
      };
    });

    const recentAuditLogs: WorkspaceAuditLogRecord[] = auditRows.map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      actorUserId: r.actor_user_id,
      actorEmail: r.actor_email,
      action: r.action,
      actionType: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      details: r.metadata_json,
      metadataJson: r.metadata_json,
      ipAddress: r.ip_address,
      createdAt: r.created_at,
    }));

    const recentSecurityEvents = securityRows.map((e) => {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = JSON.parse(e.metadata_json || '{}') as Record<string, unknown>;
      } catch {
        metadata = {};
      }
      return {
        id: e.id,
        userId: e.user_id,
        organizationId: e.organization_id,
        eventType: e.event_type as PlatformAdminOverviewDto['recentSecurityEvents'][number]['eventType'],
        ipAddress: e.ip_address,
        userAgent: e.user_agent,
        metadata,
        createdAt: e.created_at,
      };
    });

    const recentWebhookEvents = webhookRows.map((w) => ({
      id: w.id,
      organizationId: w.organization_id ?? 'central',
      organizationName: w.organization_name ?? w.organization_id ?? 'Central',
      channelType: w.provider,
      externalEventId: w.idempotency_key,
      eventSummary: w.event_type,
      status: w.status,
      errorDetail: w.error_message,
      processedAt: w.processed_at,
    }));

    const rateLimitBuckets = rateLimitRows.map((rl) => ({
      bucketKey: rl.bucket_key,
      attemptCount: Number(rl.attempt_count ?? 0),
      windowStartedAt: rl.window_started_at,
      blockedUntil: rl.blocked_until,
      updatedAt: rl.updated_at,
    }));

    return {
      stats: {
        totalBusinesses: businesses.length,
        publishedBusinesses: businesses.filter((b) => b.onboardingStatus === 'published').length,
        activeBusinesses: businesses.filter((b) => b.isActive).length,
        totalUsers: users.length,
        personalAccounts: users.filter((u) => u.isPersonalAccount).length,
        businessManagedAgents: agentIdentities.filter((a) => a.accessMode === 'business_managed').length,
        pendingInvitations: recentInvitations.filter((i) => i.status === 'pending').length,
        totalConversations: Number(convAgg?.total ?? 0),
        openConversations: Number(convAgg?.open_cnt ?? 0),
        activeSessions: Number(activeSessionsCount?.cnt ?? 0),
      },
      centralTelegramBot: {
        botUsername: params.centralTelegramBotUsername,
        tokenConfigured: params.centralTelegramTokenConfigured,
        secretConfigured: params.centralTelegramSecretConfigured,
        businessOnboardingOnHold: true,
        connectedWorkspaceChannels: Number(tgChannelCount?.cnt ?? 0),
      },
      businesses,
      users,
      agentIdentities,
      recentInvitations,
      recentAuditLogs,
      recentSecurityEvents,
      recentWebhookEvents,
      rateLimitBuckets,
    };
  }

  async recordSystemErrorLog(params: {
    errorCode: string;
    internalMessage: string;
    routeOrContext?: string;
    stack?: string;
    organizationId?: string | null;
    actorUserId?: string | null;
    actorEmail?: string | null;
    ipAddress?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const metadata = {
      errorCode: params.errorCode,
      internalMessage: params.internalMessage.slice(0, 1000),
      routeOrContext: params.routeOrContext || 'api',
      stack: params.stack ? params.stack.split('\n').slice(0, 4).join(' | ') : undefined,
      recordedAt: now,
    };

    await this.db
      .prepare(
        `INSERT INTO workspace_audit_logs
           (id, organization_id, actor_user_id, actor_email, action, target_type, target_id, metadata_json, ip_address, created_at)
         VALUES (?, ?, ?, ?, 'system_internal_error', 'system_error', ?, ?, ?, ?)`
      )
      .bind(
        createId('aud'),
        params.organizationId ?? null,
        params.actorUserId ?? null,
        params.actorEmail ?? 'System Runtime',
        params.errorCode,
        JSON.stringify(metadata),
        params.ipAddress ?? '',
        now
      )
      .run();
  }

  async executePlatformAdminAction(params: {
    actorUserId: string;
    actorName: string;
    action:
      | { type: 'toggle_business_active'; organizationId: string; isActive: boolean }
      | { type: 'set_business_onboarding_status'; organizationId: string; status: BusinessOnboardingStatus }
      | { type: 'verify_user_email'; targetUserId: string }
      | { type: 'toggle_platform_admin'; targetUserId: string; isPlatformAdmin: boolean }
      | { type: 'revoke_user_sessions'; targetUserId: string }
      | { type: 'clear_rate_limits'; bucketKey?: string }
      | { type: 'enter_business_workspace'; organizationId: string };
  }): Promise<{ message: string; organizationId?: string }> {
    const now = new Date().toISOString();
    const { action } = params;

    const actorUser = await this.db
      .prepare(`SELECT email FROM users WHERE id = ?`)
      .bind(params.actorUserId)
      .first<{ email: string }>();
    const actorEmail = actorUser?.email ?? params.actorName;

    const recordAudit = async (
      organizationId: string | null,
      actionName: string,
      targetType: string,
      targetId: string,
      metadata: Record<string, unknown>
    ) => {
      await this.db
        .prepare(
          `INSERT INTO workspace_audit_logs
             (id, organization_id, actor_user_id, actor_email, action, target_type, target_id, metadata_json, ip_address, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?)`
        )
        .bind(
          createId('aud'),
          organizationId,
          params.actorUserId,
          actorEmail,
          actionName,
          targetType,
          targetId,
          JSON.stringify(metadata),
          now
        )
        .run();
    };

    if (action.type === 'toggle_business_active') {
      await this.db
        .prepare(`UPDATE organizations SET is_active = ?, updated_at = ? WHERE id = ?`)
        .bind(action.isActive ? 1 : 0, now, action.organizationId)
        .run();
      await recordAudit(
        action.organizationId,
        action.isActive ? 'platform_admin_business_activated' : 'platform_admin_business_suspended',
        'organization',
        action.organizationId,
        { isActive: action.isActive }
      );
      return {
        message: action.isActive ? 'Business workspace activated.' : 'Business workspace suspended.',
        organizationId: action.organizationId,
      };
    }

    if (action.type === 'set_business_onboarding_status') {
      await this.db
        .prepare(`UPDATE organizations SET onboarding_status = ?, updated_at = ? WHERE id = ?`)
        .bind(action.status, now, action.organizationId)
        .run();
      await recordAudit(
        action.organizationId,
        'platform_admin_onboarding_status_changed',
        'organization',
        action.organizationId,
        { status: action.status }
      );
      return {
        message: `Business onboarding status updated to "${action.status}".`,
        organizationId: action.organizationId,
      };
    }

    if (action.type === 'verify_user_email') {
      await this.db
        .prepare(`UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?`)
        .bind(now, action.targetUserId)
        .run();
      await recordAudit(null, 'platform_admin_verified_user_email', 'user', action.targetUserId, {});
      return { message: 'User email marked as verified.' };
    }

    if (action.type === 'toggle_platform_admin') {
      await this.db
        .prepare(`UPDATE users SET is_platform_admin = ?, updated_at = ? WHERE id = ?`)
        .bind(action.isPlatformAdmin ? 1 : 0, now, action.targetUserId)
        .run();
      await recordAudit(
        null,
        action.isPlatformAdmin ? 'platform_admin_granted' : 'platform_admin_revoked',
        'user',
        action.targetUserId,
        { isPlatformAdmin: action.isPlatformAdmin }
      );
      return {
        message: action.isPlatformAdmin
          ? 'Granted CustomCare Platform Admin privileges.'
          : 'Removed CustomCare Platform Admin privileges.',
      };
    }

    if (action.type === 'revoke_user_sessions') {
      await this.db
        .prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`)
        .bind(now, action.targetUserId)
        .run();
      await recordAudit(null, 'platform_admin_revoked_user_sessions', 'user', action.targetUserId, {});
      return { message: 'All active sessions for user have been revoked.' };
    }

    if (action.type === 'clear_rate_limits') {
      if (action.bucketKey) {
        await this.db
          .prepare(`DELETE FROM auth_rate_limits WHERE key = ?`)
          .bind(action.bucketKey)
          .run();
        await recordAudit(null, 'platform_admin_cleared_rate_limit', 'rate_limit', action.bucketKey, {});
        return { message: `Cleared rate limit bucket "${action.bucketKey}".` };
      }
      await this.db.prepare(`DELETE FROM auth_rate_limits`).run();
      await recordAudit(null, 'platform_admin_cleared_all_rate_limits', 'rate_limit', 'all', {});
      return { message: 'Cleared all authentication rate limit buckets.' };
    }

    if (action.type === 'enter_business_workspace') {
      // Ensure platform super-admin has an active owner/admin membership in the target business so they can inspect/manage it directly
      const ownerPerms = JSON.stringify(DEFAULT_PERMISSIONS_BY_ROLE[UserRole.Owner]);
      await this.db
        .prepare(
          `INSERT INTO organization_members
             (id, organization_id, user_id, role, department, permissions_json, status, membership_status, is_active, joined_at, created_at, updated_at)
           VALUES (?, ?, ?, 'owner', 'Platform Administration', ?, 'active', 'active', 1, ?, ?, ?)
           ON CONFLICT (organization_id, user_id) DO UPDATE SET
             is_active = 1,
             status = 'active',
             membership_status = 'active',
             updated_at = excluded.updated_at`
        )
        .bind(createId('mem'), action.organizationId, params.actorUserId, ownerPerms, now, now, now)
        .run();

      await recordAudit(
        action.organizationId,
        'platform_admin_entered_workspace',
        'organization',
        action.organizationId,
        {}
      );

      return {
        message: 'Entered business workspace as Platform Super-Admin.',
        organizationId: action.organizationId,
      };
    }

    throw new Error('Unsupported platform admin action.');
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

  async unpublishWorkspacePortal(organizationId: string): Promise<OnboardingProgressReport> {
    const org = await this.getActiveOrgById(organizationId);
    if (!org) {
      throw new Error('Organization workspace not found.');
    }

    const now = new Date().toISOString();
    await this.db
      .prepare(
        `UPDATE organizations
         SET onboarding_status = 'ready_to_publish', updated_at = ?
         WHERE id = ?`
      )
      .bind(now, organizationId)
      .run();

    return this.getOnboardingProgress(organizationId);
  }
}

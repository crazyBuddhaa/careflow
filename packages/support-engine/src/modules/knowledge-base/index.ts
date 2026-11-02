import {
  KnowledgeStatus,
  UserRole,
  type KnowledgeArticle,
  type KnowledgeArticleSummary,
  type KnowledgeCategory,
  type KnowledgeFaq,
  type KnowledgeOverviewCounts,
  type KnowledgeRetrievalMatch,
} from '@careflow/shared';
import type {
  CreateKnowledgeArticleInput,
  CreateKnowledgeCategoryInput,
  CreateKnowledgeFaqInput,
  KnowledgeListFilterInput,
  UpdateKnowledgeArticleInput,
  UpdateKnowledgeCategoryInput,
  UpdateKnowledgeFaqInput,
} from '@careflow/validation';
import { hasMinimumRole, type AuthSessionIdentity } from '../authentication';

export class KnowledgeDomainError extends Error {
  readonly code:
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'NOT_FOUND'
    | 'CONFLICT'
    | 'INVALID_CATEGORY';

  constructor(
    code:
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'INVALID_CATEGORY',
    message: string
  ) {
    super(message);
    this.name = 'KnowledgeDomainError';
    this.code = code;
  }
}

/* ============================================================================
 * Backward-Compatible Legacy Search Port (preserved from v0.1.0 scaffold)
 * ========================================================================== */

export interface KnowledgeSearchQuery {
  organizationId: string;
  query: string;
  category?: string;
  limit?: number;
}

export interface KnowledgeBasePort {
  searchPublishedArticles(params: KnowledgeSearchQuery): Promise<KnowledgeArticleSummary[]>;
  getArticleBySlug(
    organizationId: string,
    slug: string
  ): Promise<(KnowledgeArticleSummary & { bodyMarkdown: string }) | null>;
}

/* ============================================================================
 * Stage 1 — Multi-Business Knowledge Management Repository Ports
 * Every repository operation requires an explicit server-verified organizationId.
 * ========================================================================== */

export interface CreateCategoryRecord extends Omit<CreateKnowledgeCategoryInput, 'slug'> {
  slug: string;
}

export interface UpdateCategoryRecord extends Omit<UpdateKnowledgeCategoryInput, 'slug'> {
  slug?: string;
}

export interface CreateArticleRecord extends Omit<CreateKnowledgeArticleInput, 'slug'> {
  slug: string;
  searchKeywords: string;
}

export interface UpdateArticleRecord extends Omit<UpdateKnowledgeArticleInput, 'slug'> {
  slug?: string;
  searchKeywords?: string;
}

export interface CreateFaqRecord extends CreateKnowledgeFaqInput {
  searchKeywords: string;
}

export interface UpdateFaqRecord extends UpdateKnowledgeFaqInput {
  searchKeywords?: string;
}

export interface KnowledgeRepositoryPort {
  // Categories
  listCategories(organizationId: string): Promise<KnowledgeCategory[]>;
  getCategoryById(organizationId: string, categoryId: string): Promise<KnowledgeCategory | null>;
  getCategoryBySlug(organizationId: string, slug: string): Promise<KnowledgeCategory | null>;
  createCategory(
    organizationId: string,
    record: CreateCategoryRecord
  ): Promise<KnowledgeCategory>;
  updateCategory(
    organizationId: string,
    categoryId: string,
    record: UpdateCategoryRecord
  ): Promise<KnowledgeCategory | null>;
  deleteCategory(organizationId: string, categoryId: string): Promise<boolean>;

  // Articles
  listArticles(
    organizationId: string,
    filter?: KnowledgeListFilterInput
  ): Promise<KnowledgeArticle[]>;
  getArticleById(organizationId: string, articleId: string): Promise<KnowledgeArticle | null>;
  getArticleBySlugScoped(organizationId: string, slug: string): Promise<KnowledgeArticle | null>;
  createArticle(
    organizationId: string,
    record: CreateArticleRecord
  ): Promise<KnowledgeArticle>;
  updateArticle(
    organizationId: string,
    articleId: string,
    record: UpdateArticleRecord
  ): Promise<KnowledgeArticle | null>;
  deleteArticle(organizationId: string, articleId: string): Promise<boolean>;

  // FAQs
  listFaqs(
    organizationId: string,
    filter?: KnowledgeListFilterInput
  ): Promise<KnowledgeFaq[]>;
  getFaqById(organizationId: string, faqId: string): Promise<KnowledgeFaq | null>;
  createFaq(organizationId: string, record: CreateFaqRecord): Promise<KnowledgeFaq>;
  updateFaq(
    organizationId: string,
    faqId: string,
    record: UpdateFaqRecord
  ): Promise<KnowledgeFaq | null>;
  deleteFaq(organizationId: string, faqId: string): Promise<boolean>;

  // Overview Counts
  getOverviewCounts(organizationId: string): Promise<KnowledgeOverviewCounts>;
}

/* ============================================================================
 * Future Chatbot Retrieval Port (Published-Only, Business-Scoped)
 * ========================================================================== */

export interface PublishedKnowledgeRetrievalQuery {
  organizationId: string;
  query: string;
  allowedCategoryIds?: string[];
  excludedCategoryIds?: string[];
  limit?: number;
}

export interface ChatbotKnowledgeRetrievalPort {
  retrievePublishedKnowledge(
    params: PublishedKnowledgeRetrievalQuery
  ): Promise<KnowledgeRetrievalMatch[]>;
}

/* ============================================================================
 * Helper Utilities (Pure TypeScript, Database-Independent)
 * ========================================================================== */

export function generateKnowledgeSlug(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);

  return base || `item-${Date.now().toString(36)}`;
}

export function buildSearchKeywords(parts: Array<string | string[] | undefined>): string {
  const tokens = new Set<string>();

  for (const part of parts) {
    if (!part) continue;
    const raw = Array.isArray(part) ? part.join(' ') : part;
    const words = raw
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    for (const word of words) {
      tokens.add(word);
    }
  }

  return Array.from(tokens).slice(0, 150).join(' ');
}

function assertAuthorizedKnowledgeAdmin(identity: AuthSessionIdentity | null): AuthSessionIdentity {
  if (!identity || !identity.organizationId) {
    throw new KnowledgeDomainError(
      'UNAUTHORIZED',
      'An authenticated business administrator session is required.'
    );
  }

  if (!hasMinimumRole(identity, UserRole.Admin)) {
    throw new KnowledgeDomainError(
      'FORBIDDEN',
      'Insufficient permissions: Business Administrator role is required to manage knowledge.'
    );
  }

  return identity;
}

/* ============================================================================
 * KnowledgeManagementService — Pure Domain & Business Logic Layer
 * Enforces RBAC, tenant isolation, category ownership, slug uniqueness, and
 * future chatbot retrieval readiness independent of SQLite/D1/PostgreSQL.
 * ========================================================================== */

export class KnowledgeManagementService implements ChatbotKnowledgeRetrievalPort {
  constructor(private readonly repository: KnowledgeRepositoryPort) {}

  private async verifyCategoryBelongsToOrganization(
    organizationId: string,
    categoryId: string | null | undefined
  ): Promise<void> {
    if (!categoryId) return;
    const category = await this.repository.getCategoryById(organizationId, categoryId);
    if (!category || category.organizationId !== organizationId) {
      throw new KnowledgeDomainError(
        'INVALID_CATEGORY',
        'Selected category does not exist in your business workspace.'
      );
    }
  }

  async getOverview(identity: AuthSessionIdentity | null): Promise<KnowledgeOverviewCounts> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    return this.repository.getOverviewCounts(session.organizationId);
  }

  // ---- Categories ----

  async listCategories(identity: AuthSessionIdentity | null): Promise<KnowledgeCategory[]> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    return this.repository.listCategories(session.organizationId);
  }

  async createCategory(
    identity: AuthSessionIdentity | null,
    input: CreateKnowledgeCategoryInput
  ): Promise<KnowledgeCategory> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    const slug = input.slug || generateKnowledgeSlug(input.name);

    const existing = await this.repository.getCategoryBySlug(session.organizationId, slug);
    if (existing) {
      throw new KnowledgeDomainError(
        'CONFLICT',
        `A category with slug "${slug}" already exists in this workspace.`
      );
    }

    return this.repository.createCategory(session.organizationId, {
      name: input.name,
      slug,
      description: input.description ?? '',
      displayOrder: input.displayOrder ?? 0,
    });
  }

  async updateCategory(
    identity: AuthSessionIdentity | null,
    categoryId: string,
    input: UpdateKnowledgeCategoryInput
  ): Promise<KnowledgeCategory> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    const current = await this.repository.getCategoryById(session.organizationId, categoryId);

    if (!current) {
      throw new KnowledgeDomainError('NOT_FOUND', 'Category not found in this workspace.');
    }

    let nextSlug: string | undefined = input.slug;
    if (!nextSlug && input.name && input.name !== current.name) {
      nextSlug = generateKnowledgeSlug(input.name);
    }

    if (nextSlug && nextSlug !== current.slug) {
      const duplicate = await this.repository.getCategoryBySlug(session.organizationId, nextSlug);
      if (duplicate && duplicate.id !== categoryId) {
        throw new KnowledgeDomainError(
          'CONFLICT',
          `Another category already uses slug "${nextSlug}".`
        );
      }
    }

    const updated = await this.repository.updateCategory(session.organizationId, categoryId, {
      ...input,
      slug: nextSlug,
    });

    if (!updated) {
      throw new KnowledgeDomainError('NOT_FOUND', 'Category not found in this workspace.');
    }

    return updated;
  }

  async deleteCategory(
    identity: AuthSessionIdentity | null,
    categoryId: string
  ): Promise<void> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    const deleted = await this.repository.deleteCategory(session.organizationId, categoryId);
    if (!deleted) {
      throw new KnowledgeDomainError('NOT_FOUND', 'Category not found in this workspace.');
    }
  }

  // ---- Articles ----

  async listArticles(
    identity: AuthSessionIdentity | null,
    filter?: KnowledgeListFilterInput
  ): Promise<KnowledgeArticle[]> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    return this.repository.listArticles(session.organizationId, filter);
  }

  async getArticle(
    identity: AuthSessionIdentity | null,
    articleId: string
  ): Promise<KnowledgeArticle> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    const article = await this.repository.getArticleById(session.organizationId, articleId);
    if (!article) {
      throw new KnowledgeDomainError('NOT_FOUND', 'Knowledge article not found in this workspace.');
    }
    return article;
  }

  async createArticle(
    identity: AuthSessionIdentity | null,
    input: CreateKnowledgeArticleInput
  ): Promise<KnowledgeArticle> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    await this.verifyCategoryBelongsToOrganization(session.organizationId, input.categoryId);

    const slug = input.slug || generateKnowledgeSlug(input.title);
    const duplicate = await this.repository.getArticleBySlugScoped(session.organizationId, slug);
    if (duplicate) {
      throw new KnowledgeDomainError(
        'CONFLICT',
        `An article with slug "${slug}" already exists in this workspace.`
      );
    }

    const searchKeywords = buildSearchKeywords([
      input.title,
      input.shortDescription,
      input.tags,
      input.content,
    ]);

    return this.repository.createArticle(session.organizationId, {
      ...input,
      slug,
      searchKeywords,
    });
  }

  async updateArticle(
    identity: AuthSessionIdentity | null,
    articleId: string,
    input: UpdateKnowledgeArticleInput
  ): Promise<KnowledgeArticle> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    const existing = await this.repository.getArticleById(session.organizationId, articleId);
    if (!existing) {
      throw new KnowledgeDomainError('NOT_FOUND', 'Knowledge article not found in this workspace.');
    }

    if (input.categoryId !== undefined) {
      await this.verifyCategoryBelongsToOrganization(session.organizationId, input.categoryId);
    }

    let nextSlug = input.slug;
    if (nextSlug && nextSlug !== existing.slug) {
      const duplicate = await this.repository.getArticleBySlugScoped(
        session.organizationId,
        nextSlug
      );
      if (duplicate && duplicate.id !== articleId) {
        throw new KnowledgeDomainError(
          'CONFLICT',
          `Another article already uses slug "${nextSlug}".`
        );
      }
    }

    const searchKeywords = buildSearchKeywords([
      input.title ?? existing.title,
      input.shortDescription ?? existing.shortDescription,
      input.tags ?? existing.tags,
      input.content ?? existing.content,
    ]);

    const updated = await this.repository.updateArticle(session.organizationId, articleId, {
      ...input,
      slug: nextSlug,
      searchKeywords,
    });

    if (!updated) {
      throw new KnowledgeDomainError('NOT_FOUND', 'Knowledge article not found in this workspace.');
    }

    return updated;
  }

  async deleteArticle(identity: AuthSessionIdentity | null, articleId: string): Promise<void> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    const deleted = await this.repository.deleteArticle(session.organizationId, articleId);
    if (!deleted) {
      throw new KnowledgeDomainError('NOT_FOUND', 'Knowledge article not found in this workspace.');
    }
  }

  // ---- FAQs ----

  async listFaqs(
    identity: AuthSessionIdentity | null,
    filter?: KnowledgeListFilterInput
  ): Promise<KnowledgeFaq[]> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    return this.repository.listFaqs(session.organizationId, filter);
  }

  async createFaq(
    identity: AuthSessionIdentity | null,
    input: CreateKnowledgeFaqInput
  ): Promise<KnowledgeFaq> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    await this.verifyCategoryBelongsToOrganization(session.organizationId, input.categoryId);

    const searchKeywords = buildSearchKeywords([input.question, input.answer]);

    return this.repository.createFaq(session.organizationId, {
      ...input,
      searchKeywords,
    });
  }

  async updateFaq(
    identity: AuthSessionIdentity | null,
    faqId: string,
    input: UpdateKnowledgeFaqInput
  ): Promise<KnowledgeFaq> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    const existing = await this.repository.getFaqById(session.organizationId, faqId);
    if (!existing) {
      throw new KnowledgeDomainError('NOT_FOUND', 'FAQ entry not found in this workspace.');
    }

    if (input.categoryId !== undefined) {
      await this.verifyCategoryBelongsToOrganization(session.organizationId, input.categoryId);
    }

    const searchKeywords = buildSearchKeywords([
      input.question ?? existing.question,
      input.answer ?? existing.answer,
    ]);

    const updated = await this.repository.updateFaq(session.organizationId, faqId, {
      ...input,
      searchKeywords,
    });

    if (!updated) {
      throw new KnowledgeDomainError('NOT_FOUND', 'FAQ entry not found in this workspace.');
    }

    return updated;
  }

  async deleteFaq(identity: AuthSessionIdentity | null, faqId: string): Promise<void> {
    const session = assertAuthorizedKnowledgeAdmin(identity);
    const deleted = await this.repository.deleteFaq(session.organizationId, faqId);
    if (!deleted) {
      throw new KnowledgeDomainError('NOT_FOUND', 'FAQ entry not found in this workspace.');
    }
  }

  // ---- Future Chatbot Retrieval Preparation (Published-Only, Business-Scoped) ----

  async retrievePublishedKnowledge(
    params: PublishedKnowledgeRetrievalQuery
  ): Promise<KnowledgeRetrievalMatch[]> {
    const queryTerms = params.query
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((term) => term.length >= 2);

    if (queryTerms.length === 0) {
      return [];
    }

    const [categories, publishedFaqs, publishedArticles] = await Promise.all([
      this.repository.listCategories(params.organizationId),
      this.repository.listFaqs(params.organizationId, {
        status: KnowledgeStatus.Published,
      }),
      this.repository.listArticles(params.organizationId, {
        status: KnowledgeStatus.Published,
      }),
    ]);

    const categoryMap = new Map(categories.map((cat) => [cat.id, cat.name]));
    const allowedSet = params.allowedCategoryIds ? new Set(params.allowedCategoryIds) : null;
    const excludedSet = params.excludedCategoryIds ? new Set(params.excludedCategoryIds) : null;

    const isCategoryPermitted = (categoryId: string | null): boolean => {
      if (excludedSet && categoryId && excludedSet.has(categoryId)) return false;
      if (allowedSet && (!categoryId || !allowedSet.has(categoryId))) return false;
      return true;
    };

    const scoreDocument = (titleText: string, bodyText: string, keywords: string): number => {
      const lowerTitle = titleText.toLowerCase();
      const lowerBody = bodyText.toLowerCase();
      let score = 0;

      for (const term of queryTerms) {
        if (lowerTitle.includes(term)) score += 4;
        if (keywords.includes(term)) score += 2;
        if (lowerBody.includes(term)) score += 1;
      }
      return score;
    };

    const matches: KnowledgeRetrievalMatch[] = [];

    // Priority 1: Approved Published FAQs
    for (const faq of publishedFaqs) {
      if (!isCategoryPermitted(faq.categoryId)) continue;
      const score = scoreDocument(faq.question, faq.answer, faq.searchKeywords);
      if (score > 0) {
        matches.push({
          citation: {
            sourceType: 'faq',
            sourceId: faq.id,
            organizationId: faq.organizationId,
            categoryId: faq.categoryId,
            categoryName: faq.categoryId ? categoryMap.get(faq.categoryId) : undefined,
            titleOrQuestion: faq.question,
            updatedAt: faq.updatedAt,
          },
          excerpt: faq.answer.slice(0, 280),
          fullBody: faq.answer,
          relevanceScore: score + 1.5, // Slight priority boost for direct approved FAQs
        });
      }
    }

    // Priority 2: Published Knowledge Articles
    for (const article of publishedArticles) {
      if (!isCategoryPermitted(article.categoryId)) continue;
      const score = scoreDocument(
        `${article.title} ${article.tags.join(' ')}`,
        `${article.shortDescription} ${article.content}`,
        article.searchKeywords
      );
      if (score > 0) {
        matches.push({
          citation: {
            sourceType: 'article',
            sourceId: article.id,
            organizationId: article.organizationId,
            categoryId: article.categoryId,
            categoryName: article.categoryId ? categoryMap.get(article.categoryId) : undefined,
            titleOrQuestion: article.title,
            slug: article.slug,
            updatedAt: article.updatedAt,
          },
          excerpt: article.shortDescription,
          fullBody: article.content,
          relevanceScore: score,
        });
      }
    }

    matches.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return matches.slice(0, params.limit ?? 5);
  }
}

import { randomUUID } from 'node:crypto';
import {
  KnowledgeStatus,
  type KnowledgeArticle,
  type KnowledgeCategory,
  type KnowledgeFaq,
  type KnowledgeOverviewCounts,
} from '@careflow/shared';
import type {
  CreateArticleRecord,
  CreateCategoryRecord,
  CreateFaqRecord,
  KnowledgeRepositoryPort,
  UpdateArticleRecord,
  UpdateCategoryRecord,
  UpdateFaqRecord,
} from '@careflow/support-engine';
import type { KnowledgeListFilterInput } from '@careflow/validation';
import type { D1DatabaseLike } from './d1-types';

interface CategoryRow {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  description: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

interface ArticleRow {
  id: string;
  organization_id: string;
  category_id: string | null;
  slug: string;
  title: string;
  short_description: string;
  content: string;
  tags_json: string;
  status: KnowledgeStatus;
  search_keywords: string;
  created_at: string;
  updated_at: string;
}

interface FaqRow {
  id: string;
  organization_id: string;
  category_id: string | null;
  question: string;
  answer: string;
  status: KnowledgeStatus;
  search_keywords: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

function assertTenantScope(organizationId: string): string {
  const trimmed = organizationId?.trim();
  if (!trimmed) {
    throw new Error('Tenant Isolation Violation: organizationId is required for every query.');
  }
  return trimmed;
}

function mapCategoryRow(row: CategoryRow): KnowledgeCategory {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    displayOrder: Number(row.display_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseTagsJson(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function mapArticleRow(row: ArticleRow): KnowledgeArticle {
  return {
    id: row.id,
    organizationId: row.organization_id,
    categoryId: row.category_id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description,
    content: row.content,
    tags: parseTagsJson(row.tags_json),
    status: row.status,
    searchKeywords: row.search_keywords,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFaqRow(row: FaqRow): KnowledgeFaq {
  return {
    id: row.id,
    organizationId: row.organization_id,
    categoryId: row.category_id,
    question: row.question,
    answer: row.answer,
    status: row.status,
    searchKeywords: row.search_keywords,
    displayOrder: Number(row.display_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Cloudflare D1 / SQLite implementation of KnowledgeRepositoryPort.
 * Every SQL statement binds `organization_id = ?` so cross-tenant reads,
 * updates, or deletes are structurally impossible.
 */
export class D1KnowledgeRepository implements KnowledgeRepositoryPort {
  constructor(private readonly db: D1DatabaseLike) {}

  // ---- Categories ----

  async listCategories(organizationId: string): Promise<KnowledgeCategory[]> {
    const orgId = assertTenantScope(organizationId);
    const { results } = await this.db
      .prepare(
        `SELECT id, organization_id, slug, name, description, display_order, created_at, updated_at
         FROM knowledge_categories
         WHERE organization_id = ?
         ORDER BY display_order ASC, name ASC`
      )
      .bind(orgId)
      .all<CategoryRow>();

    return results.map(mapCategoryRow);
  }

  async getCategoryById(
    organizationId: string,
    categoryId: string
  ): Promise<KnowledgeCategory | null> {
    const orgId = assertTenantScope(organizationId);
    const row = await this.db
      .prepare(
        `SELECT id, organization_id, slug, name, description, display_order, created_at, updated_at
         FROM knowledge_categories
         WHERE organization_id = ? AND id = ?`
      )
      .bind(orgId, categoryId)
      .first<CategoryRow>();

    return row ? mapCategoryRow(row) : null;
  }

  async getCategoryBySlug(organizationId: string, slug: string): Promise<KnowledgeCategory | null> {
    const orgId = assertTenantScope(organizationId);
    const row = await this.db
      .prepare(
        `SELECT id, organization_id, slug, name, description, display_order, created_at, updated_at
         FROM knowledge_categories
         WHERE organization_id = ? AND slug = ?`
      )
      .bind(orgId, slug)
      .first<CategoryRow>();

    return row ? mapCategoryRow(row) : null;
  }

  async createCategory(
    organizationId: string,
    record: CreateCategoryRecord
  ): Promise<KnowledgeCategory> {
    const orgId = assertTenantScope(organizationId);
    const id = `cat_${randomUUID()}`;
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO knowledge_categories
           (id, organization_id, slug, name, description, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, orgId, record.slug, record.name, record.description, record.displayOrder, now, now)
      .run();

    const created = await this.getCategoryById(orgId, id);
    if (!created) {
      throw new Error('Failed to retrieve newly created knowledge category.');
    }
    return created;
  }

  async updateCategory(
    organizationId: string,
    categoryId: string,
    record: UpdateCategoryRecord
  ): Promise<KnowledgeCategory | null> {
    const orgId = assertTenantScope(organizationId);
    const existing = await this.getCategoryById(orgId, categoryId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const nextName = record.name ?? existing.name;
    const nextSlug = record.slug ?? existing.slug;
    const nextDescription = record.description ?? existing.description;
    const nextOrder = record.displayOrder ?? existing.displayOrder;

    await this.db
      .prepare(
        `UPDATE knowledge_categories
         SET name = ?, slug = ?, description = ?, display_order = ?, updated_at = ?
         WHERE organization_id = ? AND id = ?`
      )
      .bind(nextName, nextSlug, nextDescription, nextOrder, now, orgId, categoryId)
      .run();

    return this.getCategoryById(orgId, categoryId);
  }

  async deleteCategory(organizationId: string, categoryId: string): Promise<boolean> {
    const orgId = assertTenantScope(organizationId);
    const res = await this.db
      .prepare(`DELETE FROM knowledge_categories WHERE organization_id = ? AND id = ?`)
      .bind(orgId, categoryId)
      .run();

    return (res.meta.changes ?? 0) > 0;
  }

  // ---- Articles ----

  async listArticles(
    organizationId: string,
    filter?: KnowledgeListFilterInput
  ): Promise<KnowledgeArticle[]> {
    const orgId = assertTenantScope(organizationId);
    const conditions: string[] = ['organization_id = ?'];
    const params: unknown[] = [orgId];

    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (filter?.categoryId) {
      conditions.push('category_id = ?');
      params.push(filter.categoryId);
    }

    if (filter?.search && filter.search.trim().length > 0) {
      const pattern = `%${filter.search.trim().toLowerCase()}%`;
      conditions.push(
        '(LOWER(title) LIKE ? OR LOWER(short_description) LIKE ? OR LOWER(content) LIKE ? OR LOWER(tags_json) LIKE ?)'
      );
      params.push(pattern, pattern, pattern, pattern);
    }

    const sql = `
      SELECT id, organization_id, category_id, slug, title, short_description, content,
             tags_json, status, search_keywords, created_at, updated_at
      FROM knowledge_articles
      WHERE ${conditions.join(' AND ')}
      ORDER BY updated_at DESC, created_at DESC
    `;

    const { results } = await this.db
      .prepare(sql)
      .bind(...params)
      .all<ArticleRow>();

    return results.map(mapArticleRow);
  }

  async getArticleById(
    organizationId: string,
    articleId: string
  ): Promise<KnowledgeArticle | null> {
    const orgId = assertTenantScope(organizationId);
    const row = await this.db
      .prepare(
        `SELECT id, organization_id, category_id, slug, title, short_description, content,
                tags_json, status, search_keywords, created_at, updated_at
         FROM knowledge_articles
         WHERE organization_id = ? AND id = ?`
      )
      .bind(orgId, articleId)
      .first<ArticleRow>();

    return row ? mapArticleRow(row) : null;
  }

  async getArticleBySlugScoped(
    organizationId: string,
    slug: string
  ): Promise<KnowledgeArticle | null> {
    const orgId = assertTenantScope(organizationId);
    const row = await this.db
      .prepare(
        `SELECT id, organization_id, category_id, slug, title, short_description, content,
                tags_json, status, search_keywords, created_at, updated_at
         FROM knowledge_articles
         WHERE organization_id = ? AND slug = ?`
      )
      .bind(orgId, slug)
      .first<ArticleRow>();

    return row ? mapArticleRow(row) : null;
  }

  async createArticle(
    organizationId: string,
    record: CreateArticleRecord
  ): Promise<KnowledgeArticle> {
    const orgId = assertTenantScope(organizationId);
    const id = `art_${randomUUID()}`;
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO knowledge_articles
           (id, organization_id, category_id, slug, title, short_description, content,
            tags_json, status, search_keywords, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        orgId,
        record.categoryId,
        record.slug,
        record.title,
        record.shortDescription,
        record.content,
        JSON.stringify(record.tags ?? []),
        record.status,
        record.searchKeywords,
        now,
        now
      )
      .run();

    const created = await this.getArticleById(orgId, id);
    if (!created) {
      throw new Error('Failed to retrieve newly created knowledge article.');
    }
    return created;
  }

  async updateArticle(
    organizationId: string,
    articleId: string,
    record: UpdateArticleRecord
  ): Promise<KnowledgeArticle | null> {
    const orgId = assertTenantScope(organizationId);
    const existing = await this.getArticleById(orgId, articleId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const nextCategoryId =
      record.categoryId !== undefined ? record.categoryId : existing.categoryId;
    const nextSlug = record.slug ?? existing.slug;
    const nextTitle = record.title ?? existing.title;
    const nextShortDesc = record.shortDescription ?? existing.shortDescription;
    const nextContent = record.content ?? existing.content;
    const nextTags = record.tags ?? existing.tags;
    const nextStatus = record.status ?? existing.status;
    const nextKeywords = record.searchKeywords ?? existing.searchKeywords;

    await this.db
      .prepare(
        `UPDATE knowledge_articles
         SET category_id = ?, slug = ?, title = ?, short_description = ?, content = ?,
             tags_json = ?, status = ?, search_keywords = ?, updated_at = ?
         WHERE organization_id = ? AND id = ?`
      )
      .bind(
        nextCategoryId,
        nextSlug,
        nextTitle,
        nextShortDesc,
        nextContent,
        JSON.stringify(nextTags),
        nextStatus,
        nextKeywords,
        now,
        orgId,
        articleId
      )
      .run();

    return this.getArticleById(orgId, articleId);
  }

  async deleteArticle(organizationId: string, articleId: string): Promise<boolean> {
    const orgId = assertTenantScope(organizationId);
    const res = await this.db
      .prepare(`DELETE FROM knowledge_articles WHERE organization_id = ? AND id = ?`)
      .bind(orgId, articleId)
      .run();

    return (res.meta.changes ?? 0) > 0;
  }

  // ---- FAQs ----

  async listFaqs(
    organizationId: string,
    filter?: KnowledgeListFilterInput
  ): Promise<KnowledgeFaq[]> {
    const orgId = assertTenantScope(organizationId);
    const conditions: string[] = ['organization_id = ?'];
    const params: unknown[] = [orgId];

    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }

    if (filter?.categoryId) {
      conditions.push('category_id = ?');
      params.push(filter.categoryId);
    }

    if (filter?.search && filter.search.trim().length > 0) {
      const pattern = `%${filter.search.trim().toLowerCase()}%`;
      conditions.push('(LOWER(question) LIKE ? OR LOWER(answer) LIKE ?)');
      params.push(pattern, pattern);
    }

    const sql = `
      SELECT id, organization_id, category_id, question, answer, status,
             search_keywords, display_order, created_at, updated_at
      FROM knowledge_faqs
      WHERE ${conditions.join(' AND ')}
      ORDER BY display_order ASC, updated_at DESC
    `;

    const { results } = await this.db
      .prepare(sql)
      .bind(...params)
      .all<FaqRow>();

    return results.map(mapFaqRow);
  }

  async getFaqById(organizationId: string, faqId: string): Promise<KnowledgeFaq | null> {
    const orgId = assertTenantScope(organizationId);
    const row = await this.db
      .prepare(
        `SELECT id, organization_id, category_id, question, answer, status,
                search_keywords, display_order, created_at, updated_at
         FROM knowledge_faqs
         WHERE organization_id = ? AND id = ?`
      )
      .bind(orgId, faqId)
      .first<FaqRow>();

    return row ? mapFaqRow(row) : null;
  }

  async createFaq(organizationId: string, record: CreateFaqRecord): Promise<KnowledgeFaq> {
    const orgId = assertTenantScope(organizationId);
    const id = `faq_${randomUUID()}`;
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO knowledge_faqs
           (id, organization_id, category_id, question, answer, status,
            search_keywords, display_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        orgId,
        record.categoryId,
        record.question,
        record.answer,
        record.status,
        record.searchKeywords,
        record.displayOrder,
        now,
        now
      )
      .run();

    const created = await this.getFaqById(orgId, id);
    if (!created) {
      throw new Error('Failed to retrieve newly created FAQ.');
    }
    return created;
  }

  async updateFaq(
    organizationId: string,
    faqId: string,
    record: UpdateFaqRecord
  ): Promise<KnowledgeFaq | null> {
    const orgId = assertTenantScope(organizationId);
    const existing = await this.getFaqById(orgId, faqId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const nextCategoryId =
      record.categoryId !== undefined ? record.categoryId : existing.categoryId;
    const nextQuestion = record.question ?? existing.question;
    const nextAnswer = record.answer ?? existing.answer;
    const nextStatus = record.status ?? existing.status;
    const nextKeywords = record.searchKeywords ?? existing.searchKeywords;
    const nextOrder = record.displayOrder ?? existing.displayOrder;

    await this.db
      .prepare(
        `UPDATE knowledge_faqs
         SET category_id = ?, question = ?, answer = ?, status = ?,
             search_keywords = ?, display_order = ?, updated_at = ?
         WHERE organization_id = ? AND id = ?`
      )
      .bind(
        nextCategoryId,
        nextQuestion,
        nextAnswer,
        nextStatus,
        nextKeywords,
        nextOrder,
        now,
        orgId,
        faqId
      )
      .run();

    return this.getFaqById(orgId, faqId);
  }

  async deleteFaq(organizationId: string, faqId: string): Promise<boolean> {
    const orgId = assertTenantScope(organizationId);
    const res = await this.db
      .prepare(`DELETE FROM knowledge_faqs WHERE organization_id = ? AND id = ?`)
      .bind(orgId, faqId)
      .run();

    return (res.meta.changes ?? 0) > 0;
  }

  // ---- Overview Counts ----

  async getOverviewCounts(organizationId: string): Promise<KnowledgeOverviewCounts> {
    const orgId = assertTenantScope(organizationId);

    const articleCounts = await this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
           SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
         FROM knowledge_articles
         WHERE organization_id = ?`
      )
      .bind(orgId)
      .first<{
        total: number;
        published: number | null;
        draft: number | null;
        archived: number | null;
      }>();

    const faqCounts = await this.db
      .prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published,
           SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft,
           SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END) as archived
         FROM knowledge_faqs
         WHERE organization_id = ?`
      )
      .bind(orgId)
      .first<{
        total: number;
        published: number | null;
        draft: number | null;
        archived: number | null;
      }>();

    const categoryCount = await this.db
      .prepare(`SELECT COUNT(*) as total FROM knowledge_categories WHERE organization_id = ?`)
      .bind(orgId)
      .first<{ total: number }>();

    return {
      totalArticles: Number(articleCounts?.total ?? 0),
      publishedArticles: Number(articleCounts?.published ?? 0),
      draftArticles: Number(articleCounts?.draft ?? 0),
      archivedArticles: Number(articleCounts?.archived ?? 0),
      totalFaqs: Number(faqCounts?.total ?? 0),
      publishedFaqs: Number(faqCounts?.published ?? 0),
      draftFaqs: Number(faqCounts?.draft ?? 0),
      archivedFaqs: Number(faqCounts?.archived ?? 0),
      totalCategories: Number(categoryCount?.total ?? 0),
    };
  }
}

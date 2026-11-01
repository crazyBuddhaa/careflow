import type { KnowledgeArticleSummary } from '@careflow/shared';

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

export enum KnowledgeStatus {
  Draft = 'draft',
  Published = 'published',
  Archived = 'archived',
}

export interface KnowledgeCategory {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticle {
  id: string;
  organizationId: string;
  categoryId: string | null;
  slug: string;
  title: string;
  shortDescription: string;
  content: string;
  tags: string[];
  status: KnowledgeStatus;
  searchKeywords: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeFaq {
  id: string;
  organizationId: string;
  categoryId: string | null;
  question: string;
  answer: string;
  status: KnowledgeStatus;
  searchKeywords: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeOverviewCounts {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  archivedArticles: number;
  totalFaqs: number;
  publishedFaqs: number;
  draftFaqs: number;
  archivedFaqs: number;
  totalCategories: number;
}

/**
 * Future Chatbot Retrieval Source Attribution Contract.
 * Allows the upcoming TypeScript chatbot engine to trace whether an answer came
 * from an approved FAQ or a published Knowledge Article, while strictly enforcing
 * organization boundaries and Published-only visibility.
 */
export interface KnowledgeRetrievalCitation {
  sourceType: 'faq' | 'article';
  sourceId: string;
  organizationId: string;
  categoryId: string | null;
  categoryName?: string;
  titleOrQuestion: string;
  slug?: string;
  updatedAt: string;
}

export interface KnowledgeRetrievalMatch {
  citation: KnowledgeRetrievalCitation;
  excerpt: string;
  fullBody: string;
  relevanceScore: number;
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  FileText,
  Archive,
  X,
  AlertTriangle,
  Upload,
  FileUp,
  Sparkles,
} from 'lucide-react';
import {
  KnowledgeStatus,
  type ApiResponse,
  type KnowledgeArticle,
  type KnowledgeCategory,
  type KnowledgeFaq,
  type KnowledgeOverviewCounts,
} from '@careflow/shared';
import { KnowledgeUploadModal } from './KnowledgeUploadModal';

export type KnowledgeSubView =
  | 'knowledge-overview'
  | 'knowledge-articles'
  | 'faqs'
  | 'categories';

interface KnowledgeAdminManagerProps {
  activeSubView: KnowledgeSubView;
  organizationName: string;
  organizationId: string;
  onNavigateSubView: (view: KnowledgeSubView) => void;
}

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatStatusLabel(status: KnowledgeStatus): string {
  if (status === KnowledgeStatus.Published) return 'Published';
  if (status === KnowledgeStatus.Archived) return 'Archived';
  return 'Draft';
}

export function KnowledgeAdminManager({
  activeSubView,
  organizationName,
  organizationId,
  onNavigateSubView,
}: KnowledgeAdminManagerProps) {
  const [overview, setOverview] = useState<KnowledgeOverviewCounts | null>(null);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [faqs, setFaqs] = useState<KnowledgeFaq[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Article Form Drawer/Panel state
  const [articleFormOpen, setArticleFormOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<KnowledgeArticle | null>(null);
  const [articleTitle, setArticleTitle] = useState('');
  const [articleShortDesc, setArticleShortDesc] = useState('');
  const [articleContent, setArticleContent] = useState('');
  const [articleCategoryId, setArticleCategoryId] = useState<string>('');
  const [articleTagsText, setArticleTagsText] = useState('');
  const [articleStatus, setArticleStatus] = useState<KnowledgeStatus>(KnowledgeStatus.Draft);
  const [savingArticle, setSavingArticle] = useState(false);

  // FAQ Form state
  const [faqFormOpen, setFaqFormOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<KnowledgeFaq | null>(null);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqCategoryId, setFaqCategoryId] = useState<string>('');
  const [faqStatus, setFaqStatus] = useState<KnowledgeStatus>(KnowledgeStatus.Draft);
  const [faqOrder, setFaqOrder] = useState<number>(0);
  const [savingFaq, setSavingFaq] = useState(false);

  // Category Form state
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<KnowledgeCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catOrder, setCatOrder] = useState<number>(0);
  const [savingCategory, setSavingCategory] = useState(false);

  // Delete confirmation modal state
  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'article' | 'faq' | 'category';
    id: string;
    label: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  const showFeedback = useCallback((msg: string) => {
    setFeedbackBanner(msg);
    window.setTimeout(() => {
      setFeedbackBanner((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const refreshWorkspaceData = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);

    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter);
      const qs = params.toString() ? `?${params.toString()}` : '';

      const [ovRes, catRes, artRes, faqRes] = await Promise.all([
        fetch('/api/admin/knowledge/overview', { cache: 'no-store' }),
        fetch('/api/admin/knowledge/categories', { cache: 'no-store' }),
        fetch(`/api/admin/knowledge/articles${qs}`, { cache: 'no-store' }),
        fetch(`/api/admin/knowledge/faqs${qs}`, { cache: 'no-store' }),
      ]);

      const [ovBody, catBody, artBody, faqBody] = (await Promise.all([
        ovRes.json(),
        catRes.json(),
        artRes.json(),
        faqRes.json(),
      ])) as [
        ApiResponse<KnowledgeOverviewCounts>,
        ApiResponse<KnowledgeCategory[]>,
        ApiResponse<KnowledgeArticle[]>,
        ApiResponse<KnowledgeFaq[]>,
      ];

      if (!ovBody.ok) throw new Error(ovBody.error.message);
      if (!catBody.ok) throw new Error(catBody.error.message);
      if (!artBody.ok) throw new Error(artBody.error.message);
      if (!faqBody.ok) throw new Error(faqBody.error.message);

      setOverview(ovBody.data);
      setCategories(catBody.data);
      setArticles(artBody.data);
      setFaqs(faqBody.data);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Unable to load workspace knowledge records.'
      );
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter, categoryFilter]);

  useEffect(() => {
    void refreshWorkspaceData();
  }, [refreshWorkspaceData, organizationId]);

  // Reset open forms when switching subviews or organizations
  useEffect(() => {
    setArticleFormOpen(false);
    setFaqFormOpen(false);
    setCategoryFormOpen(false);
    setPendingDelete(null);
  }, [activeSubView, organizationId]);

  /* ---------------- Article Actions ---------------- */

  function openCreateArticleForm() {
    setEditingArticle(null);
    setArticleTitle('');
    setArticleShortDesc('');
    setArticleContent('');
    setArticleCategoryId(categories[0]?.id ?? '');
    setArticleTagsText('');
    setArticleStatus(KnowledgeStatus.Draft);
    setArticleFormOpen(true);
    setErrorBanner(null);
  }

  function openEditArticleForm(article: KnowledgeArticle) {
    setEditingArticle(article);
    setArticleTitle(article.title);
    setArticleShortDesc(article.shortDescription);
    setArticleContent(article.content);
    setArticleCategoryId(article.categoryId ?? '');
    setArticleTagsText(article.tags.join(', '));
    setArticleStatus(article.status);
    setArticleFormOpen(true);
    setErrorBanner(null);
  }

  async function handleSaveArticle(
    event: React.FormEvent,
    overrideStatus?: KnowledgeStatus
  ) {
    event.preventDefault();
    setSavingArticle(true);
    setErrorBanner(null);

    const parsedTags = articleTagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const targetStatus = overrideStatus ?? articleStatus;

    try {
      const endpoint = editingArticle
        ? `/api/admin/knowledge/articles/${editingArticle.id}`
        : '/api/admin/knowledge/articles';
      const method = editingArticle ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: articleTitle,
          shortDescription: articleShortDesc,
          content: articleContent,
          categoryId: articleCategoryId || null,
          tags: parsedTags,
          status: targetStatus,
        }),
      });

      const body = (await res.json()) as ApiResponse<KnowledgeArticle>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }

      setArticleFormOpen(false);
      setEditingArticle(null);
      showFeedback(
        editingArticle
          ? `Updated article "${body.data.title}".`
          : `Created article "${body.data.title}".`
      );
      await refreshWorkspaceData();
    } catch {
      setErrorBanner('Network error while saving knowledge article.');
    } finally {
      setSavingArticle(false);
    }
  }

  async function handleQuickArticleStatus(article: KnowledgeArticle, nextStatus: KnowledgeStatus) {
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/admin/knowledge/articles/${article.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = (await res.json()) as ApiResponse<KnowledgeArticle>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      showFeedback(
        `"${article.title}" marked as ${formatStatusLabel(nextStatus).toLowerCase()}.`
      );
      await refreshWorkspaceData();
    } catch {
      setErrorBanner('Unable to update article publication status.');
    }
  }

  /* ---------------- FAQ Actions ---------------- */

  function openCreateFaqForm() {
    setEditingFaq(null);
    setFaqQuestion('');
    setFaqAnswer('');
    setFaqCategoryId(categories[0]?.id ?? '');
    setFaqStatus(KnowledgeStatus.Draft);
    setFaqOrder(faqs.length * 10 + 10);
    setFaqFormOpen(true);
    setErrorBanner(null);
  }

  function openEditFaqForm(faq: KnowledgeFaq) {
    setEditingFaq(faq);
    setFaqQuestion(faq.question);
    setFaqAnswer(faq.answer);
    setFaqCategoryId(faq.categoryId ?? '');
    setFaqStatus(faq.status);
    setFaqOrder(faq.displayOrder);
    setFaqFormOpen(true);
    setErrorBanner(null);
  }

  async function handleSaveFaq(event: React.FormEvent, overrideStatus?: KnowledgeStatus) {
    event.preventDefault();
    setSavingFaq(true);
    setErrorBanner(null);

    const targetStatus = overrideStatus ?? faqStatus;

    try {
      const endpoint = editingFaq
        ? `/api/admin/knowledge/faqs/${editingFaq.id}`
        : '/api/admin/knowledge/faqs';
      const method = editingFaq ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: faqQuestion,
          answer: faqAnswer,
          categoryId: faqCategoryId || null,
          status: targetStatus,
          displayOrder: Number.isFinite(faqOrder) ? faqOrder : 0,
        }),
      });

      const body = (await res.json()) as ApiResponse<KnowledgeFaq>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }

      setFaqFormOpen(false);
      setEditingFaq(null);
      showFeedback(editingFaq ? 'Updated FAQ entry.' : 'Created FAQ entry.');
      await refreshWorkspaceData();
    } catch {
      setErrorBanner('Network error while saving FAQ entry.');
    } finally {
      setSavingFaq(false);
    }
  }

  async function handleQuickFaqStatus(faq: KnowledgeFaq, nextStatus: KnowledgeStatus) {
    setErrorBanner(null);
    try {
      const res = await fetch(`/api/admin/knowledge/faqs/${faq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = (await res.json()) as ApiResponse<KnowledgeFaq>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      showFeedback(`FAQ marked as ${formatStatusLabel(nextStatus).toLowerCase()}.`);
      await refreshWorkspaceData();
    } catch {
      setErrorBanner('Unable to update FAQ publication status.');
    }
  }

  /* ---------------- Category Actions ---------------- */

  function openCreateCategoryForm() {
    setEditingCategory(null);
    setCatName('');
    setCatDescription('');
    setCatOrder(categories.length * 10 + 10);
    setCategoryFormOpen(true);
    setErrorBanner(null);
  }

  function openEditCategoryForm(category: KnowledgeCategory) {
    setEditingCategory(category);
    setCatName(category.name);
    setCatDescription(category.description);
    setCatOrder(category.displayOrder);
    setCategoryFormOpen(true);
    setErrorBanner(null);
  }

  async function handleSaveCategory(event: React.FormEvent) {
    event.preventDefault();
    setSavingCategory(true);
    setErrorBanner(null);

    try {
      const endpoint = editingCategory
        ? `/api/admin/knowledge/categories/${editingCategory.id}`
        : '/api/admin/knowledge/categories';
      const method = editingCategory ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: catName,
          description: catDescription,
          displayOrder: Number.isFinite(catOrder) ? catOrder : 0,
        }),
      });

      const body = (await res.json()) as ApiResponse<KnowledgeCategory>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }

      setCategoryFormOpen(false);
      setEditingCategory(null);
      showFeedback(
        editingCategory
          ? `Updated category "${body.data.name}".`
          : `Created category "${body.data.name}".`
      );
      await refreshWorkspaceData();
    } catch {
      setErrorBanner('Network error while saving category.');
    } finally {
      setSavingCategory(false);
    }
  }

  /* ---------------- Confirmed Delete Action ---------------- */

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setErrorBanner(null);

    const pathMap: Record<typeof pendingDelete.kind, string> = {
      article: `/api/admin/knowledge/articles/${pendingDelete.id}`,
      faq: `/api/admin/knowledge/faqs/${pendingDelete.id}`,
      category: `/api/admin/knowledge/categories/${pendingDelete.id}`,
    };

    try {
      const res = await fetch(pathMap[pendingDelete.kind], { method: 'DELETE' });
      const body = (await res.json()) as ApiResponse<{ deleted: boolean }>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }

      showFeedback(`Deleted "${pendingDelete.label}".`);
      setPendingDelete(null);
      await refreshWorkspaceData();
    } catch {
      setErrorBanner('Unable to complete deletion.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Clean Sub-Navigation Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ['knowledge-overview', 'Knowledge Overview'],
              ['knowledge-articles', `Help Articles (${articles.length})`],
              ['faqs', `FAQs (${faqs.length})`],
              ['categories', `Categories (${categories.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigateSubView(key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                activeSubView === key
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setUploadModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200/80 transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
          <span>Upload Knowledge File</span>
        </button>
      </div>

      {/* Feedback & Error Alerts */}
      {feedbackBanner && (
        <div
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm font-semibold text-teal-900 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
            <span>{feedbackBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-xs text-teal-700 hover:text-teal-950 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-xs text-red-700 hover:text-red-950 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          className="rounded-2xl border border-red-200 bg-white p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-red-700">Confirm Permanent Deletion</p>
              <h2 id="delete-confirm-title" className="mt-1 text-lg font-bold text-slate-900">
                Delete {pendingDelete.kind} &ldquo;{pendingDelete.label}&rdquo;?
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                This permanently removes the record from {organizationName}&apos;s knowledge
                database.{' '}
                {pendingDelete.kind === 'category' &&
                  'Articles and FAQs assigned to this category will remain intact as uncategorized.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              aria-label="Cancel deletion"
              className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              className="py-2 px-4 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="py-2 px-4 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {deleting ? 'Deleting...' : 'Confirm Delete'}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBVIEW 1: KNOWLEDGE OVERVIEW
      ====================================================================== */}
      {activeSubView === 'knowledge-overview' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-teal-700">
                  Knowledge Base Overview · {organizationName}
                </p>
                <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  Business Knowledge Management
                </h1>
                <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                  Organize your categories, help articles, and approved FAQs. Published items
                  immediately power answers across your CustomCare support portal.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onNavigateSubView('knowledge-articles');
                  }}
                  className="py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  Manage Articles
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNavigateSubView('faqs');
                  }}
                  className="py-2.5 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  Manage FAQs
                </button>
              </div>
            </div>

            {/* Single-File Auto-Categorization Hero Banner */}
            <div className="mt-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/80 via-white to-teal-50/40 p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 max-w-xl">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-100/70 px-2.5 py-0.5 rounded-full">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Single-File Auto-Categorizer</span>
                  </div>
                  <h2 className="text-base font-bold text-slate-900">
                    Import Knowledge Base from a Single File
                  </h2>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Upload your comprehensive support document (like Markdown, text, or export). CustomCare automatically analyzes sections, groups topics into categories, extracts FAQs, and formats help articles.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="inline-flex items-center gap-2 py-2 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
                >
                  <FileUp className="w-4 h-4" aria-hidden="true" />
                  <span>Upload &amp; Categorize</span>
                </button>
              </div>
            </div>

            {/* Live Database Counts */}
            <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-slate-500">Knowledge Articles</p>
                <p className="mt-1.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                  {loading ? '—' : (overview?.totalArticles ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  {overview?.publishedArticles ?? 0} published · {overview?.draftArticles ?? 0}{' '}
                  draft · {overview?.archivedArticles ?? 0} archived
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Approved & Draft FAQs</p>
                <p className="mt-1.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                  {loading ? '—' : (overview?.totalFaqs ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  {overview?.publishedFaqs ?? 0} published · {overview?.draftFaqs ?? 0} draft ·{' '}
                  {overview?.archivedFaqs ?? 0} archived
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500">Configured Categories</p>
                <p className="mt-1.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                  {loading ? '—' : (overview?.totalCategories ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Organized support topics
                </p>
              </div>
            </div>
          </div>

          {/* Recent Articles Quick List */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-base font-bold text-slate-900">Recent Workspace Articles</h2>
              <button
                type="button"
                onClick={() => onNavigateSubView('knowledge-articles')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap cursor-pointer"
              >
                Open Article Manager &rarr;
              </button>
            </div>

            {loading ? (
              <div className="mt-4 space-y-3">
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
                <div className="h-10 rounded-lg bg-slate-100 animate-pulse" />
              </div>
            ) : articles.length === 0 ? (
              <div className="mt-6 py-6 text-center border-t border-slate-100">
                <p className="text-sm text-slate-600">
                  No knowledge articles created for {organizationName} yet.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateSubView('knowledge-articles')}
                  className="mt-3 py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Create First Article
                </button>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                {articles.slice(0, 5).map((art) => (
                  <div
                    key={art.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{art.title}</p>
                      <p className="text-xs text-slate-500">
                        {art.categoryId
                          ? (categoryNameById.get(art.categoryId) ?? 'Uncategorized')
                          : 'Uncategorized'}{' '}
                        · {formatStatusLabel(art.status)} · Updated{' '}
                        <span className="font-mono tabular-nums">
                          {formatShortDate(art.updatedAt)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateSubView('knowledge-articles');
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 self-start sm:self-center whitespace-nowrap cursor-pointer"
                    >
                      Manage
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBVIEW 2: KNOWLEDGE ARTICLES MANAGEMENT
      ====================================================================== */}
      {activeSubView === 'knowledge-articles' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-teal-700">
                  Knowledge Articles · {organizationName}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Articles
                </h1>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="inline-flex items-center gap-1.5 py-2.5 px-3.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span>Upload File</span>
                </button>
                <button
                  type="button"
                  onClick={openCreateArticleForm}
                  className="inline-flex items-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>New Article</span>
                </button>
              </div>
            </div>

            {/* Search & Filters */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6 relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search articles by title, summary, content, or tag..."
                  aria-label="Search articles"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-10 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filter articles by category"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter articles by status"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value={KnowledgeStatus.Published}>Published</option>
                  <option value={KnowledgeStatus.Draft}>Draft</option>
                  <option value={KnowledgeStatus.Archived}>Archived</option>
                </select>
              </div>
            </div>
          </div>

          {/* Create / Edit Article Form */}
          {articleFormOpen && (
            <form
              onSubmit={(e) => handleSaveArticle(e)}
              className="rounded-2xl border border-blue-200 bg-white p-6 sm:p-8 space-y-5"
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingArticle ? 'Edit Knowledge Article' : 'Create Knowledge Article'}
                </h2>
                <button
                  type="button"
                  onClick={() => setArticleFormOpen(false)}
                  aria-label="Close article editor"
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="art-title"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Title
                  </label>
                  <input
                    id="art-title"
                    type="text"
                    required
                    value={articleTitle}
                    onChange={(e) => setArticleTitle(e.target.value)}
                    placeholder="e.g., How to Confirm a Deposit Reference"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="art-category"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Category
                  </label>
                  <select
                    id="art-category"
                    value={articleCategoryId}
                    onChange={(e) => setArticleCategoryId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="art-status"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Status
                  </label>
                  <select
                    id="art-status"
                    value={articleStatus}
                    onChange={(e) => setArticleStatus(e.target.value as KnowledgeStatus)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value={KnowledgeStatus.Draft}>Draft</option>
                    <option value={KnowledgeStatus.Published}>Published</option>
                    <option value={KnowledgeStatus.Archived}>Archived</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="art-short-desc"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Short Description
                  </label>
                  <input
                    id="art-short-desc"
                    type="text"
                    required
                    value={articleShortDesc}
                    onChange={(e) => setArticleShortDesc(e.target.value)}
                    placeholder="Concise summary used for quick previews and chatbot context..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="art-tags"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Tags <span className="font-normal text-slate-400">(comma-separated)</span>
                  </label>
                  <input
                    id="art-tags"
                    type="text"
                    value={articleTagsText}
                    onChange={(e) => setArticleTagsText(e.target.value)}
                    placeholder="deposits, payments, receipt"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="art-content"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Main Content
                  </label>
                  <textarea
                    id="art-content"
                    rows={7}
                    required
                    value={articleContent}
                    onChange={(e) => setArticleContent(e.target.value)}
                    placeholder="Write clear, accurate customer guidance..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setArticleFormOpen(false)}
                  className="py-2 px-4 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingArticle}
                  onClick={(e) => handleSaveArticle(e, KnowledgeStatus.Draft)}
                  className="py-2 px-4 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Save as Draft
                </button>
                <button
                  type="submit"
                  disabled={savingArticle}
                  className="py-2 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {savingArticle
                    ? 'Saving...'
                    : editingArticle
                      ? 'Save Changes'
                      : 'Save Article'}
                </button>
              </div>
            </form>
          )}

          {/* Articles List */}
          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 space-y-3">
                <div className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              </div>
            ) : articles.length === 0 ? (
              <div className="p-10 text-center">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
                <h2 className="mt-3 text-base font-bold text-slate-900">
                  No matching knowledge articles
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a new knowledge article or adjust your search and filter selection.
                </p>
                <button
                  type="button"
                  onClick={openCreateArticleForm}
                  className="mt-4 py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Create Article
                </button>
              </div>
            ) : (
              articles.map((article) => {
                const catNameLabel = article.categoryId
                  ? (categoryNameById.get(article.categoryId) ?? 'Uncategorized')
                  : 'Uncategorized';

                return (
                  <div
                    key={article.id}
                    className="p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 max-w-2xl">
                      {/* Clean unboxed metadata per anti-slop typography rule */}
                      <p className="text-xs text-slate-500">
                        <span
                          className={
                            article.status === KnowledgeStatus.Published
                              ? 'font-semibold text-teal-700'
                              : article.status === KnowledgeStatus.Archived
                                ? 'font-semibold text-slate-400'
                                : 'font-semibold text-amber-700'
                          }
                        >
                          {formatStatusLabel(article.status)}
                        </span>
                        <span className="mx-2" aria-hidden="true">
                          ·
                        </span>
                        <span>{catNameLabel}</span>
                        <span className="mx-2" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono tabular-nums">
                          Updated {formatShortDate(article.updatedAt)}
                        </span>
                      </p>

                      <h3 className="text-base font-bold text-slate-900">{article.title}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {article.shortDescription}
                      </p>

                      {article.tags.length > 0 && (
                        <p className="text-xs text-slate-400 font-mono">
                          Tags: {article.tags.join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {article.status !== KnowledgeStatus.Published ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickArticleStatus(article, KnowledgeStatus.Published)
                          }
                          className="py-1.5 px-3 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Publish
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleQuickArticleStatus(article, KnowledgeStatus.Draft)}
                          className="py-1.5 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Unpublish
                        </button>
                      )}

                      {article.status !== KnowledgeStatus.Archived && (
                        <button
                          type="button"
                          onClick={() =>
                            handleQuickArticleStatus(article, KnowledgeStatus.Archived)
                          }
                          title="Archive article"
                          className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Archive</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openEditArticleForm(article)}
                        className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({
                            kind: 'article',
                            id: article.id,
                            label: article.title,
                          })
                        }
                        className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBVIEW 3: FAQ MANAGEMENT
      ====================================================================== */}
      {activeSubView === 'faqs' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-teal-700">
                  FAQ Management · {organizationName}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Frequently Asked Questions
                </h1>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(true)}
                  className="inline-flex items-center gap-1.5 py-2.5 px-3.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
                  <span>Upload File</span>
                </button>
                <button
                  type="button"
                  onClick={openCreateFaqForm}
                  className="inline-flex items-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>New FAQ</span>
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6 relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search FAQs by question or approved answer..."
                  aria-label="Search FAQs"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-10 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  aria-label="Filter FAQs by category"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-3">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  aria-label="Filter FAQs by status"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-800 focus:border-blue-600 focus:bg-white focus:outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value={KnowledgeStatus.Published}>Published</option>
                  <option value={KnowledgeStatus.Draft}>Draft</option>
                  <option value={KnowledgeStatus.Archived}>Archived</option>
                </select>
              </div>
            </div>
          </div>

          {faqFormOpen && (
            <form
              onSubmit={(e) => handleSaveFaq(e)}
              className="rounded-2xl border border-blue-200 bg-white p-6 sm:p-8 space-y-5"
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingFaq ? 'Edit FAQ Entry' : 'Create FAQ Entry'}
                </h2>
                <button
                  type="button"
                  onClick={() => setFaqFormOpen(false)}
                  aria-label="Close FAQ editor"
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-3">
                  <label
                    htmlFor="faq-question"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Question
                  </label>
                  <input
                    id="faq-question"
                    type="text"
                    required
                    value={faqQuestion}
                    onChange={(e) => setFaqQuestion(e.target.value)}
                    placeholder="e.g., How do I verify my payment receipt?"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="faq-category"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Category
                  </label>
                  <select
                    id="faq-category"
                    value={faqCategoryId}
                    onChange={(e) => setFaqCategoryId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="faq-status"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Status
                  </label>
                  <select
                    id="faq-status"
                    value={faqStatus}
                    onChange={(e) => setFaqStatus(e.target.value as KnowledgeStatus)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value={KnowledgeStatus.Draft}>Draft</option>
                    <option value={KnowledgeStatus.Published}>Published</option>
                    <option value={KnowledgeStatus.Archived}>Archived</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="faq-order"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Display Order
                  </label>
                  <input
                    id="faq-order"
                    type="number"
                    min={0}
                    max={9999}
                    value={faqOrder}
                    onChange={(e) => setFaqOrder(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 font-mono tabular-nums focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor="faq-answer"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Approved Answer
                  </label>
                  <textarea
                    id="faq-answer"
                    rows={5}
                    required
                    value={faqAnswer}
                    onChange={(e) => setFaqAnswer(e.target.value)}
                    placeholder="Provide the canonical approved answer for customers..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setFaqFormOpen(false)}
                  className="py-2 px-4 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingFaq}
                  onClick={(e) => handleSaveFaq(e, KnowledgeStatus.Draft)}
                  className="py-2 px-4 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  Save as Draft
                </button>
                <button
                  type="submit"
                  disabled={savingFaq}
                  className="py-2 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {savingFaq ? 'Saving...' : editingFaq ? 'Save Changes' : 'Save FAQ'}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 space-y-3">
                <div className="h-14 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              </div>
            ) : faqs.length === 0 ? (
              <div className="p-10 text-center">
                <h2 className="text-base font-bold text-slate-900">No FAQs found</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Add approved question-and-answer pairs for {organizationName}.
                </p>
                <button
                  type="button"
                  onClick={openCreateFaqForm}
                  className="mt-4 py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Create FAQ
                </button>
              </div>
            ) : (
              faqs.map((faq) => {
                const catLabel = faq.categoryId
                  ? (categoryNameById.get(faq.categoryId) ?? 'Uncategorized')
                  : 'Uncategorized';
                return (
                  <div
                    key={faq.id}
                    className="p-6 flex flex-col lg:flex-row lg:items-start justify-between gap-4"
                  >
                    <div className="space-y-1.5 max-w-2xl">
                      <p className="text-xs text-slate-500">
                        <span
                          className={
                            faq.status === KnowledgeStatus.Published
                              ? 'font-semibold text-teal-700'
                              : faq.status === KnowledgeStatus.Archived
                                ? 'font-semibold text-slate-400'
                                : 'font-semibold text-amber-700'
                          }
                        >
                          {formatStatusLabel(faq.status)}
                        </span>
                        <span className="mx-2" aria-hidden="true">
                          ·
                        </span>
                        <span>{catLabel}</span>
                        <span className="mx-2" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono tabular-nums">Order {faq.displayOrder}</span>
                      </p>

                      <h3 className="text-base font-bold text-slate-900">{faq.question}</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{faq.answer}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {faq.status !== KnowledgeStatus.Published ? (
                        <button
                          type="button"
                          onClick={() => handleQuickFaqStatus(faq, KnowledgeStatus.Published)}
                          className="py-1.5 px-3 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Publish
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleQuickFaqStatus(faq, KnowledgeStatus.Draft)}
                          className="py-1.5 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Unpublish
                        </button>
                      )}

                      {faq.status !== KnowledgeStatus.Archived && (
                        <button
                          type="button"
                          onClick={() => handleQuickFaqStatus(faq, KnowledgeStatus.Archived)}
                          className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                          <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Archive</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => openEditFaqForm(faq)}
                        className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setPendingDelete({
                            kind: 'faq',
                            id: faq.id,
                            label: faq.question,
                          })
                        }
                        className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUBVIEW 4: KNOWLEDGE CATEGORIES MANAGEMENT
      ====================================================================== */}
      {activeSubView === 'categories' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-teal-700">
                Categories · {organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Knowledge Categories
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                Configure independent categories for organizing articles and FAQs in this business
                workspace.
              </p>
            </div>

            <button
              type="button"
              onClick={openCreateCategoryForm}
              className="inline-flex items-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New Category</span>
            </button>
          </div>

          {categoryFormOpen && (
            <form
              onSubmit={handleSaveCategory}
              className="rounded-2xl border border-blue-200 bg-white p-6 sm:p-8 space-y-5"
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingCategory ? 'Edit Category' : 'Create Category'}
                </h2>
                <button
                  type="button"
                  onClick={() => setCategoryFormOpen(false)}
                  aria-label="Close category editor"
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="cat-name" className="block text-xs font-semibold text-slate-700">
                    Category Name
                  </label>
                  <input
                    id="cat-name"
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="e.g., Withdrawals, Billing, General Enquiries"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cat-order"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Display Order
                  </label>
                  <input
                    id="cat-order"
                    type="number"
                    min={0}
                    max={9999}
                    value={catOrder}
                    onChange={(e) => setCatOrder(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 font-mono tabular-nums focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="cat-desc" className="block text-xs font-semibold text-slate-700">
                    Description
                  </label>
                  <input
                    id="cat-desc"
                    type="text"
                    value={catDescription}
                    onChange={(e) => setCatDescription(e.target.value)}
                    placeholder="Short description of what topics belong in this category..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCategoryFormOpen(false)}
                  className="py-2 px-4 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCategory}
                  className="py-2 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {savingCategory
                    ? 'Saving...'
                    : editingCategory
                      ? 'Save Changes'
                      : 'Create Category'}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 space-y-3">
                <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-12 rounded-xl bg-slate-100 animate-pulse" />
              </div>
            ) : categories.length === 0 ? (
              <div className="p-10 text-center">
                <h2 className="text-base font-bold text-slate-900">
                  No categories configured for {organizationName}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create your business&apos;s first knowledge category to group articles and FAQs.
                </p>
                <button
                  type="button"
                  onClick={openCreateCategoryForm}
                  className="mt-4 py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Create Category
                </button>
              </div>
            ) : (
              categories.map((cat) => (
                <div
                  key={cat.id}
                  className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-slate-900">{cat.name}</h3>
                    {cat.description && (
                      <p className="text-sm text-slate-600">{cat.description}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditCategoryForm(cat)}
                      className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingDelete({
                          kind: 'category',
                          id: cat.id,
                          label: cat.name,
                        })
                      }
                      className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Single-File Knowledge Upload & Auto-Categorization Modal */}
      <KnowledgeUploadModal
        isOpen={uploadModalOpen}
        organizationName={organizationName}
        onClose={() => setUploadModalOpen(false)}
        onImportSuccess={(msg) => {
          showFeedback(msg);
          void refreshWorkspaceData();
        }}
      />
    </div>
  );
}

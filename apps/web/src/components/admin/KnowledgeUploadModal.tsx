'use client';

import React, { useRef, useState } from 'react';
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertTriangle,
  FolderTree,
  HelpCircle,
  BookOpen,
  Sparkles,
  Loader2,
  FileUp,
  Layers,
  FileCode,
} from 'lucide-react';
import { KnowledgeStatus, type ApiResponse } from '@careflow/shared';
import type { KnowledgeDocumentParseResult } from '@careflow/support-engine';

interface KnowledgeUploadModalProps {
  isOpen: boolean;
  organizationName: string;
  onClose: () => void;
  onImportSuccess: (message: string) => void;
}

export function KnowledgeUploadModal({
  isOpen,
  organizationName,
  onClose,
  onImportSuccess,
}: KnowledgeUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importContent, setImportContent] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importStatus, setImportStatus] = useState<KnowledgeStatus>(KnowledgeStatus.Published);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');

  const [preview, setPreview] = useState<KnowledgeDocumentParseResult | null>(null);
  const [previewTab, setPreviewTab] = useState<'breakdown' | 'articles' | 'faqs'>('breakdown');

  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [showPasteArea, setShowPasteArea] = useState(false);

  if (!isOpen) return null;

  async function generatePreview(text: string, fileName?: string) {
    setParsing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/knowledge/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, fileName }),
      });
      const body = (await res.json()) as ApiResponse<KnowledgeDocumentParseResult>;
      if (!body.ok) {
        setErrorMsg(body.error.message || 'Failed to analyze knowledge document.');
        return;
      }
      setPreview(body.data);
      setImportContent(text);
      if (fileName) setImportFileName(fileName);
    } catch {
      setErrorMsg('Network error while analyzing knowledge file.');
    } finally {
      setParsing(false);
    }
  }

  function handleFileSelected(file: File) {
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      void generatePreview(text, file.name);
    };
    reader.onerror = () => {
      setErrorMsg('Error reading selected file.');
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  }

  async function handleLoadPunterStatSample() {
    setParsing(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        '/assets/aistudio/PunterStat_CustomCare_Knowledge_Base_0973f7c5.md'
      );
      if (!res.ok) {
        throw new Error('Sample file could not be loaded.');
      }
      const text = await res.text();
      await generatePreview(text, 'PunterStat_CustomCare_Knowledge_Base.md');
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not fetch sample PunterStat knowledge base.'
      );
      setParsing(false);
    }
  }

  async function handleExecuteImport() {
    if (!importContent.trim()) {
      setErrorMsg('No knowledge content available to import.');
      return;
    }

    setImporting(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/knowledge/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: importContent,
          fileName: importFileName,
          status: importStatus,
          mode: importMode,
        }),
      });

      const body = (await res.json()) as ApiResponse<{
        documentTitle: string;
        totalCategoriesCreated: number;
        totalArticlesCreated: number;
        totalFaqsCreated: number;
        summary: {
          totalCategories: number;
          totalArticles: number;
          totalFaqs: number;
        };
      }>;

      if (!body.ok) {
        setErrorMsg(body.error.message || 'Import failed.');
        return;
      }

      onImportSuccess(
        `Successfully imported ${body.data.summary.totalCategories} categories, ${body.data.summary.totalArticles} articles, and ${body.data.summary.totalFaqs} FAQs from "${body.data.documentTitle}" into ${organizationName}!`
      );
      onClose();
    } catch {
      setErrorMsg('Network error while saving imported knowledge records.');
    } finally {
      setImporting(false);
    }
  }

  function resetForm() {
    setImportContent('');
    setImportFileName('');
    setPreview(null);
    setErrorMsg(null);
    setShowPasteArea(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 bg-gradient-to-r from-teal-50/60 via-white to-blue-50/40">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-teal-100 text-teal-800">
                <Sparkles className="w-4 h-4" />
              </span>
              <p className="text-xs font-bold text-teal-800 uppercase tracking-wider">
                Automated Knowledge Ingestion
              </p>
            </div>
            <h2 id="upload-modal-title" className="mt-1 text-xl font-bold text-slate-900">
              Upload Knowledge Document & Auto-Categorize
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Upload a single Markdown, text, or JSON file. CustomCare will parse and organize it
              into structured support categories, help articles, and approved FAQs.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                className="text-red-700 hover:text-red-950 font-bold"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* If no file preview has been generated yet, show upload dropzone and sample loader */}
          {!preview ? (
            <div className="space-y-5">
              {/* Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                  dragActive
                    ? 'border-teal-500 bg-teal-50/60 scale-[1.01]'
                    : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50/70 bg-white'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.json,.csv,.markdown"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div className="mx-auto w-12 h-12 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center mb-3 shadow-2xs">
                  {parsing ? (
                    <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
                  ) : (
                    <FileUp className="w-6 h-6" />
                  )}
                </div>

                <p className="text-sm font-bold text-slate-900">
                  {parsing ? 'Parsing and categorizing document...' : 'Click to select or drag and drop your file'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Supports Markdown (<code className="text-slate-700 font-mono">.md</code>), Plain Text (<code className="text-slate-700 font-mono">.txt</code>), or Knowledge JSON (<code className="text-slate-700 font-mono">.json</code>)
                </p>
              </div>

              {/* Sample Loader Quick Button */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-teal-100 text-teal-800 shrink-0">
                    <FileCode className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      Sample PunterStat Knowledge Base (.md)
                    </p>
                    <p className="text-xs text-slate-600">
                      Ready-to-test document containing 13 sections, 33 approved FAQs, and full platform guides.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadPunterStatSample}
                  disabled={parsing}
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-700 hover:bg-teal-800 rounded-xl transition-colors shrink-0 shadow-2xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  {parsing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Load PunterStat Sample
                    </>
                  )}
                </button>
              </div>

              {/* Paste Text Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowPasteArea(!showPasteArea)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  {showPasteArea ? '− Hide direct text input' : '+ Or paste raw markdown / text directly'}
                </button>

                {showPasteArea && (
                  <div className="mt-3 space-y-3">
                    <textarea
                      rows={6}
                      value={importContent}
                      onChange={(e) => setImportContent(e.target.value)}
                      placeholder="# My Business Knowledge Base&#10;&#10;## 1. General FAQs&#10;### Q: How do I get started?&#10;**A:** Sign up on our portal..."
                      className="w-full text-xs font-mono rounded-xl border border-slate-300 p-3 focus:outline-hidden focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                    />
                    <button
                      type="button"
                      disabled={parsing || !importContent.trim()}
                      onClick={() => void generatePreview(importContent, 'Pasted-Knowledge.md')}
                      className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {parsing ? 'Analyzing...' : 'Analyze Pasted Text'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Analysis & Categorization Preview */
            <div className="space-y-6">
              {/* Document Summary Bar */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-800">
                      Document Title
                    </span>
                    <h3 className="text-base font-bold text-slate-900">
                      {preview.documentTitle}
                    </h3>
                    <p className="text-xs text-slate-600 mt-0.5">
                      File: {importFileName || 'knowledge-import.md'} · {preview.summary.wordCount.toLocaleString()} words
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900 py-1.5 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors self-start sm:self-center cursor-pointer"
                  >
                    Select Different File
                  </button>
                </div>

                {/* Metrics Pill Grid */}
                <div className="mt-4 pt-3 border-t border-teal-100 grid grid-cols-3 gap-3 text-center">
                  <div className="p-2.5 rounded-lg bg-white border border-teal-100">
                    <p className="text-lg font-bold text-teal-900 font-mono tabular-nums">
                      {preview.summary.totalCategories}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-600">Categories Detected</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-teal-100">
                    <p className="text-lg font-bold text-teal-900 font-mono tabular-nums">
                      {preview.summary.totalArticles}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-600">Help Articles</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white border border-teal-100">
                    <p className="text-lg font-bold text-teal-900 font-mono tabular-nums">
                      {preview.summary.totalFaqs}
                    </p>
                    <p className="text-[11px] font-semibold text-slate-600">Approved FAQs</p>
                  </div>
                </div>
              </div>

              {/* Categorization Tabs */}
              <div>
                <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('breakdown')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      previewTab === 'breakdown'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Categories Breakdown ({preview.categories.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('articles')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      previewTab === 'articles'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Articles ({preview.articles.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('faqs')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      previewTab === 'faqs'
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    FAQs ({preview.faqs.length})
                  </button>
                </div>

                {/* Tab 1: Categories Breakdown */}
                {previewTab === 'breakdown' && (
                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {preview.categories.map((c) => (
                      <div
                        key={c.slug}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <FolderTree className="w-4 h-4 text-teal-700 shrink-0" />
                          <span className="font-bold text-slate-900">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          {c.articleCount > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-semibold">
                              {c.articleCount} articles
                            </span>
                          )}
                          {c.faqCount > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-teal-100 text-teal-800 text-[11px] font-semibold">
                              {c.faqCount} FAQs
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab 2: Articles Preview */}
                {previewTab === 'articles' && (
                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {preview.articles.map((a, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl border border-slate-200 bg-white text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-slate-900">{a.title}</span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-semibold">
                            {a.categoryName}
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2">{a.shortDescription}</p>
                        {a.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {a.tags.map((t, ti) => (
                              <span
                                key={ti}
                                className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600 font-mono"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab 3: FAQs Preview */}
                {previewTab === 'faqs' && (
                  <div className="mt-3 space-y-2 max-h-60 overflow-y-auto pr-1">
                    {preview.faqs.map((f, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-xl border border-slate-200 bg-white text-xs space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-slate-900">Q: {f.question}</span>
                          <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 text-[10px] font-semibold shrink-0">
                            {f.categoryName}
                          </span>
                        </div>
                        <p className="text-slate-600 line-clamp-2">A: {f.answer}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Import Options */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <p className="text-xs font-bold text-slate-900">Import Configuration</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      Publication Status
                    </label>
                    <select
                      value={importStatus}
                      onChange={(e) => setImportStatus(e.target.value as KnowledgeStatus)}
                      className="w-full p-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold focus:outline-hidden focus:border-teal-500"
                    >
                      <option value={KnowledgeStatus.Published}>
                        Published (Active immediately on portal & bot)
                      </option>
                      <option value={KnowledgeStatus.Draft}>
                        Draft (Save for review before publishing)
                      </option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">
                      Import Behavior
                    </label>
                    <select
                      value={importMode}
                      onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
                      className="w-full p-2 rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold focus:outline-hidden focus:border-teal-500"
                    >
                      <option value="merge">Merge (Keep existing knowledge records)</option>
                      <option value="replace">
                        Replace (Wipe existing records & replace with file)
                      </option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="py-2.5 px-4 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {preview && (
            <button
              type="button"
              onClick={handleExecuteImport}
              disabled={importing}
              className="py-2.5 px-6 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl transition-colors shadow-sm inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Importing & Categorizing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm & Import ({preview.summary.totalCategories} Categories, {preview.summary.totalArticles} Articles, {preview.summary.totalFaqs} FAQs)
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

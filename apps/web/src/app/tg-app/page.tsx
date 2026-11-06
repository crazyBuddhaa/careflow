'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Script from 'next/script';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  History,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  ConversationStatus,
  EscalationPriority,
  UserRole,
  type AgentAvailability,
  type ApiResponse,
  type WorkspaceConversationItem,
} from '@careflow/shared';

interface MiniAppSessionData {
  authenticated: boolean;
  authSource: 'telegram_init_data' | 'telegram_linked' | 'web_session';
  telegramUsername?: string | null;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
  activeWorkspace: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: UserRole;
    availability: AgentAvailability;
  };
  linkedWorkspaces: Array<{
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: UserRole;
  }>;
}

interface CopilotSuggestionItem {
  id: string;
  type: 'faq' | 'article' | 'procedure';
  title: string;
  category: string;
  snippet: string;
  insertText: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
        close?: () => void;
      };
    };
  }
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function TelegramMiniAppContent() {
  const searchParams = useSearchParams();
  const initialConvParam = searchParams.get('conversationId');
  const initialOrgParam = searchParams.get('orgId');

  const [session, setSession] = useState<MiniAppSessionData | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<WorkspaceConversationItem[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(false);
  const [queueFilter, setQueueFilter] = useState<
    'all' | 'unassigned' | 'my' | 'escalated' | 'open' | 'resolved'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConvParam);
  const [mobileDetailView, setMobileDetailView] = useState<boolean>(Boolean(initialConvParam));

  const [replyBody, setReplyBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  // AI Draft & KB Search Copilot state
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotDraft, setCopilotDraft] = useState<string | null>(null);
  const [copilotSource, setCopilotSource] = useState<string | null>(null);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [copilotItems, setCopilotItems] = useState<CopilotSuggestionItem[]>([]);

  const showToast = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const authenticateMiniApp = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const tgWebApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
      tgWebApp?.ready?.();
      tgWebApp?.expand?.();

      const rawInitData = tgWebApp?.initData?.trim() || '';

      if (rawInitData) {
        const res = await fetch('/api/telegram/miniapp/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initData: rawInitData,
            organizationId: initialOrgParam || undefined,
          }),
        });
        const body = (await res.json()) as ApiResponse<MiniAppSessionData>;
        if (!body.ok) {
          setAuthError(body.error.message);
          setAuthLoading(false);
          return;
        }
        setSession(body.data);
        setAuthLoading(false);
        return;
      }

      // Fallback to active CustomCare session cookie (desktop/mobile browser or already authenticated WebView)
      const getRes = await fetch(
        initialOrgParam
          ? `/api/telegram/miniapp/session`
          : '/api/telegram/miniapp/session',
        { cache: 'no-store' }
      );
      const getBody = (await getRes.json()) as ApiResponse<MiniAppSessionData>;
      if (getBody.ok) {
        if (
          initialOrgParam &&
          initialOrgParam !== getBody.data.activeWorkspace.organizationId
        ) {
          const switchRes = await fetch('/api/telegram/miniapp/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organizationId: initialOrgParam }),
          });
          const switchBody = (await switchRes.json()) as ApiResponse<MiniAppSessionData>;
          if (switchBody.ok) {
            setSession(switchBody.data);
            setAuthLoading(false);
            return;
          }
        }
        setSession(getBody.data);
      } else {
        setAuthError(
          'Launch this Mini App from your linked Telegram bot (@getcustomcarebot) or sign in to your CustomCare agent account.'
        );
      }
    } catch {
      setAuthError('Unable to verify Telegram Mini App session.');
    } finally {
      setAuthLoading(false);
    }
  }, [initialOrgParam]);

  const loadConversations = useCallback(async () => {
    if (!session?.authenticated) return;
    setLoadingConvs(true);
    try {
      const params = new URLSearchParams();
      if (queueFilter === 'open') params.set('status', ConversationStatus.Open);
      if (queueFilter === 'escalated') params.set('status', ConversationStatus.Escalated);
      if (queueFilter === 'resolved') params.set('status', ConversationStatus.Resolved);
      if (queueFilter === 'unassigned') params.set('unassignedOnly', 'true');
      if (queueFilter === 'my') params.set('assignedToMe', 'true');
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/admin/conversations?${params.toString()}`, {
        cache: 'no-store',
      });
      const body = (await res.json()) as ApiResponse<WorkspaceConversationItem[]>;
      if (body.ok) {
        setConversations(body.data);
      }
    } catch {
      // ignore transient poll error
    } finally {
      setLoadingConvs(false);
    }
  }, [session?.authenticated, queueFilter, searchQuery]);

  useEffect(() => {
    void authenticateMiniApp();
  }, [authenticateMiniApp]);

  useEffect(() => {
    if (session?.authenticated) {
      void loadConversations();
    }
  }, [session?.authenticated, loadConversations]);

  const activeConversation =
    conversations.find((c) => c.id === selectedConvId) ?? conversations[0] ?? null;

  async function handleWorkspaceSwitch(nextOrgId: string) {
    try {
      const res = await fetch('/api/telegram/miniapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: nextOrgId }),
      });
      const body = (await res.json()) as ApiResponse<MiniAppSessionData>;
      if (body.ok) {
        setSession(body.data);
        setSelectedConvId(null);
        showToast(`Switched to ${body.data.activeWorkspace.organizationName}`);
      }
    } catch {
      // ignore
    }
  }

  async function handleAvailabilityChange(nextAvail: AgentAvailability) {
    try {
      const res = await fetch('/api/telegram/miniapp/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability: nextAvail }),
      });
      const body = (await res.json()) as ApiResponse<MiniAppSessionData>;
      if (body.ok) {
        setSession(body.data);
        showToast(`Availability set to ${nextAvail.toUpperCase()}`);
      }
    } catch {
      // ignore
    }
  }

  async function handlePatchConversation(
    convId: string,
    patch: {
      status?: ConversationStatus;
      priority?: EscalationPriority;
      assignedAgentName?: string | null;
    }
  ) {
    try {
      const res = await fetch(`/api/admin/conversations/${encodeURIComponent(convId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as ApiResponse<WorkspaceConversationItem>;
      if (body.ok) {
        showToast('Conversation updated');
        await loadConversations();
      }
    } catch {
      // ignore
    }
  }

  async function handleSendReply(
    e: React.FormEvent,
    nextStatus?: ConversationStatus
  ) {
    e.preventDefault();
    if (!activeConversation || !replyBody.trim()) return;
    setSendingReply(true);
    try {
      const res = await fetch(
        `/api/admin/conversations/${encodeURIComponent(activeConversation.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: replyBody.trim(),
            isInternalNote,
            nextStatus,
          }),
        }
      );
      const body = (await res.json()) as ApiResponse<WorkspaceConversationItem>;
      if (body.ok) {
        setReplyBody('');
        showToast(
          isInternalNote
            ? 'Internal note saved'
            : 'Reply sent to customer via official bot'
        );
        await loadConversations();
      }
    } finally {
      setSendingReply(false);
    }
  }

  async function handleRunCopilot(action: 'suggest_reply' | 'search_kb') {
    if (!activeConversation) return;
    setCopilotOpen(true);
    setCopilotLoading(true);
    try {
      const res = await fetch(
        `/api/workspace/conversations/${encodeURIComponent(activeConversation.id)}/copilot`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            query: copilotQuery.trim() || undefined,
          }),
        }
      );
      const body = (await res.json()) as ApiResponse<{
        suggestedReply?: string;
        matchedSourceTitle?: string | null;
        suggestions?: CopilotSuggestionItem[];
      }>;
      if (body.ok) {
        if (body.data.suggestedReply) {
          setCopilotDraft(body.data.suggestedReply);
          setCopilotSource(body.data.matchedSourceTitle ?? null);
        }
        setCopilotItems(body.data.suggestions ?? []);
      }
    } finally {
      setCopilotLoading(false);
    }
  }

  const openCount = conversations.filter(
    (c) => c.status === ConversationStatus.Open || c.status === ConversationStatus.Escalated
  ).length;
  const unassignedCount = conversations.filter(
    (c) => !c.assignedAgentName && c.status !== ConversationStatus.Resolved
  ).length;
  const myCount = conversations.filter(
    (c) =>
      c.assignedAgentName === session?.user.fullName &&
      c.status !== ConversationStatus.Resolved
  ).length;
  const resolvedCount = conversations.filter(
    (c) => c.status === ConversationStatus.Resolved
  ).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => {
          window.Telegram?.WebApp?.ready?.();
          window.Telegram?.WebApp?.expand?.();
        }}
      />

      {/* Top Agent Bar */}
      <header className="sticky top-0 z-20 bg-slate-900 text-white border-b border-slate-800 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center font-bold text-sm">
              CC
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight">
                  {session?.activeWorkspace.organizationName ?? 'CustomCare Agent Mini App'}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 text-[10px] font-semibold uppercase">
                  Telegram Mini App
                </span>
              </div>
              {session && (
                <p className="text-[11px] text-slate-300">
                  {session.user.fullName} ({session.activeWorkspace.role})
                  {session.telegramUsername ? ` · @${session.telegramUsername}` : ''}
                </p>
              )}
            </div>
          </div>

          {session && (
            <div className="flex flex-wrap items-center gap-2">
              {session.linkedWorkspaces.length > 1 && (
                <select
                  aria-label="Switch active business workspace"
                  value={session.activeWorkspace.organizationId}
                  onChange={(e) => void handleWorkspaceSwitch(e.target.value)}
                  className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-white"
                >
                  {session.linkedWorkspaces.map((w) => (
                    <option key={w.organizationId} value={w.organizationId}>
                      {w.organizationName} ({w.role})
                    </option>
                  ))}
                </select>
              )}

              <select
                aria-label="Agent availability"
                value={session.activeWorkspace.availability}
                onChange={(e) =>
                  void handleAvailabilityChange(e.target.value as AgentAvailability)
                }
                className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-white"
              >
                <option value="available">🟢 Available</option>
                <option value="busy">🟡 Busy</option>
                <option value="offline">⚪ Offline</option>
              </select>

              <button
                type="button"
                onClick={() => void loadConversations()}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                title="Refresh queue"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <a
                href="/admin"
                className="py-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Full Dashboard
              </a>
            </div>
          )}
        </div>
      </header>

      {feedback && (
        <div className="bg-teal-700 text-white px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 space-y-4">
        {authLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
            <p className="text-sm font-bold text-slate-900">
              Verifying Telegram Mini App Agent Identity...
            </p>
            <p className="text-xs text-slate-500">
              Validating HMAC-SHA256 signature and workspace permissions.
            </p>
          </div>
        ) : authError || !session ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 max-w-lg mx-auto text-center space-y-4">
            <ShieldCheck className="w-10 h-10 text-teal-700 mx-auto" />
            <h1 className="text-lg font-bold text-slate-900">
              Agent Authentication Required
            </h1>
            <p className="text-xs text-slate-600 leading-relaxed">
              {authError}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
              <a
                href="/login?redirect=/tg-app"
                className="py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white"
              >
                Sign In to Agent Workspace
              </a>
              <a
                href="/admin"
                className="py-2 px-4 rounded-xl border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700"
              >
                Open Web Dashboard
              </a>
            </div>
          </div>
        ) : (
          <>
            {/* KPI Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold text-slate-500">Active / Open</p>
                <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-slate-900">
                  {openCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold text-slate-500">Unassigned</p>
                <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-amber-700">
                  {unassignedCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold text-slate-500">My Active Chats</p>
                <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-blue-700">
                  {myCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold text-slate-500">Resolved</p>
                <p className="mt-0.5 text-lg font-bold font-mono tabular-nums text-teal-700">
                  {resolvedCount}
                </p>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    ['all', 'All'],
                    ['unassigned', 'Unassigned'],
                    ['my', 'My Chats'],
                    ['escalated', 'Escalated'],
                    ['open', 'Open'],
                    ['resolved', 'Resolved'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setQueueFilter(key);
                      setMobileDetailView(false);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                      queueFilter === key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search customer, subject, ID..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Unified Inbox + Conversation Workspace */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left Queue List */}
              <div
                className={`lg:col-span-5 rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden ${
                  mobileDetailView ? 'hidden lg:block' : 'block'
                }`}
              >
                {loadingConvs ? (
                  <div className="p-6 text-center text-xs text-slate-500">
                    Loading conversations...
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <MessageSquare className="w-7 h-7 text-slate-300 mx-auto" />
                    <p className="text-xs font-semibold text-slate-800">
                      No conversations in this queue
                    </p>
                  </div>
                ) : (
                  conversations.map((conv) => {
                    const isSelected = activeConversation?.id === conv.id;
                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => {
                          setSelectedConvId(conv.id);
                          setMobileDetailView(true);
                        }}
                        className={`w-full text-left p-4 transition-colors cursor-pointer ${
                          isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={
                                conv.status === ConversationStatus.Escalated
                                  ? 'font-bold text-rose-700'
                                  : conv.status === ConversationStatus.Resolved
                                    ? 'font-bold text-teal-700'
                                    : 'font-bold text-blue-700'
                              }
                            >
                              {conv.status.toUpperCase()}
                            </span>
                            <span>·</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] uppercase">
                              {conv.channel}
                            </span>
                          </div>
                          <span className="font-mono">{formatShortTime(conv.updatedAt)}</span>
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-900 line-clamp-1">
                          {conv.subject}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-600">
                          <span className="truncate">{conv.customerName}</span>
                          <span className="font-semibold text-slate-700 shrink-0">
                            {conv.assignedAgentName ?? 'Unassigned'}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right Conversation Workspace */}
              <div
                className={`lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 space-y-4 ${
                  !mobileDetailView ? 'hidden lg:block' : 'block'
                }`}
              >
                {!activeConversation ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Select a conversation from the queue to view messages and reply.
                  </div>
                ) : (
                  <>
                    <div className="border-b border-slate-100 pb-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 lg:hidden">
                        <button
                          type="button"
                          onClick={() => setMobileDetailView(false)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Back to Queue</span>
                        </button>
                        <span className="font-mono text-[11px] text-slate-400">
                          {activeConversation.id}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h2 className="text-sm font-bold text-slate-900">
                            {activeConversation.subject}
                          </h2>
                          <p className="text-xs text-slate-600">
                            {activeConversation.customerName} ({activeConversation.customerEmail}) ·{' '}
                            <span className="font-mono">{activeConversation.channel}</span>
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {activeConversation.assignedAgentName !== session.user.fullName && (
                            <button
                              type="button"
                              onClick={() =>
                                void handlePatchConversation(activeConversation.id, {
                                  assignedAgentName: session.user.fullName,
                                })
                              }
                              className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-semibold cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Claim Chat</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowAuditLogs((v) => !v)}
                            className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>History</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <select
                          aria-label="Conversation status"
                          value={activeConversation.status}
                          onChange={(e) =>
                            void handlePatchConversation(activeConversation.id, {
                              status: e.target.value as ConversationStatus,
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          <option value={ConversationStatus.Open}>Open</option>
                          <option value={ConversationStatus.Pending}>Pending</option>
                          <option value={ConversationStatus.Escalated}>Escalated</option>
                          <option value={ConversationStatus.Resolved}>Resolved</option>
                        </select>

                        <select
                          aria-label="Conversation priority"
                          value={activeConversation.priority}
                          onChange={(e) =>
                            void handlePatchConversation(activeConversation.id, {
                              priority: e.target.value as EscalationPriority,
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          <option value={EscalationPriority.Low}>Priority: Low</option>
                          <option value={EscalationPriority.Normal}>Priority: Normal</option>
                          <option value={EscalationPriority.High}>Priority: High</option>
                          <option value={EscalationPriority.Urgent}>Priority: Urgent</option>
                        </select>
                      </div>

                      {showAuditLogs && activeConversation.activityLogs && (
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-1.5 max-h-32 overflow-y-auto text-[11px]">
                          {activeConversation.activityLogs.map((log) => (
                            <div key={log.id} className="flex justify-between gap-2">
                              <span>
                                <strong>{log.actorName}</strong>: {log.details}
                              </span>
                              <span className="font-mono text-slate-400 shrink-0">
                                {formatShortTime(log.createdAt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Message Thread */}
                    <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                      {activeConversation.messages.map((m) => {
                        const isNote = Boolean(m.isInternalNote);
                        const isAgent = m.senderType === 'agent';
                        const isBot = m.senderType === 'bot';
                        return (
                          <div
                            key={m.id}
                            className={`rounded-xl p-3 text-xs ${
                              isNote
                                ? 'bg-amber-50 border border-amber-300 text-amber-950 ml-4'
                                : isAgent
                                  ? 'bg-blue-50/80 border border-blue-100 text-slate-900 ml-4'
                                  : isBot
                                    ? 'bg-teal-50/70 border border-teal-100 text-slate-900 ml-4'
                                    : 'bg-slate-50 border border-slate-200 text-slate-900 mr-4'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 mb-1">
                              <span className="font-bold text-slate-900">
                                {m.senderName}{' '}
                                <span className="font-normal uppercase text-[10px]">
                                  ({isNote ? 'Internal Note' : m.senderType})
                                </span>
                              </span>
                              <span className="font-mono">{formatShortTime(m.createdAt)}</span>
                            </div>
                            <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Composer + AI/KB Copilot */}
                    <form
                      onSubmit={(e) => void handleSendReply(e)}
                      className="pt-3 border-t border-slate-100 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="inline-flex p-0.5 rounded-lg bg-slate-100">
                          <button
                            type="button"
                            onClick={() => setIsInternalNote(false)}
                            className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer ${
                              !isInternalNote ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                            }`}
                          >
                            Bot-Mediated Reply
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsInternalNote(true)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer ${
                              isInternalNote ? 'bg-amber-500 text-white' : 'text-slate-600'
                            }`}
                          >
                            <Lock className="w-3 h-3" />
                            <span>Internal Note</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => void handleRunCopilot('suggest_reply')}
                          className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg border border-teal-200 bg-teal-50 hover:bg-teal-100 text-xs font-semibold text-teal-900 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-teal-700" />
                          <span>AI Draft &amp; KB Search</span>
                        </button>
                      </div>

                      {copilotOpen && (
                        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">
                              AI Reply Copilot &amp; Knowledge Base
                              {copilotSource ? ` · ${copilotSource}` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCopilotOpen(false)}
                              className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {copilotLoading ? (
                            <p className="text-xs text-slate-500">
                              Generating grounded reply suggestion...
                            </p>
                          ) : (
                            copilotDraft && (
                              <div className="rounded-lg bg-white border border-teal-200 p-2.5 space-y-2">
                                <p className="text-xs text-slate-800 whitespace-pre-line">
                                  {copilotDraft}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setIsInternalNote(false);
                                    setReplyBody(copilotDraft);
                                  }}
                                  className="py-1 px-2.5 rounded bg-teal-700 hover:bg-teal-800 text-[11px] font-semibold text-white cursor-pointer"
                                >
                                  Insert Draft into Composer
                                </button>
                              </div>
                            )
                          )}

                          <div className="flex items-center gap-1.5">
                            <div className="relative flex-1">
                              <BookOpen className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <input
                                type="search"
                                value={copilotQuery}
                                onChange={(e) => setCopilotQuery(e.target.value)}
                                placeholder="Search knowledge base articles & FAQs..."
                                className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 py-1 text-xs text-slate-900"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleRunCopilot('search_kb')}
                              className="py-1 px-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                            >
                              Search
                            </button>
                          </div>

                          {copilotItems.length > 0 && (
                            <div className="space-y-1.5 max-h-36 overflow-y-auto">
                              {copilotItems.map((item) => (
                                <div
                                  key={`${item.type}_${item.id}`}
                                  className="rounded-lg bg-white border border-slate-200 p-2 flex items-start justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-900 truncate">
                                      {item.title}
                                    </p>
                                    <p className="text-[11px] text-slate-600 line-clamp-2">
                                      {item.snippet}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReplyBody((prev) =>
                                        prev ? `${prev}\n\n${item.insertText}` : item.insertText
                                      )
                                    }
                                    className="text-[11px] font-bold text-teal-700 shrink-0 cursor-pointer"
                                  >
                                    + Use
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <textarea
                        rows={3}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={
                          isInternalNote
                            ? 'Write a private internal note for your team...'
                            : `Reply to ${activeConversation.customerName} (delivered via official ${activeConversation.channel} bot)...`
                        }
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      />

                      <div className="flex items-center justify-end gap-2">
                        {!isInternalNote &&
                          activeConversation.status !== ConversationStatus.Resolved && (
                            <button
                              type="button"
                              disabled={sendingReply || !replyBody.trim()}
                              onClick={(e) =>
                                void handleSendReply(e, ConversationStatus.Resolved)
                              }
                              className="py-2 px-3 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                            >
                              Reply &amp; Resolve
                            </button>
                          )}
                        <button
                          type="submit"
                          disabled={sendingReply || !replyBody.trim()}
                          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>
                            {sendingReply
                              ? 'Sending...'
                              : isInternalNote
                                ? 'Save Note'
                                : 'Send Reply'}
                          </span>
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function TelegramMiniAppPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-xs text-slate-500">
          Loading CustomCare Telegram Mini App...
        </div>
      }
    >
      <TelegramMiniAppContent />
    </Suspense>
  );
}

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Send,
  BookOpen,
  Users,
  CheckCircle2,
  AlertTriangle,
  Copy,
  ExternalLink,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Clock,
  Inbox,
  Link2,
  Unlink,
  UserCheck,
  Bot,
  Globe,
} from 'lucide-react';
import {
  ConversationStatus,
  EscalationPriority,
  UserRole,
  type AgentAvailability,
  type ApiResponse,
  type ChannelIntegrationRecord,
  type OnboardingProgressReport,
  type TelegramAgentLinkCodeResponse,
  type TelegramAgentLinkRecord,
  type WorkspaceAgentRecord,
  type WorkspaceAnalyticsSummary,
  type WorkspaceConversationItem,
  type AdminModuleSectionKey,
} from '@careflow/shared';

interface WorkspaceRoleOverviewProps {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  currentUserId: string;
  currentUserName: string;
  currentUserEmail: string;
  currentUserRole: UserRole;
  onNavigateSection: (section: AdminModuleSectionKey) => void;
}

export function WorkspaceRoleOverview({
  organizationId,
  organizationName,
  organizationSlug,
  currentUserId,
  currentUserName,
  currentUserEmail,
  currentUserRole,
  onNavigateSection,
}: WorkspaceRoleOverviewProps) {
  const isBusinessManager =
    currentUserRole === UserRole.Owner || currentUserRole === UserRole.Admin;

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<WorkspaceAnalyticsSummary | null>(null);
  const [conversations, setConversations] = useState<WorkspaceConversationItem[]>([]);
  const [integrations, setIntegrations] = useState<ChannelIntegrationRecord[]>([]);
  const [agentLinks, setAgentLinks] = useState<TelegramAgentLinkRecord[]>([]);
  const [agents, setAgents] = useState<WorkspaceAgentRecord[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingProgressReport | null>(null);

  // Agent-specific state (availability + Telegram companion linking)
  const [updatingAvailability, setUpdatingAvailability] = useState(false);
  const [generatedLinkCode, setGeneratedLinkCode] =
    useState<TelegramAgentLinkCodeResponse | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const [convRes, intRes, agRes, anaRes, onbRes] = await Promise.all([
        fetch('/api/admin/conversations', { cache: 'no-store' }),
        fetch('/api/admin/integrations', { cache: 'no-store' }),
        fetch('/api/admin/agents', { cache: 'no-store' }),
        fetch('/api/admin/analytics', { cache: 'no-store' }),
        isBusinessManager
          ? fetch('/api/admin/onboarding', { cache: 'no-store' })
          : Promise.resolve(null),
      ]);

      const convBody = (await convRes.json()) as ApiResponse<WorkspaceConversationItem[]>;
      if (convBody.ok) setConversations(convBody.data);

      const intBody = (await intRes.json()) as ApiResponse<{
        integrations: ChannelIntegrationRecord[];
        agentLinks: TelegramAgentLinkRecord[];
      }>;
      if (intBody.ok) {
        setIntegrations(intBody.data.integrations);
        setAgentLinks(intBody.data.agentLinks);
      }

      const agBody = (await agRes.json()) as ApiResponse<WorkspaceAgentRecord[]>;
      if (agBody.ok) setAgents(agBody.data);

      const anaBody = (await anaRes.json()) as ApiResponse<WorkspaceAnalyticsSummary>;
      if (anaBody.ok) setAnalytics(anaBody.data);

      if (onbRes) {
        const onbBody = (await onbRes.json()) as ApiResponse<OnboardingProgressReport>;
        if (onbBody.ok) setOnboarding(onbBody.data);
      }
    } catch {
      setErrorBanner('Unable to load workspace overview.');
    } finally {
      setLoading(false);
    }
  }, [isBusinessManager]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData, organizationId]);

  function copyToClipboard(value: string, label: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
      showFeedback(`Copied ${label} to clipboard.`);
    }
  }

  const currentAgentProfile = agents.find(
    (a) =>
      a.userId === currentUserId ||
      a.email.toLowerCase() === currentUserEmail.toLowerCase() ||
      a.displayName.toLowerCase() === currentUserName.toLowerCase()
  );

  const currentUserTelegramLink = agentLinks.find(
    (l) => l.userId === currentUserId && l.status === 'linked'
  );

  async function handleUpdateMyAvailability(nextAvailability: AgentAvailability) {
    if (!currentAgentProfile) return;
    setUpdatingAvailability(true);
    try {
      const res = await fetch(
        `/api/admin/agents/${encodeURIComponent(currentAgentProfile.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ availability: nextAvailability }),
        }
      );
      const body = (await res.json()) as ApiResponse<WorkspaceAgentRecord>;
      if (body.ok) {
        showFeedback(`Your status is now ${nextAvailability.toUpperCase()}.`);
        await loadDashboardData();
      }
    } finally {
      setUpdatingAvailability(false);
    }
  }

  async function handleGenerateAgentLinkCode() {
    setGeneratingCode(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/integrations/telegram-link', {
        method: 'POST',
      });
      const body = (await res.json()) as ApiResponse<TelegramAgentLinkCodeResponse>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setGeneratedLinkCode(body.data);
      showFeedback('Generated single-use 10-minute Telegram linking code.');
    } catch {
      setErrorBanner('Unable to generate Telegram linking code.');
    } finally {
      setGeneratingCode(false);
    }
  }

  async function handleUnlinkMyTelegram() {
    try {
      const res = await fetch(
        `/api/admin/integrations/telegram-link?userId=${encodeURIComponent(currentUserId)}`,
        { method: 'DELETE' }
      );
      const body = (await res.json()) as ApiResponse<{ revoked: boolean }>;
      if (body.ok) {
        setGeneratedLinkCode(null);
        showFeedback('Unlinked your Telegram account.');
        await loadDashboardData();
      }
    } catch {
      setErrorBanner('Unable to unlink Telegram account.');
    }
  }

  const tgIntegration = integrations.find((i) => i.channel === 'telegram');
  const portalIntegration = integrations.find((i) => i.channel === 'portal');
  const widgetIntegration = integrations.find((i) => i.channel === 'web_widget');

  const activeConversations = conversations.filter(
    (c) => c.status !== ConversationStatus.Resolved && c.status !== ConversationStatus.Closed
  );
  const myAssignedConversations = activeConversations.filter(
    (c) =>
      c.assignedAgentName &&
      c.assignedAgentName.toLowerCase() === currentUserName.toLowerCase()
  );
  const unassignedConversations = activeConversations.filter((c) => !c.assignedAgentName);
  const highPriorityConversations = activeConversations.filter(
    (c) =>
      c.priority === EscalationPriority.High || c.priority === EscalationPriority.Urgent
  );

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse p-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse p-5" />
          <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse p-5" />
          <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse p-5" />
          <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse p-5" />
        </div>
      </div>
    );
  }

  /* =========================================================================
     VIEW A: DEDICATED AGENT DASHBOARD (Agent / Supervisor / Viewer)
     Focused strictly on queue resolution, availability, and Telegram companion
  ========================================================================= */
  if (!isBusinessManager) {
    return (
      <div className="space-y-6">
        {feedback && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs sm:text-sm font-semibold text-teal-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
              <span>{feedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs text-teal-700 hover:text-teal-950"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorBanner && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-semibold text-rose-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs text-rose-700 hover:text-rose-950"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Agent Header & Live Availability Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold uppercase">
                Agent Workspace · {currentUserRole}
              </span>
              <span className="text-xs text-slate-500">{organizationName}</span>
            </div>
            <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Welcome back, {currentUserName.split(' ')[0]}
            </h1>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-600">
              Manage your assigned customer conversations, pick up unassigned escalations, and reply
              from the web or Telegram.
            </p>
          </div>

          {/* Availability Toggle */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {currentAgentProfile && (
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
                {(['available', 'busy', 'offline'] as const).map((state) => {
                  const isCurrent = currentAgentProfile.availability === state;
                  const dotColor =
                    state === 'available'
                      ? 'bg-emerald-500'
                      : state === 'busy'
                        ? 'bg-amber-500'
                        : 'bg-slate-400';
                  return (
                    <button
                      key={state}
                      type="button"
                      disabled={updatingAvailability || isCurrent}
                      onClick={() => void handleUpdateMyAvailability(state)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span>{state}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => onNavigateSection('conversations')}
              className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Inbox className="w-4 h-4" />
              <span>Open Support Inbox</span>
            </button>
          </div>
        </div>

        {/* Agent Focused 3-Card Queue Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onNavigateSection('conversations')}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-teal-300 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">My Assigned Chats</span>
              <UserCheck className="w-4 h-4 text-teal-600" />
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-900 font-mono">
              {myAssignedConversations.length}
            </p>
            <p className="mt-1 text-xs text-teal-700 font-semibold group-hover:underline">
              View my active threads &rarr;
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection('conversations')}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-blue-300 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Unassigned Queue</span>
              <Inbox className="w-4 h-4 text-blue-600" />
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-900 font-mono">
              {unassignedConversations.length}
            </p>
            <p className="mt-1 text-xs text-blue-700 font-semibold group-hover:underline">
              Pick up waiting customers &rarr;
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateSection('conversations')}
            className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-rose-300 transition-colors cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">High &amp; Urgent Priority</span>
              <Clock className="w-4 h-4 text-rose-600" />
            </div>
            <p className="mt-2 text-3xl font-bold text-slate-900 font-mono">
              {highPriorityConversations.length}
            </p>
            <p className="mt-1 text-xs text-rose-700 font-semibold group-hover:underline">
              Inspect priority escalations &rarr;
            </p>
          </button>
        </div>

        {/* Two-Column Agent Workspace: Active Queue + Personal Telegram Companion */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Conversations Needing Attention */}
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Conversations Needing Attention
                </h2>
                <p className="text-xs text-slate-500">
                  Assigned to you or waiting in {organizationName}&apos;s unassigned queue
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateSection('conversations')}
                className="text-xs font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
              >
                Full Inbox &rarr;
              </button>
            </div>

            {activeConversations.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center space-y-1">
                <CheckCircle2 className="w-6 h-6 text-teal-600 mx-auto" />
                <p className="text-sm font-bold text-slate-900">All caught up!</p>
                <p className="text-xs text-slate-500">
                  There are no open or escalated customer conversations right now.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeConversations.slice(0, 5).map((conv) => (
                  <div
                    key={conv.id}
                    className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {conv.customerName}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                          {conv.channel}
                        </span>
                        {(conv.priority === EscalationPriority.High ||
                          conv.priority === EscalationPriority.Urgent) && (
                          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-[10px] font-bold uppercase">
                            {conv.priority}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 truncate mt-0.5">
                        {conv.subject} ·{' '}
                        <span className="text-slate-400">
                          {conv.assignedAgentName
                            ? `Assigned to ${conv.assignedAgentName}`
                            : 'Unassigned'}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateSection('conversations')}
                      className="py-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-800 shrink-0 cursor-pointer"
                    >
                      Reply
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Agent's Personal Telegram Companion Card */}
          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 text-[10px] font-bold uppercase">
                  Mobile Agent Companion
                </span>
                <h2 className="mt-1 text-base font-bold text-slate-900">
                  Reply from Telegram (@getcustomcarebot)
                </h2>
              </div>
              <Send className="w-5 h-5 text-teal-600 shrink-0" />
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Link your personal Telegram account to receive instant escalation alerts, accept
              tickets, and reply to customers on the go. Your personal Telegram identity is never
              shown to customers.
            </p>

            {currentUserTelegramLink ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900">
                    ✅ Linked (@
                    {currentUserTelegramLink.telegramUsername ||
                      currentUserTelegramLink.telegramUserId}
                    )
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleUnlinkMyTelegram()}
                    className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:underline cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Unlink</span>
                  </button>
                </div>
                <div className="text-[11px] font-mono text-slate-700 bg-white rounded-lg p-2.5 border border-emerald-200/80 space-y-1">
                  <div>/my — View your assigned chats</div>
                  <div>/unassigned — View waiting queue</div>
                  <div>/accept &lt;id&gt; — Claim a conversation</div>
                  <div>/reply &lt;id&gt; &lt;msg&gt; — Send customer reply</div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={generatingCode}
                  onClick={() => void handleGenerateAgentLinkCode()}
                  className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Link2 className="w-4 h-4" />
                  <span>
                    {generatingCode
                      ? 'Generating Code...'
                      : 'Generate 10-Min Telegram Linking Code'}
                  </span>
                </button>

                {generatedLinkCode && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-3.5 space-y-2">
                    <p className="text-[11px] font-bold text-teal-900">
                      Send this single-use code to @getcustomcarebot:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 rounded-lg bg-white border border-teal-200 text-xs font-mono font-bold text-slate-900">
                        /link {generatedLinkCode.linkingCode}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            `/link ${generatedLinkCode.linkingCode}`,
                            'agent linking command'
                          )
                        }
                        className="py-2 px-3 rounded-lg bg-teal-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* =========================================================================
     VIEW B: BUSINESS COMMAND CENTER (Owner / Admin)
     Clean, non-overwhelming overview of channels, bot links, inbox, and KB
  ========================================================================= */
  const activeChannelCount = integrations.filter((i) => i.status === 'active').length;
  const publishedKbCount =
    (analytics?.knowledge.publishedArticles ?? 0) +
    (analytics?.knowledge.publishedFaqs ?? 0);
  const effectiveTelegramUrl =
    tgIntegration?.telegramConfig?.customBotDeepLinkUrl || tgIntegration?.deepLinkUrl || null;

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-xs sm:text-sm font-semibold text-teal-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs text-teal-700 hover:text-teal-950"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-semibold text-rose-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-xs text-rose-700 hover:text-rose-950"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Business Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-[11px] font-bold uppercase">
              Business Command Center · {currentUserRole}
            </span>
            <span className="text-xs text-slate-500">/{organizationSlug}</span>
          </div>
          <h1 className="mt-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {organizationName} Overview
          </h1>
          <p className="mt-0.5 text-xs sm:text-sm text-slate-600">
            Monitor live customer conversations, share your Telegram bot &amp; portal links, and
            manage your support team from one clean workspace.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateSection('integrations')}
            className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5 text-teal-600" />
            <span>Telegram &amp; Channels</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('conversations')}
            className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Open Support Inbox ({activeConversations.length})</span>
          </button>
        </div>
      </div>

      {/* Compact Setup Progress Banner (only shown if setup < 100% or not published) */}
      {onboarding && onboarding.completionPercentage < 100 && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-700" />
              <span className="text-xs font-bold uppercase tracking-wider text-teal-900">
                Guided Launch Checklist · {onboarding.completionPercentage}% Complete (
                {onboarding.completedStepsCount}/{onboarding.totalStepsCount} steps)
              </span>
            </div>
            <p className="text-xs text-teal-800">
              Complete your remaining setup items at your own pace to launch your full self-service
              experience.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateSection('onboarding-guide')}
            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shrink-0 cursor-pointer"
          >
            <span>Open Setup Checklist</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 Clean Business KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateSection('conversations')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Active Conversations</span>
            <MessageSquare className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono">
            {activeConversations.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {unassignedConversations.length} unassigned ·{' '}
            <span className="text-blue-700 font-semibold group-hover:underline">Open Inbox</span>
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('integrations')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Customer Channels</span>
            <Send className="w-4 h-4 text-teal-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono">
            {activeChannelCount} Active
          </p>
          <p className="mt-1 text-xs text-slate-500 truncate">
            {tgIntegration?.telegramConfig?.customBotUsername
              ? `Sub-Bot @${tgIntegration.telegramConfig.customBotUsername}`
              : tgIntegration?.status === 'active'
                ? 'Central @getcustomcarebot active'
                : 'Configure Telegram & Widget'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('knowledge-overview')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Published Knowledge</span>
            <BookOpen className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono">{publishedKbCount}</p>
          <p className="mt-1 text-xs text-slate-500">
            {analytics?.knowledge.publishedArticles ?? 0} articles ·{' '}
            {analytics?.knowledge.publishedFaqs ?? 0} FAQs
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('agents')}
          className="rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Support Specialists</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono">
            {analytics?.team.availableSpecialists ?? 0} / {analytics?.team.totalSpecialists ?? 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Online now · {agentLinks.filter((l) => l.status === 'linked').length} linked on Telegram
          </p>
        </button>
      </div>

      {/* Main 2-Column Overview: Live Customer Channels (Left) + Recent Conversations (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Customer Access Links (Telegram Central Link + Sub-Bot + Portal) */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Your Customer Support Channels
              </h2>
              <p className="text-xs text-slate-500">
                Share these links with your customers or connect your own @BotFather sub-bot
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('integrations')}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 cursor-pointer"
            >
              Configure &rarr;
            </button>
          </div>

          {/* Telegram Channel Summary Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Send className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-900">
                  Telegram Customer Bot
                </span>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  tgIntegration?.status === 'active'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tgIntegration?.status === 'active' ? 'Active' : 'Not Activated'}
              </span>
            </div>

            {effectiveTelegramUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={effectiveTelegramUrl}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-mono text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(effectiveTelegramUrl, 'Telegram support link')}
                    className="py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                  <span>
                    {tgIntegration?.telegramConfig?.customBotUsername
                      ? `Dedicated Sub-Bot: @${tgIntegration.telegramConfig.customBotUsername}`
                      : 'Using Central @getcustomcarebot link'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onNavigateSection('integrations')}
                    className="font-bold text-teal-700 hover:underline cursor-pointer"
                  >
                    {tgIntegration?.telegramConfig?.customBotUsername
                      ? 'Manage Sub-Bot'
                      : '+ Connect @BotFather Sub-Bot'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-600">
                  Activate your instant @getcustomcarebot link or connect a @BotFather sub-bot.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateSection('integrations')}
                  className="py-1.5 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  Activate
                </button>
              </div>
            )}
          </div>

          {/* Web Portal & Widget Summary Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-600" />
                  <span>Support Portal</span>
                </span>
                <span className="text-[10px] font-bold uppercase text-slate-500">
                  {portalIntegration?.status === 'active' ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <Link
                  href={`/portal/${organizationSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  <span>Preview Portal</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
                <button
                  type="button"
                  onClick={() => onNavigateSection('branding')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Customize
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-teal-600" />
                  <span>Web Chat Widget</span>
                </span>
                <span className="text-[10px] font-bold uppercase text-slate-500">
                  {widgetIntegration?.status === 'active' ? 'Active' : 'Optional'}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => onNavigateSection('integrations')}
                  className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                >
                  Embed Script &rarr;
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateSection('chatbot-settings')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  AI Rules
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Recent Customer Conversations */}
        <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Customer Conversations</h2>
              <p className="text-xs text-slate-500">
                Live threads across Telegram, Website Widget, and Support Portal
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('conversations')}
              className="text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              View All ({conversations.length}) &rarr;
            </button>
          </div>

          {conversations.length === 0 ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-6 text-center space-y-1.5">
              <MessageSquare className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-sm font-bold text-slate-900">No customer conversations yet</p>
              <p className="text-xs text-slate-500">
                Share your Telegram bot link or Support Portal to start receiving customer enquiries.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {conversations.slice(0, 5).map((conv) => (
                <div
                  key={conv.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {conv.customerName}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                        {conv.channel}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          conv.status === ConversationStatus.Escalated
                            ? 'bg-amber-50 text-amber-800'
                            : conv.status === ConversationStatus.Resolved
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-blue-50 text-blue-800'
                        }`}
                      >
                        {conv.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 truncate mt-0.5">
                      {conv.subject} ·{' '}
                      <span className="text-slate-400">
                        {conv.assignedAgentName || 'Unassigned'}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateSection('conversations')}
                    className="py-1.5 px-3 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-800 shrink-0 cursor-pointer"
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

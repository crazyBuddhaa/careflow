'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShieldAlert,
  Building2,
  Users,
  MessageSquare,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Search,
  Send,
  Globe,
  RotateCcw,
  Activity,
  ArrowLeft,
} from 'lucide-react';
import {
  CAREFLOW_LOGO_ICON_PATH,
  CAREFLOW_NAME,
  CENTRAL_TELEGRAM_BOT_USERNAME,
  type ApiResponse,
  type PlatformAdminOverviewDto,
} from '@careflow/shared';

type PlatformTab = 'organizations' | 'users' | 'agents_invites' | 'logs';

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function PlatformAdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PlatformTab>('organizations');
  const [overview, setOverview] = useState<PlatformAdminOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [orgSearch, setOrgSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  const loadPlatformOverview = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/platform-admin', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<PlatformAdminOverviewDto>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setOverview(body.data);
    } catch {
      setErrorBanner('Unable to load CustomCare Central Platform Admin overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPlatformOverview();
  }, [loadPlatformOverview]);

  async function runPlatformAction(
    key: string,
    payload: Record<string, unknown>,
    onSuccessRedirect?: string
  ) {
    setActionBusy(key);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/platform-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as ApiResponse<{
        message: string;
        organizationId?: string;
      }>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      showFeedback(body.data.message);
      if (onSuccessRedirect) {
        router.push(onSuccessRedirect);
        return;
      }
      await loadPlatformOverview();
    } catch {
      setErrorBanner('Platform admin operation failed.');
    } finally {
      setActionBusy(null);
    }
  }

  const filteredOrgs = (overview?.businesses ?? []).filter((org) => {
    if (!orgSearch.trim()) return true;
    const q = orgSearch.toLowerCase();
    return (
      org.name.toLowerCase().includes(q) ||
      org.slug.toLowerCase().includes(q) ||
      org.id.toLowerCase().includes(q) ||
      (org.ownerEmail || '').toLowerCase().includes(q) ||
      org.industry.toLowerCase().includes(q)
    );
  });

  const filteredUsers = (overview?.users ?? []).filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-slate-900"
            >
              <img
                src={CAREFLOW_LOGO_ICON_PATH}
                alt={`${CAREFLOW_NAME} logo`}
                className="w-7 h-7 rounded-lg object-contain"
              />
              <span>.CUSTOMCARE</span>
            </Link>
            <span className="text-slate-300">/</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-bold">
              <ShieldAlert className="w-3.5 h-3.5 text-teal-400" />
              <span>Central Platform Admin</span>
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadPlatformOverview()}
              className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Workspace Dashboard</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {feedback && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
              <span>{feedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs text-teal-700 hover:text-teal-950 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorBanner && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <Link
              href="/login"
              className="py-1.5 px-3 rounded-lg bg-rose-800 text-white text-xs font-bold shrink-0"
            >
              Sign In as Platform Owner
            </Link>
          </div>
        )}

        {loading && !overview ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            <div className="h-28 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          </div>
        ) : overview ? (
          <>
            {/* Platform Hero & Telegram Central Control Bar */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-md bg-teal-50 border border-teal-200 text-teal-800 text-[11px] font-bold uppercase">
                    Zero-CLI Web Command Center
                  </span>
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold uppercase">
                    Telegram Business Onboarding: On Hold (Web Only)
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                  CustomCare Global Platform Administration
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 max-w-2xl leading-relaxed">
                  Manage every business workspace, user account, agent identity, single-use
                  invitation, rate-limit bucket, and central Telegram bot webhook directly from the
                  web.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={actionBusy === 'sync_tg'}
                  onClick={() =>
                    void runPlatformAction('sync_tg', {
                      type: 'sync_central_telegram_bot',
                    })
                  }
                  className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {actionBusy === 'sync_tg'
                      ? 'Syncing @getcustomcarebot...'
                      : `Sync @${overview.centralTelegramBot.botUsername || CENTRAL_TELEGRAM_BOT_USERNAME} Webhook & Commands`}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={actionBusy === 'clear_rl'}
                  onClick={() =>
                    void runPlatformAction('clear_rl', {
                      type: 'clear_rate_limits',
                    })
                  }
                  className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear Rate Limits</span>
                </button>
              </div>
            </div>

            {/* Global KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Business Workspaces</span>
                  <Building2 className="w-4 h-4 text-teal-600" />
                </div>
                <p className="mt-2 text-3xl font-bold font-mono text-slate-900">
                  {overview.stats.totalBusinesses}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {overview.stats.activeBusinesses} active ·{' '}
                  {overview.stats.publishedBusinesses} published portals
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Registered Users</span>
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <p className="mt-2 text-3xl font-bold font-mono text-slate-900">
                  {overview.stats.totalUsers}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {overview.stats.personalAccounts} personal ·{' '}
                  {overview.stats.businessManagedAgents} business-managed ·{' '}
                  {overview.stats.activeSessions} sessions
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Customer Conversations</span>
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="mt-2 text-3xl font-bold font-mono text-slate-900">
                  {overview.stats.totalConversations}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {overview.stats.openConversations} open · {overview.stats.pendingInvitations} pending
                  invitations
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Telegram Channels</span>
                  <Send className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-3xl font-bold font-mono text-slate-900">
                  {overview.centralTelegramBot.connectedWorkspaceChannels}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  @{overview.centralTelegramBot.botUsername || CENTRAL_TELEGRAM_BOT_USERNAME} active
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="rounded-2xl border border-slate-200 bg-white p-2 flex flex-wrap items-center gap-1.5">
              {(
                [
                  ['organizations', `Businesses & Workspaces (${overview.businesses.length})`],
                  ['users', `Users & Accounts (${overview.users.length})`],
                  [
                    'agents_invites',
                    `Agent Identities & Invites (${overview.agentIdentities.length} / ${overview.recentInvitations.length})`,
                  ],
                  [
                    'logs',
                    `Security, Audit & Webhook Logs (${overview.recentAuditLogs.length + overview.recentWebhookEvents.length})`,
                  ],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    activeTab === key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* TAB 1: ALL BUSINESSES & WORKSPACES */}
            {activeTab === 'organizations' && (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      All Business Workspaces
                    </h2>
                    <p className="text-xs text-slate-500">
                      Inspect, enter, publish/unpublish, or suspend any workspace on CustomCare
                    </p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="search"
                      value={orgSearch}
                      onChange={(e) => setOrgSearch(e.target.value)}
                      placeholder="Search business, slug, owner..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="py-3.5 px-5">Business Workspace</th>
                        <th className="py-3.5 px-4">Owner &amp; Industry</th>
                        <th className="py-3.5 px-4 text-right">Team / Chats</th>
                        <th className="py-3.5 px-4">Status</th>
                        <th className="py-3.5 px-5 text-right">Admin Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrgs.map((org) => {
                        const isPublished = org.onboardingStatus === 'published';
                        return (
                          <tr key={org.id} className="hover:bg-slate-50/80">
                            <td className="py-3.5 px-5">
                              <p className="font-bold text-slate-900 text-sm">{org.name}</p>
                              <p className="font-mono text-[11px] text-slate-500">
                                /{org.slug} · {org.id}
                              </p>
                            </td>
                            <td className="py-3.5 px-4">
                              <p className="font-semibold text-slate-800">
                                {org.ownerEmail || 'System'}
                              </p>
                              <p className="text-slate-500">
                                {org.industry} · {org.country}
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono">
                              <span className="font-bold text-slate-900">{org.totalAgents}</span>{' '}
                              members ·{' '}
                              <span className="font-bold text-slate-900">
                                {org.totalConversations}
                              </span>{' '}
                              chats
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    org.isActive
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                                  }`}
                                >
                                  {org.isActive ? 'Active' : 'Suspended'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                    isPublished
                                      ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {org.onboardingStatus}
                                </span>
                              </div>
                            </td>
                            <td className="py-3.5 px-5 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-2">
                                <button
                                  type="button"
                                  disabled={actionBusy === `enter_${org.id}`}
                                  onClick={() =>
                                    void runPlatformAction(
                                      `enter_${org.id}`,
                                      {
                                        type: 'enter_business_workspace',
                                        organizationId: org.id,
                                      },
                                      '/admin'
                                    )
                                  }
                                  className="py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                                >
                                  Enter Workspace
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusy === `pub_${org.id}`}
                                  onClick={() =>
                                    void runPlatformAction(`pub_${org.id}`, {
                                      type: 'set_business_onboarding_status',
                                      organizationId: org.id,
                                      status: isPublished ? 'in_progress' : 'published',
                                    })
                                  }
                                  className="py-1.5 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer"
                                >
                                  {isPublished ? 'Unpublish' : 'Publish'}
                                </button>
                                <button
                                  type="button"
                                  disabled={actionBusy === `act_${org.id}`}
                                  onClick={() =>
                                    void runPlatformAction(`act_${org.id}`, {
                                      type: 'toggle_business_active',
                                      organizationId: org.id,
                                      isActive: !org.isActive,
                                    })
                                  }
                                  className={`py-1.5 px-2.5 rounded-lg font-semibold cursor-pointer ${
                                    org.isActive
                                      ? 'text-rose-700 hover:bg-rose-50'
                                      : 'text-emerald-700 hover:bg-emerald-50'
                                  }`}
                                >
                                  {org.isActive ? 'Suspend' : 'Activate'}
                                </button>
                                <Link
                                  href={`/portal/${org.slug}`}
                                  target="_blank"
                                  className="p-1.5 text-slate-500 hover:text-slate-900"
                                  title="Open Public Portal"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: ALL USERS & ACCOUNTS */}
            {activeTab === 'users' && (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Registered Users &amp; Workspace Identities
                    </h2>
                    <p className="text-xs text-slate-500">
                      Verify emails, manage Platform Admin privileges, or revoke active sessions
                    </p>
                  </div>
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="search"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search name, email, user ID..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                        <th className="py-3.5 px-5">User</th>
                        <th className="py-3.5 px-4">Account Type</th>
                        <th className="py-3.5 px-4">Security &amp; Verification</th>
                        <th className="py-3.5 px-4 text-right">Workspaces / Sessions</th>
                        <th className="py-3.5 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900 text-sm">
                                {u.fullName}
                              </span>
                              {u.isPlatformAdmin && (
                                <span className="px-2 py-0.5 rounded bg-slate-900 text-teal-400 text-[10px] font-bold uppercase">
                                  Platform Admin
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 font-mono text-[11px]">
                              {u.email} · {u.id}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold uppercase">
                              {u.accountType}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  u.emailVerified
                                    ? 'bg-emerald-50 text-emerald-800'
                                    : 'bg-amber-50 text-amber-800'
                                }`}
                              >
                                {u.emailVerified ? 'Email Verified' : 'Unverified'}
                              </span>
                              {u.mfaEnabled && (
                                <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 text-[10px] font-bold uppercase">
                                  2FA Active
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-900">
                            <span className="font-bold">{u.workspaceCount}</span> ws ·{' '}
                            <span className="font-bold">{u.activeSessions}</span> sessions
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-2">
                              {!u.emailVerified && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void runPlatformAction(`ver_${u.id}`, {
                                      type: 'verify_user_email',
                                      targetUserId: u.id,
                                    })
                                  }
                                  className="py-1 px-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer"
                                >
                                  Verify Email
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  void runPlatformAction(`rev_sess_${u.id}`, {
                                    type: 'revoke_user_sessions',
                                    targetUserId: u.id,
                                  })
                                }
                                className="py-1 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                              >
                                Revoke Sessions
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void runPlatformAction(`adm_${u.id}`, {
                                    type: 'toggle_platform_admin',
                                    targetUserId: u.id,
                                    isPlatformAdmin: !u.isPlatformAdmin,
                                  })
                                }
                                className="py-1 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                              >
                                {u.isPlatformAdmin ? 'Remove Admin' : 'Make Admin'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: AGENT IDENTITIES & WORKSPACE INVITATIONS */}
            {activeTab === 'agents_invites' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="p-5 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-900">
                      Workspace Invitations ({overview.recentInvitations.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Single-use, time-limited agent invitations across all businesses
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-3 px-5">Invited Email</th>
                          <th className="py-3 px-4">Workspace</th>
                          <th className="py-3 px-4">Role &amp; Department</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Expires</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {overview.recentInvitations.map((inv) => (
                          <tr key={inv.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-5 font-semibold text-slate-900">{inv.email}</td>
                            <td className="py-3 px-4 text-slate-700">{inv.organizationName}</td>
                            <td className="py-3 px-4 text-slate-600">
                              <span className="font-bold uppercase">{inv.role}</span>
                              {inv.department ? ` · ${inv.department}` : ''}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  inv.status === 'pending'
                                    ? 'bg-amber-50 text-amber-800'
                                    : inv.status === 'accepted'
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {inv.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500">
                              {formatShortDate(inv.expiresAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="p-5 border-b border-slate-100">
                    <h2 className="text-base font-bold text-slate-900">
                      Agent Identities ({overview.agentIdentities.length})
                    </h2>
                    <p className="text-xs text-slate-500">
                      Business-Managed and Personal Account agent memberships across workspaces
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                          <th className="py-3 px-5">Agent</th>
                          <th className="py-3 px-4">Access Model</th>
                          <th className="py-3 px-4">Status &amp; Workspace</th>
                          <th className="py-3 px-4 text-right">Active Workspaces</th>
                          <th className="py-3 px-5">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {overview.agentIdentities.map((ai) => (
                          <tr key={ai.id} className="hover:bg-slate-50/80">
                            <td className="py-3 px-5">
                              <p className="font-bold text-slate-900">{ai.displayName}</p>
                              <p className="text-slate-500 font-mono text-[11px]">{ai.email}</p>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  ai.accessMode === 'personal_account'
                                    ? 'bg-indigo-50 text-indigo-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {ai.accessMode === 'personal_account'
                                  ? 'Personal Account'
                                  : 'Business-Managed'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              <span className="uppercase font-bold">{ai.status}</span> ·{' '}
                              {ai.emailVerified ? 'Verified' : 'Unverified'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                              {ai.workspaceCount}
                            </td>
                            <td className="py-3 px-5 font-mono text-slate-500">
                              {formatShortDate(ai.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: SECURITY, AUDIT & WEBHOOK LOGS */}
            {activeTab === 'logs' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Security &amp; Lifecycle Audit Logs
                      </h2>
                      <p className="text-xs text-slate-500">
                        Invitations, identity linking, suspensions, revocations, and admin actions
                      </p>
                    </div>
                    <Activity className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto text-xs">
                    {overview.recentAuditLogs.length === 0 ? (
                      <p className="p-6 text-slate-500 text-center">No audit events recorded yet.</p>
                    ) : (
                      overview.recentAuditLogs.map((log) => (
                        <div key={log.id} className="p-4 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-bold text-teal-800 uppercase text-[11px]">
                              {log.actionType}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {formatShortDate(log.createdAt)}
                            </span>
                          </div>
                          <p className="text-slate-800 font-mono text-[11px]">
                            Target: {log.targetType} ({log.targetId || '—'})
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono">
                            Org: {log.organizationId || 'Platform'} · Actor:{' '}
                            {log.actorEmail || log.actorUserId || 'System'}
                          </p>
                          {log.details && (
                            <p className="text-[11px] text-slate-600">{log.details}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Recent Telegram &amp; Channel Webhook Events
                      </h2>
                      <p className="text-xs text-slate-500">
                        Inbound webhook deliveries across @getcustomcarebot and sub-bots
                      </p>
                    </div>
                    <Globe className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto text-xs">
                    {overview.recentWebhookEvents.length === 0 ? (
                      <p className="p-6 text-slate-500 text-center">
                        No webhook events recorded yet.
                      </p>
                    ) : (
                      overview.recentWebhookEvents.map((ev) => (
                        <div key={ev.id} className="p-4 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900 uppercase">
                              {ev.channelType} · {ev.externalEventId}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                ev.status === 'processed'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {ev.status}
                            </span>
                          </div>
                          <p className="text-slate-600 font-mono text-[11px]">
                            Org: {ev.organizationName || ev.organizationId || 'Central'} ·{' '}
                            {formatShortDate(ev.processedAt)}
                          </p>
                          {ev.eventSummary && (
                            <p className="text-slate-700 font-mono text-[11px]">{ev.eventSummary}</p>
                          )}
                          {ev.errorDetail && (
                            <p className="text-rose-700 font-semibold">{ev.errorDetail}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

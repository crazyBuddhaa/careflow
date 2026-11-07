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
  Mail,
} from 'lucide-react';
import {
  CAREFLOW_LOGO_ICON_PATH,
  CAREFLOW_NAME,
  CENTRAL_TELEGRAM_BOT_USERNAME,
  type ApiResponse,
  type PlatformAdminOverviewDto,
} from '@careflow/shared';

type PlatformTab = 'organizations' | 'users' | 'agents_invites' | 'mail_ui' | 'logs';

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
  const [selectedMailTemplateKey, setSelectedMailTemplateKey] = useState<string>('email_verification');
  const [mailPreviewMode, setMailPreviewMode] = useState<'html' | 'text' | 'headers'>('html');
  const [testEmailRecipient, setTestEmailRecipient] = useState('oluwafemiadekanmi76@gmail.com');

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
        if (res.status === 401 || res.status === 403) {
          window.setTimeout(() => {
            router.replace('/admin');
          }, 2000);
        }
        return;
      }
      setOverview(body.data);
    } catch {
      setErrorBanner('Unable to load CustomCare Central Platform Admin overview.');
    } finally {
      setLoading(false);
    }
  }, [router]);

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
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <Link
              href={errorBanner.toLowerCase().includes('2fa') || errorBanner.toLowerCase().includes('two-factor') ? '/admin' : '/login'}
              className="py-1.5 px-3 rounded-lg bg-rose-800 hover:bg-rose-900 text-white text-xs font-bold shrink-0 self-start sm:self-auto"
            >
              {errorBanner.toLowerCase().includes('2fa') || errorBanner.toLowerCase().includes('two-factor')
                ? 'Complete 2FA Setup in Account Security →'
                : 'Sign In as Platform Owner'}
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
                    'mail_ui',
                    `Custom Mail UI & Google Compliance (${overview.emailSystem?.templates.length ?? 5})`,
                  ],
                  [
                    'logs',
                    `System Errors, Security & Webhook Logs (${overview.recentAuditLogs.length + overview.recentWebhookEvents.length})`,
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

            {/* TAB 4: CUSTOM MAIL UI & GOOGLE SENDER COMPLIANCE STUDIO */}
            {activeTab === 'mail_ui' && overview.emailSystem && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Sidebar: Template Selector, Google Deliverability Checklist & Live Test Dispatch */}
                <div className="lg:col-span-4 space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">
                          CustomCare Mail UI Templates
                        </h2>
                        <p className="text-xs text-slate-500">
                          Branded, watermarked transactional templates
                        </p>
                      </div>
                      <Mail className="w-4 h-4 text-teal-600" />
                    </div>

                    <div className="space-y-1.5">
                      {overview.emailSystem.templates.map((tpl) => {
                        const isSelected = tpl.templateKey === selectedMailTemplateKey;
                        return (
                          <button
                            key={tpl.templateKey}
                            type="button"
                            onClick={() => setSelectedMailTemplateKey(tpl.templateKey)}
                            className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'border-teal-600 bg-teal-50/70 text-teal-950 font-bold'
                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold'
                            }`}
                          >
                            <span>{tpl.categoryBadge}</span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {tpl.watermarkId.slice(0, 11)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Google / Gmail Bulk & Transactional Sender Compliance Card */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">
                        Google / Gmail Anti-Spam Compliance
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold uppercase">
                        RFC 5322 / 8058 Ready
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Every outbound CustomCare email is structured to pass Gmail and Google Workspace spam filters without clipping or blocking:
                    </p>
                    <ul className="space-y-2 text-xs text-slate-700">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Official Logo &amp; Anti-Phishing Watermark:</strong> Embedded Q Atelier Logo + unique <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">CC-*-VERIFIED</code> watermark ribbon &amp; seal.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Monitored Reply-To Alignment:</strong> Uses{' '}
                          <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">
                            {overview.emailSystem.fromAddress}
                          </code>{' '}
                          (no <code className="font-mono text-[11px]">no-reply@</code> penalty).
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Anti-Clipping &amp; Loop Prevention Headers:</strong> Sends{' '}
                          <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">
                            X-Entity-Ref-ID
                          </code>{' '}
                          and{' '}
                          <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">
                            Auto-Submitted: auto-generated
                          </code>
                          .
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>1:1 Multipart Plain-Text + HTML Parity:</strong> Synchronized{' '}
                          <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">
                            text/plain
                          </code>{' '}
                          and{' '}
                          <code className="font-mono text-[11px] bg-slate-100 px-1 rounded">
                            text/html
                          </code>{' '}
                          bodies with matching HTTPS domain links.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                        <span>
                          <strong>Google Terms Attribution Footer:</strong> Includes recipient reason, Privacy Policy, Terms of Service, and Acceptable Use links.
                        </span>
                      </li>
                    </ul>
                  </div>

                  {/* Send Test Email Card */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      Dispatch Live Test Email
                    </h3>
                    <p className="text-xs text-slate-500">
                      Send the selected watermarked template to verify inbox rendering and SPF/DKIM alignment.
                    </p>
                    <input
                      type="email"
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      placeholder="recipient@example.com"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:border-teal-600 focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={actionBusy === 'send_test_email' || !testEmailRecipient.trim()}
                      onClick={() =>
                        void runPlatformAction('send_test_email', {
                          type: 'send_test_email',
                          templateKey: selectedMailTemplateKey,
                          recipientEmail: testEmailRecipient.trim(),
                        })
                      }
                      className="w-full py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                    >
                      {actionBusy === 'send_test_email'
                        ? 'Dispatching Test Email...'
                        : 'Send Watermarked Test Email'}
                    </button>
                  </div>
                </div>

                {/* Right Column: Live Mail Client Preview */}
                <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  {(() => {
                    const activeTemplate =
                      overview.emailSystem.templates.find(
                        (t) => t.templateKey === selectedMailTemplateKey
                      ) ?? overview.emailSystem.templates[0];

                    if (!activeTemplate) return null;

                    return (
                      <div>
                        {/* Simulated Email Client Envelope Header */}
                        <div className="p-5 border-b border-slate-200 bg-slate-50/70 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-teal-400 text-[10px] font-bold uppercase">
                                {activeTemplate.categoryBadge}
                              </span>
                              <span className="font-mono text-[11px] text-slate-500">
                                Watermark: {activeTemplate.watermarkId}
                              </span>
                            </div>

                            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
                              {(
                                [
                                  ['html', 'Branded Mail UI'],
                                  ['text', 'Plain-Text Multipart'],
                                  ['headers', 'RFC / Google Headers'],
                                ] as const
                              ).map(([mode, label]) => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setMailPreviewMode(mode)}
                                  className={`px-3 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                                    mailPreviewMode === mode
                                      ? 'bg-slate-900 text-white'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-1 text-xs">
                            <p className="font-bold text-slate-900 text-sm">
                              {activeTemplate.subject}
                            </p>
                            <p className="text-slate-600 font-mono text-[11px]">
                              From: {overview.emailSystem.fromName} &lt;
                              {overview.emailSystem.fromAddress}&gt; · Reply-To:{' '}
                              {activeTemplate.replyTo}
                            </p>
                          </div>
                        </div>

                        {/* Mail Preview Body */}
                        {mailPreviewMode === 'html' && (
                          <div className="bg-slate-100 p-3 sm:p-5">
                            <iframe
                              title={`CustomCare Mail Preview - ${activeTemplate.categoryBadge}`}
                              srcDoc={activeTemplate.html}
                              className="w-full h-[680px] rounded-2xl border border-slate-200 bg-white shadow-xs"
                            />
                          </div>
                        )}

                        {mailPreviewMode === 'text' && (
                          <div className="p-6 bg-slate-950 text-slate-100 font-mono text-xs whitespace-pre-wrap leading-relaxed min-h-[420px]">
                            {activeTemplate.text}
                          </div>
                        )}

                        {mailPreviewMode === 'headers' && (
                          <div className="p-6 space-y-4 text-xs">
                            <p className="text-slate-600">
                              These headers are attached to every Resend API dispatch to comply with Google Workspace and Gmail bulk/transactional sender standards:
                            </p>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono space-y-2">
                              <div>
                                <span className="font-bold text-teal-800">From:</span>{' '}
                                {overview.emailSystem.fromName} &lt;
                                {overview.emailSystem.fromAddress}&gt;
                              </div>
                              <div>
                                <span className="font-bold text-teal-800">Reply-To:</span>{' '}
                                {activeTemplate.replyTo}
                              </div>
                              {Object.entries(activeTemplate.headers).map(([hKey, hVal]) => (
                                <div key={hKey}>
                                  <span className="font-bold text-teal-800">{hKey}:</span> {hVal}
                                </div>
                              ))}
                              <div>
                                <span className="font-bold text-teal-800">Content-Type:</span>{' '}
                                multipart/alternative; boundary=&quot;customcare-mime-boundary&quot;
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* TAB 5: SYSTEM ERRORS, SECURITY, AUDIT & WEBHOOK LOGS */}
            {activeTab === 'logs' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        System Internal Errors &amp; Security Audit Logs
                      </h2>
                      <p className="text-xs text-slate-500">
                        Internal exceptions shielded from end users, plus invitations and admin actions
                      </p>
                    </div>
                    <Activity className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto text-xs">
                    {overview.recentAuditLogs.length === 0 ? (
                      <p className="p-6 text-slate-500 text-center">No audit events recorded yet.</p>
                    ) : (
                      overview.recentAuditLogs.map((log) => {
                        const isInternalError = log.actionType === 'system_internal_error';
                        const rawDetails = log.details || log.metadataJson || '';
                        let parsedError: {
                          errorCode?: string;
                          internalMessage?: string;
                          routeOrContext?: string;
                          stack?: string;
                        } | null = null;
                        if (rawDetails.startsWith('{')) {
                          try {
                            parsedError = JSON.parse(rawDetails);
                          } catch {
                            parsedError = null;
                          }
                        }

                        return (
                          <div
                            key={log.id}
                            className={`p-4 space-y-1.5 ${
                              isInternalError ? 'bg-rose-50/50' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`font-mono font-bold uppercase text-[11px] ${
                                    isInternalError
                                      ? 'px-2 py-0.5 rounded bg-rose-100 text-rose-900 border border-rose-200'
                                      : 'text-teal-800'
                                  }`}
                                >
                                  {isInternalError
                                    ? 'INTERNAL SYSTEM ERROR (SHIELDED FROM USER)'
                                    : log.actionType}
                                </span>
                              </div>
                              <span className="font-mono text-[11px] text-slate-400">
                                {formatShortDate(log.createdAt)}
                              </span>
                            </div>
                            <p className="text-slate-800 font-mono text-[11px]">
                              Ref / Target: {log.targetType} ({log.targetId || '—'})
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">
                              Org: {log.organizationId || 'Platform'} · Actor:{' '}
                              {log.actorEmail || log.actorUserId || 'System Runtime'}
                            </p>
                            {parsedError?.internalMessage ? (
                              <div className="rounded-lg border border-rose-200 bg-white p-2.5 font-mono text-[11px] text-rose-900 space-y-1">
                                <div>
                                  <strong>Route / Context:</strong>{' '}
                                  {parsedError.routeOrContext || 'api'}
                                </div>
                                <div className="break-all">
                                  <strong>Internal Detail:</strong> {parsedError.internalMessage}
                                </div>
                                {parsedError.stack && (
                                  <div className="text-[10px] text-slate-500 break-all">
                                    {parsedError.stack}
                                  </div>
                                )}
                              </div>
                            ) : (
                              rawDetails && (
                                <p className="text-[11px] text-slate-600 font-mono break-all">
                                  {rawDetails}
                                </p>
                              )
                            )}
                          </div>
                        );
                      })
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
                  <div className="divide-y divide-slate-100 max-h-[540px] overflow-y-auto text-xs">
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


'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Palette,
  BookOpen,
  HelpCircle,
  FolderTree,
  Bot,
  GitBranch,
  UserCog,
  MessageSquare,
  Users,
  BarChart3,
  LayoutDashboard,
  ArrowLeft,
  Lock,
  LogOut,
} from 'lucide-react';
import {
  CAREFLOW_NAME,
  type AdminModuleSectionKey,
  type ApiResponse,
} from '@careflow/shared';
import type { AdminSessionStatusDto } from '@/app/api/admin/session/route';
import {
  KnowledgeAdminManager,
  type KnowledgeSubView,
} from '@/components/admin/KnowledgeAdminManager';

interface AdminModuleDescriptor {
  key: AdminModuleSectionKey;
  title: string;
  group: 'Knowledge' | 'Configuration' | 'Operations';
  isLiveInStage1?: boolean;
  summary: string;
  plannedControls: string[];
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_MODULES: AdminModuleDescriptor[] = [
  {
    key: 'knowledge-overview',
    title: 'Knowledge Overview',
    group: 'Knowledge',
    isLiveInStage1: true,
    summary: 'Workspace summary of published, draft, and archived knowledge records.',
    plannedControls: [],
    icon: LayoutDashboard,
  },
  {
    key: 'knowledge-articles',
    title: 'Knowledge Articles',
    group: 'Knowledge',
    isLiveInStage1: true,
    summary:
      'Create, edit, search, filter, publish, archive, and delete organization-scoped articles.',
    plannedControls: [],
    icon: BookOpen,
  },
  {
    key: 'faqs',
    title: 'FAQs',
    group: 'Knowledge',
    isLiveInStage1: true,
    summary:
      'Maintain approved question-and-answer pairs scoped strictly to your business workspace.',
    plannedControls: [],
    icon: HelpCircle,
  },
  {
    key: 'categories',
    title: 'Categories',
    group: 'Knowledge',
    isLiveInStage1: true,
    summary: 'Configure business-specific categories for organizing articles and FAQs.',
    plannedControls: [],
    icon: FolderTree,
  },
  {
    key: 'support-procedures',
    title: 'Support Procedures',
    group: 'Knowledge',
    summary:
      'Define step-by-step troubleshooting decision trees and escalation rules for recurring issues.',
    plannedControls: [
      'Multi-step diagnostic flows and customer prompts',
      'Required context capture prior to human escalation',
      'Escalation priority rules by issue type',
    ],
    icon: GitBranch,
  },
  {
    key: 'business-profile',
    title: 'Business Profile',
    group: 'Configuration',
    summary:
      'Manage organization identity, verified subdomain or custom hostname bindings, and tenant contact settings.',
    plannedControls: [
      'Organization display name and verified portal domain mapping',
      'Supported vs. restricted business topic boundaries',
      'Tenant-scoped workspace identifiers',
    ],
    icon: Building2,
  },
  {
    key: 'branding',
    title: 'Branding',
    group: 'Configuration',
    summary:
      'Customize your public customer support portal logo, colour palette, welcome headline, and footer attribution.',
    plannedControls: [
      'Portal logo mark and display wordmark',
      'Primary and secondary accent theme selection',
      'Hero welcome headline and supporting message',
    ],
    icon: Palette,
  },
  {
    key: 'chatbot-settings',
    title: 'Chatbot Settings',
    group: 'Configuration',
    summary:
      'Configure assistant greeting, communication style, natural-language response priority, and optional AI fallback limits.',
    plannedControls: [
      'Assistant greeting and tone of voice',
      'Response priority order (business rules, KB, troubleshooting, AI fallback, human)',
      'Optional external AI provider selection and usage caps',
    ],
    icon: Bot,
  },
  {
    key: 'conversations',
    title: 'Conversations',
    group: 'Operations',
    summary:
      'Review and respond to active customer enquiries across your web support portal, widget, and messaging channels.',
    plannedControls: [
      'Unified multi-channel conversation queue',
      'Pre-attached troubleshooting history on escalated threads',
      'Status transitions (open, troubleshooting, escalated, resolved)',
    ],
    icon: MessageSquare,
  },
  {
    key: 'customers',
    title: 'Customers',
    group: 'Operations',
    summary: 'View organization-isolated customer records and prior conversation context.',
    plannedControls: [
      'Tenant-scoped customer directory',
      'External application reference linking',
      'Conversation history per customer',
    ],
    icon: Users,
  },
  {
    key: 'agents',
    title: 'Agents',
    group: 'Operations',
    summary:
      'Manage human support representatives, role permissions, and queue availability.',
    plannedControls: [
      'Role-based access (Agent, Supervisor, Admin)',
      'Specialist availability and active load',
      'Escalation routing assignment',
    ],
    icon: UserCog,
  },
  {
    key: 'analytics',
    title: 'Analytics',
    group: 'Operations',
    summary:
      'Understand common customer enquiry topics, self-service resolution paths, and human escalation volume.',
    plannedControls: [
      'Top enquiry categories and unanswered questions',
      'Guided troubleshooting completion vs. escalation breakdown',
      'Knowledge base coverage insights',
    ],
    icon: BarChart3,
  },
];

const KNOWLEDGE_KEYS = new Set<AdminModuleSectionKey>([
  'knowledge-overview',
  'knowledge-articles',
  'faqs',
  'categories',
]);

export function BusinessAdminShell() {
  const [selectedKey, setSelectedKey] = useState<AdminModuleSectionKey>('knowledge-overview');
  const [sessionState, setSessionState] = useState<AdminSessionStatusDto | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Sign-in gate form state
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setLoadingSession(true);
    try {
      const res = await fetch('/api/admin/session', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<AdminSessionStatusDto>;
      if (body.ok) {
        setSessionState(body.data);
        if (!selectedOrgId && body.data.availableWorkspaces.length > 0) {
          setSelectedOrgId(body.data.availableWorkspaces[0].id);
        }
      }
    } finally {
      setLoadingSession(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrgId,
          accessPasscode: passcode,
        }),
      });

      const body = (await res.json()) as ApiResponse<{ authenticated: boolean }>;
      if (!body.ok) {
        setAuthError(body.error.message);
        return;
      }

      setPasscode('');
      await loadSession();
    } catch {
      setAuthError('Unable to reach workspace session endpoint.');
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await fetch('/api/admin/session', { method: 'DELETE' });
    await loadSession();
  }

  const activeModule =
    ADMIN_MODULES.find((item) => item.key === selectedKey) ?? ADMIN_MODULES[0];
  const ActiveIcon = activeModule.icon;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
              {CAREFLOW_NAME}
            </Link>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="text-sm font-semibold text-slate-600">Business Administration</span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {sessionState?.authenticated && sessionState.session ? (
              <>
                <span className="hidden sm:inline text-xs text-slate-600">
                  Workspace:{' '}
                  <strong className="font-semibold text-slate-900">
                    {sessionState.session.organizationName}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 py-2 px-3.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sign Out / Switch Business</span>
                </button>
              </>
            ) : (
              <Link
                href="/"
                className="py-2 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Platform Home
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Loading State */}
      {loadingSession ? (
        <div className="flex-1 max-w-md w-full mx-auto px-6 py-20">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-4">
            <div className="h-6 w-40 rounded bg-slate-100 animate-pulse" />
            <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
            <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
          </div>
        </div>
      ) : !sessionState?.authenticated || !sessionState.session ? (
        /* Protected Admin Authorization Gate (Prevents unauthenticated public admin access) */
        <main className="flex-1 flex items-center justify-center px-6 py-14">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 space-y-6">
            <div>
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Lock className="w-5 h-5" aria-hidden="true" />
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                Authorize Business Workspace
              </h1>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Knowledge management operations require a server-signed organization session cookie.
                Client-supplied organization IDs are never trusted directly on API requests.
              </p>
            </div>

            {/* Explicit Stage 1 Development Auth Disclosure */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-900">
                Stage 1 Development Session Gate
              </p>
              <p>
                Full user account registration and multi-user authentication are scheduled for a
                later milestone. Use your configured{' '}
                <span className="font-mono">CAREFLOW_ADMIN_PASSCODE</span>
                {sessionState?.usesDefaultDevPasscode && (
                  <>
                    {' '}
                    (default local dev passcode:{' '}
                    <span className="font-mono font-semibold text-slate-900">
                      careflow-dev-admin
                    </span>
                    )
                  </>
                )}{' '}
                to open an isolated session for a specific business.
              </p>
            </div>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label
                  htmlFor="admin-org-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Select Business Organization
                </label>
                <select
                  id="admin-org-select"
                  value={selectedOrgId}
                  onChange={(e) => setSelectedOrgId(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {(sessionState?.availableWorkspaces ?? []).map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="admin-passcode"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Workspace Access Passcode
                </label>
                <input
                  id="admin-passcode"
                  type="password"
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter workspace admin passcode"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              {authError && (
                <p role="alert" className="text-xs font-semibold text-red-700">
                  {authError}
                </p>
              )}

              <button
                type="submit"
                disabled={signingIn || !selectedOrgId}
                className="w-full py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
              >
                {signingIn ? 'Authorizing Session...' : 'Open Isolated Admin Session'}
              </button>
            </form>
          </div>
        </main>
      ) : (
        /* Authenticated Admin Workspace Body */
        <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Sidebar Navigation */}
          <aside
            aria-label="Business Administration Sections"
            className="lg:col-span-4 xl:col-span-3 rounded-2xl border border-slate-200 bg-white p-4 space-y-5"
          >
            {(['Knowledge', 'Configuration', 'Operations'] as const).map((groupName) => {
              const items = ADMIN_MODULES.filter((m) => m.group === groupName);
              return (
                <div key={groupName}>
                  <p className="px-3 text-xs font-semibold text-slate-400">{groupName}</p>
                  <div className="mt-1.5 space-y-1">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const active = item.key === selectedKey;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedKey(item.key)}
                          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors text-left cursor-pointer ${
                            active
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <span className="flex items-center gap-3 truncate">
                            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span className="truncate">{item.title}</span>
                          </span>
                          {item.isLiveInStage1 && (
                            <span className="text-[11px] font-normal text-teal-700 shrink-0">
                              Live
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </aside>

          {/* Main Administration Panel */}
          <main className="lg:col-span-8 xl:col-span-9">
            {KNOWLEDGE_KEYS.has(selectedKey) ? (
              <KnowledgeAdminManager
                activeSubView={selectedKey as KnowledgeSubView}
                organizationName={sessionState.session.organizationName}
                organizationId={sessionState.session.organizationId}
                onNavigateSubView={(view) => setSelectedKey(view)}
              />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-9">
                <p className="text-xs font-semibold text-teal-700">
                  {activeModule.group} · {sessionState.session.organizationName}
                </p>

                <div className="mt-3 flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <ActiveIcon className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    {activeModule.title}
                  </h1>
                </div>

                <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-2xl">
                  {activeModule.summary}
                </p>

                <div className="mt-8 pt-6 border-t border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900">
                    Scheduled for upcoming stages
                  </h2>
                  <ul className="mt-4 space-y-3 text-sm text-slate-600">
                    {activeModule.plannedControls.map((control) => (
                      <li key={control} className="leading-relaxed">
                        <span className="font-semibold text-blue-600 mr-2" aria-hidden="true">
                          ·
                        </span>
                        {control}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-500">
                  <span>
                    Stage 1 focuses on Knowledge Management (Overview, Articles, FAQs, and
                    Categories).
                  </span>
                  <Link
                    href="/"
                    className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-slate-900 whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Back to CareFlow Platform</span>
                  </Link>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

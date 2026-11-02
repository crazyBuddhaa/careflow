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
  Lock,
  LogOut,
  ExternalLink,
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
import {
  WorkspaceSettingsManager,
  type SettingsSubView,
} from '@/components/admin/WorkspaceSettingsManager';
import {
  WorkspaceOperationsManager,
  type OperationsSubView,
} from '@/components/admin/WorkspaceOperationsManager';

interface AdminModuleDescriptor {
  key: AdminModuleSectionKey;
  title: string;
  group: 'Knowledge' | 'Configuration' | 'Operations';
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_MODULES: AdminModuleDescriptor[] = [
  {
    key: 'knowledge-overview',
    title: 'Knowledge Overview',
    group: 'Knowledge',
    icon: LayoutDashboard,
  },
  {
    key: 'knowledge-articles',
    title: 'Knowledge Articles',
    group: 'Knowledge',
    icon: BookOpen,
  },
  {
    key: 'faqs',
    title: 'FAQs',
    group: 'Knowledge',
    icon: HelpCircle,
  },
  {
    key: 'categories',
    title: 'Categories',
    group: 'Knowledge',
    icon: FolderTree,
  },
  {
    key: 'support-procedures',
    title: 'Support Procedures',
    group: 'Knowledge',
    icon: GitBranch,
  },
  {
    key: 'business-profile',
    title: 'Business Profile',
    group: 'Configuration',
    icon: Building2,
  },
  {
    key: 'branding',
    title: 'Branding',
    group: 'Configuration',
    icon: Palette,
  },
  {
    key: 'chatbot-settings',
    title: 'Chatbot Settings',
    group: 'Configuration',
    icon: Bot,
  },
  {
    key: 'conversations',
    title: 'Conversations',
    group: 'Operations',
    icon: MessageSquare,
  },
  {
    key: 'customers',
    title: 'Customers',
    group: 'Operations',
    icon: Users,
  },
  {
    key: 'agents',
    title: 'Agents',
    group: 'Operations',
    icon: UserCog,
  },
  {
    key: 'analytics',
    title: 'Analytics',
    group: 'Operations',
    icon: BarChart3,
  },
];

const KNOWLEDGE_KEYS = new Set<AdminModuleSectionKey>([
  'knowledge-overview',
  'knowledge-articles',
  'faqs',
  'categories',
]);

const SETTINGS_KEYS = new Set<AdminModuleSectionKey>([
  'business-profile',
  'branding',
  'chatbot-settings',
  'support-procedures',
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

  const activeSession = sessionState?.session ?? null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* SaaS Dashboard Top Bar Contract: Breadcrumb left, 1-2 primary actions right */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0 truncate">
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
              {CAREFLOW_NAME}
            </Link>
            <span className="text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="text-sm font-semibold text-slate-600">Business Administration</span>
            {activeSession && (
              <>
                <span className="hidden sm:inline text-slate-300" aria-hidden="true">
                  /
                </span>
                <span className="hidden sm:inline text-sm font-bold text-slate-900 truncate max-w-[200px]">
                  {activeSession.organizationName}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {sessionState?.authenticated && activeSession ? (
              <>
                {activeSession.organizationSlug && (
                  <Link
                    href={`/portal/${activeSession.organizationSlug}`}
                    className="inline-flex items-center gap-1.5 py-2 px-3.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Open Customer Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 py-2 px-3.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Switch Business</span>
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
      ) : !sessionState?.authenticated || !activeSession ? (
        /* Protected Admin Authorization Gate */
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
                Select a business organization to open its isolated administration dashboard for
                knowledge, FAQs, chatbot rules, and customer conversations.
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
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  {(sessionState?.availableWorkspaces ?? []).map((ws) => (
                    <option key={ws.id} value={ws.id}>
                      {ws.name} ({ws.slug}.careflow.com)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="admin-passcode"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Workspace Access Passcode
                  </label>
                  {sessionState?.usesDefaultDevPasscode && (
                    <button
                      type="button"
                      onClick={() => setPasscode('careflow-dev-admin')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                    >
                      Fill dev passcode
                    </button>
                  )}
                </div>
                <input
                  id="admin-passcode"
                  type="password"
                  required
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter workspace admin passcode"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                {sessionState?.usesDefaultDevPasscode && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Development passcode:{' '}
                    <span className="font-mono text-slate-800">careflow-dev-admin</span>
                  </p>
                )}
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

            <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Launching a new company?</span>
              <Link
                href="/onboarding"
                className="font-semibold text-blue-600 hover:text-blue-700"
              >
                Onboard Business &rarr;
              </Link>
            </div>
          </div>
        </main>
      ) : (
        /* Authenticated Admin Workspace Body */
        <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Sidebar Navigation (240px-280px equivalent in 12-col grid) */}
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
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors text-left cursor-pointer whitespace-nowrap ${
                            active
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span className="truncate">{item.title}</span>
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
                organizationName={activeSession.organizationName}
                organizationId={activeSession.organizationId}
                onNavigateSubView={(view) => setSelectedKey(view)}
              />
            ) : SETTINGS_KEYS.has(selectedKey) ? (
              <WorkspaceSettingsManager
                activeSubView={selectedKey as SettingsSubView}
                organizationName={activeSession.organizationName}
                organizationSlug={activeSession.organizationSlug}
              />
            ) : (
              <WorkspaceOperationsManager
                activeSubView={selectedKey as OperationsSubView}
                organizationName={activeSession.organizationName}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}

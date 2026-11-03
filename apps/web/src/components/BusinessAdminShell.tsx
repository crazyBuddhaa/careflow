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
  ChevronDown,
  Plus,
  Sparkles,
  Check,
  CheckCircle2,
  X,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import {
  CAREFLOW_NAME,
  type AdminModuleSectionKey,
  type ApiResponse,
  type UserWorkspaceMembership,
  UserRole,
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
import { WorkspaceOnboardingGuide } from '@/components/admin/WorkspaceOnboardingGuide';
import { AccountSecurityManager } from '@/components/admin/AccountSecurityManager';
import { ChannelIntegrationsManager } from '@/components/admin/ChannelIntegrationsManager';
import { TurnstileWidget } from '@/components/TurnstileWidget';

interface AdminModuleDescriptor {
  key: AdminModuleSectionKey;
  title: string;
  group: 'Workspace Setup' | 'Knowledge' | 'Configuration' | 'Operations';
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_MODULES: AdminModuleDescriptor[] = [
  {
    key: 'onboarding-guide',
    title: 'Onboarding Guide (7 Steps)',
    group: 'Workspace Setup',
    icon: Sparkles,
  },
  {
    key: 'integrations',
    title: 'Channels & Integrations',
    group: 'Workspace Setup',
    icon: Share2,
  },
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
    title: 'Assistant Settings',
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
    title: 'Specialists',
    group: 'Operations',
    icon: UserCog,
  },
  {
    key: 'analytics',
    title: 'Analytics',
    group: 'Operations',
    icon: BarChart3,
  },
  {
    key: 'account-security',
    title: 'Account & Security',
    group: 'Configuration',
    icon: ShieldCheck,
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
  const [selectedKey, setSelectedKey] = useState<AdminModuleSectionKey>('onboarding-guide');
  const [sessionState, setSessionState] = useState<AdminSessionStatusDto | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Workspace Switcher Dropdown State
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);

  // "Create Another Business" Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [newBizIndustry, setNewBizIndustry] = useState('Technology');
  const [newBizCountry, setNewBizCountry] = useState('United States');
  const [newBizWebsite, setNewBizWebsite] = useState('');
  const [creatingBusiness, setCreatingBusiness] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Sign-in gate form state
  const [authTab, setAuthTab] = useState<'account' | 'mfa' | 'workspace_code'>('account');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [workspaceIdentifier, setWorkspaceIdentifier] = useState('');
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
      }
    } finally {
      setLoadingSession(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function handleSwitchWorkspace(targetOrgId: string) {
    if (switchingOrgId) return;
    setSwitchingOrgId(targetOrgId);
    try {
      const res = await fetch('/api/auth/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: targetOrgId }),
      });
      const body = await res.json();
      if (body.ok) {
        setSwitcherOpen(false);
        await loadSession();
      }
    } finally {
      setSwitchingOrgId(null);
    }
  }

  async function handleCreateNewBusiness(e: React.FormEvent) {
    e.preventDefault();
    if (!newBizName.trim()) return;

    setCreatingBusiness(true);
    setCreateError(null);
    try {
      const res = await fetch('/api/auth/workspaces/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: newBizName.trim(),
          industry: newBizIndustry,
          country: newBizCountry,
          website: newBizWebsite.trim(),
        }),
      });

      const body = await res.json();
      if (!body.ok) {
        setCreateError(body.error?.message || 'Unable to create business workspace.');
        return;
      }

      setCreateModalOpen(false);
      setNewBizName('');
      setNewBizWebsite('');
      setSwitcherOpen(false);
      setSelectedKey('onboarding-guide');
      await loadSession();
    } catch {
      setCreateError('Network error while creating workspace.');
    } finally {
      setCreatingBusiness(false);
    }
  }

  async function handleAccountSignIn(event: React.FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginEmail.trim(),
          password: loginPassword,
          turnstileToken: turnstileToken || undefined,
        }),
      });

      const body = await res.json();
      if (!body.ok) {
        setAuthError(body.error?.message || 'Invalid email or password.');
        return;
      }

      const issuedChallengeToken = body.data?.challengeToken || body.data?.mfaChallengeToken;
      if (body.data?.mfaRequired && issuedChallengeToken) {
        setMfaChallengeToken(issuedChallengeToken);
        setMfaCode('');
        setAuthTab('mfa');
        return;
      }

      setLoginPassword('');
      await loadSession();
    } catch {
      setAuthError('Unable to reach account authentication service.');
    } finally {
      setSigningIn(false);
    }
  }

  async function handleMfaChallengeSignIn(event: React.FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: mfaChallengeToken,
          code: mfaCode.trim(),
        }),
      });

      const body = await res.json();
      if (!body.ok) {
        setAuthError(body.error?.message || 'Invalid MFA verification code.');
        return;
      }

      setMfaChallengeToken('');
      setMfaCode('');
      setLoginPassword('');
      setAuthTab('account');
      await loadSession();
    } catch {
      setAuthError('Unable to verify MFA security code.');
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: workspaceIdentifier.trim(),
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
      setAuthError('Unable to reach workspace authentication service.');
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    await fetch('/api/admin/session', { method: 'DELETE' });
    await loadSession();
  }

  const activeSession = sessionState?.session ?? null;
  const workspaces = sessionState?.workspaces ?? [];

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar with Workspace Switcher */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4 px-4 sm:px-6 py-3 sm:py-3.5">
          {/* Left: Breadcrumbs & Workspace Switcher */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <Link href="/" className="text-base sm:text-lg font-bold tracking-tight text-slate-900 shrink-0">
              {CAREFLOW_NAME}
            </Link>
            <span className="text-slate-300 shrink-0" aria-hidden="true">
              /
            </span>

            {activeSession ? (
              <div className="relative min-w-0">
                <button
                  type="button"
                  onClick={() => setSwitcherOpen(!switcherOpen)}
                  className="flex items-center gap-1.5 sm:gap-2 py-1.5 px-2.5 sm:px-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-xs font-bold text-slate-900 max-w-full"
                >
                  <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="truncate max-w-[105px] sm:max-w-[200px]">
                    {activeSession.organizationName}
                  </span>
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-slate-100 text-slate-600 shrink-0">
                    {activeSession.role}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {/* Workspace Switcher Dropdown */}
                {switcherOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setSwitcherOpen(false)}
                    />
                    <div className="absolute left-0 top-full mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl z-50 space-y-1">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Your Businesses ({workspaces.length > 0 ? workspaces.length : 1})
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-0.5">
                        {workspaces.map((ws) => {
                          const isCurrent = ws.organizationId === activeSession.organizationId;
                          return (
                            <button
                              key={ws.organizationId}
                              type="button"
                              onClick={() => void handleSwitchWorkspace(ws.organizationId)}
                              disabled={isCurrent || switchingOrgId === ws.organizationId}
                              className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors ${
                                isCurrent
                                  ? 'bg-teal-50 text-teal-900 font-bold'
                                  : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <div className="truncate pr-2">
                                <div className="truncate">{ws.organizationName}</div>
                                <div className="text-[10px] text-slate-500 font-normal">
                                  {ws.industry} · {ws.country}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase font-semibold">
                                  {ws.role}
                                </span>
                                {isCurrent && <Check className="w-3.5 h-3.5 text-teal-600" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-1 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            setSwitcherOpen(false);
                            setCreateModalOpen(true);
                          }}
                          className="w-full flex items-center gap-2 p-2 rounded-xl text-xs font-bold text-teal-700 hover:bg-teal-50 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create Another Business</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <span className="text-sm font-semibold text-slate-600">Workspace</span>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {sessionState?.authenticated && activeSession ? (
              <>
                {activeSession.organizationSlug && (
                  <Link
                    href={`/portal/${activeSession.organizationSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hidden sm:inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Customer Portal</span>
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 py-2 px-3 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <Link
                href="/"
                className="py-2 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
              >
                {CAREFLOW_NAME} Home
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* "Create Another Business" Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-teal-600" />
                <span>Create Another Business</span>
              </h3>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Provision a new isolated workspace under your current CustomCare account. Each business
              maintains its own distinct knowledge base, support configurations, branding, and team.
            </p>

            {createError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateNewBusiness} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Business Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newBizName}
                  onChange={(e) => setNewBizName(e.target.value)}
                  placeholder="e.g. Apex Health Systems"
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Industry
                  </label>
                  <select
                    value={newBizIndustry}
                    onChange={(e) => setNewBizIndustry(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white outline-none"
                  >
                    <option value="Technology">Technology</option>
                    <option value="E-commerce and retail">E-commerce and retail</option>
                    <option value="Financial services">Financial services</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Education">Education</option>
                    <option value="Hospitality">Hospitality</option>
                    <option value="Professional services">Professional services</option>
                    <option value="Logistics and transportation">Logistics</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Country
                  </label>
                  <input
                    type="text"
                    value={newBizCountry}
                    onChange={(e) => setNewBizCountry(e.target.value)}
                    placeholder="e.g. United States"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Website (Optional)
                </label>
                <input
                  type="text"
                  value={newBizWebsite}
                  onChange={(e) => setNewBizWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBusiness}
                  className="py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm"
                >
                  {creatingBusiness ? 'Creating...' : 'Provision Business'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
          <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 space-y-6 shadow-sm">
            <div>
              <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
                <Lock className="w-6 h-6" aria-hidden="true" />
              </div>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
                Sign In to Your Workspace
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
                Sign in with your CustomCare account email and password, or use a workspace passcode.
              </p>
            </div>

            <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('account');
                  setAuthError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  authTab === 'account'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Account Email
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('workspace_code');
                  setAuthError(null);
                }}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  authTab === 'workspace_code'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Workspace Code
              </button>
            </div>

            {authTab === 'account' ? (
              <form onSubmit={handleAccountSignIn} className="space-y-4">
                <div>
                  <label
                    htmlFor="loginEmail"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                  >
                    Email Address
                  </label>
                  <input
                    id="loginEmail"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="loginPassword"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                  >
                    Password
                  </label>
                  <input
                    id="loginPassword"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <TurnstileWidget
                  onVerify={(t) => setTurnstileToken(t)}
                  onExpire={() => setTurnstileToken('')}
                />

                {authError && (
                  <p role="alert" className="text-xs font-semibold text-rose-700">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={signingIn || !loginEmail.trim() || !loginPassword}
                  className="w-full py-2.5 px-5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
                >
                  {signingIn ? 'Signing In...' : 'Sign In to Dashboard'}
                </button>
              </form>
            ) : authTab === 'mfa' ? (
              <form onSubmit={handleMfaChallengeSignIn} className="space-y-4">
                <div>
                  <label
                    htmlFor="mfaCodeAdmin"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                  >
                    6-Digit Authenticator or Recovery Code
                  </label>
                  <input
                    id="mfaCodeAdmin"
                    type="text"
                    required
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="123456 or ABCD-EFGH"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                {authError && (
                  <p role="alert" className="text-xs font-semibold text-rose-700">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={signingIn || mfaCode.trim().length < 6}
                  className="w-full py-2.5 px-5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
                >
                  {signingIn ? 'Verifying...' : 'Verify MFA & Sign In'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label
                    htmlFor="wsId"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                  >
                    Workspace Identifier
                  </label>
                  <input
                    id="wsId"
                    type="text"
                    required
                    value={workspaceIdentifier}
                    onChange={(e) => setWorkspaceIdentifier(e.target.value)}
                    placeholder="e.g. northstar-commerce or your-workspace-slug"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="wsPasscode"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
                  >
                    Access Passcode
                  </label>
                  <input
                    id="wsPasscode"
                    type="password"
                    required
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter workspace access passcode"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                {authError && (
                  <p role="alert" className="text-xs font-semibold text-rose-700">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={signingIn || !workspaceIdentifier.trim()}
                  className="w-full py-2.5 px-5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
                >
                  {signingIn ? 'Signing In...' : 'Sign In with Passcode'}
                </button>
              </form>
            )}

            <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Setting up a new business?</span>
              <Link
                href="/onboarding"
                className="font-bold text-teal-600 hover:text-teal-700 whitespace-nowrap"
              >
                Register Account &rarr;
              </Link>
            </div>
          </div>
        </main>
      ) : (
        /* Authenticated Admin Workspace Body */
        <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Sidebar Navigation */}
          <aside
            aria-label="Workspace Navigation"
            className="min-w-0 w-full lg:col-span-4 xl:col-span-3 rounded-2xl border border-slate-200 bg-white p-4 space-y-5"
          >
            {(['Workspace Setup', 'Knowledge', 'Configuration', 'Operations'] as const).map((groupName) => {
              const items = ADMIN_MODULES.filter((m) => m.group === groupName);
              if (items.length === 0) return null;
              return (
                <div key={groupName}>
                  <p className="px-3 text-xs font-semibold text-slate-400">{groupName}</p>
                  <div className="mt-1.5 space-y-1">
                    {items.map((item) => {
                      const Icon = item.icon;
                      const active = item.key === selectedKey;
                      const isGuide = item.key === 'onboarding-guide';
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSelectedKey(item.key)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors text-left cursor-pointer whitespace-nowrap ${
                            active
                              ? isGuide
                                ? 'bg-teal-50 text-teal-800 font-bold'
                                : 'bg-blue-50 text-blue-700 font-bold'
                              : isGuide
                              ? 'text-teal-700 hover:bg-teal-50/60 font-semibold'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${isGuide && !active ? 'text-teal-600' : ''}`} aria-hidden="true" />
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
          <main className="min-w-0 w-full lg:col-span-8 xl:col-span-9 space-y-6">
            {activeSession.emailVerified === false && selectedKey !== 'account-security' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-amber-900 min-w-0 break-words">
                  <span className="font-bold">Verify your account email:</span> Please confirm{' '}
                  <span className="font-mono font-semibold break-all">{activeSession.email}</span> to secure
                  your CustomCare owner account and enable recovery alerts.
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedKey('account-security')}
                  className="self-start sm:self-auto shrink-0 py-1.5 px-3 rounded-xl bg-amber-900 hover:bg-amber-950 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Verify Email &amp; Security &rarr;
                </button>
              </div>
            )}

            {selectedKey === 'onboarding-guide' ? (
              <WorkspaceOnboardingGuide
                key={activeSession.organizationId}
                organizationId={activeSession.organizationId}
                organizationSlug={activeSession.organizationSlug}
                onNavigateSection={(sec) => setSelectedKey(sec)}
                onPortalPublished={() => void loadSession()}
              />
            ) : selectedKey === 'integrations' ? (
              <ChannelIntegrationsManager
                key={activeSession.organizationId}
                organizationName={activeSession.organizationName}
                organizationSlug={activeSession.organizationSlug}
                currentUserId={activeSession.userId}
                currentUserRole={activeSession.role}
              />
            ) : selectedKey === 'account-security' ? (
              <AccountSecurityManager
                key={activeSession.userId}
                onSessionUpdated={() => void loadSession()}
              />
            ) : KNOWLEDGE_KEYS.has(selectedKey) ? (
              <KnowledgeAdminManager
                key={activeSession.organizationId}
                activeSubView={selectedKey as KnowledgeSubView}
                organizationName={activeSession.organizationName}
                organizationId={activeSession.organizationId}
                onNavigateSubView={(view) => setSelectedKey(view)}
              />
            ) : SETTINGS_KEYS.has(selectedKey) ? (
              <WorkspaceSettingsManager
                key={activeSession.organizationId}
                activeSubView={selectedKey as SettingsSubView}
                organizationName={activeSession.organizationName}
                organizationSlug={activeSession.organizationSlug}
              />
            ) : (
              <WorkspaceOperationsManager
                key={activeSession.organizationId}
                activeSubView={selectedKey as OperationsSubView}
                organizationName={activeSession.organizationName}
                currentUserName={activeSession.userName}
                currentUserRole={activeSession.role}
              />
            )}
          </main>
        </div>
      )}
    </div>
  );
}


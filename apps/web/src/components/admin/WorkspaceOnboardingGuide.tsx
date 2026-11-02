'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  Building2,
  Palette,
  Headphones,
  BookOpen,
  UserCheck,
  Bot,
  Send,
  ExternalLink,
  Save,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  HelpCircle,
  RefreshCw,
  Upload,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  UserRole,
  type AdminModuleSectionKey,
  type ApiResponse,
  type BusinessPortalConfig,
  type CommunicationStyle,
  type OnboardingProgressReport,
  type PortalAccentTheme,
  type PortalAssistantResponseDto,
  type WorkspaceAgentRecord,
} from '@careflow/shared';

interface WorkspaceOnboardingGuideProps {
  organizationId: string;
  organizationSlug: string;
  onNavigateSection?: (section: AdminModuleSectionKey) => void;
  onPortalPublished?: () => void;
}

const ACCENT_THEMES: Array<{ key: PortalAccentTheme; label: string; preview: string }> = [
  { key: 'blue-teal', label: 'Blue & Teal', preview: 'bg-gradient-to-r from-blue-600 to-teal-600' },
  { key: 'teal-slate', label: 'Teal & Slate', preview: 'bg-gradient-to-r from-teal-600 to-slate-700' },
  { key: 'indigo-sky', label: 'Indigo & Sky', preview: 'bg-gradient-to-r from-indigo-600 to-sky-500' },
];

const ALLOWED_LOGO_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);
const MAX_LOGO_SIZE_BYTES = 512 * 1024; // 512 KB

export function WorkspaceOnboardingGuide({
  organizationId,
  organizationSlug,
  onNavigateSection,
  onPortalPublished,
}: WorkspaceOnboardingGuideProps) {
  const [report, setReport] = useState<OnboardingProgressReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStepTab, setActiveStepTab] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Step 1: Profile form state
  const [description, setDescription] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [country, setCountry] = useState('United States');
  const [industry, setIndustry] = useState('Technology');
  const [website, setWebsite] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');

  // Step 2: Branding form state
  const [displayName, setDisplayName] = useState('');
  const [logoText, setLogoText] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState('#0d9488');
  const [secondaryColor, setSecondaryColor] = useState('#2563eb');
  const [accentTheme, setAccentTheme] = useState<PortalAccentTheme>('blue-teal');
  const [welcomeMessage, setWelcomeMessage] = useState('');

  // Step 3: Support Configuration state
  const [supportedProductsInput, setSupportedProductsInput] = useState('Core Platform, Customer Portal');
  const [handledIssuesInput, setHandledIssuesInput] = useState(
    'Billing inquiries, Technical troubleshooting, Account access'
  );
  const [supportedTopicsInput, setSupportedTopicsInput] = useState('General Support, Account Inquiries');
  const [restrictedTopicsInput, setRestrictedTopicsInput] = useState('Unrelated third-party inquiries');
  const [languagesInput, setLanguagesInput] = useState('English');
  const [commStyle, setCommStyle] = useState<CommunicationStyle>('warm-helpful');

  // Step 5: Human Support & Specialist Team state
  const [operatingHours, setOperatingHours] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [escalationConditions, setEscalationConditions] = useState(
    'Escalate to human support when automated troubleshooting does not resolve the customer issue or customer requests a specialist.'
  );
  const [humanSupportAvailable, setHumanSupportAvailable] = useState(true);
  const [agents, setAgents] = useState<WorkspaceAgentRecord[]>([]);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole.Agent | UserRole.Supervisor | UserRole.Admin>(
    UserRole.Agent
  );
  const [inviteSpecialty, setInviteSpecialty] = useState('Customer Support');
  const [invitingAgent, setInvitingAgent] = useState(false);

  // Step 6: Chatbot Configuration state
  const [assistantName, setAssistantName] = useState('Support Assistant');
  const [greetingMessage, setGreetingMessage] = useState('Hello! How can I assist you today?');

  // Step 7: Test interactive state
  const [testQuery, setTestQuery] = useState('');
  const [testResult, setTestResult] = useState<PortalAssistantResponseDto | null>(null);
  const [testing, setTesting] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadProgress = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/onboarding', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<OnboardingProgressReport>;
      if (body.ok) {
        setReport(body.data);
        setActiveStepTab(body.data.currentStep || 1);
        if (body.data.country) setCountry(body.data.country);
        if (body.data.industry) setIndustry(body.data.industry);
        if (body.data.website !== undefined) setWebsite(body.data.website);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  const loadCurrentSettingsAndAgents = useCallback(async () => {
    try {
      const [settingsRes, agentsRes] = await Promise.all([
        fetch('/api/admin/settings', { cache: 'no-store' }),
        fetch('/api/admin/agents', { cache: 'no-store' }),
      ]);

      const settingsBody = (await settingsRes.json()) as ApiResponse<BusinessPortalConfig>;
      if (settingsBody.ok && settingsBody.data) {
        const d = settingsBody.data;
        setDescription(d.welcomeDescription || '');
        setContactEmail(d.contactEmail || '');
        setDisplayName(d.branding?.displayName || '');
        setLogoText(d.branding?.logoText || '');
        setLogoUrl(d.branding?.logoUrl || '');
        if (d.branding?.primaryColor) setPrimaryColor(d.branding.primaryColor);
        if (d.branding?.secondaryColor) setSecondaryColor(d.branding.secondaryColor);
        setAccentTheme(d.branding?.accentTheme || 'blue-teal');
        setWelcomeMessage(d.welcomeHeadline || '');
        setOperatingHours(d.supportHours || '');
        if (d.escalation?.supportInstructions) {
          setEscalationConditions(d.escalation.supportInstructions);
        }
        if (d.chatbot) {
          setAssistantName(d.chatbot.assistantName || 'Support Assistant');
          setGreetingMessage(d.chatbot.initialGreeting || '');
          setCommStyle(d.chatbot.communicationStyle || 'warm-helpful');
          if (d.chatbot.supportedTopics?.length) {
            setSupportedTopicsInput(d.chatbot.supportedTopics.join(', '));
          }
          if (d.chatbot.restrictedTopics?.length) {
            setRestrictedTopicsInput(d.chatbot.restrictedTopics.join(', '));
          }
        }
      }

      const agentsBody = (await agentsRes.json()) as ApiResponse<{ agents: WorkspaceAgentRecord[] }>;
      if (agentsBody.ok && agentsBody.data?.agents) {
        setAgents(agentsBody.data.agents);
      }
    } catch {
      // Ignore fallback
    }
  }, [organizationId]);

  useEffect(() => {
    void loadProgress();
    void loadCurrentSettingsAndAgents();
  }, [loadProgress, loadCurrentSettingsAndAgents]);

  function handleLogoFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    setLogoUploadError(null);
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_LOGO_MIMES.has(file.type)) {
      setLogoUploadError('Invalid file format. Please upload a PNG, JPEG, WebP, or SVG image.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoUploadError('Logo file exceeds the 512 KB size limit. Please choose a smaller image.');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.onerror = () => {
      setLogoUploadError('Unable to read the selected image file.');
    };
    reader.readAsDataURL(file);
  }

  async function handleInviteSpecialist(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) return;

    setInvitingAgent(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: inviteName.trim(),
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
          specialty: inviteSpecialty.trim() || 'Customer Support',
          availability: 'available',
        }),
      });
      const body = (await res.json()) as ApiResponse<WorkspaceAgentRecord>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setAgents((prev) => [...prev, body.data]);
      setInviteName('');
      setInviteEmail('');
      setSaveSuccessMessage(`Invited ${body.data.displayName} (${body.data.role}) to the support team.`);
      setTimeout(() => setSaveSuccessMessage(null), 3500);
    } catch {
      setErrorMessage('Network error while inviting support specialist.');
    } finally {
      setInvitingAgent(false);
    }
  }

  async function handleSaveStep(step: number, payload: Record<string, unknown>) {
    setSaving(true);
    setSaveSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/onboarding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step,
          ...payload,
        }),
      });

      const body = (await res.json()) as ApiResponse<OnboardingProgressReport>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      setReport(body.data);
      setSaveSuccessMessage(`Step ${step} progress saved successfully.`);
      setTimeout(() => setSaveSuccessMessage(null), 3500);

      if (step < 7) {
        setActiveStepTab(step + 1);
      }
    } catch {
      setErrorMessage('Network error while saving progress.');
    } finally {
      setSaving(false);
    }
  }

  async function handlePublishPortal() {
    setPublishing(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/admin/onboarding/publish', {
        method: 'POST',
      });
      const body = (await res.json()) as ApiResponse<OnboardingProgressReport>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      setReport(body.data);
      onPortalPublished?.();
      setSaveSuccessMessage('Congratulations! Your customer support portal is now published and live.');
    } catch {
      setErrorMessage('Unable to publish portal. Please verify requirements and try again.');
    } finally {
      setPublishing(false);
    }
  }

  async function handleRunTestAssistant(e: React.FormEvent) {
    e.preventDefault();
    if (!testQuery.trim()) return;

    setTesting(true);
    setTestResult(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/portal/${organizationSlug}/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: testQuery.trim() }),
      });
      const body = (await res.json()) as ApiResponse<PortalAssistantResponseDto>;
      if (body.ok && body.data) {
        setTestResult(body.data);
      } else if (!body.ok) {
        setErrorMessage(body.error.message || 'Assistant test request failed.');
      }
    } catch {
      setErrorMessage('Unable to reach assistant endpoint.');
    } finally {
      setTesting(false);
    }
  }

  if (loading && !report) {
    return (
      <div className="p-12 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-teal-600" />
        <span>Loading onboarding progress checklist...</span>
      </div>
    );
  }

  const isPublished = report?.status === 'published';

  return (
    <div className="space-y-6">
      {/* Onboarding Status Header Banner */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                  isPublished
                    ? 'bg-emerald-100 text-emerald-800'
                    : report?.status === 'ready_to_publish'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                Status: {report?.status.replace(/_/g, ' ') || 'Incomplete'}
              </span>
              <span className="text-xs text-slate-500">
                {report?.completedStepsCount ?? 0} of {report?.totalStepsCount ?? 7} steps completed
              </span>
              <span className="text-xs font-semibold text-slate-500">
                · {isPublished ? 'Publicly Published' : 'Private Preview Mode'}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Workspace Onboarding Guide
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">
              Complete these steps progressively to launch your branded customer support portal. You
              can save and return anytime without losing progress.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href={`/portal/${organizationSlug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all"
            >
              <span>Preview Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            {report?.canPublish && !isPublished && (
              <button
                type="button"
                onClick={handlePublishPortal}
                disabled={publishing}
                className="inline-flex items-center gap-2 py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold tracking-wide transition-all shadow-sm disabled:opacity-50"
              >
                {publishing ? 'Publishing...' : 'Publish Support Portal'}
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-6 space-y-2">
          <div className="flex justify-between text-xs font-semibold text-slate-700">
            <span>Progress to Publication</span>
            <span className="text-teal-700">{report?.completionPercentage ?? 0}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-600 transition-all duration-500"
              style={{ width: `${report?.completionPercentage ?? 0}%` }}
            />
          </div>
        </div>
      </div>

      {saveSuccessMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs font-semibold text-emerald-800 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs font-semibold text-rose-800 flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 7-Step Tabs Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {report?.steps.map((st) => (
          <button
            key={st.step}
            type="button"
            onClick={() => setActiveStepTab(st.step)}
            className={`p-3 rounded-2xl border text-left transition-all ${
              activeStepTab === st.step
                ? 'border-teal-600 bg-teal-50/60 text-teal-900 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Step {st.step}
              </span>
              {st.completed ? (
                <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-slate-300 shrink-0" />
              )}
            </div>
            <div className="text-xs font-bold truncate">
              {st.title.split(' ')[0]} {st.title.split(' ')[1]}
            </div>
            <div className="text-[10px] text-slate-500 truncate mt-0.5">
              {st.completed ? 'Done' : 'Pending'}
            </div>
          </button>
        ))}
      </div>

      {/* Active Step Workspace Content */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        {/* STEP 1: BUSINESS PROFILE */}
        {activeStepTab === 1 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 1 — Complete Business Profile</h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Provide your business contact email (distinct from your personal account login email),
                  description, and operation details.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Business Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain what your business does and how your support center helps customers."
                  className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Business Contact Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="support@yourbusiness.com"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Public support contact email shown to customers (separate from your CareFlow account login email).
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Country of Operation <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. United States"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Primary Industry <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Website (Optional)
                  </label>
                  <input
                    type="text"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Phone (Optional)
                  </label>
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Business Address (Optional)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Headquarters or operating facility address"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() =>
                  handleSaveStep(1, {
                    profile: {
                      description,
                      contactEmail,
                      country,
                      industry,
                      website,
                      phoneNumber,
                      address,
                    },
                  })
                }
                disabled={saving}
                className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold tracking-wide transition-all shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Profile & Next'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: BUSINESS BRANDING */}
        {activeStepTab === 2 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 2 — Business Branding</h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Customize the logo, brand colors, and welcome presentation of your customer support portal.
                </p>
              </div>
            </div>

            <div className="space-y-5 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Support Portal Display Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Acme Support Center"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Logo Text / Brand Wordmark
                  </label>
                  <input
                    type="text"
                    value={logoText}
                    onChange={(e) => setLogoText(e.target.value)}
                    placeholder="e.g. Acme Help"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Validated Business Logo Upload + Preview */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Business Logo Upload
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Accepted formats: PNG, JPEG, WebP, SVG · Max file size: 512 KB
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer shadow-2xs">
                      <Upload className="w-3.5 h-3.5 text-teal-600" />
                      <span>Upload Logo File</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogoFileUpload}
                        className="hidden"
                      />
                    </label>
                    {logoUrl && (
                      <button
                        type="button"
                        onClick={() => setLogoUrl('')}
                        className="inline-flex items-center gap-1 py-2 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>

                {logoUploadError && (
                  <p role="alert" className="text-xs font-semibold text-rose-700">
                    {logoUploadError}
                  </p>
                )}

                {logoUrl && (
                  <div className="flex items-center gap-3 pt-1">
                    <div className="h-12 w-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden p-1.5">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logoUrl}
                        alt="Uploaded business logo preview"
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <span className="text-xs font-semibold text-teal-800">
                      Logo verified and ready to save
                    </span>
                  </div>
                )}
              </div>

              {/* Brand Primary & Secondary Colors + Theme */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Brand Primary Colour
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="h-10 w-12 rounded-lg border border-slate-200 cursor-pointer bg-white p-1"
                    />
                    <input
                      type="text"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Secondary Colour
                  </label>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="h-10 w-12 rounded-lg border border-slate-200 cursor-pointer bg-white p-1"
                    />
                    <input
                      type="text"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="flex-1 px-3.5 py-2 text-sm font-mono rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Portal Accent Theme
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {ACCENT_THEMES.map((th) => (
                    <button
                      key={th.key}
                      type="button"
                      onClick={() => setAccentTheme(th.key)}
                      className={`p-3 rounded-2xl border text-left transition-all flex items-center gap-3 ${
                        accentTheme === th.key
                          ? 'border-teal-600 bg-teal-50/70 text-teal-900 shadow-sm'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg ${th.preview} shrink-0`} />
                      <span className="text-xs font-bold">{th.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Welcome Message / Headline <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  placeholder="Get fast answers and clear guidance anytime."
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() =>
                  handleSaveStep(2, {
                    branding: {
                      displayName,
                      logoText,
                      logoUrl,
                      primaryColor,
                      secondaryColor,
                      accentTheme,
                      welcomeMessage,
                    },
                  })
                }
                disabled={saving}
                className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold tracking-wide transition-all shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Branding & Next'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUPPORT CONFIGURATION */}
        {activeStepTab === 3 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 3 — Support Configuration</h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Define what products or services your support center handles and set communication preferences.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Supported Products or Services (Comma-separated)
                </label>
                <input
                  type="text"
                  value={supportedProductsInput}
                  onChange={(e) => setSupportedProductsInput(e.target.value)}
                  placeholder="e.g. Web App, Mobile Checkout, Payment Gateway"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Handled Customer Issues (Comma-separated)
                </label>
                <input
                  type="text"
                  value={handledIssuesInput}
                  onChange={(e) => setHandledIssuesInput(e.target.value)}
                  placeholder="e.g. Deposit delays, Password resets, Invoice queries"
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Supported Topics <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={supportedTopicsInput}
                    onChange={(e) => setSupportedTopicsInput(e.target.value)}
                    placeholder="General Support, Payments, Accounts"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Restricted or Unsupported Topics
                  </label>
                  <input
                    type="text"
                    value={restrictedTopicsInput}
                    onChange={(e) => setRestrictedTopicsInput(e.target.value)}
                    placeholder="Tax advice, Off-topic questions"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Supported Languages
                  </label>
                  <input
                    type="text"
                    value={languagesInput}
                    onChange={(e) => setLanguagesInput(e.target.value)}
                    placeholder="English, French, Spanish"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Preferred Communication Style
                  </label>
                  <select
                    value={commStyle}
                    onChange={(e) => setCommStyle(e.target.value as CommunicationStyle)}
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  >
                    <option value="warm-helpful">Warm &amp; Helpful</option>
                    <option value="professional-concise">Professional &amp; Concise</option>
                    <option value="technical-precise">Technical &amp; Precise</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const supportedProducts = supportedProductsInput
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const handledIssues = handledIssuesInput
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const supportedTopics = supportedTopicsInput
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const restrictedTopics = restrictedTopicsInput
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const languages = languagesInput
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);

                  void handleSaveStep(3, {
                    supportConfig: {
                      supportedProducts,
                      handledIssues,
                      supportedTopics,
                      restrictedTopics,
                      languages,
                      communicationStyle: commStyle,
                    },
                  });
                }}
                disabled={saving}
                className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold tracking-wide transition-all shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Support Config & Next'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: KNOWLEDGE BASE SETUP */}
        {activeStepTab === 4 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 4 — Knowledge Base Setup</h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Publish verified articles, FAQs, categories, and troubleshooting instructions. Your
                  customer assistant relies strictly on approved business information to answer customer questions.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 leading-relaxed flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Knowledge Coverage Notice:</span> CareFlow does not require a
                minimum number of articles to complete registration, and never invents policies or
                prices. However, an empty knowledge base limits the assistant’s ability to provide
                accurate business-specific answers.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Knowledge Articles
                </div>
                <p className="text-xs text-slate-600">
                  Write detailed resolution guides, product procedures, and reference documentation.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateSection?.('knowledge-articles')}
                  className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-all shadow-2xs"
                >
                  <BookOpen className="w-4 h-4 text-teal-600" />
                  <span>Manage Articles</span>
                </button>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  FAQs
                </div>
                <p className="text-xs text-slate-600">
                  Add concise Q&amp;A pairs for common customer questions and immediate answers.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateSection?.('faqs')}
                  className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-all shadow-2xs"
                >
                  <HelpCircle className="w-4 h-4 text-teal-600" />
                  <span>Manage FAQs</span>
                </button>
              </div>

              <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Troubleshooting Procedures
                </div>
                <p className="text-xs text-slate-600">
                  Configure step-by-step diagnostic flows before escalating to human specialists.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateSection?.('support-procedures')}
                  className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 hover:bg-slate-100 transition-all shadow-2xs"
                >
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span>Manage Procedures</span>
                </button>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-slate-100">
              <div className="text-xs text-slate-500">
                {report?.steps.find((s) => s.step === 4)?.summary}
              </div>
              <button
                type="button"
                onClick={() => setActiveStepTab(5)}
                className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold tracking-wide transition-all shadow-sm"
              >
                <span>Continue to Human Support</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: HUMAN SUPPORT CONFIGURATION */}
        {activeStepTab === 5 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 5 — Human Support Configuration</h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Configure operating hours, time zone, escalation conditions, and support team members.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Support Operating Hours <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={operatingHours}
                    onChange={(e) => setOperatingHours(e.target.value)}
                    placeholder="e.g. Monday – Friday · 09:00 – 18:00 UTC"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Must be defined by your business. CareFlow never invents response-time guarantees.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Primary Time Zone
                  </label>
                  <input
                    type="text"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    placeholder="e.g. UTC, EST, WAT, CET"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Escalation Conditions &amp; Handover Rules
                </label>
                <textarea
                  rows={2}
                  value={escalationConditions}
                  onChange={(e) => setEscalationConditions(e.target.value)}
                  placeholder="Instructions for when the assistant passes conversations to human specialists."
                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  id="humanAvail"
                  type="checkbox"
                  checked={humanSupportAvailable}
                  onChange={(e) => setHumanSupportAvailable(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="humanAvail" className="text-xs font-semibold text-slate-800 cursor-pointer">
                  Enable human escalation option on customer support portal
                </label>
              </div>

              {/* Support Team & Agent Invitation */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Support Team Members &amp; Agent Invitation ({agents.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Add support agents or supervisors to handle escalated customer conversations.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateSection?.('agents')}
                    className="text-xs font-bold text-teal-700 hover:text-teal-900 underline underline-offset-4"
                  >
                    Open Full Roster →
                  </button>
                </div>

                {agents.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {agents.map((ag) => (
                      <div
                        key={ag.id}
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs flex items-center gap-2"
                      >
                        <span className="font-bold text-slate-800">{ag.displayName}</span>
                        <span className="text-slate-400">({ag.email})</span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                          {ag.role}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <form onSubmit={handleInviteSpecialist} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-1">
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Agent full name"
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="agent@company.com"
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as UserRole.Agent | UserRole.Supervisor | UserRole.Admin)
                    }
                    className="px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  >
                    <option value={UserRole.Agent}>Support Agent</option>
                    <option value={UserRole.Supervisor}>Supervisor</option>
                    <option value={UserRole.Admin}>Administrator</option>
                  </select>
                  <button
                    type="submit"
                    disabled={invitingAgent || !inviteName.trim() || !inviteEmail.trim()}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{invitingAgent ? 'Adding...' : 'Invite Member'}</span>
                  </button>
                </form>
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() =>
                  handleSaveStep(5, {
                    humanSupport: {
                      operatingHours,
                      timezone,
                      escalationConditions,
                      humanSupportAvailable,
                    },
                  })
                }
                disabled={saving}
                className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold tracking-wide transition-all shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Human Support & Next'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: CHATBOT CONFIGURATION */}
        {activeStepTab === 6 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 6 — Assistant Configuration</h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Configure your customer-facing assistant name, initial greeting, tone, and topic guardrails.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Assistant Display Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={assistantName}
                    onChange={(e) => setAssistantName(e.target.value)}
                    placeholder="e.g. CareFlow Guide"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                    Initial Greeting Message <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={greetingMessage}
                    onChange={(e) => setGreetingMessage(e.target.value)}
                    placeholder="Hi! Welcome to our support center. How can I help?"
                    className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-600">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  <span>External AI Provider Configuration: Optional</span>
                </div>
                <p>
                  External AI provider keys are not required during registration. Your assistant
                  operates deterministically out-of-the-box using your verified knowledge base, FAQs,
                  and guided troubleshooting procedures.
                </p>
              </div>
            </div>

            <div className="pt-4 flex justify-end border-t border-slate-100">
              <button
                type="button"
                onClick={() =>
                  handleSaveStep(6, {
                    chatbot: {
                      assistantName,
                      greetingMessage,
                      communicationStyle: commStyle,
                    },
                  })
                }
                disabled={saving}
                className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold tracking-wide transition-all shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : 'Save Assistant & Next'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 7: TEST AND PUBLISH */}
        {activeStepTab === 7 && (
          <div className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Step 7 — Test and Publish Support Portal</h2>
                <p className="text-xs text-slate-600 leading-relaxed mt-0.5">
                  Before publishing, preview your portal, test sample customer inquiries against your
                  assistant, and verify that all mandatory setup items are complete.
                </p>
              </div>
            </div>

            {/* Readiness Checklist */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Readiness Checklist
              </h3>
              <div className="space-y-2 text-xs">
                {report?.steps.slice(0, 6).map((st) => (
                  <div key={st.step} className="flex items-center justify-between py-1 gap-4">
                    <div className="flex items-center gap-2">
                      {st.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveStepTab(st.step)}
                        className={`text-left hover:underline ${
                          st.completed ? 'text-slate-800 font-semibold' : 'text-slate-500'
                        }`}
                      >
                        Step {st.step}: {st.title}
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-400 text-right">{st.summary}</span>
                  </div>
                ))}
              </div>

              {report?.missingRequirements && report.missingRequirements.length > 0 && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <div className="font-bold">Items required before publishing:</div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {report.missingRequirements.map((m, idx) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Interactive Test Box */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Interactive Assistant Test
              </h3>
              <p className="text-xs text-slate-600">
                Ask a sample customer question to verify how your assistant responds with current
                settings and published knowledge.
              </p>
              <form onSubmit={handleRunTestAssistant} className="flex gap-2">
                <input
                  type="text"
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="e.g. How do I get help with my account or connect with support?"
                  className="flex-1 px-4 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                />
                <button
                  type="submit"
                  disabled={testing || !testQuery.trim()}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{testing ? 'Testing...' : 'Test Reply'}</span>
                </button>
              </form>

              {testResult && (
                <div className="mt-3 p-3.5 rounded-xl bg-teal-50/70 border border-teal-200 text-xs text-teal-950 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-teal-800">
                    <span>Layer: {testResult.resolutionLayer}</span>
                    {testResult.matchedSourceTitle && (
                      <span>· Source: {testResult.matchedSourceTitle}</span>
                    )}
                    <span>· Escalation Suggested: {testResult.suggestEscalation ? 'Yes' : 'No'}</span>
                  </div>
                  <p className="leading-relaxed text-slate-900">{testResult.reply}</p>
                </div>
              )}
            </div>

            {/* Publishing Action */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-600">
                  {isPublished ? (
                    <span className="font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 inline" /> Your portal is published and live for customers.
                    </span>
                  ) : (
                    <span>Your portal remains in private preview status until you explicitly publish it.</span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Link
                  href={`/portal/${organizationSlug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 py-3 px-5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  <span>Open Full Portal Preview</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>

                <button
                  type="button"
                  onClick={handlePublishPortal}
                  disabled={publishing || (!report?.canPublish && !isPublished)}
                  className={`inline-flex items-center gap-2 py-3 px-6 rounded-xl text-xs font-bold tracking-wide transition-all shadow-sm ${
                    isPublished
                      ? 'bg-slate-100 text-slate-500 cursor-default'
                      : report?.canPublish
                      ? 'bg-teal-600 hover:bg-teal-700 text-white'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {publishing
                    ? 'Publishing...'
                    : isPublished
                    ? 'Portal is Published'
                    : 'Publish Support Portal'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

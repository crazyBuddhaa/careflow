'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Plus,
  Send,
  Trash2,
  Pencil,
  X,
} from 'lucide-react';
import type {
  ApiResponse,
  BusinessPortalConfig,
  CommunicationStyle,
  ExternalAiProviderKey,
  PortalAccentTheme,
  PortalAssistantResponseDto,
  ResponsePriorityLayer,
  SupportProcedureItem,
  SupportProcedureStep,
} from '@careflow/shared';

export type SettingsSubView =
  | 'business-profile'
  | 'branding'
  | 'chatbot-settings'
  | 'support-procedures';

interface WorkspaceSettingsManagerProps {
  activeSubView: SettingsSubView;
  organizationName: string;
  organizationSlug: string;
}

const PRIORITY_LABELS: Record<ResponsePriorityLayer, { label: string; detail: string }> = {
  'business-rules': {
    label: 'Approved Business Rules & FAQs',
    detail: 'Canonical answers and topic rules defined by your team.',
  },
  'knowledge-base': {
    label: 'Published Knowledge Base',
    detail: 'Verified help articles written for your customers.',
  },
  'guided-troubleshooting': {
    label: 'Guided Troubleshooting Flows',
    detail: 'Step-by-step checks for recurring customer questions.',
  },
  'ai-fallback': {
    label: 'Assisted Resolution',
    detail: 'Context-aware assistance governed by your confidence and usage limits.',
  },
  'human-escalation': {
    label: 'Human Specialist Handoff',
    detail: 'Routes unresolved enquiries to your support team with context.',
  },
};

const DEFAULT_PRIORITY_ORDER: ResponsePriorityLayer[] = [
  'business-rules',
  'knowledge-base',
  'guided-troubleshooting',
  'ai-fallback',
  'human-escalation',
];

export function WorkspaceSettingsManager({
  activeSubView,
  organizationName,
  organizationSlug,
}: WorkspaceSettingsManagerProps) {
  const [config, setConfig] = useState<BusinessPortalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Business Profile state
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [supportHours, setSupportHours] = useState('');
  const [hostnamesText, setHostnamesText] = useState('');

  // Branding state
  const [logoText, setLogoText] = useState('');
  const [portalSubtitle, setPortalSubtitle] = useState('');
  const [accentTheme, setAccentTheme] = useState<PortalAccentTheme>('blue-teal');
  const [welcomeHeadline, setWelcomeHeadline] = useState('');
  const [welcomeDescription, setWelcomeDescription] = useState('');
  const [primaryCtaLabel, setPrimaryCtaLabel] = useState('');
  const [secondaryCtaLabel, setSecondaryCtaLabel] = useState('');
  const [escEyebrow, setEscEyebrow] = useState('');
  const [escHeadline, setEscHeadline] = useState('');
  const [escDescription, setEscDescription] = useState('');
  const [escCtaLabel, setEscCtaLabel] = useState('');
  const [escInstructions, setEscInstructions] = useState('');

  // Chatbot Settings state
  const [assistantName, setAssistantName] = useState('');
  const [assistantSubtitle, setAssistantSubtitle] = useState('');
  const [initialGreeting, setInitialGreeting] = useState('');
  const [communicationStyle, setCommunicationStyle] =
    useState<CommunicationStyle>('warm-helpful');
  const [supportedTopics, setSupportedTopics] = useState<string[]>([]);
  const [newSupportedTopic, setNewSupportedTopic] = useState('');
  const [restrictedTopics, setRestrictedTopics] = useState<string[]>([]);
  const [newRestrictedTopic, setNewRestrictedTopic] = useState('');
  const [priorityOrder, setPriorityOrder] =
    useState<ResponsePriorityLayer[]>(DEFAULT_PRIORITY_ORDER);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiProvider, setAiProvider] = useState<ExternalAiProviderKey>('gemini');
  const [aiThreshold, setAiThreshold] = useState(0.78);
  const [aiDailyCap, setAiDailyCap] = useState(500);
  const [aiInstructions, setAiInstructions] = useState('');

  // Chatbot Sandbox state
  const [sandboxPrompt, setSandboxPrompt] = useState('');
  const [sandboxTesting, setSandboxTesting] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<PortalAssistantResponseDto | null>(null);

  // Support Procedures state
  const [procedures, setProcedures] = useState<SupportProcedureItem[]>([]);
  const [procFormOpen, setProcFormOpen] = useState(false);
  const [editingProcId, setEditingProcId] = useState<string | null>(null);
  const [procTitle, setProcTitle] = useState('');
  const [procCategory, setProcCategory] = useState('');
  const [procTriggersText, setProcTriggersText] = useState('');
  const [procEscalationRule, setProcEscalationRule] = useState('');
  const [procPublished, setProcPublished] = useState(true);
  const [procSteps, setProcSteps] = useState<SupportProcedureStep[]>([
    { stepNumber: 1, instruction: '', expectedOutcome: '' },
  ]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const populateStateFromConfig = useCallback((data: BusinessPortalConfig) => {
    setConfig(data);
    setDisplayName(data.branding.displayName);
    setContactEmail(data.contactEmail ?? '');
    setSupportHours(data.supportHours ?? 'Monday – Friday · 09:00 – 18:00 UTC');
    setHostnamesText(data.verifiedHostnames.join(', '));

    setLogoText(data.branding.logoText);
    setPortalSubtitle(data.branding.portalSubtitle);
    setAccentTheme(data.branding.accentTheme);
    setWelcomeHeadline(data.welcomeHeadline);
    setWelcomeDescription(data.welcomeDescription);
    setPrimaryCtaLabel(data.primaryCtaLabel);
    setSecondaryCtaLabel(data.secondaryCtaLabel);

    setEscEyebrow(data.escalation.sectionEyebrow);
    setEscHeadline(data.escalation.headline);
    setEscDescription(data.escalation.description);
    setEscCtaLabel(data.escalation.ctaLabel);
    setEscInstructions(data.escalation.supportInstructions);

    setAssistantName(data.chatbot.assistantName);
    setAssistantSubtitle(data.chatbot.assistantSubtitle);
    setInitialGreeting(data.chatbot.initialGreeting);
    setCommunicationStyle(data.chatbot.communicationStyle);
    setSupportedTopics(data.chatbot.supportedTopics);
    setRestrictedTopics(data.chatbot.restrictedTopics);
    setPriorityOrder(
      data.chatbot.responsePriority && data.chatbot.responsePriority.length > 0
        ? data.chatbot.responsePriority
        : DEFAULT_PRIORITY_ORDER
    );
    setAiEnabled(data.chatbot.aiFallback?.enabled ?? false);
    setAiProvider(data.chatbot.aiFallback?.provider ?? 'gemini');
    setAiThreshold(data.chatbot.aiFallback?.confidenceThreshold ?? 0.78);
    setAiDailyCap(data.chatbot.aiFallback?.dailyRequestCap ?? 500);
    setAiInstructions(data.chatbot.aiFallback?.systemInstructions ?? '');

    setProcedures(data.procedures ?? []);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/settings', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<BusinessPortalConfig>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      populateStateFromConfig(body.data);
    } catch {
      setErrorBanner('Unable to load workspace configuration.');
    } finally {
      setLoading(false);
    }
  }, [populateStateFromConfig]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function persistPatch(payload: Record<string, unknown>, successMsg: string) {
    setSaving(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as ApiResponse<BusinessPortalConfig>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return false;
      }
      populateStateFromConfig(body.data);
      showFeedback(successMsg);
      return true;
    } catch {
      setErrorBanner('Network error while saving workspace settings.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleSaveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (!config) return;
    const parsedHosts = hostnamesText
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

    void persistPatch(
      {
        contactEmail: contactEmail.trim() || undefined,
        supportHours: supportHours.trim(),
        verifiedHostnames:
          parsedHosts.length > 0 ? parsedHosts : [`${organizationSlug}.careflow.com`],
        branding: {
          ...config.branding,
          displayName: displayName.trim(),
        },
      },
      'Updated business profile and verified hostnames.'
    );
  }

  function handleSaveBranding(event: React.FormEvent) {
    event.preventDefault();
    void persistPatch(
      {
        branding: {
          displayName: displayName.trim(),
          logoText: logoText.trim(),
          accentTheme,
          portalSubtitle: portalSubtitle.trim(),
        },
        welcomeHeadline: welcomeHeadline.trim(),
        welcomeDescription: welcomeDescription.trim(),
        primaryCtaLabel: primaryCtaLabel.trim(),
        secondaryCtaLabel: secondaryCtaLabel.trim(),
        escalation: {
          sectionEyebrow: escEyebrow.trim(),
          headline: escHeadline.trim(),
          description: escDescription.trim(),
          ctaLabel: escCtaLabel.trim(),
          supportInstructions: escInstructions.trim(),
        },
      },
      'Saved customer portal branding and welcome copy.'
    );
  }

  function handleSaveChatbot(event: React.FormEvent) {
    event.preventDefault();
    if (supportedTopics.length === 0) {
      setErrorBanner('Add at least one supported topic for your chatbot.');
      return;
    }
    void persistPatch(
      {
        chatbot: {
          assistantName: assistantName.trim(),
          assistantSubtitle: assistantSubtitle.trim(),
          initialGreeting: initialGreeting.trim(),
          supportedTopics,
          restrictedTopics,
          communicationStyle,
          responsePriority: priorityOrder,
          aiFallback: {
            enabled: aiEnabled,
            provider: aiProvider,
            confidenceThreshold: Number(aiThreshold),
            dailyRequestCap: Number(aiDailyCap),
            systemInstructions: aiInstructions.trim(),
          },
        },
        escalation: {
          sectionEyebrow: escEyebrow.trim(),
          headline: escHeadline.trim(),
          description: escDescription.trim(),
          ctaLabel: escCtaLabel.trim(),
          supportInstructions: escInstructions.trim(),
        },
      },
      'Saved chatbot settings, topic boundaries, and priority rules.'
    );
  }

  function movePriorityLayer(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= priorityOrder.length) return;
    const copy = [...priorityOrder];
    const [moved] = copy.splice(index, 1);
    if (moved) {
      copy.splice(target, 0, moved);
      setPriorityOrder(copy);
    }
  }

  async function handleRunSandboxQuery(event: React.FormEvent) {
    event.preventDefault();
    const q = sandboxPrompt.trim();
    if (!q || !config) return;
    setSandboxTesting(true);
    try {
      const res = await fetch(
        `/api/portal/${encodeURIComponent(config.slug)}/assistant`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: q }),
        }
      );
      const body = (await res.json()) as ApiResponse<PortalAssistantResponseDto>;
      if (body.ok) {
        setSandboxResult(body.data);
      }
    } finally {
      setSandboxTesting(false);
    }
  }

  /* ---------------- Support Procedures Handlers ---------------- */

  function openNewProcedureForm() {
    setEditingProcId(null);
    setProcTitle('');
    setProcCategory(config?.categories[0]?.title ?? 'General');
    setProcTriggersText('');
    setProcEscalationRule('Escalate to human specialist if steps do not resolve the issue.');
    setProcPublished(true);
    setProcSteps([{ stepNumber: 1, instruction: '', expectedOutcome: '' }]);
    setProcFormOpen(true);
  }

  function openEditProcedureForm(proc: SupportProcedureItem) {
    setEditingProcId(proc.id);
    setProcTitle(proc.title);
    setProcCategory(proc.category);
    setProcTriggersText(proc.triggerPhrases.join(', '));
    setProcEscalationRule(proc.escalationRule);
    setProcPublished(proc.isPublished);
    setProcSteps(
      proc.steps.length > 0
        ? proc.steps
        : [{ stepNumber: 1, instruction: '', expectedOutcome: '' }]
    );
    setProcFormOpen(true);
  }

  async function handleSaveProcedure(event: React.FormEvent) {
    event.preventDefault();
    const cleanedSteps = procSteps
      .filter((s) => s.instruction.trim().length > 0)
      .map((s, idx) => ({
        stepNumber: idx + 1,
        instruction: s.instruction.trim(),
        expectedOutcome: s.expectedOutcome.trim() || 'Step verified.',
      }));

    if (cleanedSteps.length === 0) {
      setErrorBanner('Add at least one diagnostic step to the procedure.');
      return;
    }

    const triggers = procTriggersText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const item: SupportProcedureItem = {
      id: editingProcId ?? `proc_${Date.now().toString(36)}`,
      title: procTitle.trim(),
      category: procCategory.trim() || 'General',
      triggerPhrases: triggers,
      steps: cleanedSteps,
      escalationRule: procEscalationRule.trim(),
      isPublished: procPublished,
    };

    const nextList = editingProcId
      ? procedures.map((p) => (p.id === editingProcId ? item : p))
      : [...procedures, item];

    const ok = await persistPatch(
      { procedures: nextList },
      editingProcId
        ? `Updated procedure "${item.title}".`
        : `Created procedure "${item.title}".`
    );
    if (ok) {
      setProcFormOpen(false);
      setEditingProcId(null);
    }
  }

  async function handleDeleteProcedure(procId: string) {
    const nextList = procedures.filter((p) => p.id !== procId);
    await persistPatch({ procedures: nextList }, 'Removed troubleshooting procedure.');
  }

  async function handleToggleProcedurePublished(proc: SupportProcedureItem) {
    const nextList = procedures.map((p) =>
      p.id === proc.id ? { ...p, isPublished: !p.isPublished } : p
    );
    await persistPatch(
      { procedures: nextList },
      `Procedure marked as ${!proc.isPublished ? 'published' : 'draft'}.`
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-4">
        <div className="h-6 w-48 rounded bg-slate-100 animate-pulse" />
        <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  const portalHref = `/portal/${config?.slug || organizationSlug}`;

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm font-semibold text-teal-900 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
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

      {/* =====================================================================
          1. BUSINESS PROFILE
      ====================================================================== */}
      {activeSubView === 'business-profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-semibold text-teal-700">
                Configuration · {organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Business Profile &amp; Domain Routing
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                Manage organization identity, verified portal hostnames, and customer support hours.
              </p>
            </div>
            <Link
              href={portalHref}
              className="inline-flex items-center gap-1.5 py-2 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl whitespace-nowrap self-start"
            >
              <span>Open Support Portal</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="prof-name"
                className="block text-xs font-semibold text-slate-700"
              >
                Organization Display Name
              </label>
              <input
                id="prof-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">
                Support Portal Address
              </label>
              <p className="mt-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-mono text-slate-600">
                {config?.slug}.careflow.com
              </p>
            </div>

            <div>
              <label
                htmlFor="prof-email"
                className="block text-xs font-semibold text-slate-700"
              >
                Support Escalation Email
              </label>
              <input
                id="prof-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="support@yourbusiness.com"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="prof-hours"
                className="block text-xs font-semibold text-slate-700"
              >
                Human Support Hours
              </label>
              <input
                id="prof-hours"
                type="text"
                value={supportHours}
                onChange={(e) => setSupportHours(e.target.value)}
                placeholder="Monday – Saturday · 08:00 – 20:00 UTC"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="prof-hosts"
                className="block text-xs font-semibold text-slate-700"
              >
                Verified Portal Hostnames{' '}
                <span className="font-normal text-slate-400">(comma-separated)</span>
              </label>
              <input
                id="prof-hosts"
                type="text"
                required
                value={hostnamesText}
                onChange={(e) => setHostnamesText(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Incoming requests to these hostnames resolve exclusively to this business&apos;s
                support portal.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="py-2.5 px-6 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Business Profile'}
            </button>
          </div>
        </form>
      )}

      {/* =====================================================================
          2. PORTAL BRANDING
      ====================================================================== */}
      {activeSubView === 'branding' && (
        <form
          onSubmit={handleSaveBranding}
          className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-semibold text-teal-700">
                Configuration · {organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Customer Portal Branding
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                Customize your public portal theme, welcome messaging, action labels, and escalation
                section.
              </p>
            </div>
            <Link
              href={portalHref}
              className="inline-flex items-center gap-1.5 py-2 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl whitespace-nowrap self-start"
            >
              <span>Preview Portal</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="br-logo-text"
                className="block text-xs font-semibold text-slate-700"
              >
                Portal Brand Wordmark
              </label>
              <input
                id="br-logo-text"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="br-theme"
                className="block text-xs font-semibold text-slate-700"
              >
                Accent Colour Palette
              </label>
              <select
                id="br-theme"
                value={accentTheme}
                onChange={(e) => setAccentTheme(e.target.value as PortalAccentTheme)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              >
                <option value="blue-teal">Electric Blue &amp; Teal</option>
                <option value="teal-slate">Deep Teal &amp; Slate</option>
                <option value="indigo-sky">Indigo &amp; Sky</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="br-subtitle"
                className="block text-xs font-semibold text-slate-700"
              >
                Hero Eyebrow Subtitle
              </label>
              <input
                id="br-subtitle"
                type="text"
                required
                value={portalSubtitle}
                onChange={(e) => setPortalSubtitle(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="br-headline"
                className="block text-xs font-semibold text-slate-700"
              >
                Hero Welcome Headline
              </label>
              <input
                id="br-headline"
                type="text"
                required
                value={welcomeHeadline}
                onChange={(e) => setWelcomeHeadline(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="br-desc"
                className="block text-xs font-semibold text-slate-700"
              >
                Hero Supporting Description
              </label>
              <textarea
                id="br-desc"
                rows={3}
                required
                value={welcomeDescription}
                onChange={(e) => setWelcomeDescription(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="br-cta1"
                className="block text-xs font-semibold text-slate-700"
              >
                Primary CTA Button Label
              </label>
              <input
                id="br-cta1"
                type="text"
                required
                value={primaryCtaLabel}
                onChange={(e) => setPrimaryCtaLabel(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="br-cta2"
                className="block text-xs font-semibold text-slate-700"
              >
                Secondary CTA Button Label
              </label>
              <input
                id="br-cta2"
                type="text"
                required
                value={secondaryCtaLabel}
                onChange={(e) => setSecondaryCtaLabel(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100 space-y-4">
            <h2 className="text-sm font-bold text-slate-900">Human Support Banner Copy</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="br-esc-head"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Escalation Headline
                </label>
                <input
                  id="br-esc-head"
                  type="text"
                  required
                  value={escHeadline}
                  onChange={(e) => setEscHeadline(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="br-esc-cta"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Escalation Button Label
                </label>
                <input
                  id="br-esc-cta"
                  type="text"
                  required
                  value={escCtaLabel}
                  onChange={(e) => setEscCtaLabel(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="br-esc-desc"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Escalation Description
                </label>
                <input
                  id="br-esc-desc"
                  type="text"
                  required
                  value={escDescription}
                  onChange={(e) => setEscDescription(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="py-2.5 px-6 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Branding'}
            </button>
          </div>
        </form>
      )}

      {/* =====================================================================
          3. CHATBOT SETTINGS + TOPIC BOUNDARIES + LIVE SANDBOX
      ====================================================================== */}
      {activeSubView === 'chatbot-settings' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveChatbot}
            className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 space-y-7"
          >
            <div className="border-b border-slate-100 pb-5">
              <p className="text-xs font-semibold text-teal-700">
                Configuration · {organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Assistant Settings &amp; Topic Scope
              </h1>
              <p className="mt-1.5 text-sm text-slate-600">
                Configure your assistant greeting, tone of voice, supported topics, resolution
                order, and assisted response controls.
              </p>
            </div>

            {/* Identity & Tone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label
                  htmlFor="cb-name"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Assistant Display Name
                </label>
                <input
                  id="cb-name"
                  type="text"
                  required
                  value={assistantName}
                  onChange={(e) => setAssistantName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="cb-style"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Communication Style
                </label>
                <select
                  id="cb-style"
                  value={communicationStyle}
                  onChange={(e) => setCommunicationStyle(e.target.value as CommunicationStyle)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                >
                  <option value="warm-helpful">Warm &amp; Helpful</option>
                  <option value="professional-concise">Professional &amp; Concise</option>
                  <option value="technical-precise">Technical &amp; Precise</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="cb-sub"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Assistant Header Subtitle
                </label>
                <input
                  id="cb-sub"
                  type="text"
                  required
                  value={assistantSubtitle}
                  onChange={(e) => setAssistantSubtitle(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="cb-greeting"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Initial Customer Greeting
                </label>
                <textarea
                  id="cb-greeting"
                  rows={2}
                  required
                  value={initialGreeting}
                  onChange={(e) => setInitialGreeting(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Supported & Restricted Topic Boundaries */}
            <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Supported Topics</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Topics your chatbot is authorized to answer using workspace knowledge.
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={newSupportedTopic}
                    onChange={(e) => setNewSupportedTopic(e.target.value)}
                    placeholder="Add supported topic..."
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = newSupportedTopic.trim();
                      if (v && !supportedTopics.includes(v)) {
                        setSupportedTopics([...supportedTopics, v]);
                        setNewSupportedTopic('');
                      }
                    }}
                    className="py-2 px-3 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-xs">
                  {supportedTopics.map((topic) => (
                    <li
                      key={topic}
                      className="py-2 flex items-center justify-between gap-2 text-slate-700"
                    >
                      <span>{topic}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSupportedTopics(supportedTopics.filter((t) => t !== topic))
                        }
                        className="text-slate-400 hover:text-red-700 cursor-pointer"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <h2 className="text-sm font-bold text-slate-900">Restricted Topics</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Topics the chatbot must decline cleanly without inventing policies.
                </p>

                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={newRestrictedTopic}
                    onChange={(e) => setNewRestrictedTopic(e.target.value)}
                    placeholder="Add restricted topic..."
                    className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = newRestrictedTopic.trim();
                      if (v && !restrictedTopics.includes(v)) {
                        setRestrictedTopics([...restrictedTopics, v]);
                        setNewRestrictedTopic('');
                      }
                    }}
                    className="py-2 px-3 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl whitespace-nowrap cursor-pointer"
                  >
                    Add
                  </button>
                </div>

                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-xs">
                  {restrictedTopics.map((topic) => (
                    <li
                      key={topic}
                      className="py-2 flex items-center justify-between gap-2 text-slate-700"
                    >
                      <span>{topic}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setRestrictedTopics(restrictedTopics.filter((t) => t !== topic))
                        }
                        className="text-slate-400 hover:text-red-700 cursor-pointer"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Response Priority Order */}
            <div className="pt-6 border-t border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Resolution Order</h2>
              <p className="mt-1 text-xs text-slate-500">
                CareFlow resolves customer enquiries in this order across your support portal.
              </p>

              <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                {priorityOrder.map((layerKey, index) => {
                  const info = PRIORITY_LABELS[layerKey];
                  return (
                    <div
                      key={layerKey}
                      className="py-3 flex items-center justify-between gap-4 text-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span className="font-mono tabular-nums text-xs font-semibold text-blue-600 mt-0.5">
                          0{index + 1}
                        </span>
                        <div>
                          <p className="font-semibold text-slate-900">{info.label}</p>
                          <p className="text-xs text-slate-500">{info.detail}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => movePriorityLayer(index, -1)}
                          aria-label="Move priority up"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === priorityOrder.length - 1}
                          onClick={() => movePriorityLayer(index, 1)}
                          aria-label="Move priority down"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Assisted Resolution Controls */}
            <div className="pt-6 border-t border-slate-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Assisted Resolution Controls
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Set confidence thresholds, daily request limits, and guidance rules for assisted
                    replies.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span>{aiEnabled ? 'Enabled' : 'Standard Knowledge Mode'}</span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="ai-provider"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Response Engine
                  </label>
                  <select
                    id="ai-provider"
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value as ExternalAiProviderKey)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value="gemini">CareFlow Standard</option>
                    <option value="groq">CareFlow Fast Response</option>
                    <option value="openrouter">CareFlow Extended Reasoning</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ai-threshold"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Minimum Confidence
                  </label>
                  <input
                    id="ai-threshold"
                    type="number"
                    step="0.01"
                    min="0.1"
                    max="0.99"
                    value={aiThreshold}
                    onChange={(e) => setAiThreshold(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="ai-cap"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Daily Request Limit
                  </label>
                  <input
                    id="ai-cap"
                    type="number"
                    min="0"
                    max="100000"
                    value={aiDailyCap}
                    onChange={(e) => setAiDailyCap(Number(e.target.value))}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor="ai-inst"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Assistant Guidance Instructions
                  </label>
                  <textarea
                    id="ai-inst"
                    rows={3}
                    value={aiInstructions}
                    onChange={(e) => setAiInstructions(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Escalation Instructions */}
            <div className="pt-6 border-t border-slate-100">
              <label
                htmlFor="cb-esc-rules"
                className="block text-xs font-semibold text-slate-700"
              >
                Human Escalation Handover Instructions
              </label>
              <textarea
                id="cb-esc-rules"
                rows={2}
                value={escInstructions}
                onChange={(e) => setEscInstructions(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="py-2.5 px-6 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Chatbot Settings'}
              </button>
            </div>
          </form>

          {/* Interactive Assistant Preview */}
          <div className="rounded-2xl border border-slate-200 bg-white p-7 space-y-4">
            <div>
              <p className="text-xs font-semibold text-teal-700">Assistant Preview</p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                Preview Customer Responses
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Ask a sample customer question to preview how {organizationName}&apos;s published
                knowledge, FAQs, and topic rules respond.
              </p>
            </div>

            <form onSubmit={handleRunSandboxQuery} className="flex items-center gap-2">
              <input
                type="text"
                value={sandboxPrompt}
                onChange={(e) => setSandboxPrompt(e.target.value)}
                placeholder="Type a sample customer question..."
                className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sandboxTesting || !sandboxPrompt.trim()}
                className="inline-flex items-center gap-1.5 py-2.5 px-5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-xl whitespace-nowrap cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{sandboxTesting ? 'Testing...' : 'Test Reply'}</span>
              </button>
            </form>

            {sandboxResult && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <p className="text-xs text-slate-500 font-mono">
                  Resolved Layer: <strong className="text-slate-900">{sandboxResult.resolutionLayer}</strong>
                  {sandboxResult.matchedSourceTitle && (
                    <> · Source: {sandboxResult.matchedSourceTitle}</>
                  )}
                  {' · '}
                  Escalation Suggested: {sandboxResult.suggestEscalation ? 'Yes' : 'No'}
                </p>
                <p className="text-sm text-slate-900 leading-relaxed">{sandboxResult.reply}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          4. SUPPORT PROCEDURES (GUIDED TROUBLESHOOTING FLOWS)
      ====================================================================== */}
      {activeSubView === 'support-procedures' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-teal-700">
                Knowledge · {organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Troubleshooting Procedures
              </h1>
              <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
                Define step-by-step diagnostic checklists and trigger phrases your chatbot follows
                before escalating recurring issues to human specialists.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewProcedureForm}
              className="inline-flex items-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>New Procedure</span>
            </button>
          </div>

          {procFormOpen && (
            <form
              onSubmit={handleSaveProcedure}
              className="rounded-2xl border border-blue-200 bg-white p-7 space-y-5"
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-bold text-slate-900">
                  {editingProcId ? 'Edit Procedure' : 'Create Troubleshooting Procedure'}
                </h2>
                <button
                  type="button"
                  onClick={() => setProcFormOpen(false)}
                  aria-label="Close procedure editor"
                  className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="proc-title"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Procedure Title
                  </label>
                  <input
                    id="proc-title"
                    type="text"
                    required
                    value={procTitle}
                    onChange={(e) => setProcTitle(e.target.value)}
                    placeholder="e.g., Missing Deposit Balance Verification"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="proc-cat"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Category
                  </label>
                  <input
                    id="proc-cat"
                    type="text"
                    required
                    value={procCategory}
                    onChange={(e) => setProcCategory(e.target.value)}
                    placeholder="Deposits"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="proc-triggers"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Customer Trigger Phrases{' '}
                    <span className="font-normal text-slate-400">(comma-separated)</span>
                  </label>
                  <input
                    id="proc-triggers"
                    type="text"
                    value={procTriggersText}
                    onChange={(e) => setProcTriggersText(e.target.value)}
                    placeholder="missing deposit, balance not updated, payment pending"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Diagnostic Steps</span>
                  <button
                    type="button"
                    onClick={() =>
                      setProcSteps([
                        ...procSteps,
                        {
                          stepNumber: procSteps.length + 1,
                          instruction: '',
                          expectedOutcome: '',
                        },
                      ])
                    }
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    + Add Step
                  </button>
                </div>

                {procSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start pt-2 border-t border-slate-100"
                  >
                    <span className="sm:col-span-1 font-mono tabular-nums text-xs font-semibold text-slate-500 pt-2.5">
                      0{idx + 1}.
                    </span>
                    <input
                      type="text"
                      required
                      value={step.instruction}
                      onChange={(e) => {
                        const copy = [...procSteps];
                        copy[idx] = { ...step, instruction: e.target.value };
                        setProcSteps(copy);
                      }}
                      placeholder="Customer instruction..."
                      className="sm:col-span-6 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={step.expectedOutcome}
                      onChange={(e) => {
                        const copy = [...procSteps];
                        copy[idx] = { ...step, expectedOutcome: e.target.value };
                        setProcSteps(copy);
                      }}
                      placeholder="Expected outcome..."
                      className="sm:col-span-4 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    {procSteps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setProcSteps(procSteps.filter((_, i) => i !== idx))}
                        className="sm:col-span-1 text-xs text-red-700 pt-2 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label
                  htmlFor="proc-esc"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Escalation Rule
                </label>
                <input
                  id="proc-esc"
                  type="text"
                  required
                  value={procEscalationRule}
                  onChange={(e) => setProcEscalationRule(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={procPublished}
                    onChange={(e) => setProcPublished(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  <span>Publish for live chatbot guidance</span>
                </label>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setProcFormOpen(false)}
                    className="py-2 px-4 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="py-2 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    {saving ? 'Saving...' : 'Save Procedure'}
                  </button>
                </div>
              </div>
            </form>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {procedures.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  No troubleshooting procedures configured yet
                </p>
                <p className="text-xs text-slate-500">
                  Add a step-by-step diagnostic procedure for recurring customer questions.
                </p>
                <button
                  type="button"
                  onClick={openNewProcedureForm}
                  className="py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Create First Procedure
                </button>
              </div>
            ) : (
              procedures.map((proc) => (
                <div key={proc.id} className="p-6 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        <span
                          className={
                            proc.isPublished
                              ? 'font-semibold text-teal-700'
                              : 'font-semibold text-amber-700'
                          }
                        >
                          {proc.isPublished ? 'Published' : 'Draft'}
                        </span>
                        <span className="mx-2" aria-hidden="true">
                          ·
                        </span>
                        <span>{proc.category}</span>
                        <span className="mx-2" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono tabular-nums">{proc.steps.length} steps</span>
                      </p>
                      <h3 className="mt-1 text-base font-bold text-slate-900">{proc.title}</h3>
                      {proc.triggerPhrases.length > 0 && (
                        <p className="mt-1 text-xs text-slate-400 font-mono">
                          Triggers: {proc.triggerPhrases.join(' · ')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleProcedurePublished(proc)}
                        className="py-1.5 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap cursor-pointer"
                      >
                        {proc.isPublished ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditProcedureForm(proc)}
                        className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProcedure(proc.id)}
                        className="inline-flex items-center gap-1 py-1.5 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-50 border border-slate-200 rounded-lg cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  <ol className="pt-2 space-y-1.5 text-xs text-slate-600">
                    {proc.steps.map((s) => (
                      <li key={s.stepNumber}>
                        <span className="font-mono tabular-nums font-semibold text-slate-800 mr-2">
                          0{s.stepNumber}.
                        </span>
                        <span>{s.instruction}</span>
                        <span className="text-slate-400"> — {s.expectedOutcome}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-slate-500 pt-1">
                    Escalation: {proc.escalationRule}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

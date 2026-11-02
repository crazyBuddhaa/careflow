'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Globe,
  ShieldCheck,
  BookOpen,
  Bot,
} from 'lucide-react';
import type {
  ApiResponse,
  CommunicationStyle,
  PortalAccentTheme,
} from '@careflow/shared';

interface OnboardingResult {
  organizationId: string;
  slug: string;
  displayName: string;
  portalPath: string;
  verifiedHostname: string;
}

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export function BusinessOnboardingFlow() {
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [contactEmail, setContactEmail] = useState('');
  const [accentTheme, setAccentTheme] = useState<PortalAccentTheme>('blue-teal');
  const [communicationStyle, setCommunicationStyle] =
    useState<CommunicationStyle>('warm-helpful');
  const [welcomeHeadline, setWelcomeHeadline] = useState(
    'Get clear answers and fast support whenever you need it.'
  );
  const [welcomeDescription, setWelcomeDescription] = useState(
    'Search our verified help guides, walk through step-by-step troubleshooting, or connect directly with our support team.'
  );
  const [initialGreeting, setInitialGreeting] = useState(
    'Hi! Welcome to our support center. What can I help you with today?'
  );
  const [supportedTopicsInput, setSupportedTopicsInput] = useState(
    'Billing & payments, Product setup, Account access'
  );
  const [restrictedTopicsInput, setRestrictedTopicsInput] = useState(
    'Unrelated general trivia, External legal advice'
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdWorkspace, setCreatedWorkspace] = useState<OnboardingResult | null>(null);

  function handleBusinessNameChange(nextName: string) {
    setBusinessName(nextName);
    if (!slugManuallyEdited) {
      setSlug(slugifyName(nextName));
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    const supportedTopics = supportedTopicsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const restrictedTopics = restrictedTopicsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          slug,
          contactEmail,
          accentTheme,
          communicationStyle,
          welcomeHeadline,
          welcomeDescription,
          initialGreeting,
          supportedTopics,
          restrictedTopics,
        }),
      });

      const body = (await res.json()) as ApiResponse<OnboardingResult>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      setCreatedWorkspace(body.data);
    } catch {
      setErrorMessage('Network error while provisioning your CareFlow workspace.');
    } finally {
      setSubmitting(false);
    }
  }

  const previewSlug = slug || 'yourbusiness';
  const previewName = businessName.trim() || 'Your Business';

  if (createdWorkspace) {
    return (
      <div className="rounded-2xl border border-teal-200 bg-white p-8 sm:p-10 space-y-6">
        <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
        </div>

        <div>
          <p className="text-xs font-semibold text-teal-700">Workspace Provisioned</p>
          <h2 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {createdWorkspace.displayName} is live on CareFlow
          </h2>
          <p className="mt-2.5 text-sm text-slate-600 leading-relaxed max-w-2xl">
            Your isolated database records, starter knowledge article, approved FAQ, and branded
            support portal have been created. You can visit your live customer portal right away or
            open Business Administration to customize articles and chatbot rules.
          </p>
        </div>

        <div className="divide-y divide-slate-100 border-y border-slate-100 text-sm">
          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-slate-500">Organization ID</span>
            <span className="font-mono text-slate-900">{createdWorkspace.organizationId}</span>
          </div>
          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-slate-500">Verified Portal Hostname</span>
            <span className="font-mono text-blue-600">{createdWorkspace.verifiedHostname}</span>
          </div>
          <div className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-slate-500">Preview Route</span>
            <span className="font-mono text-slate-900">{createdWorkspace.portalPath}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2">
          <Link
            href={createdWorkspace.portalPath}
            className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
          >
            <span>Open Live Customer Portal</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>

          <Link
            href={`/login?org=${encodeURIComponent(createdWorkspace.organizationId)}`}
            className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition-colors whitespace-nowrap"
          >
            <span>Manage in Business Admin</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left: Provisioning Form */}
      <form
        onSubmit={handleSubmit}
        className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 space-y-6"
      >
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Create Isolated Business Workspace
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Configure your portal identity, branding theme, and initial chatbot boundaries.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="onb-name"
              className="block text-xs font-semibold text-slate-700"
            >
              Business Name
            </label>
            <input
              id="onb-name"
              type="text"
              required
              value={businessName}
              onChange={(e) => handleBusinessNameChange(e.target.value)}
              placeholder="e.g., Paystack FinOps or Acme Cloud"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="onb-slug"
              className="block text-xs font-semibold text-slate-700"
            >
              Portal Subdomain Slug
            </label>
            <input
              id="onb-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => {
                setSlugManuallyEdited(true);
                setSlug(slugifyName(e.target.value));
              }}
              placeholder="yourbusiness"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500 font-mono">
              {previewSlug}.careflow.com
            </p>
          </div>

          <div>
            <label
              htmlFor="onb-email"
              className="block text-xs font-semibold text-slate-700"
            >
              Support Contact Email
            </label>
            <input
              id="onb-email"
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="support@company.com"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="onb-theme"
              className="block text-xs font-semibold text-slate-700"
            >
              Portal Accent Theme
            </label>
            <select
              id="onb-theme"
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
              htmlFor="onb-headline"
              className="block text-xs font-semibold text-slate-700"
            >
              Portal Welcome Headline
            </label>
            <input
              id="onb-headline"
              type="text"
              required
              value={welcomeHeadline}
              onChange={(e) => setWelcomeHeadline(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="onb-desc"
              className="block text-xs font-semibold text-slate-700"
            >
              Supporting Portal Description
            </label>
            <textarea
              id="onb-desc"
              rows={2}
              required
              value={welcomeDescription}
              onChange={(e) => setWelcomeDescription(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="onb-greeting"
              className="block text-xs font-semibold text-slate-700"
            >
              Chatbot Initial Greeting
            </label>
            <input
              id="onb-greeting"
              type="text"
              required
              value={initialGreeting}
              onChange={(e) => setInitialGreeting(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="onb-supported"
              className="block text-xs font-semibold text-slate-700"
            >
              Supported Topics <span className="font-normal text-slate-400">(comma-separated)</span>
            </label>
            <input
              id="onb-supported"
              type="text"
              required
              value={supportedTopicsInput}
              onChange={(e) => setSupportedTopicsInput(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="onb-style"
              className="block text-xs font-semibold text-slate-700"
            >
              Assistant Tone of Voice
            </label>
            <select
              id="onb-style"
              value={communicationStyle}
              onChange={(e) => setCommunicationStyle(e.target.value as CommunicationStyle)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              <option value="warm-helpful">Warm &amp; Helpful</option>
              <option value="professional-concise">Professional &amp; Concise</option>
              <option value="technical-precise">Technical &amp; Precise</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="onb-restricted"
              className="block text-xs font-semibold text-slate-700"
            >
              Restricted Topics <span className="font-normal text-slate-400">(declined by assistant)</span>
            </label>
            <input
              id="onb-restricted"
              type="text"
              value={restrictedTopicsInput}
              onChange={(e) => setRestrictedTopicsInput(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
          </div>
        </div>

        {errorMessage && (
          <p role="alert" className="text-xs font-semibold text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Creates an isolated tenant in D1 with starter categories and FAQs.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 py-2.5 px-6 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
          >
            <span>{submitting ? 'Provisioning...' : 'Launch Business Portal'}</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      {/* Right: Live Portal Preview & Architecture Guarantees */}
      <div className="lg:col-span-5 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <p className="text-xs font-semibold text-teal-700">Live Portal Preview</p>
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <p className="text-xs font-mono text-slate-500">
              https://{previewSlug}.careflow.com
            </p>
            <h3 className="text-lg font-bold text-slate-900">{previewName}</h3>
            <p className="text-sm font-semibold text-slate-800">{welcomeHeadline}</p>
            <p className="text-xs text-slate-600 leading-relaxed">{welcomeDescription}</p>
          </div>
          <div className="pt-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">Assistant Greeting</p>
            <p className="mt-1.5 text-xs text-slate-800 bg-slate-50 rounded-xl p-3 leading-relaxed">
              &ldquo;{initialGreeting}&rdquo;
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">What Gets Provisioned Automatically</h3>
          <ul className="space-y-3 text-xs text-slate-600">
            <li className="flex items-start gap-2.5">
              <Globe className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Dedicated portal route and verified subdomain configuration</span>
            </li>
            <li className="flex items-start gap-2.5">
              <BookOpen className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Isolated knowledge categories, starter article, and approved FAQ</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Bot className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Scoped chatbot assistant with topic boundaries and escalation handoff</span>
            </li>
            <li className="flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
              <span>Full Business Administration workspace access</span>
            </li>
          </ul>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-500">Want to inspect existing portals first?</span>
            <Link
              href="/portals"
              className="font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              View Live Portals &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import {
  CAREFLOW_NAME,
  CAREFLOW_TAGLINE,
  CAREFLOW_VERSION,
  INITIAL_CLIENT_NAME,
} from '@careflow/shared';
import { ModuleArchitectureExplorer } from '@/components/ModuleArchitectureExplorer';
import { ApiHealthVerifier } from '@/components/ApiHealthVerifier';
import { DeploymentEnquiryForm } from '@/components/DeploymentEnquiryForm';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-slate-900">
      {/* Top Bar Contract: 3 exact zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-stone-50/95 backdrop-blur-xs border-b border-slate-200">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <a
            href="#"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            {CAREFLOW_NAME}
          </a>

          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600"
          >
            <a
              href="#capabilities"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#architecture"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Architecture
            </a>
            <a
              href="#impact"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Client Impact
            </a>
            <a
              href="#verification"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Diagnostics
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <a
              href="#onboarding"
              className="py-2 px-4 text-xs font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              Request Deployment
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Proposition: Hero Section */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center">
              <p className="text-xs text-slate-500">
                {CAREFLOW_TAGLINE} · Initial Client {INITIAL_CLIENT_NAME} · Release{' '}
                <span className="font-mono tabular-nums">v{CAREFLOW_VERSION}</span>
              </p>

              <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-slate-900 leading-[1.08] text-balance">
                Resolve repetitive support enquiries before they reach your queue.
              </h1>

              <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                CareFlow combines structured troubleshooting trees, a canonical knowledge base, and
                unified Website Widget and Telegram intake so human specialists focus strictly on
                high-complexity customer problems.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-5">
                <a
                  href="#onboarding"
                  className="py-3 px-6 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                >
                  Schedule Architecture Briefing
                </a>
                <a
                  href="#architecture"
                  className="text-sm font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
                >
                  Inspect Monorepo Modules
                </a>
              </div>
            </div>

            <div className="lg:col-span-6 flex">
              <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 min-h-[300px] lg:min-h-[420px]">
                <img
                  src="/images/hero-support-architecture.jpg"
                  alt="CareFlow customer support engineering workspace bathed in natural daylight"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6">
                  <p className="text-xs text-stone-200">
                    Unified Channel Architecture · Next.js + Supabase PostgreSQL + Vercel
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    Built for {INITIAL_CLIENT_NAME} customer operations
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width 4-column Architectural Foundations Strip below Hero Split */}
          <div
            id="capabilities"
            className="mt-12 pt-10 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8"
          >
            <div>
              <p className="text-xs text-slate-500">01 · Self-Service Deflection</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                Deterministic Flows
              </p>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Guided diagnostic steps resolve known product issues without LLM hallucination risk.
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">02 · Channel Convergence</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                2 Unified Intakes
              </p>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Embeddable web widget and Telegram adapter write to one shared conversation schema.
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">03 · Tenant Isolation</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                PostgreSQL RLS
              </p>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Row Level Security enforces strict organization boundaries with zero browser secret exposure.
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">04 · Infrastructure Portability</p>
              <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 font-mono tabular-nums">
                4 Shared Packages
              </p>
              <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                Domain ports in <span className="font-mono text-xs">@careflow/*</span> keep business rules decoupled from HTTP and DB adapters.
              </p>
            </div>
          </div>
        </section>

        {/* Mechanism: Core Modules Explorer */}
        <section id="architecture" className="border-t border-slate-200 bg-stone-100/60 py-16 lg:py-24">
          <div className="max-w-7xl mx-auto px-6">
            <ModuleArchitectureExplorer />
          </div>
        </section>

        {/* Proof / Evidence: Initial Client Blueprint & Quantified Targets */}
        <section id="impact" className="border-t border-slate-200 bg-stone-50 py-16 lg:py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl">
              <p className="text-xs text-slate-500">
                Initial Client Rollout · {INITIAL_CLIENT_NAME}
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Engineered around measurable support operations outcomes
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <article className="border border-slate-200 bg-white p-8 rounded-xl flex flex-col justify-between gap-6">
                <div>
                  <p className="text-xs text-slate-500">
                    Case Rollout · {INITIAL_CLIENT_NAME} Support Transformation
                  </p>
                  <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                    Eliminating duplicate Tier-1 triage across web and Telegram
                  </h3>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                    Before CareFlow, password resets, webhook configuration questions, and billing
                    invoice lookups arrived across disconnected chat threads without user metadata.
                    CareFlow captures diagnostic state upfront and attaches full context on human
                    handoff.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-100">
                  <div>
                    <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      -42% Tier-1 Queue
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Target repetitive ticket reduction within 90 days of deployment
                    </p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                      &lt; 90s Context Handoff
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Diagnostic answers pre-attached before specialist assignment
                    </p>
                  </div>
                </div>
              </article>

              <div id="verification" className="flex flex-col">
                <ApiHealthVerifier />
              </div>
            </div>
          </div>
        </section>

        {/* Conversion / Action: Validated Deployment Briefing Form */}
        <section
          id="onboarding"
          className="border-t border-slate-200 bg-stone-100/60 py-16 lg:py-24"
        >
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <div className="lg:col-span-5">
              <p className="text-xs text-slate-500">
                Deployment Preparation · Vercel + Supabase + GitHub
              </p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Configure CareFlow for your product team
              </h2>
              <p className="mt-4 text-sm sm:text-base text-slate-600 leading-relaxed">
                CareFlow ships as a portable pnpm workspace monorepo with SQL migrations, Row Level
                Security policies, and strict server/client environment separation ready for your
                own Vercel and Supabase accounts.
              </p>

              <dl className="mt-8 space-y-4 border-t border-slate-200 pt-6 text-sm">
                <div>
                  <dt className="font-semibold text-slate-900">Repository Structure</dt>
                  <dd className="mt-0.5 text-slate-600 font-mono text-xs">
                    apps/web · apps/widget · packages/* · supabase/migrations
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-900">Security Boundary</dt>
                  <dd className="mt-0.5 text-slate-600">
                    Service-role credentials isolated to server Route Handlers; RLS active by default.
                  </dd>
                </div>
              </dl>
            </div>

            <div className="lg:col-span-7">
              <DeploymentEnquiryForm />
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900 font-display">{CAREFLOW_NAME}</span>
            <span aria-hidden="true">·</span>
            <span>{CAREFLOW_TAGLINE}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">v{CAREFLOW_VERSION}</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a href="#capabilities" className="hover:text-slate-900 transition-colors">
              Capabilities
            </a>
            <a href="#architecture" className="hover:text-slate-900 transition-colors">
              Architecture
            </a>
            <a href="/api/health" className="hover:text-slate-900 transition-colors font-mono">
              /api/health
            </a>
            <span>Prepared for {INITIAL_CLIENT_NAME}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

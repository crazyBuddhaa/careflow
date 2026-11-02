'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BookOpen,
  GitBranch,
  UserCheck,
  Globe,
  ShieldCheck,
  Layers,
  Menu,
  X,
} from 'lucide-react';
import { CAREFLOW_NAME } from '@careflow/shared';

type PlatformLayerTab = 'knowledge' | 'troubleshooting' | 'escalation' | 'channels';

interface LayerPreview {
  id: PlatformLayerTab;
  tabLabel: string;
  eyebrow: string;
  title: string;
  description: string;
  highlights: string[];
}

const PLATFORM_LAYERS: LayerPreview[] = [
  {
    id: 'knowledge',
    tabLabel: 'Knowledge Assistance',
    eyebrow: '01 · Knowledge-Based Customer Assistance',
    title: 'Answer customer questions from verified business knowledge',
    description:
      'Each business publishes its own structured help articles, FAQs, and supported topics so customers receive consistent answers grounded strictly in that organization’s documentation.',
    highlights: [
      'Independent knowledge base, categories, and FAQs per business',
      'Strict topic boundaries so unrelated questions are declined cleanly',
      'Shared source of truth across self-service portals and human support',
    ],
  },
  {
    id: 'troubleshooting',
    tabLabel: 'Guided Troubleshooting',
    eyebrow: '02 · Automated Troubleshooting',
    title: 'Walk customers through clear step-by-step problem resolution',
    description:
      'Before an enquiry reaches a support queue, CareFlow guides customers through structured diagnostic steps for recurring issues like payment checks, account setup, or feature usage.',
    highlights: [
      'Configurable decision paths tailored to each business’s products',
      'Captures customer answers and context as they progress',
      'Resolves routine enquiries without waiting for an available agent',
    ],
  },
  {
    id: 'escalation',
    tabLabel: 'Human Handoff',
    eyebrow: '03 · Human-Agent Escalation',
    title: 'Pass unresolved enquiries to human specialists with context intact',
    description:
      'When guided steps do not solve an issue, CareFlow prepares the conversation for a human representative—carrying forward the selected category and troubleshooting path.',
    highlights: [
      'Customers do not have to repeat basic issue details',
      'Configurable escalation rules and support instructions per business',
      'Clear separation between automated guidance and human representation',
    ],
  },
  {
    id: 'channels',
    tabLabel: 'Multi-Channel Architecture',
    eyebrow: '04 · Multi-Channel Support',
    title: 'Connect dedicated web portals, embeddable widgets, and messaging',
    description:
      'Every business receives its own branded support portal alongside shared conversation contracts prepared for website widgets and messaging channels such as Telegram.',
    highlights: [
      'Dedicated subdomain or custom-domain portal architecture per business',
      'Unified conversation and message structure across intake channels',
      'Strict tenant isolation between independent businesses',
    ],
  },
];

const HOW_PLATFORM_WORKS = [
  {
    step: '01',
    title: 'Configure your business workspace',
    description:
      'Define your branding, welcome message, help categories, published articles, FAQs, and topic boundaries inside your isolated workspace.',
  },
  {
    step: '02',
    title: 'Launch your dedicated support portal',
    description:
      'Provide customers with a clean, branded support destination (such as businessname.careflow.com) where they can browse topics or start guided assistance.',
  },
  {
    step: '03',
    title: 'Resolve automatically or hand off cleanly',
    description:
      'Let structured knowledge and troubleshooting handle common questions while routing complex enquiries to your human support team.',
  },
];

const BUSINESS_BENEFITS = [
  {
    title: 'Fewer repetitive enquiries',
    description:
      'Guided troubleshooting and clear FAQs address recurring customer questions before they enter your team’s queue.',
    icon: GitBranch,
  },
  {
    title: 'Strict business boundaries',
    description:
      'Each organization controls its own supported topics, communication style, and published procedures without cross-business data mixing.',
    icon: ShieldCheck,
  },
  {
    title: 'Organized product knowledge',
    description:
      'Centralize articles, categories, and step-by-step instructions so customers always see accurate guidance.',
    icon: BookOpen,
  },
  {
    title: 'Prepared for multi-channel growth',
    description:
      'Built on a modular architecture connecting branded customer portals, web widgets, and messaging integrations.',
    icon: Layers,
  },
];

export function CentralPlatformHome() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeLayer, setActiveLayer] = useState<PlatformLayerTab>('knowledge');

  const selectedLayer =
    PLATFORM_LAYERS.find((layer) => layer.id === activeLayer) ?? PLATFORM_LAYERS[0];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 exact zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Single-line CareFlow wordmark */}
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {CAREFLOW_NAME}
          </Link>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="CareFlow Platform Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600"
          >
            <a
              href="#capabilities"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Platform
            </a>
            <a
              href="#how-it-works"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#benefits"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              For Businesses
            </a>
            <Link
              href="/admin"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Business Admin
            </Link>
            <Link
              href="/login"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Log In
            </Link>
          </nav>

          {/* Zone 3: 1 Primary Action (+ mobile menu toggle) */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="#onboarding"
              className="py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Onboard Business
            </a>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Menu className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            aria-label="Mobile Platform Navigation"
            className="md:hidden border-t border-slate-100 bg-white px-6 py-4 space-y-3 text-sm font-semibold text-slate-700"
          >
            <a
              href="#capabilities"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              Platform
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              How It Works
            </a>
            <a
              href="#benefits"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              For Businesses
            </a>
            <Link
              href="/admin"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              Business Admin
            </Link>
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              Log In
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        {/* Hero Section — Central CareFlow Platform */}
        <section className="bg-gradient-to-b from-white via-slate-50/70 to-slate-50 border-b border-slate-200/80">
          <div className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-stretch">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6 flex flex-col justify-center"
              >
                <p className="text-xs font-semibold text-teal-700">
                  Multi-Business Customer Support Platform
                </p>

                <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-slate-900 leading-[1.08] text-balance">
                  Better customer support starts with better conversations.
                </h1>

                <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  CareFlow helps businesses deliver faster, smarter customer support through
                  intelligent assistance, organized knowledge and seamless human handoff.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <a
                    href="#onboarding"
                    className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <span>Get Started for Your Business</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </a>

                  <Link
                    href="/login"
                    className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <span>Business Login</span>
                  </Link>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200/80 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                  <span>Dedicated portal architecture:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    businessname.careflow.com
                  </span>
                </div>
              </motion.div>

              {/* Right Column: Visual Studio Asset + Domain Isolation Architecture Card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6 flex"
              >
                <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 min-h-[320px] lg:min-h-[420px]">
                  <img
                    src="/images/hero-support-architecture.jpg"
                    alt="Modern customer support operations workspace"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-6 sm:p-8 text-white">
                    <p className="text-xs text-teal-300 font-semibold">
                      Dedicated Portals · Isolated Workspaces
                    </p>
                    <p className="mt-1.5 text-base sm:text-lg font-bold tracking-tight">
                      One platform. Independent support portals for every business.
                    </p>
                    <p className="mt-1 text-xs text-slate-200 font-mono">
                      careflow.com · businessname.careflow.com
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Section 1: What CareFlow Does + Interactive Capability Inspector */}
        <section id="capabilities" className="py-16 lg:py-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold text-teal-700">What CareFlow Does</p>
                <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                  Structured customer assistance built around your business rules
                </h2>
                <p className="mt-3 text-base text-slate-600 leading-relaxed">
                  Explore how CareFlow combines published knowledge, guided troubleshooting, human
                  escalation, and multi-channel portals.
                </p>
              </div>

              {/* Interactive Segmented Capability Selector */}
              <div
                role="tablist"
                aria-label="CareFlow platform capabilities"
                className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start"
              >
                {PLATFORM_LAYERS.map((layer) => {
                  const isActive = layer.id === activeLayer;
                  return (
                    <button
                      key={layer.id}
                      role="tab"
                      type="button"
                      aria-selected={isActive}
                      onClick={() => setActiveLayer(layer.id)}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        isActive
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {layer.tabLabel}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Capability Detail Surface */}
            <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 rounded-2xl border border-slate-200 bg-white p-7 sm:p-10">
              <div className="lg:col-span-7 flex flex-col justify-center">
                <p className="text-xs font-semibold text-blue-600 font-mono">
                  {selectedLayer.eyebrow}
                </p>
                <h3 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 text-balance">
                  {selectedLayer.title}
                </h3>
                <p className="mt-4 text-base text-slate-600 leading-relaxed">
                  {selectedLayer.description}
                </p>
              </div>

              <div className="lg:col-span-5 lg:border-l lg:border-slate-200 lg:pl-8 flex flex-col justify-center">
                <p className="text-xs font-semibold text-slate-500">Key architectural capabilities</p>
                <ul className="mt-4 space-y-3.5 text-sm text-slate-700">
                  {selectedLayer.highlights.map((point) => (
                    <li key={point} className="leading-relaxed">
                      <span className="font-semibold text-teal-700 mr-2" aria-hidden="true">
                        ·
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Asymmetric 4-Card Summary Grid */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-white p-7">
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-blue-600 shrink-0" aria-hidden="true" />
                  <h3 className="text-lg font-bold tracking-tight text-slate-900">
                    Independent Business Portals by Domain
                  </h3>
                </div>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed max-w-2xl">
                  Each business on CareFlow receives its own isolated customer support portal with
                  custom branding, categories, FAQs, chatbot instructions, and escalation rules—resolved
                  from verified hostnames rather than shared global pages.
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <span className="font-mono text-slate-500">
                    businessname.careflow.com &rarr; Dedicated customer portal
                  </span>
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-1.5 font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                  >
                    <span>Explore Portal Architecture</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="md:col-span-1 rounded-2xl border border-slate-200 bg-white p-7 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
                    <h3 className="text-lg font-bold tracking-tight text-slate-900">
                      Seamless Handoff
                    </h3>
                  </div>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                    When automated flows cannot resolve an enquiry, CareFlow routes the customer to
                    human support with their selected topic and context preserved.
                  </p>
                </div>
                <p className="mt-5 pt-4 border-t border-slate-100 text-xs text-slate-500">
                  Human escalation · Context preserved
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: How the Platform Works */}
        <section
          id="how-it-works"
          className="py-16 lg:py-24 bg-white border-y border-slate-200/80 scroll-mt-16"
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-teal-700">How CareFlow Works</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                A clear path from business setup to customer resolution
              </h2>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
              {HOW_PLATFORM_WORKS.map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-7"
                >
                  <span className="font-mono tabular-nums text-xs font-semibold text-blue-600">
                    Step {item.step}
                  </span>
                  <h3 className="mt-3 text-lg font-bold tracking-tight text-slate-900">
                    {item.step}. {item.title}
                  </h3>
                  <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: Benefits for Businesses */}
        <section id="benefits" className="py-16 lg:py-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-teal-700">Benefits for Businesses</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Designed for clarity, control, and multi-tenant isolation
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
              {BUSINESS_BENEFITS.map((benefit) => {
                const Icon = benefit.icon;
                return (
                  <div
                    key={benefit.title}
                    className="rounded-2xl border border-slate-200 bg-white p-7 flex items-start gap-5"
                  >
                    <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold tracking-tight text-slate-900">
                        {benefit.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                        {benefit.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 4: Business Onboarding & Login Access */}
        <section id="onboarding" className="pb-16 lg:pb-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-8 py-12 sm:px-12 sm:py-16 text-white grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7">
                <p className="text-xs font-semibold text-teal-300 tracking-wide">
                  Business Onboarding & Workspace Access
                </p>
                <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white text-balance">
                  Launch a dedicated CareFlow portal for your customers
                </h2>
                <p className="mt-4 text-base text-slate-300 leading-relaxed tracking-wide max-w-2xl">
                  Configure your business profile, branding, knowledge base, guided troubleshooting
                  flows, and agent escalation settings from a dedicated administration workspace.
                </p>
              </div>

              <div className="lg:col-span-5 flex flex-wrap lg:justify-end gap-4">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
                >
                  <span>Prepare Business Workspace</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>

                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span>Workspace Login</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Platform Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-sm text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">{CAREFLOW_NAME}</span>
            <span aria-hidden="true">·</span>
            <span>Smarter Support. Better Experiences.</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a href="#capabilities" className="hover:text-slate-900 transition-colors">
              Platform
            </a>
            <Link href="/admin" className="hover:text-slate-900 transition-colors">
              Business Admin
            </Link>
            <Link href="/login" className="hover:text-slate-900 transition-colors">
              Login
            </Link>
            <Link href="/onboarding" className="hover:text-slate-900 transition-colors">
              Onboarding
            </Link>
            <span className="text-slate-400">
              &copy; {new Date().getFullYear()} {CAREFLOW_NAME}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

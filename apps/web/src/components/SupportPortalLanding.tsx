'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Wallet,
  Compass,
  UserCheck,
  HelpCircle,
  MessageSquareText,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import type { BusinessPortalConfig, PortalIconKey } from '@careflow/shared';
import {
  GuidedSupportPreview,
  getReplyForNode,
  type ChatTurn,
} from '@/components/GuidedSupportPreview';
import { getDefaultUltimateTechAppConfig } from '@/config/business-portals';

const ICON_MAP: Record<PortalIconKey, React.ComponentType<{ className?: string }>> = {
  wallet: Wallet,
  compass: Compass,
  'user-check': UserCheck,
  'help-circle': HelpCircle,
};

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Choose your issue',
    description:
      'Select what you need help with from the support categories or guided conversation options.',
  },
  {
    step: '02',
    title: 'Follow guided assistance',
    description:
      'Walk through clear, interactive prompts tailored to your topic so you can find answers right away.',
  },
  {
    step: '03',
    title: 'Connect to human support',
    description:
      'Get connected to human support if the issue remains unresolved, with your selected topic ready to share.',
  },
];

export interface SupportPortalLandingProps {
  portalConfig?: BusinessPortalConfig;
}

export function SupportPortalLanding({
  portalConfig = getDefaultUltimateTechAppConfig(),
}: SupportPortalLandingProps) {
  const { branding, chatbot, escalation, categories, faqs } = portalConfig;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqId, setOpenFaqId] = useState<string | null>(faqs[0]?.id ?? null);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 'initial-greeting',
      sender: 'assistant',
      text: chatbot.initialGreeting,
    },
  ]);
  const [currentNodeId, setCurrentNodeId] = useState<string>('root');
  const [chatHighlighted, setChatHighlighted] = useState(false);

  function triggerPreviewHighlight() {
    setChatHighlighted(true);
    window.setTimeout(() => {
      setChatHighlighted(false);
    }, 1200);
  }

  function scrollToAssistantAndStart(customerPrompt?: string, nextNodeId?: string) {
    const heroAssistant = document.getElementById('guided-assistant');
    if (heroAssistant) {
      heroAssistant.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    triggerPreviewHighlight();

    if (customerPrompt && nextNodeId) {
      const reply = getReplyForNode(nextNodeId, chatbot);
      const stamp = Date.now().toString();
      setTurns([
        {
          id: 'initial-greeting',
          sender: 'assistant',
          text: chatbot.initialGreeting,
        },
        {
          id: `cust-${stamp}`,
          sender: 'customer',
          text: customerPrompt,
        },
        {
          id: `asst-${stamp}`,
          sender: 'assistant',
          text: reply,
        },
      ]);
      setCurrentNodeId(nextNodeId);
    }
  }

  function handleSelectOption(label: string, nextNodeId: string) {
    const reply = getReplyForNode(nextNodeId, chatbot);
    const stamp = Date.now().toString();
    setTurns((prev) => [
      ...prev,
      { id: `cust-${stamp}`, sender: 'customer', text: label },
      { id: `asst-${stamp}`, sender: 'assistant', text: reply },
    ]);
    setCurrentNodeId(nextNodeId);
  }

  function handleResetConversation() {
    setTurns([
      {
        id: 'initial-greeting',
        sender: 'assistant',
        text: chatbot.initialGreeting,
      },
    ]);
    setCurrentNodeId('root');
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 1. Navigation — Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Business Portal Brand Wordmark */}
          <a
            href="#top"
            className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {branding.displayName}
          </a>

          {/* Zone 2: Navigation Links */}
          <nav
            aria-label="Support Portal Navigation"
            className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600"
          >
            <a
              href="#help-topics"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Help Topics
            </a>
            <a
              href="#how-it-works"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            {faqs.length > 0 && (
              <a
                href="#faqs"
                className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                FAQs
              </a>
            )}
            <a
              href="#contact-support"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Contact Support
            </a>
          </nav>

          {/* Zone 3: Single Primary Action (+ Mobile Menu Button on narrow screens) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => scrollToAssistantAndStart()}
              className="py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Get Help
            </button>

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

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <nav
            aria-label="Mobile Navigation"
            className="md:hidden border-t border-slate-100 bg-white px-6 py-4 space-y-3 text-sm font-semibold text-slate-700"
          >
            <a
              href="#help-topics"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              Help Topics
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              How It Works
            </a>
            {faqs.length > 0 && (
              <a
                href="#faqs"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 hover:text-slate-900"
              >
                FAQs
              </a>
            )}
            <a
              href="#contact-support"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              Contact Support
            </a>
          </nav>
        )}
      </header>

      <main id="top" className="flex-1">
        {/* 2. Hero Section */}
        <section className="relative overflow-hidden bg-gradient-to-b from-white via-slate-50/70 to-slate-50 border-b border-slate-200/70">
          <div className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-12 items-center">
              {/* Left Column: Customer Proposition & Actions */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6"
              >
                <p className="text-xs font-semibold text-teal-700">{branding.portalSubtitle}</p>

                <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-slate-900 leading-[1.1] text-balance">
                  {portalConfig.welcomeHeadline}
                </h1>

                <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  {portalConfig.welcomeDescription}
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      handleResetConversation();
                      scrollToAssistantAndStart();
                    }}
                    className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <MessageSquareText className="w-4 h-4" aria-hidden="true" />
                    <span>{portalConfig.primaryCtaLabel}</span>
                  </button>

                  <a
                    href="#help-topics"
                    className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <span>{portalConfig.secondaryCtaLabel}</span>
                  </a>
                </div>
              </motion.div>

              {/* Right Column: Interactive Chatbot Preview */}
              <motion.div
                id="guided-assistant"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6 scroll-mt-24"
              >
                <GuidedSupportPreview
                  turns={turns}
                  currentNodeId={currentNodeId}
                  onSelectOption={handleSelectOption}
                  onReset={handleResetConversation}
                  highlighted={chatHighlighted}
                  chatbotConfig={chatbot}
                />
              </motion.div>
            </div>
          </div>
        </section>

        {/* 3. Quick Help Categories */}
        <section id="help-topics" className="py-16 lg:py-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-teal-700">Help Topics</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                How can we help you today?
              </h2>
              <p className="mt-3 text-base text-slate-600 leading-relaxed">
                Choose a topic below to launch guided step-by-step assistance right away.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {categories.map((category) => {
                const Icon = ICON_MAP[category.iconKey] ?? HelpCircle;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() =>
                      scrollToAssistantAndStart(category.customerPrompt, category.targetNodeId)
                    }
                    className="group text-left rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 hover:border-blue-600/60 hover:shadow-sm transition-all duration-150 flex flex-col justify-between gap-6 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <div>
                      <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors duration-150">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <h3 className="mt-5 text-lg font-bold tracking-tight text-slate-900">
                        {category.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                        {category.description}
                      </p>
                    </div>

                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 group-hover:text-blue-700 whitespace-nowrap">
                      <span>{category.actionLabel}</span>
                      <ArrowRight
                        className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform duration-150"
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 4. How Support Works */}
        <section
          id="how-it-works"
          className="py-16 lg:py-24 bg-white border-y border-slate-200/80 scroll-mt-16"
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-teal-700">How It Works</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Simple, guided support from start to finish
              </h2>
              <p className="mt-3 text-base text-slate-600 leading-relaxed">
                Find clear answers quickly while keeping human support within easy reach.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
              {HOW_IT_WORKS_STEPS.map((item) => (
                <div
                  key={item.step}
                  className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-7 flex flex-col justify-between gap-4"
                >
                  <div>
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
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Configurable Business FAQs */}
        {faqs.length > 0 && (
          <section id="faqs" className="py-16 lg:py-20 scroll-mt-16 border-b border-slate-200/80">
            <div className="max-w-4xl mx-auto px-6">
              <p className="text-xs font-semibold text-teal-700">Common Questions</p>
              <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                Frequently asked questions at {branding.displayName}
              </h2>

              <div className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
                {faqs.map((faq) => {
                  const isOpen = openFaqId === faq.id;
                  return (
                    <div key={faq.id} className="py-5">
                      <button
                        type="button"
                        onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center justify-between gap-4 text-left text-base font-semibold text-slate-900 hover:text-blue-700 transition-colors cursor-pointer"
                      >
                        <span>{faq.question}</span>
                        <ChevronDown
                          className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-150 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                      {isOpen && (
                        <p className="mt-3 text-sm text-slate-600 leading-relaxed pr-8">
                          {faq.answer}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* 5. Human Support Section */}
        <section id="contact-support" className="py-16 lg:py-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-8 py-12 sm:px-12 sm:py-16 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold text-teal-300 tracking-wide">
                  {escalation.sectionEyebrow}
                </p>
                <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white text-balance">
                  {escalation.headline}
                </h2>
                <p className="mt-4 text-base text-slate-300 leading-relaxed tracking-wide">
                  {escalation.description}
                </p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    scrollToAssistantAndStart(
                      escalation.customerTriggerPrompt,
                      escalation.targetNodeId
                    )
                  }
                  className="inline-flex items-center gap-2 py-3.5 px-7 text-sm font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
                >
                  <span>{escalation.ctaLabel}</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 6. Portal Footer — Includes Powered by CareFlow link back to central platform */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-sm text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">{branding.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>Customer Support Center</span>
            <span aria-hidden="true">·</span>
            <Link href="/" className="text-slate-500 hover:text-blue-600 transition-colors">
              Powered by CareFlow
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a href="#help-topics" className="hover:text-slate-900 transition-colors">
              Help Topics
            </a>
            <button
              type="button"
              onClick={() =>
                scrollToAssistantAndStart(
                  escalation.customerTriggerPrompt,
                  escalation.targetNodeId
                )
              }
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Contact Support
            </button>
            <span className="text-slate-400">
              &copy; {new Date().getFullYear()} {branding.displayName}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

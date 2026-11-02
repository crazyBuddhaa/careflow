'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import {
  GuidedSupportPreview,
  INITIAL_GREETING,
  getReplyForNode,
  type ChatTurn,
} from '@/components/GuidedSupportPreview';

interface HelpCategory {
  id: string;
  title: string;
  description: string;
  actionLabel: string;
  customerPrompt: string;
  targetNodeId: string;
  icon: React.ComponentType<{ className?: string }>;
}

const QUICK_HELP_CATEGORIES: HelpCategory[] = [
  {
    id: 'deposit-assistance',
    title: 'Deposit Assistance',
    description: 'Help with deposits, payment confirmation and missing balances.',
    actionLabel: 'Start deposit guide',
    customerPrompt: 'I have a deposit problem.',
    targetNodeId: 'deposit_root',
    icon: Wallet,
  },
  {
    id: 'product-support',
    title: 'Product Support',
    description: 'Learn how to use products and resolve common issues.',
    actionLabel: 'Explore product help',
    customerPrompt: 'I need help using a product.',
    targetNodeId: 'product_root',
    icon: Compass,
  },
  {
    id: 'account-assistance',
    title: 'Account Assistance',
    description: 'Get help with account-related enquiries.',
    actionLabel: 'Get account help',
    customerPrompt: 'I need help with an account enquiry.',
    targetNodeId: 'account_root',
    icon: UserCheck,
  },
  {
    id: 'other-enquiries',
    title: 'Other Enquiries',
    description: 'Find assistance for other questions.',
    actionLabel: 'Ask another question',
    customerPrompt: 'I have another question.',
    targetNodeId: 'other_root',
    icon: HelpCircle,
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Choose your issue',
    description:
      'Select what you need help with—whether it involves a deposit, learning how a product works, or an account question.',
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

export function SupportPortalLanding() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 'initial-greeting',
      sender: 'assistant',
      text: INITIAL_GREETING,
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
      const reply = getReplyForNode(nextNodeId);
      const stamp = Date.now().toString();
      setTurns([
        {
          id: 'initial-greeting',
          sender: 'assistant',
          text: INITIAL_GREETING,
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
    const reply = getReplyForNode(nextNodeId);
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
        text: INITIAL_GREETING,
      },
    ]);
    setCurrentNodeId('root');
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* 1. Navigation — Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Brand Wordmark */}
          <a
            href="#top"
            className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            CareFlow
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
                <p className="text-xs font-semibold text-teal-700">
                  Customer Support Portal · UltimateTechApp
                </p>

                <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-slate-900 leading-[1.1] text-balance">
                  Get help. Find answers. Move forward.
                </h1>

                <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  Need help with a deposit or using a product? Find answers through guided support
                  or connect with a human representative when you need one.
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
                    <span>Start a Conversation</span>
                  </button>

                  <a
                    href="#help-topics"
                    className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <span>Explore Help Topics</span>
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
              {QUICK_HELP_CATEGORIES.map((category) => {
                const Icon = category.icon;
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

        {/* 4. How CareFlow Works */}
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
                CareFlow helps you find clear answers quickly while keeping human support within
                easy reach.
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

        {/* 5. Human Support Section */}
        <section id="contact-support" className="py-16 lg:py-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-8 py-12 sm:px-12 sm:py-16 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold text-teal-300 tracking-wide">
                  Human Assistance
                </p>
                <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white text-balance">
                  Still need a helping hand?
                </h2>
                <p className="mt-4 text-base text-slate-300 leading-relaxed tracking-wide">
                  If guided assistance doesn&apos;t solve your problem, your enquiry can be passed
                  to a human support representative.
                </p>
              </div>

              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    scrollToAssistantAndStart('I want to speak with support.', 'human_root')
                  }
                  className="inline-flex items-center gap-2 py-3.5 px-7 text-sm font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
                >
                  <span>Contact Support</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 6. Simple Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-sm text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">CareFlow</span>
            <span aria-hidden="true">·</span>
            <span>Customer Support Portal</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a href="#help-topics" className="hover:text-slate-900 transition-colors">
              Help Topics
            </a>
            <button
              type="button"
              onClick={() =>
                scrollToAssistantAndStart('I want to speak with support.', 'human_root')
              }
              className="hover:text-slate-900 transition-colors cursor-pointer"
            >
              Contact Support
            </button>
            <span className="text-slate-400">
              &copy; {new Date().getFullYear()} CareFlow. All rights reserved.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

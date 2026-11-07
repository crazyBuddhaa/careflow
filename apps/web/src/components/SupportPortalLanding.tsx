'use client';

import React, { useMemo, useState } from 'react';
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
  Search,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';
import type {
  ApiResponse,
  BusinessPortalConfig,
  PortalAccentTheme,
  PortalIconKey,
  PortalKnowledgePreviewItem,
} from '@careflow/shared';
import {
  GuidedSupportPreview,
  getReplyForNode,
  type ChatTurn,
} from '@/components/GuidedSupportPreview';
import { PortalClaimsWidget } from '@/components/PortalClaimsWidget';
import { getDefaultPortalTemplateConfig } from '@/config/business-portals';

const ICON_MAP: Record<PortalIconKey, React.ComponentType<{ className?: string }>> = {
  wallet: Wallet,
  compass: Compass,
  'user-check': UserCheck,
  'help-circle': HelpCircle,
};

const THEME_CLASSES: Record<
  PortalAccentTheme,
  {
    primaryBtn: string;
    eyebrow: string;
    iconBox: string;
    iconHover: string;
  }
> = {
  'blue-teal': {
    primaryBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
    eyebrow: 'text-teal-700',
    iconBox: 'bg-teal-50 text-teal-700',
    iconHover: 'group-hover:bg-blue-600 group-hover:text-white',
  },
  'teal-slate': {
    primaryBtn: 'bg-teal-700 hover:bg-teal-800 text-white',
    eyebrow: 'text-teal-800',
    iconBox: 'bg-teal-50 text-teal-800',
    iconHover: 'group-hover:bg-teal-700 group-hover:text-white',
  },
  'indigo-sky': {
    primaryBtn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    eyebrow: 'text-indigo-700',
    iconBox: 'bg-indigo-50 text-indigo-700',
    iconHover: 'group-hover:bg-indigo-600 group-hover:text-white',
  },
};

const HOW_IT_WORKS_STEPS = [
  {
    step: '01',
    title: 'Choose or type your question',
    description:
      'Pick a help topic card, select a guided conversation prompt, or type a natural-language question.',
  },
  {
    step: '02',
    title: 'Get grounded answers immediately',
    description:
      'Receive answers sourced strictly from approved FAQs, published help articles, and diagnostic steps.',
  },
  {
    step: '03',
    title: 'Escalate to human support',
    description:
      'Send unresolved enquiries directly to our support specialists with your conversation context attached.',
  },
];

export interface SupportPortalLandingProps {
  portalConfig?: BusinessPortalConfig;
}

export function SupportPortalLanding({
  portalConfig = getDefaultPortalTemplateConfig(),
}: SupportPortalLandingProps) {
  const { branding, chatbot, escalation, categories, faqs, publishedKnowledge } = portalConfig;
  const theme = THEME_CLASSES[branding.accentTheme] ?? THEME_CLASSES['blue-teal'];

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

  // Knowledge Base Reader & Filtering State
  const [articleQuery, setArticleQuery] = useState('');
  const [selectedArticleCat, setSelectedArticleCat] = useState<string>('all');
  const [activeArticle, setActiveArticle] = useState<PortalKnowledgePreviewItem | null>(null);

  // Human Support Escalation Form State
  const [escalationFormOpen, setEscalationFormOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custRef, setCustRef] = useState('');
  const [escCategory, setEscCategory] = useState(categories[0]?.title ?? 'General Support');
  const [escSubject, setEscSubject] = useState('');
  const [escMessage, setEscMessage] = useState('');
  const [submittingEscalation, setSubmittingEscalation] = useState(false);
  const [escalationError, setEscalationError] = useState<string | null>(null);
  const [escalationTicket, setEscalationTicket] = useState<{
    conversationId: string;
    assignedAgentName: string | null;
  } | null>(null);

  const articleCategories = useMemo(() => {
    const unique = new Set<string>();
    for (const art of publishedKnowledge) {
      if (art.category) unique.add(art.category);
    }
    return Array.from(unique);
  }, [publishedKnowledge]);

  const filteredArticles = useMemo(() => {
    const q = articleQuery.trim().toLowerCase();
    return publishedKnowledge.filter((art) => {
      if (selectedArticleCat !== 'all' && art.category !== selectedArticleCat) {
        return false;
      }
      if (!q) return true;
      const hay = `${art.title} ${art.summary} ${art.content ?? ''} ${(art.tags ?? []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [publishedKnowledge, articleQuery, selectedArticleCat]);

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

  function openEscalationForm(suggestedTopic?: string) {
    if (suggestedTopic) {
      setEscCategory(suggestedTopic);
    }
    setEscalationTicket(null);
    setEscalationFormOpen(true);
    window.setTimeout(() => {
      const contactEl = document.getElementById('contact-support');
      contactEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
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

  function handleAppendTurns(newTurns: ChatTurn[]) {
    setTurns((prev) => [...prev, ...newTurns]);
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

  async function handleSubmitEscalation(event: React.FormEvent) {
    event.preventDefault();
    setSubmittingEscalation(true);
    setEscalationError(null);

    const transcriptSummary = turns
      .slice(-6)
      .map((t) => `${t.sender === 'customer' ? 'Customer' : 'Assistant'}: ${t.text}`)
      .join(' | ');

    try {
      const res = await fetch(
        `/api/portal/${encodeURIComponent(portalConfig.slug)}/escalate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: custName,
            customerEmail: custEmail,
            customerExternalRef: custRef,
            category: escCategory,
            subject: escSubject,
            message: escMessage,
            transcriptSummary,
          }),
        }
      );

      const body = (await res.json()) as ApiResponse<{
        conversationId: string;
        assignedAgentName: string | null;
      }>;

      if (!body.ok) {
        setEscalationError(body.error.message);
        return;
      }

      setEscalationTicket(body.data);
      setCustName('');
      setCustEmail('');
      setCustRef('');
      setEscSubject('');
      setEscMessage('');
    } catch {
      setEscalationError('Unable to submit your support request right now.');
    } finally {
      setSubmittingEscalation(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Draft / Private Preview Banner for Unpublished Portals */}
      {portalConfig.onboardingStatus && portalConfig.onboardingStatus !== 'published' && (
        <div className="bg-amber-950 text-amber-100 border-b border-amber-800/70 px-6 py-2.5 text-xs">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
              <span className="font-bold uppercase tracking-wider text-amber-300">
                Private Preview Mode
              </span>
              <span className="text-amber-100/90">
                — This support portal is currently in draft status ({portalConfig.onboardingStatus.replace(/_/g, ' ')}) and has not been published yet.
              </span>
            </div>
            <Link
              href="/admin"
              className="font-bold text-amber-300 hover:text-white underline underline-offset-4 whitespace-nowrap"
            >
              Return to Onboarding Dashboard &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* 1. Navigation — Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          {/* Zone 1: Business Portal Brand Logo & Wordmark */}
          <a
            href="#top"
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={`${branding.displayName} logo`}
                className="h-8 w-8 rounded-lg object-contain border border-slate-200/70 bg-white p-0.5"
              />
            )}
            <span>{branding.displayName}</span>
          </a>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Support Portal Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600"
          >
            <a
              href="#help-topics"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Help Topics
            </a>
            {publishedKnowledge.length > 0 && (
              <a
                href="#knowledge-base"
                className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Knowledge Base
              </a>
            )}
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

          {/* Zone 3: Single Primary Action (+ Mobile Menu Button) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => scrollToAssistantAndStart()}
              style={branding.primaryColor ? { backgroundColor: branding.primaryColor } : undefined}
              className={`py-2.5 px-5 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${theme.primaryBtn}`}
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
            {publishedKnowledge.length > 0 && (
              <a
                href="#knowledge-base"
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 hover:text-slate-900"
              >
                Knowledge Base
              </a>
            )}
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
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Left Column: Customer Proposition & Actions */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6"
              >
                <p
                  style={branding.secondaryColor ? { color: branding.secondaryColor } : undefined}
                  className={`text-xs font-semibold ${theme.eyebrow}`}
                >
                  {branding.portalSubtitle}
                </p>

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
                    style={branding.primaryColor ? { backgroundColor: branding.primaryColor } : undefined}
                    className={`inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${theme.primaryBtn}`}
                  >
                    <MessageSquareText className="w-4 h-4" aria-hidden="true" />
                    <span>{portalConfig.primaryCtaLabel}</span>
                  </button>

                  <a
                    href="#help-topics"
                    className="inline-flex items-center gap-2 py-3 px-6 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>{portalConfig.secondaryCtaLabel}</span>
                  </a>
                </div>

                {portalConfig.supportHours && (
                  <p className="mt-6 text-xs text-slate-500">
                    Human support coverage: {portalConfig.supportHours}
                  </p>
                )}
              </motion.div>

              {/* Right Column: Interactive Natural-Language + Guided Chatbot */}
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
                  onAppendTurns={handleAppendTurns}
                  onRequestEscalation={openEscalationForm}
                  businessSlug={portalConfig.slug}
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
              <p className={`text-xs font-semibold ${theme.eyebrow}`}>Help Topics</p>
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
                    className="group text-left rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 hover:border-blue-600/60 hover:shadow-sm transition-all duration-150 flex flex-col justify-between gap-6 cursor-pointer"
                  >
                    <div>
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors duration-150 ${theme.iconBox} ${theme.iconHover}`}
                      >
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

        {/* 4. Published Knowledge Base Browser */}
        {publishedKnowledge.length > 0 && (
          <section
            id="knowledge-base"
            className="py-16 lg:py-20 bg-white border-t border-slate-200/80 scroll-mt-16"
          >
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="max-w-2xl">
                  <p className={`text-xs font-semibold ${theme.eyebrow}`}>Published Guides</p>
                  <h2 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                    {branding.displayName} Knowledge Base
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Read step-by-step documentation published by the {branding.displayName} team.
                  </p>
                </div>

                {/* Search Input */}
                <div className="w-full lg:w-80 relative">
                  <Search
                    className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={articleQuery}
                    onChange={(e) => setArticleQuery(e.target.value)}
                    placeholder="Search guides..."
                    aria-label="Search published guides"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Interactive Category Filter Buttons */}
              {articleCategories.length > 1 && (
                <div className="mt-6 inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSelectedArticleCat('all')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      selectedArticleCat === 'all'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Guides
                  </button>
                  {articleCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedArticleCat(cat)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        selectedArticleCat === cat
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              {/* Active Article Reader */}
              {activeArticle && (
                <div className="mt-8 rounded-2xl border border-blue-200 bg-slate-50/70 p-6 sm:p-8 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        {activeArticle.category}
                        {activeArticle.tags && activeArticle.tags.length > 0 && (
                          <> · {activeArticle.tags.join(' · ')}</>
                        )}
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-slate-900">
                        {activeArticle.title}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveArticle(null)}
                      aria-label="Close article"
                      className="p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    {activeArticle.summary}
                  </p>
                  {activeArticle.content && (
                    <div className="pt-4 border-t border-slate-200/80 text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                      {activeArticle.content}
                    </div>
                  )}
                </div>
              )}

              {/* Filtered Articles Grid */}
              {filteredArticles.length === 0 ? (
                <div className="mt-8 py-8 text-center border-t border-slate-100">
                  <p className="text-sm text-slate-500">
                    No published guides match &ldquo;{articleQuery}&rdquo;. Try another keyword or
                    ask in the support assistant above.
                  </p>
                </div>
              ) : (
                <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredArticles.map((art) => (
                    <div
                      key={art.slug}
                      className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between gap-4"
                    >
                      <div>
                        <p className="text-xs text-slate-500">{art.category}</p>
                        <h3 className="mt-1.5 text-base font-bold text-slate-900">
                          {art.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                          {art.summary}
                        </p>
                      </div>
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setActiveArticle(art)}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Read Full Guide</span>
                        </button>
                        {art.tags && art.tags.length > 0 && (
                          <span className="text-xs text-slate-400 font-mono truncate max-w-[180px]">
                            {art.tags.join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 5. How Support Works */}
        <section
          id="how-it-works"
          className="py-16 lg:py-24 bg-slate-50 border-y border-slate-200/80 scroll-mt-16"
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl">
              <p className={`text-xs font-semibold ${theme.eyebrow}`}>How It Works</p>
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
                  className="rounded-2xl border border-slate-200/80 bg-white p-7 flex flex-col justify-between gap-4"
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

        {/* 6. Configurable Business FAQs */}
        {faqs.length > 0 && (
          <section
            id="faqs"
            className="py-16 lg:py-20 bg-white scroll-mt-16 border-b border-slate-200/80"
          >
            <div className="max-w-4xl mx-auto px-6">
              <p className={`text-xs font-semibold ${theme.eyebrow}`}>Common Questions</p>
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

        {/* 7. Human Support & Escalation Submission Section */}
        <section id="contact-support" className="py-16 lg:py-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6 space-y-8">
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

              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEscalationFormOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 py-3.5 px-7 text-sm font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>
                    {escalationFormOpen ? 'Hide Support Form' : escalation.ctaLabel}
                  </span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Ticket Submitted Confirmation */}
            {escalationTicket && (
              <div className="rounded-2xl border border-teal-200 bg-white p-7 space-y-3">
                <div className="flex items-center gap-2.5 text-teal-800">
                  <CheckCircle2 className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
                  <h3 className="text-lg font-bold text-slate-900">
                    Enquiry routed to {branding.displayName} human support
                  </h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">
                  Reference ID:{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {escalationTicket.conversationId}
                  </span>
                  {escalationTicket.assignedAgentName && (
                    <>
                      {' '}
                      · Assigned specialist:{' '}
                      <span className="font-semibold text-slate-900">
                        {escalationTicket.assignedAgentName}
                      </span>
                    </>
                  )}
                  . Your guided support transcript has been attached so you won&apos;t need to
                  repeat your steps.
                </p>
              </div>
            )}

            {/* Live Escalation Form */}
            {escalationFormOpen && !escalationTicket && (
              <form
                onSubmit={handleSubmitEscalation}
                className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 space-y-5"
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Send Enquiry to {branding.displayName} Support
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      Your recent conversation turns are attached automatically for our team.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEscalationFormOpen(false)}
                    aria-label="Close support form"
                    className="p-1.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="esc-name"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Your Name
                    </label>
                    <input
                      id="esc-name"
                      type="text"
                      required
                      value={custName}
                      onChange={(e) => setCustName(e.target.value)}
                      placeholder="Full name"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="esc-email"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Email Address
                    </label>
                    <input
                      id="esc-email"
                      type="email"
                      required
                      value={custEmail}
                      onChange={(e) => setCustEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="esc-cat"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Topic Category
                    </label>
                    <select
                      id="esc-cat"
                      value={escCategory}
                      onChange={(e) => setEscCategory(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.title}>
                          {c.title}
                        </option>
                      ))}
                      <option value="General Support">General Support</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="esc-ref"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Account / Order / Payment Reference{' '}
                      <span className="font-normal text-slate-400">(optional)</span>
                    </label>
                    <input
                      id="esc-ref"
                      type="text"
                      value={custRef}
                      onChange={(e) => setCustRef(e.target.value)}
                      placeholder="e.g., TRX-882910 or Order ID"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-mono text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="esc-subject"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Short Summary
                    </label>
                    <input
                      id="esc-subject"
                      type="text"
                      required
                      value={escSubject}
                      onChange={(e) => setEscSubject(e.target.value)}
                      placeholder="Briefly describe what you need help with"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label
                      htmlFor="esc-message"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Details for Our Support Team
                    </label>
                    <textarea
                      id="esc-message"
                      rows={4}
                      required
                      value={escMessage}
                      onChange={(e) => setEscMessage(e.target.value)}
                      placeholder="Include any helpful details so a human specialist can assist right away..."
                      className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                  </div>
                </div>

                {escalationError && (
                  <p role="alert" className="text-xs font-semibold text-red-700">
                    {escalationError}
                  </p>
                )}

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setEscalationFormOpen(false)}
                    className="py-2 px-4 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingEscalation}
                    className={`py-2.5 px-6 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer ${theme.primaryBtn}`}
                  >
                    {submittingEscalation ? 'Sending...' : 'Submit to Human Support'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        <PortalClaimsWidget
          slug={portalConfig.slug}
          displayName={branding.displayName}
        />
      </main>

      {/* 8. Portal Footer — Includes Powered by CareFlow link back to central platform */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-sm text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-slate-900">{branding.displayName}</span>
            <span aria-hidden="true">·</span>
            <span>Customer Support Center</span>
            <span aria-hidden="true">·</span>
            <Link href="/" className="text-slate-500 hover:text-blue-600 transition-colors">
              Powered by CustomCare
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <a href="#help-topics" className="hover:text-slate-900 transition-colors">
              Help Topics
            </a>
            <button
              type="button"
              onClick={() => openEscalationForm()}
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

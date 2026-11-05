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
  MessageSquareText,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';
import {
  CAREFLOW_NAME,
  CUSTOMCARE_BRAND_WORDMARK,
  CUSTOMCARE_LOGO_ICON_URL,
} from '@careflow/shared';

type DemoIndustryId = 'fintech' | 'ecommerce' | 'software';

interface DemoScenarioPrompt {
  id: string;
  customerQuestion: string;
  resolutionStage: string;
  matchedSource: string;
  assistantReply: string;
  specialistSummary: string;
  outcomeNote: string;
}

interface DemoIndustryScenario {
  id: DemoIndustryId;
  label: string;
  companyExample: string;
  portalDomain: string;
  summary: string;
  prompts: DemoScenarioPrompt[];
}

const DEMO_SCENARIOS: DemoIndustryScenario[] = [
  {
    id: 'fintech',
    label: 'Fintech & Payments',
    companyExample: 'Aurelia Pay',
    portalDomain: 'aureliapay.getcustomcare.xyz',
    summary: 'Resolve payment confirmation, payout schedules, and account verification without queue bottlenecks.',
    prompts: [
      {
        id: 'fin-1',
        customerQuestion: 'I sent a bank transfer 10 minutes ago—why hasn’t my balance updated?',
        resolutionStage: 'Guided Troubleshooting + Verified FAQ',
        matchedSource: 'Verifying Transfer References & Settlement Windows',
        assistantReply:
          'Standard bank transfers settle within 15 minutes when your payment reference matches your Aurelia Pay account ID. Please check your receipt reference—if it has been over 15 minutes or the reference was omitted, we can pass your receipt straight to our payments desk.',
        specialistSummary: 'Resolved automatically in self-service · No ticket needed unless reference mismatched.',
        outcomeNote: 'Deflects routine transfer status checks while flagging genuine mismatches fast.',
      },
      {
        id: 'fin-2',
        customerQuestion: 'I forgot to include my reference code on transfer #TXN-4082. Can someone help?',
        resolutionStage: 'Context-Ready Human Handoff',
        matchedSource: 'Missing Reference Escalation Rule',
        assistantReply:
          'I have prepared your request for a Payment Reconciliation Specialist with reference #TXN-4082 attached. Confirm your contact email below and our team will credit your account once verified.',
        specialistSummary:
          'Topic: Deposit Reconciliation · Ref: #TXN-4082 · Prior check: Missing transfer reference confirmed.',
        outcomeNote: 'Specialists receive the exact transaction reference on the very first message.',
      },
      {
        id: 'fin-3',
        customerQuestion: 'Which currency or stock should I invest my balance in this month?',
        resolutionStage: 'Policy Scope Protection',
        matchedSource: 'Out-of-Scope Rule · Financial & Investment Advice',
        assistantReply:
          'I can help with Aurelia Pay transfers, card controls, payouts, and account verification, but I cannot provide investment or financial advice. Would you like help with an account or payment question instead?',
        specialistSummary: 'Polite boundary response · Zero invented policies or compliance risk.',
        outcomeNote: 'Keeps every automated answer strictly inside your approved business scope.',
      },
    ],
  },
  {
    id: 'ecommerce',
    label: 'E-Commerce & Retail',
    companyExample: 'Northstar Goods',
    portalDomain: 'northstar.getcustomcare.xyz',
    summary: 'Turn "Where is my order?", size exchanges, and invoice requests into effortless self-service.',
    prompts: [
      {
        id: 'eco-1',
        customerQuestion: 'How do I exchange a jacket I received yesterday for a medium?',
        resolutionStage: 'Published Help Article',
        matchedSource: '30-Day Prepaid Exchanges & Returns Guide',
        assistantReply:
          'Unworn items in original packaging qualify for a free size exchange within 30 days of delivery. Open your Order Summary, select Start Exchange, and print your prepaid courier label—your replacement ships as soon as the parcel is scanned.',
        specialistSummary: 'Answered immediately from published return policy · Zero wait time for customer.',
        outcomeNote: 'Gives shoppers instant confidence to complete exchanges without emailing support.',
      },
      {
        id: 'eco-2',
        customerQuestion: 'Order #NS-9184 arrived with a damaged Ceramic Vase inside.',
        resolutionStage: 'Context-Ready Human Handoff',
        matchedSource: 'Damaged Parcel Fulfillment Rule',
        assistantReply:
          'I am sorry your item arrived damaged. I have routed Order #NS-9184 to our Fulfillment Specialists so we can arrange an immediate replacement—no need to repeat your order details.',
        specialistSummary:
          'Topic: Damaged Shipment · Order: #NS-9184 · Item: Ceramic Vase · Priority queue: Fulfillment Desk.',
        outcomeNote: 'Routes urgent fulfillment issues straight to the right specialist with order context.',
      },
      {
        id: 'eco-3',
        customerQuestion: 'Where can I download a VAT invoice for my company purchase?',
        resolutionStage: 'Verified FAQ',
        matchedSource: 'Downloading PDF Order & VAT Invoices',
        assistantReply:
          'Every completed order includes a downloadable PDF VAT invoice inside Account → Order History. If you need a company tax ID amended on an existing invoice, our billing desk can update it for you.',
        specialistSummary: 'Instant self-service resolution from approved billing FAQ.',
        outcomeNote: 'Eliminates repetitive invoice copy requests from your daily support inbox.',
      },
    ],
  },
  {
    id: 'software',
    label: 'Software & Digital Services',
    companyExample: 'Veloce Cloud',
    portalDomain: 'veloce.getcustomcare.xyz',
    summary: 'Guide users through product setup, team permissions, and billing questions around the clock.',
    prompts: [
      {
        id: 'saas-1',
        customerQuestion: 'Why is the "Publish Project" button disabled in my workspace?',
        resolutionStage: 'Guided Troubleshooting Flow',
        matchedSource: 'Project Publishing Checklist',
        assistantReply:
          'Let’s check two quick items: (1) Confirm your workspace role is Editor or Admin, and (2) Verify a custom domain or staging target is selected in Project Settings. Completing both unlocks Publish Project immediately.',
        specialistSummary: 'Step-by-step product diagnostic completed in seconds.',
        outcomeNote: 'Walks users through product configuration checks before a ticket is ever filed.',
      },
      {
        id: 'saas-2',
        customerQuestion: 'We need to migrate 45 seats to annual invoicing with a purchase order.',
        resolutionStage: 'Context-Ready Human Handoff',
        matchedSource: 'Enterprise Billing & Annual Plan Handoff',
        assistantReply:
          'Our Account Billing team handles annual purchase orders for 25+ seats. I have attached your 45-seat migration request so a billing specialist can send your annual quote right away.',
        specialistSummary:
          'Topic: Annual PO Upgrade · Volume: 45 seats · Routed to: Account & Billing Specialists.',
        outcomeNote: 'Captures high-value expansion requests cleanly with seat count attached.',
      },
      {
        id: 'saas-3',
        customerQuestion: 'How do I remove a former contractor and revoke their active session?',
        resolutionStage: 'Published Help Article',
        matchedSource: 'Managing Team Members & Session Access',
        assistantReply:
          'Open Settings → Team Members, select the user, and click Revoke Access. Their active sessions end immediately while their historical project activity remains intact for your audit log.',
        specialistSummary: 'Answered directly from verified security documentation.',
        outcomeNote: 'Delivers clear, accurate security steps when customers need fast reassurance.',
      },
    ],
  },
];

const CORE_FEATURES = [
  {
    title: 'Branded Customer Support Portals',
    description:
      'Launch a polished support center on your own CustomCare subdomain with your company name, accent theme, welcome headline, and support hours.',
    icon: Globe,
  },
  {
    title: 'Verified Knowledge Base & FAQs',
    description:
      'Organize help articles and canonical Q&As by topic category. Publish updates once and keep both your portal and assistant in sync.',
    icon: BookOpen,
  },
  {
    title: 'Step-by-Step Troubleshooting',
    description:
      'Build clear diagnostic flows for recurring payment, order, or product issues so customers solve routine problems on the spot.',
    icon: GitBranch,
  },
  {
    title: 'Strict Topic & Voice Guardrails',
    description:
      'Choose what your assistant answers, what it politely declines, and how it speaks—so it never guesses or invents company policies.',
    icon: ShieldCheck,
  },
  {
    title: 'Context-Rich Specialist Inbox',
    description:
      'When a customer requests human help, your team receives their topic, reference ID, and conversation transcript in one unified queue.',
    icon: MessageSquareText,
  },
  {
    title: 'Specialist Routing & Live Metrics',
    description:
      'Assign specialists by expertise, manage real-time availability, and track top enquiry categories and resolution performance.',
    icon: BarChart3,
  },
];

const LAUNCH_STEPS = [
  {
    step: '01',
    title: 'Customize your brand & portal',
    description:
      'Set your company name, CustomCare subdomain, visual theme, welcome message, and assistant tone in a guided setup flow.',
  },
  {
    step: '02',
    title: 'Add your top answers & checklists',
    description:
      'Publish the FAQs, help guides, and step-by-step troubleshooting procedures your customers ask about every day.',
  },
  {
    step: '03',
    title: 'Share your portal & resolve faster',
    description:
      'Customers get instant, accurate answers 24/7—and your team handles complex requests from one organized CustomCare inbox.',
  },
];

const BUYER_FAQS = [
  {
    id: 'faq-1',
    question: 'How quickly can we launch a CustomCare portal for our customers?',
    answer:
      'You can create your workspace and launch a live, branded customer support portal in minutes. CustomCare sets up your starter categories, welcome experience, and assistant immediately so you can refine articles and FAQs at your own pace.',
  },
  {
    id: 'faq-2',
    question: 'Will the assistant ever make up policies, prices, or promises?',
    answer:
      'No. CustomCare prioritizes your approved FAQs, published help articles, and step-by-step procedures first, and enforces your out-of-scope topic rules so unrelated or sensitive questions are declined cleanly rather than guessed.',
  },
  {
    id: 'faq-3',
    question: 'What happens when a customer needs a real person on our team?',
    answer:
      'At any point, customers can request human support. CustomCare captures their name, email, order or transaction reference, selected category, and recent conversation steps—placing the complete thread directly into your workspace inbox.',
  },
  {
    id: 'faq-4',
    question: 'Can we update our branding, articles, and assistant rules anytime?',
    answer:
      'Yes. Sign in to your CustomCare workspace anytime to publish or unpublish articles, update FAQs, adjust troubleshooting steps, refine assistant tone, and reply to customer conversations with zero engineering work.',
  },
];

export function CentralPlatformHome() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedIndustry, setSelectedIndustry] = useState<DemoIndustryId>('fintech');
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [openFaqId, setOpenFaqId] = useState<string | null>(BUYER_FAQS[0].id);

  const activeScenario =
    DEMO_SCENARIOS.find((item) => item.id === selectedIndustry) ?? DEMO_SCENARIOS[0];
  const activePrompt =
    activeScenario.prompts[selectedPromptIndex] ?? activeScenario.prompts[0];

  function handleSelectIndustry(nextId: DemoIndustryId) {
    setSelectedIndustry(nextId);
    setSelectedPromptIndex(0);
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 exact zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80">
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
            aria-label="CustomCare Navigation"
            className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600"
          >
            <a
              href="#what-we-do"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              What We Do
            </a>
            <a
              href="#interactive-demo"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Live Demo
            </a>
            <a
              href="#features"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Features
            </a>
            <a
              href="#faq"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              FAQ
            </a>
            <Link
              href="/login"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </Link>
          </nav>

          {/* Zone 3: 1 Primary Action (+ mobile menu toggle) */}
          <div className="flex items-center gap-3 shrink-0">
            <Link
              href="/onboarding"
              className="py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Start Your Portal
            </Link>

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
            aria-label="Mobile Navigation"
            className="md:hidden border-t border-slate-100 bg-white px-6 py-4 space-y-3 text-sm font-semibold text-slate-700"
          >
            <a
              href="#what-we-do"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              What We Do
            </a>
            <a
              href="#interactive-demo"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              Live Demo
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              Features
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              FAQ
            </a>
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 hover:text-slate-900"
            >
              Sign In
            </Link>
          </nav>
        )}
      </header>

      <main className="flex-1">
        {/* 1. Hero Section — Clear Pitch & Visual Outcome */}
        <section className="bg-gradient-to-b from-white via-slate-50/70 to-slate-50 border-b border-slate-200/80">
          <div className="max-w-7xl mx-auto px-6 pt-12 pb-16 lg:pt-20 lg:pb-24">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6"
              >
                <p className="text-xs font-semibold text-teal-700">
                  Customer Support Portals &amp; Guided Resolution for Modern Businesses
                </p>

                <h1 className="mt-4 text-4xl sm:text-5xl lg:text-[3.4rem] font-bold tracking-tight text-slate-900 leading-[1.08] text-balance">
                  Turn repetitive customer questions into instant, trusted answers.
                </h1>

                <p className="mt-6 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                  {CAREFLOW_NAME} gives your business a branded customer support portal, an
                  assistant grounded strictly in your approved knowledge, and a specialist inbox
                  that receives full context whenever human care is needed.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <span>Launch Your Portal</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>

                  <a
                    href="#interactive-demo"
                    className="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <span>Try Interactive Demo</span>
                  </a>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Launch your branded portal in minutes</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Answers sourced only from your rules</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>Seamless handoff to your team</span>
                  </div>
                </div>
              </motion.div>

              {/* Right Column: Editorial Hero Photography + Live Resolution Card */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-6"
              >
                <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-slate-900 shadow-sm">
                  <div className="aspect-[4/3] w-full overflow-hidden">
                    <img
                      src="/images/careflow-hero.jpg"
                      alt="Customer support director welcoming customers in a sunlit CustomCare studio"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="bg-gradient-to-t from-slate-950 via-slate-950/90 to-slate-900/75 p-6 sm:p-7 text-white border-t border-white/10">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-teal-300 font-semibold">
                      <span>How {CAREFLOW_NAME} Works in Every Conversation</span>
                      <span className="font-mono text-slate-300">24/7 Self-Service + Human Care</span>
                    </div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="rounded-xl bg-white/10 p-3 border border-white/10">
                        <p className="font-mono text-teal-300">01 · Ask</p>
                        <p className="mt-1 text-slate-100 font-semibold">
                          Customer asks about an order, payment, or account
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/10 p-3 border border-white/10">
                        <p className="font-mono text-teal-300">02 · Guide</p>
                        <p className="mt-1 text-slate-100 font-semibold">
                          {CAREFLOW_NAME} answers from your verified FAQs &amp; steps
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/10 p-3 border border-white/10">
                        <p className="font-mono text-teal-300">03 · Care</p>
                        <p className="mt-1 text-slate-100 font-semibold">
                          Complex cases reach your team with full context attached
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* 2. Clear Explanation of What CareFlow Does (Visual Editorial Pillars) */}
        <section id="what-we-do" className="py-16 lg:py-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold text-teal-700">What {CAREFLOW_NAME} Does</p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
                Stop losing customer trust to slow inboxes and guesswork chatbots.
              </h2>
              <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">
                Most support teams face an impossible choice: drown in the same repetitive emails
                every day, or deploy a generic bot that frustrates customers with vague answers.{' '}
                {CAREFLOW_NAME} solves both—combining instant self-service accuracy with effortless
                human handoff.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Visual Story 1: Customer Self-Service Clarity */}
              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
                  <img
                    src="/images/careflow-customer-clarity.jpg"
                    alt="Customer getting clear, immediate support answers"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-7 sm:p-8 flex-1 flex flex-col justify-between space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-blue-600">
                      For Your Customers · Instant Clarity
                    </p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                      One branded destination where customers find real answers immediately
                    </h3>
                    <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
                      Give your customers a clean, welcoming support portal tailored to your brand.
                      They can browse help topics, search your published guides, or walk through
                      interactive troubleshooting steps at any hour—without waiting in a queue.
                    </p>
                  </div>

                  <ul className="pt-4 border-t border-slate-100 space-y-2.5 text-sm text-slate-700">
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                      <span>Dedicated support address styled to your company</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                      <span>Natural-language Q&amp;A grounded in your approved articles</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                      <span>Guided checklists that solve everyday issues on the spot</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Visual Story 2: Empowered Specialist Team */}
              <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                <div className="aspect-[16/9] w-full overflow-hidden bg-slate-100">
                  <img
                    src="/images/careflow-team-care.jpg"
                    alt="Support specialists collaborating with complete customer context"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-7 sm:p-8 flex-1 flex flex-col justify-between space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-teal-700">
                      For Your Team · Focused Human Care
                    </p>
                    <h3 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                      Your specialists step in only when needed—with every detail ready
                    </h3>
                    <p className="mt-3 text-sm sm:text-base text-slate-600 leading-relaxed">
                      Because {CAREFLOW_NAME} resolves routine enquiries upfront, your team spends
                      its energy on high-impact conversations. Every escalated request arrives with
                      the customer&apos;s category, reference number, and prior steps already attached.
                    </p>
                  </div>

                  <ul className="pt-4 border-t border-slate-100 space-y-2.5 text-sm text-slate-700">
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                      <span>Zero back-and-forth asking customers to repeat their issue</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                      <span>Update an FAQ once to prevent tomorrow’s repeat tickets</span>
                    </li>
                    <li className="flex items-center gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                      <span>Clear visibility into top customer topics and team workload</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Interactive Live Product Demo ("See CareFlow in Action") */}
        <section
          id="interactive-demo"
          className="py-16 lg:py-24 bg-white border-y border-slate-200/80 scroll-mt-16"
        >
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold text-teal-700">Interactive Product Walkthrough</p>
                <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
                  See how {CAREFLOW_NAME} handles real customer questions
                </h2>
                <p className="mt-3 text-base text-slate-600 leading-relaxed">
                  Select an industry below and click any customer question to see how{' '}
                  {CAREFLOW_NAME} answers from verified knowledge, protects your policy scope, and
                  prepares human handoffs.
                </p>
              </div>

              {/* Industry Switcher */}
              <div
                role="tablist"
                aria-label="Select business industry example"
                className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start"
              >
                {DEMO_SCENARIOS.map((scenario) => {
                  const isSelected = scenario.id === selectedIndustry;
                  return (
                    <button
                      key={scenario.id}
                      role="tab"
                      type="button"
                      aria-selected={isSelected}
                      onClick={() => handleSelectIndustry(scenario.id)}
                      className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        isSelected
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {scenario.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left: Sample Customer Prompts */}
              <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 sm:p-7 flex flex-col justify-between space-y-6">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900">
                      Sample Portal: {activeScenario.companyExample}
                    </span>
                    <span className="font-mono text-xs text-blue-600">
                      {activeScenario.portalDomain}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    {activeScenario.summary}
                  </p>

                  <p className="mt-6 text-xs font-semibold text-slate-500">
                    Click a customer message to test:
                  </p>
                  <div className="mt-3 space-y-2.5">
                    {activeScenario.prompts.map((item, idx) => {
                      const active = idx === selectedPromptIndex;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedPromptIndex(idx)}
                          className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                            active
                              ? 'border-blue-600 bg-white text-slate-900 shadow-xs'
                              : 'border-slate-200 bg-white/70 hover:bg-white text-slate-700'
                          }`}
                        >
                          <p className="text-xs font-mono text-slate-400">
                            Scenario 0{idx + 1} · {item.resolutionStage}
                          </p>
                          <p className="mt-1 text-sm font-semibold leading-snug">
                            &ldquo;{item.customerQuestion}&rdquo;
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-600">Want this for your own products?</span>
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
                  >
                    <span>Build Your Portal</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              {/* Right: Live Resolution Inspector */}
              <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 flex flex-col justify-between space-y-6">
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {activeScenario.companyExample} Support Assistant
                      </p>
                      <p className="text-xs text-slate-500">
                        Powered by {CAREFLOW_NAME} · Grounded in {activeScenario.companyExample} policies
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-teal-700">
                      {activePrompt.resolutionStage}
                    </span>
                  </div>

                  {/* Customer Message Bubble */}
                  <div className="flex flex-col items-end">
                    <p className="text-[11px] text-slate-400 mb-1">Customer</p>
                    <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-blue-600 text-white px-4 py-3 text-sm leading-relaxed">
                      {activePrompt.customerQuestion}
                    </div>
                  </div>

                  {/* CareFlow Assistant Reply Bubble */}
                  <div className="flex flex-col items-start">
                    <p className="text-[11px] text-slate-400 mb-1">
                      {CAREFLOW_NAME} · Source: {activePrompt.matchedSource}
                    </p>
                    <div className="max-w-[92%] rounded-2xl rounded-tl-sm bg-slate-100 text-slate-900 px-5 py-4 text-sm leading-relaxed">
                      {activePrompt.assistantReply}
                    </div>
                  </div>
                </div>

                {/* Behind-the-Scenes Value Callout */}
                <div className="rounded-xl border border-teal-200/80 bg-teal-50/50 p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-teal-900">
                    <UserCheck className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                    <span>What your team sees in {CAREFLOW_NAME}</span>
                  </div>
                  <p className="text-xs font-mono text-slate-800">
                    {activePrompt.specialistSummary}
                  </p>
                  <p className="text-xs text-slate-600">{activePrompt.outcomeNote}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 4. Helpful Features Built for Growing Businesses */}
        <section id="features" className="py-16 lg:py-24 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-teal-700">Platform Features</p>
              <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
                Everything you need to run fast, reliable customer support
              </h2>
              <p className="mt-3 text-base text-slate-600 leading-relaxed">
                Every {CAREFLOW_NAME} workspace includes the tools to publish knowledge, guide
                customers automatically, and manage specialist conversations in one place.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {CORE_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="rounded-2xl border border-slate-200 bg-white p-7 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-4">
                      <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <h3 className="text-lg font-bold tracking-tight text-slate-900">
                        {feature.title}
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Side-by-Side Comparison + 3-Step Setup */}
            <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 space-y-6">
                <div>
                  <p className="text-xs font-semibold text-blue-600">Why Businesses Switch</p>
                  <h3 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
                    The {CAREFLOW_NAME} difference
                  </h3>
                </div>

                <div className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
                  <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-400">Traditional Support</p>
                      <p className="mt-1 text-slate-600">
                        Customers wait hours in email queues for simple policy or status answers.
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-teal-700">With {CAREFLOW_NAME}</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        Instant answers 24/7 from your verified FAQs and guided checklists.
                      </p>
                    </div>
                  </div>

                  <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-400">Generic Chatbots</p>
                      <p className="mt-1 text-slate-600">
                        Unpredictable replies that guess policies or trap frustrated customers.
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-teal-700">With {CAREFLOW_NAME}</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        Strict topic rules and one-click handoff to a real specialist anytime.
                      </p>
                    </div>
                  </div>

                  <div className="py-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-400">Disconnected Tools</p>
                      <p className="mt-1 text-slate-600">
                        Customers repeat their order number and issue all over again to agents.
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-teal-700">With {CAREFLOW_NAME}</p>
                      <p className="mt-1 font-semibold text-slate-900">
                        Every reference and troubleshooting step arrives attached in your inbox.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-7 sm:p-8 flex flex-col justify-between space-y-6">
                <div>
                  <p className="text-xs font-semibold text-teal-700">Simple Setup</p>
                  <h3 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
                    Go live in three straightforward steps
                  </h3>

                  <ol className="mt-6 space-y-5">
                    {LAUNCH_STEPS.map((item) => (
                      <li key={item.step} className="flex items-start gap-4">
                        <span className="font-mono tabular-nums text-xs font-bold text-blue-600 bg-blue-50 rounded-lg px-2.5 py-1.5 shrink-0">
                          {item.step}
                        </span>
                        <div>
                          <h4 className="text-base font-bold text-slate-900">{item.title}</h4>
                          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                  <span className="text-xs text-slate-500">
                    No complex setup or custom code required.
                  </span>
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-2 py-2.5 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
                  >
                    <span>Create Your Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Buyer FAQ Section */}
        <section
          id="faq"
          className="py-16 lg:py-24 bg-white border-t border-slate-200/80 scroll-mt-16"
        >
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto">
              <p className="text-xs font-semibold text-teal-700">Common Questions</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
                Everything you need to know before getting started
              </h2>
            </div>

            <div className="mt-10 divide-y divide-slate-200 border-y border-slate-200">
              {BUYER_FAQS.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div key={item.id} className="py-5">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                      className="w-full flex items-center justify-between gap-4 text-left cursor-pointer"
                    >
                      <span className="text-base font-bold text-slate-900">{item.question}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-150 ${
                          isOpen ? 'rotate-180 text-blue-600' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <p className="mt-3 text-sm text-slate-600 leading-relaxed pr-8">
                        {item.answer}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 6. Closing Conversion CTA */}
        <section className="py-16 lg:py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-6">
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-8 py-12 sm:px-12 sm:py-16 text-white grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7">
                <p className="text-xs font-semibold text-teal-300 tracking-wide">
                  Ready When You Are
                </p>
                <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white text-balance">
                  Give your customers faster answers and a better support experience today.
                </h2>
                <p className="mt-4 text-base text-slate-300 leading-relaxed tracking-wide max-w-2xl">
                  Launch your branded {CAREFLOW_NAME} support portal in minutes, organize your key
                  answers once, and keep your team focused on the conversations that matter most.
                </p>
              </div>

              <div className="lg:col-span-5 flex flex-wrap lg:justify-end gap-4">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold text-slate-950 bg-teal-400 hover:bg-teal-300 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300"
                >
                  <span>Start Your Portal</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </Link>

                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 py-3.5 px-6 text-sm font-semibold text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  <span>Sign In</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Clean Platform Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col gap-6 text-sm text-slate-500">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-3">
              <img
                src={CUSTOMCARE_LOGO_ICON_URL}
                alt={CAREFLOW_NAME}
                className="w-7 h-7 rounded-md object-contain bg-white border border-slate-200 p-0.5"
              />
              <span className="font-bold tracking-wider text-slate-900">{CUSTOMCARE_BRAND_WORDMARK}</span>
              <span aria-hidden="true">·</span>
              <span>Smarter Support. Better Experiences.</span>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <a href="#what-we-do" className="hover:text-slate-900 transition-colors">
                What We Do
              </a>
              <a href="#interactive-demo" className="hover:text-slate-900 transition-colors">
                Live Demo
              </a>
              <a href="#features" className="hover:text-slate-900 transition-colors">
                Features
              </a>
              <a href="#faq" className="hover:text-slate-900 transition-colors">
                FAQ
              </a>
              <Link href="/login" className="hover:text-slate-900 transition-colors">
                Sign In
              </Link>
              <Link href="/onboarding" className="hover:text-slate-900 transition-colors">
                Register Account
              </Link>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-400">
            <div className="flex flex-wrap items-center gap-5">
              <Link href="/privacy" className="hover:text-slate-700 transition-colors font-medium">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-slate-700 transition-colors font-medium">
                Terms of Use
              </Link>
              <Link href="/compliance" className="hover:text-slate-700 transition-colors font-medium">
                Security &amp; Compliance Notes
              </Link>
            </div>
            <span>
              &copy; {new Date().getFullYear()} {CAREFLOW_NAME} (EST. 2026) · Tenant-Isolated Customer Support Platform
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

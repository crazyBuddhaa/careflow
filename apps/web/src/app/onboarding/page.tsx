import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Globe, BookOpen, Bot, ShieldCheck } from 'lucide-react';
import { CAREFLOW_NAME } from '@careflow/shared';

export const metadata: Metadata = {
  title: 'Business Onboarding — CareFlow',
  description: 'Learn how business workspaces and dedicated customer portals are structured on CareFlow.',
};

const ONBOARDING_CHECKLIST = [
  {
    title: '01. Dedicated Portal Domain Mapping',
    detail:
      'Each business receives an isolated subdomain (such as businessname.careflow.com) or verified custom hostname resolved server-side.',
    icon: Globe,
  },
  {
    title: '02. Branded Categories, Knowledge & FAQs',
    detail:
      'Configure your organization logo, colours, welcome message, help topics, published articles, and FAQs independently.',
    icon: BookOpen,
  },
  {
    title: '03. Scoped Chatbot & Escalation Rules',
    detail:
      'Define supported vs. restricted topics, troubleshooting procedures, communication style, and human handoff settings.',
    icon: Bot,
  },
  {
    title: '04. Strict Organization Isolation',
    detail:
      'Customers, conversations, knowledge bases, and settings remain strictly isolated per business.',
    icon: ShieldCheck,
  },
];

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
            {CAREFLOW_NAME}
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap"
          >
            Workspace Login
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-14 sm:py-20">
        <p className="text-xs font-semibold text-teal-700">Business Onboarding Architecture</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
          How your business launches on CareFlow
        </h1>
        <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-2xl">
          Self-service business registration is being prepared for an upcoming milestone. Every
          business onboarded onto CareFlow receives a dedicated customer support portal and an
          isolated administration workspace.
        </p>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
          {ONBOARDING_CHECKLIST.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3"
              >
                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </div>
                <h2 className="text-base font-bold text-slate-900">{item.title}</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{item.detail}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Explore a live business portal configuration
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              See how UltimateTechApp’s customer-facing portal operates as a tenant on CareFlow.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/portal/ultimatetechapp"
              className="py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
            >
              View Sample Portal
            </Link>
            <Link
              href="/admin"
              className="py-2.5 px-5 text-sm font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl transition-colors whitespace-nowrap"
            >
              Inspect Admin Workspace
            </Link>
          </div>
        </div>

        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to {CAREFLOW_NAME} Platform</span>
          </Link>
        </div>
      </main>
    </div>
  );
}

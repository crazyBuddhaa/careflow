import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Globe } from 'lucide-react';
import { CAREFLOW_NAME } from '@careflow/shared';
import { getWorkspaceRepository } from '@/lib/knowledge-runtime';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Active Business Support Portals — CareFlow',
  description:
    'Explore independent customer support portals hosted on the CareFlow multi-business platform.',
};

export default async function PortalsDirectoryPage() {
  const repo = await getWorkspaceRepository();
  const portals = await repo.listPublicPortals();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {CAREFLOW_NAME}
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-600">
            <Link href="/" className="hover:text-slate-900 whitespace-nowrap">
              Platform
            </Link>
            <Link href="/admin" className="hover:text-slate-900 whitespace-nowrap">
              Business Admin
            </Link>
            <Link href="/login" className="hover:text-slate-900 whitespace-nowrap">
              Log In
            </Link>
          </nav>

          <Link
            href="/onboarding"
            className="py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            Onboard Business
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-14 sm:py-20">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-teal-700">Multi-Business Portal Directory</p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
              Independent customer support portals
            </h1>
            <p className="mt-3 text-base text-slate-600 leading-relaxed">
              Each organization below runs on an isolated CareFlow workspace with its own branding,
              published knowledge base, FAQs, chatbot instructions, and human escalation queue.
            </p>
          </div>

          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 py-2.5 px-5 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap self-start"
          >
            <span>Provision Another Business</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
          {portals.map((portal) => (
            <div
              key={portal.organizationId}
              className="rounded-2xl border border-slate-200 bg-white p-7 flex flex-col justify-between gap-6"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5 font-mono text-blue-600">
                    <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{portal.verifiedHostname}</span>
                  </span>
                  <span className="font-mono tabular-nums">
                    {portal.publishedArticleCount} articles · {portal.publishedFaqCount} FAQs
                  </span>
                </div>

                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">
                    {portal.displayName}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {portal.welcomeHeadline}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500">{portal.portalSubtitle}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <Link
                  href={`/portal/${portal.slug}`}
                  className="inline-flex items-center gap-2 py-2.5 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
                >
                  <span>Open Customer Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>

                <Link
                  href={`/login?org=${encodeURIComponent(portal.organizationId)}`}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap"
                >
                  Admin Workspace &rarr;
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10">
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

import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CAREFLOW_LOGO_ICON_PATH, CAREFLOW_NAME } from '@careflow/shared';
import { BusinessOnboardingFlow } from '@/components/BusinessOnboardingFlow';

export const metadata: Metadata = {
  title: 'Register Account — CustomCare',
  description:
    'Register as a Business or Support Agent on CustomCare to manage customer support, automate conversations, and collaborate across workspaces.',
};

export default function OnboardingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            <img
              src={CAREFLOW_LOGO_ICON_PATH}
              alt={`${CAREFLOW_NAME} logo`}
              className="w-8 h-8 rounded-lg object-contain"
            />
            <span>.CUSTOMCARE</span>
          </Link>
          <nav className="hidden sm:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <Link href="/#what-we-do" className="hover:text-slate-900 whitespace-nowrap">
              What We Do
            </Link>
            <Link href="/#interactive-demo" className="hover:text-slate-900 whitespace-nowrap">
              Live Demo
            </Link>
            <Link href="/#features" className="hover:text-slate-900 whitespace-nowrap">
              Features
            </Link>
            <Link href="/#faq" className="hover:text-slate-900 whitespace-nowrap">
              FAQ
            </Link>
          </nav>
          <Link
            href="/login"
            className="py-2 px-4 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            Sign In
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 sm:py-16">
        <div className="max-w-2xl mb-10">
          <p className="text-xs font-semibold text-teal-700">
            {CAREFLOW_NAME} Account &amp; Workspace Registration
          </p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
            Register as a Business or Support Agent on CustomCare
          </h1>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            Choose whether you are launching a business support workspace or creating a personal
            Support Agent account. You can always expand to the other role anytime from your web
            dashboard.
          </p>
        </div>

        <BusinessOnboardingFlow />

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-6 text-xs text-slate-500">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to {CAREFLOW_NAME}</span>
          </Link>
          <div className="flex flex-wrap items-center gap-4 font-semibold">
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-900">
              Terms of Use
            </Link>
            <Link href="/compliance" className="hover:text-slate-900">
              Compliance Notes
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

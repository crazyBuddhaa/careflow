import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CAREFLOW_NAME } from '@careflow/shared';
import { BusinessOnboardingFlow } from '@/components/BusinessOnboardingFlow';

export const metadata: Metadata = {
  title: 'Get Started — CustomCare',
  description: 'Launch your branded customer support portal and workspace on CustomCare.',
};

export default function OnboardingPage() {
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
          <p className="text-xs font-semibold text-teal-700">{CAREFLOW_NAME} Workspace Setup</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
            Launch your dedicated support portal on CustomCare
          </h1>
          <p className="mt-3 text-base text-slate-600 leading-relaxed">
            Set up your branded customer support portal, organized knowledge base, and guided
            assistant in minutes.
          </p>
        </div>

        <BusinessOnboardingFlow />

        <div className="mt-10">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Back to {CAREFLOW_NAME}</span>
          </Link>
        </div>
      </main>
    </div>
  );
}

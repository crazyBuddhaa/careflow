import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CAREFLOW_NAME } from '@careflow/shared';
import { WorkspaceLoginForm } from '@/components/WorkspaceLoginForm';

export const metadata: Metadata = {
  title: 'Workspace Sign In — CustomCare',
  description: 'Sign in to manage your business support workspace on CustomCare.',
};

export default function LoginPage() {
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
            href="/onboarding"
            className="py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap shrink-0"
          >
            Get Started
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <Suspense
          fallback={
            <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 space-y-4">
              <div className="h-8 w-48 rounded bg-slate-100 animate-pulse" />
              <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
            </div>
          }
        >
          <WorkspaceLoginForm />
        </Suspense>
      </main>
    </div>
  );
}

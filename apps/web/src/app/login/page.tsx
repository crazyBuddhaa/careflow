import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { CAREFLOW_NAME } from '@careflow/shared';

export const metadata: Metadata = {
  title: 'Workspace Sign In — CareFlow',
  description: 'Sign in to manage your business support workspace on CareFlow.',
};

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8 px-6 py-4">
          <Link href="/" className="text-xl font-bold tracking-tight text-slate-900">
            {CAREFLOW_NAME}
          </Link>
          <Link
            href="/onboarding"
            className="text-sm font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
          >
            New business? Onboard workspace
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          </div>

          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
            Business Workspace Access
          </h1>
          <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
            Sign in as an authorized business administrator to manage your organization&apos;s
            knowledge articles, FAQs, and support categories.
          </p>

          <div className="mt-6 pt-6 border-t border-slate-100 space-y-3">
            <Link
              href="/admin"
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              <span>Open Business Admin Workspace</span>
            </Link>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 leading-relaxed">
              Looking for customer support? Visit your provider&apos;s dedicated CareFlow portal
              (for example,{' '}
              <span className="font-mono text-slate-800">businessname.careflow.com</span>).
            </div>
          </div>

          <div className="mt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Return to {CAREFLOW_NAME} Home</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

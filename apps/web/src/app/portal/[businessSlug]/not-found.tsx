import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function BusinessPortalNotFound() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-xs font-semibold text-teal-700">Support Portal Lookup</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
          Business portal not found
        </h1>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          We could not find an active customer support portal matching this business address.
          Verify the portal URL provided by the business or return to CustomCare.
        </p>
        <div className="mt-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Return to CustomCare Platform</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

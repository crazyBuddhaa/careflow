import React from 'react';
import Link from 'next/link';
import { ShieldCheck, KeyRound, Lock, FileCheck2, Server, ArrowLeft } from 'lucide-react';
import {
  CAREFLOW_NAME,
  CUSTOMCARE_BRAND_WORDMARK,
  CUSTOMCARE_LOGO_ICON_URL,
} from '@careflow/shared';

export default function ComplianceNotesPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-bold tracking-wider text-slate-900">
            <img
              src={CUSTOMCARE_LOGO_ICON_URL}
              alt={CAREFLOW_NAME}
              className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5"
            />
            <span>{CUSTOMCARE_BRAND_WORDMARK}</span>
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-900">
              Terms of Use
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 space-y-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-10 shadow-xs space-y-6">
          <div className="space-y-2 border-b border-slate-200 pb-6">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
              Security Architecture &amp; Regulatory Compliance
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Security, Trust &amp; Compliance Notes
            </h1>
            <p className="text-xs text-slate-500">
              Architectural Controls &amp; Data Governance Standards · Updated November 4, 2026
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 p-5 space-y-2 bg-slate-50/70">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Server className="w-4 h-4 text-teal-600" />
                Zero Cross-Tenant Data Leakage
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Every database query for conversations, messages, customers, knowledge articles, FAQs, saved replies, and invitations is strictly scoped by <code className="bg-white px-1 py-0.5 rounded border border-slate-200">organization_id</code> and verified against active D1 membership.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5 space-y-2 bg-slate-50/70">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <KeyRound className="w-4 h-4 text-blue-600" />
                Single-Use Token &amp; Session Cryptography
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Invitation links, email verification tokens, and password reset tokens are generated using 256-bit cryptographic randomness, stored strictly as SHA-256 hashes, and enforced as single-use and time-limited.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5 space-y-2 bg-slate-50/70">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Lock className="w-4 h-4 text-indigo-600" />
                Immediate Session Revocation
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                When a workspace administrator suspends or revokes an agent, or when an agent voluntarily departs a workspace, all active sessions for that workspace are invalidated immediately in Cloudflare D1.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5 space-y-2 bg-slate-50/70">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                Immutable Security &amp; Workspace Audit Logs
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                All invitations, acceptances, identity links, role changes, suspensions, revocations, voluntary departures, and authentication events are recorded with actor, IP, and timestamp metadata.
              </p>
            </div>
          </div>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed pt-2">
            <h2 className="text-lg font-bold text-slate-900">1. GDPR, UK GDPR, CCPA &amp; NDPA Alignment</h2>
            <p>
              CustomCare enforces data minimization, purpose limitation, and explicit user consent across all onboarding and support workflows. Personal accounts and Business-Managed Agent identities are never linked without verified email ownership and explicit opt-in consent.
            </p>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">2. Channel &amp; Webhook Verification</h2>
            <p>
              Inbound webhooks from Telegram (both the central <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">@getcustomcarebot</code> and dedicated business sub-bots) are authenticated using constant-time secret header verification and idempotency keys to prevent replay attacks and duplicate ticket creation.
            </p>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">3. Vulnerability Disclosure &amp; Contact</h2>
            <p>
              To report a security issue or request a Data Processing Addendum (DPA) for your organization, please contact our security team at <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">security@getcustomcare.xyz</code>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} {CAREFLOW_NAME}. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-slate-900">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-900">Terms of Use</Link>
            <Link href="/compliance" className="font-semibold text-slate-900">Compliance Notes</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Lock, Database, Globe, ArrowLeft } from 'lucide-react';
import {
  CAREFLOW_NAME,
  CUSTOMCARE_BRAND_WORDMARK,
  CUSTOMCARE_LOGO_ICON_URL,
} from '@careflow/shared';

export default function PrivacyPolicyPage() {
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
            <Link href="/terms" className="hover:text-slate-900">
              Terms of Use
            </Link>
            <Link href="/compliance" className="hover:text-slate-900">
              Compliance Notes
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
            <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
              Legal &amp; Data Protection
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              CustomCare Privacy Policy
            </h1>
            <p className="text-xs text-slate-500">
              Effective Date: January 1, 2026 · Last Updated: November 4, 2026
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <Database className="w-4 h-4 text-teal-600" />
                Strict Tenant Isolation
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Each business workspace has isolated customer conversations, knowledge bases, and configuration records.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <Lock className="w-4 h-4 text-blue-600" />
                Encrypted Credentials
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Passwords use scrypt hashing; session, verification, and invitation tokens are SHA-256 hashed at rest.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Consent-Driven Linking
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Agent identities are never merged across businesses without verified email ownership and explicit consent.
              </p>
            </div>
          </div>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">1. Overview &amp; Scope</h2>
            <p>
              This Privacy Policy describes how {CAREFLOW_NAME} (&ldquo;CustomCare&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;us&rdquo;) collects, uses, processes, and safeguards information across our website (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">getcustomcare.xyz</code>), hosted customer support portals, embedded website widgets, and connected messaging integrations including Telegram.
            </p>
            <p>
              CustomCare operates in two distinct capacities under global data protection laws (including GDPR, UK GDPR, CCPA/CPRA, and NDPA):
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Data Controller:</strong> For account registration data of Business Owners, Administrators, and Registered CustomCare Support Agents.
              </li>
              <li>
                <strong>Data Processor / Service Provider:</strong> For customer support enquiries, conversation transcripts, attachments, and Business-Managed Agent memberships processed on behalf of a registered Business Workspace.
              </li>
            </ul>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">2. Information We Collect</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong>Business &amp; Personal Account Data:</strong> Full name, verified email address, password hash (scrypt), optional TOTP multi-factor authentication metadata, business name, industry, country, and website.
              </li>
              <li>
                <strong>Agent Membership &amp; Invitation Data:</strong> Invited agent email address, assigned workspace role, department, granular permissions, single-use invitation token hashes, and membership lifecycle status (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">active</code>, <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">suspended</code>, <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">revoked</code>, <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">departed</code>).
              </li>
              <li>
                <strong>Customer Support Conversations:</strong> Customer name, contact email or messaging identifier (such as Telegram user/chat ID when a customer messages a business bot), support category, conversation messages, and uploaded diagnostic attachments.
              </li>
              <li>
                <strong>Security &amp; Audit Telemetry:</strong> IP address, browser user-agent string, session timestamps, and administrative audit logs required for fraud prevention, rate limiting, and workspace security.
              </li>
            </ul>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">3. Multi-Tenant Data Isolation &amp; AI Guardrails</h2>
            <p>
              Every registered business on CustomCare receives an isolated workspace. Customer enquiries, knowledge base articles, FAQs, troubleshooting procedures, and internal team notes belonging to one business are strictly segregated at the database query layer (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">organization_id</code>) and are never shared with or exposed to other businesses.
            </p>
            <p>
              We do not sell personal or business data to third parties, and we do not use private customer support conversations to train public foundation models.
            </p>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">4. Agent Identity &amp; Workspace Privacy</h2>
            <p>
              CustomCare supports both <strong>Business-Managed Agents</strong> (whose access is scoped exclusively to the inviting business) and <strong>Registered CustomCare Users</strong> (who manage multiple workspaces under one personal account). Even when an agent belongs to multiple workspaces:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Each business administrator can only see and manage their own workspace membership.</li>
              <li>No business can see which other businesses an agent works with.</li>
              <li>Suspending or revoking an agent&apos;s access immediately terminates their sessions for that business without affecting any other workspace.</li>
            </ul>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">5. Data Retention &amp; Your Rights</h2>
            <p>
              Business owners can export, archive, or delete their workspace knowledge and conversation records at any time. Users may request access, correction, portability, or deletion of their personal account data by contacting their workspace administrator or reaching out to CustomCare Data Protection Support at <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">privacy@getcustomcare.xyz</code>.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} {CAREFLOW_NAME}. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="font-semibold text-slate-900">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-slate-900">Terms of Use</Link>
            <Link href="/compliance" className="hover:text-slate-900">Compliance Notes</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

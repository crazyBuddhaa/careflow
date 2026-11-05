import React from 'react';
import Link from 'next/link';
import { FileText, ShieldAlert, CheckCircle2, ArrowLeft } from 'lucide-react';
import {
  CAREFLOW_NAME,
  CUSTOMCARE_BRAND_WORDMARK,
  CUSTOMCARE_LOGO_ICON_URL,
} from '@careflow/shared';

export default function TermsOfUsePage() {
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
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">
              Platform Terms &amp; Governance
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              CustomCare Terms of Use
            </h1>
            <p className="text-xs text-slate-500">
              Effective Date: January 1, 2026 · Last Updated: November 4, 2026
            </p>
          </div>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">1. Acceptance of Terms</h2>
            <p>
              By registering a Business Workspace, creating a Support Agent account, accepting a workspace invitation, or accessing any service provided by {CAREFLOW_NAME} (&ldquo;CustomCare&rdquo;), you agree to be bound by these Terms of Use and our <Link href="/privacy" className="text-blue-600 underline">Privacy Policy</Link>.
            </p>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">2. Business Workspaces &amp; Ownership</h2>
            <p>
              Every registered business workspace on CustomCare belongs to the registering business entity, not to individual support agents or employees. The Business Owner and authorized Administrators control:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Workspace branding, public portal publication, knowledge base articles, FAQs, and troubleshooting procedures.</li>
              <li>Customer conversations, tickets, enquiries, and connected support channels (including Telegram and website widgets).</li>
              <li>Team member invitations, role assignments (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Owner</code>, <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Admin</code>, <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Supervisor</code>, <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Agent</code>, <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">Viewer</code>), suspensions, and access revocations.</li>
            </ul>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">3. Support Agent Access &amp; Responsibilities</h2>
            <p>
              Agents may access a workspace either as a <strong>Business-Managed Agent</strong> or via a <strong>Registered CustomCare Personal Account</strong>. In both models, agents agree to:
            </p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Keep authentication credentials, invitation links, and single-use Telegram linking codes confidential.</li>
              <li>Use customer data solely for resolving authorized support enquiries within the assigning business workspace.</li>
              <li>Respect workspace boundaries: if an agent&apos;s membership is suspended or revoked, or if the agent voluntarily leaves the workspace, all access to that business&apos;s conversations and records terminates immediately while historical support records remain the property of the business.</li>
            </ul>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">4. Acceptable Use &amp; Messaging Compliance</h2>
            <p>
              You may not use CustomCare portals, widgets, or Telegram bots to transmit unlawful, deceptive, phishing, or unsolicited bulk messages (spam). Businesses connecting a Telegram bot (via the central <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">@getcustomcarebot</code> hub or a dedicated <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">@BotFather</code> sub-bot) must comply with Telegram&apos;s Terms of Service and applicable consumer protection laws.
            </p>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">5. Automated Assistant Accuracy &amp; Guardrails</h2>
            <p>
              CustomCare assistants are designed to prioritize your published knowledge base, verified FAQs, and configured troubleshooting procedures. Businesses are solely responsible for the accuracy, legality, and completeness of the policies, instructions, and articles they publish inside their workspace.
            </p>
          </section>

          <section className="space-y-3 text-sm text-slate-700 leading-relaxed">
            <h2 className="text-lg font-bold text-slate-900">6. Service Availability &amp; Termination</h2>
            <p>
              CustomCare reserves the right to suspend or terminate any workspace or user account that violates these Terms of Use, compromises platform security, or engages in abusive or fraudulent conduct.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-4xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} {CAREFLOW_NAME}. All rights reserved.</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-slate-900">Privacy Policy</Link>
            <Link href="/terms" className="font-semibold text-slate-900">Terms of Use</Link>
            <Link href="/compliance" className="hover:text-slate-900">Compliance Notes</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

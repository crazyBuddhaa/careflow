'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Building2,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import {
  CAREFLOW_NAME,
  CUSTOMCARE_BRAND_WORDMARK,
  CUSTOMCARE_LOGO_ICON_URL,
  type AgentAccessMode,
  type InvitationInspectionDto,
} from '@careflow/shared';

export default function InviteAcceptancePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const rawToken = params?.token ? decodeURIComponent(String(params.token)) : '';

  const [loading, setLoading] = useState(true);
  const [inspection, setInspection] = useState<InvitationInspectionDto | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [accessMode, setAccessMode] = useState<AgentAccessMode>('business_managed');
  const [consentToLinkPersonalAccount, setConsentToLinkPersonalAccount] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!rawToken) return;
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/auth/invitations/${encodeURIComponent(rawToken)}`, {
          cache: 'no-store',
        });
        const payload = await res.json();
        if (!active) return;
        if (res.ok && payload.ok && payload.data) {
          const data = payload.data as InvitationInspectionDto;
          setInspection(data);
          if (data.existingAgentIdentity?.displayName) {
            setDisplayName(data.existingAgentIdentity.displayName);
          } else if (data.existingPersonalUser?.fullName) {
            setDisplayName(data.existingPersonalUser.fullName);
          } else if (data.invitation?.displayName) {
            setDisplayName(data.invitation.displayName);
          } else if (data.invitation?.email) {
            setDisplayName(data.invitation.email.split('@')[0] || '');
          }
          if (data.existingPersonalUser) {
            setAccessMode('personal_account');
            setConsentToLinkPersonalAccount(true);
          }
        } else {
          setErrorMessage(payload.error?.message || 'Unable to inspect invitation link.');
        }
      } catch {
        if (active) setErrorMessage('Network error while verifying invitation link.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [rawToken]);

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!agreeToTerms) {
      setErrorMessage('Please accept the CustomCare Terms of Use and Privacy Policy to continue.');
      return;
    }

    if (
      (accessMode === 'personal_account' || inspection?.canLinkToPersonalAccount) &&
      accessMode === 'personal_account' &&
      !consentToLinkPersonalAccount
    ) {
      setErrorMessage(
        'Please confirm explicit consent to connect this workspace to a personal CustomCare account.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/invitations/${encodeURIComponent(rawToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          password: password.trim() || undefined,
          accessMode,
          consentToLinkPersonalAccount,
        }),
      });
      const payload = await res.json();
      if (!res.ok || !payload.ok) {
        setErrorMessage(payload.error?.message || 'Unable to accept invitation.');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setErrorMessage('Network error while accepting invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 text-lg font-bold tracking-wider text-slate-900"
          >
            <img
              src={CUSTOMCARE_LOGO_ICON_URL}
              alt={CAREFLOW_NAME}
              className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5"
            />
            <span>{CUSTOMCARE_BRAND_WORDMARK}</span>
          </Link>
          <Link
            href="/login"
            className="text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            Sign In to Existing Account
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 p-8 shadow-xs space-y-6">
          {loading ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-2 border-teal-600 border-t-transparent animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">
                Verifying secure workspace invitation...
              </p>
            </div>
          ) : !inspection?.invitation || inspection.invitation.status !== 'pending' ? (
            <div className="space-y-4 text-center py-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">
                Invitation Link Unavailable
              </h1>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                {errorMessage ||
                  (inspection?.invitation?.status === 'accepted'
                    ? 'This single-use invitation link has already been accepted. Please sign in with your email and password.'
                    : inspection?.invitation?.status === 'revoked'
                      ? 'This invitation was revoked by the workspace administrator.'
                      : 'This invitation token is invalid, expired, or has already been used.')}
              </p>
              <div className="pt-4 flex justify-center gap-3">
                <Link
                  href="/login"
                  className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                >
                  Go to Sign In
                </Link>
                <Link
                  href="/"
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Return Home
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2 border-b border-slate-100 pb-5">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-700">
                  <Building2 className="w-4 h-4" />
                  Workspace Team Invitation
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Join {inspection.invitation.organizationName || inspection.organization.name}
                </h1>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>{inspection.invitation.invitedByName}</strong> invited{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {inspection.invitation.email}
                  </span>{' '}
                  to join{' '}
                  <strong>{inspection.invitation.organizationName || inspection.organization.name}</strong>{' '}
                  as a{' '}
                  <span className="uppercase font-bold text-teal-700">
                    {inspection.invitation.role}
                  </span>
                  {inspection.invitation.department
                    ? ` (${inspection.invitation.department})`
                    : ''}
                  .
                </p>
              </div>

              {inspection.canLinkToPersonalAccount && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-950">
                    <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
                    Existing Agent Identity Detected
                  </div>
                  <p className="text-xs text-blue-900 leading-relaxed">
                    {inspection.linkPromptMessage ||
                      `You already have an agent identity associated with ${inspection.invitation.email}. Would you like to connect this workspace to a personal CustomCare account?`}
                  </p>
                </div>
              )}

              {errorMessage && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-800">
                  {errorMessage}
                </div>
              )}

              <form onSubmit={handleAccept} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-800">
                    Choose How You Want to Access This Workspace
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAccessMode('business_managed')}
                      className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                        accessMode === 'business_managed'
                          ? 'border-teal-600 bg-teal-50/50 ring-1 ring-teal-600'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          Business-Managed Agent
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-teal-100 text-teal-800">
                          Default
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">
                        No personal CustomCare account required. Your access is scoped strictly to{' '}
                        {inspection.invitation.organizationName}.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAccessMode('personal_account')}
                      className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                        accessMode === 'personal_account'
                          ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">
                          Personal CustomCare Account
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          Multi-Workspace
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">
                        Connect to a personal CustomCare account to accept invitations from multiple
                        businesses and switch workspaces easily.
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Verified Invitation Email
                  </label>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3.5 py-2.5 text-sm text-slate-700">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="font-mono text-xs">{inspection.invitation.email}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Token Verified
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Your Specialist Display Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="e.g. Jordan Vance"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {inspection.canLinkToPersonalAccount
                      ? 'Confirm Your Existing Password (or set a password if first time)'
                      : 'Set Your Workspace Sign-In Password (min 8 characters)'}
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter at least 8 characters"
                      className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Note: This single-use invitation link only establishes your initial membership.
                    On future visits, you will sign in using your email and password.
                  </p>
                </div>

                {(accessMode === 'personal_account' || inspection.canLinkToPersonalAccount) && (
                  <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentToLinkPersonalAccount}
                      onChange={(e) => setConsentToLinkPersonalAccount(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span>
                      <strong>Explicit Identity Linking Consent:</strong> I confirm that I own{' '}
                      <code className="font-mono">{inspection.invitation.email}</code> and consent
                      to linking my workspace membership to my personal CustomCare account while
                      keeping each business&apos;s data and permissions strictly isolated.
                    </span>
                  </label>
                )}

                <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    I agree to the CustomCare{' '}
                    <Link href="/terms" className="text-teal-700 underline font-medium">
                      Terms of Use
                    </Link>
                    ,{' '}
                    <Link href="/privacy" className="text-teal-700 underline font-medium">
                      Privacy Policy
                    </Link>
                    , and{' '}
                    <Link href="/compliance" className="text-teal-700 underline font-medium">
                      Workspace Confidentiality &amp; Compliance Rules
                    </Link>
                    .
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 px-5 py-3 text-sm font-semibold text-white transition-colors cursor-pointer"
                >
                  <UserCheck className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'Activating Workspace Access...'
                      : `Accept Invitation & Enter ${inspection.invitation.organizationName}`}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white py-5">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} {CAREFLOW_NAME}</span>
          <div className="flex items-center gap-4">
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
      </footer>
    </div>
  );
}

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Lock, CheckCircle2, Mail, Eye, EyeOff, Building2 } from 'lucide-react';
import { CAREFLOW_NAME, type ApiResponse } from '@careflow/shared';
import type { AdminSessionStatusDto } from '@/app/api/admin/session/route';

export function WorkspaceLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectOrg = searchParams.get('org');

  const [sessionState, setSessionState] = useState<AdminSessionStatusDto | null>(null);
  const [loading, setLoading] = useState(true);

  // Mode: 'account' (email + password) or 'passcode' (workspace + passcode)
  const [authMode, setAuthMode] = useState<'account' | 'passcode'>('account');

  // Account login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Passcode login fields
  const [workspaceIdentifier, setWorkspaceIdentifier] = useState(preselectOrg ?? '');
  const [passcode, setPasscode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (preselectOrg) {
      setWorkspaceIdentifier(preselectOrg);
      setAuthMode('passcode');
    }
  }, [preselectOrg]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        const body = (await res.json()) as ApiResponse<AdminSessionStatusDto>;
        if (!active || !body.ok) return;
        setSessionState(body.data);
        if (!preselectOrg && body.data.session?.organizationSlug) {
          setWorkspaceIdentifier(body.data.session.organizationSlug);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [preselectOrg]);

  async function handleAccountSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      const body = (await res.json()) as ApiResponse<{
        authenticated: boolean;
        redirectUrl: string;
      }>;

      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      router.push(body.data.redirectUrl || '/admin');
    } catch {
      setErrorMessage('Unable to reach CareFlow authentication service.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasscodeSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: workspaceIdentifier.trim(),
          accessPasscode: passcode,
        }),
      });

      const body = (await res.json()) as ApiResponse<{ authenticated: boolean }>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      router.push('/admin');
    } catch {
      setErrorMessage('Unable to reach workspace authentication service.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 sm:p-9 shadow-sm space-y-6">
      <div>
        <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
          <Lock className="w-6 h-6" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          Sign In to {CAREFLOW_NAME}
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          Access your business workspaces, manage knowledge base articles, customize branding, and
          handle customer conversations.
        </p>
      </div>

      {sessionState?.authenticated && sessionState.session && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-900">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
            <span>Active session: {sessionState.session.organizationName}</span>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 hover:text-teal-950 underline underline-offset-4"
          >
            <span>Open current workspace dashboard</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setAuthMode('account');
            setErrorMessage(null);
          }}
          className={`py-2 rounded-lg transition-all ${
            authMode === 'account' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Account Login
        </button>
        <button
          type="button"
          onClick={() => {
            setAuthMode('passcode');
            setErrorMessage(null);
          }}
          className={`py-2 rounded-lg transition-all ${
            authMode === 'passcode' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Workspace Code
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs font-semibold text-rose-800 flex items-start gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-600 mt-1.5 shrink-0" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Account Login (Email + Password) */}
      {authMode === 'account' ? (
        <form onSubmit={handleAccountSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Account Email
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all pr-10"
              />
              <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          <div>
            <label
              htmlFor="accPassword"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="accPassword"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2"
          >
            {submitting ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      ) : (
        /* Workspace Code Login (Legacy / Direct) */
        <form onSubmit={handlePasscodeSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="workspaceId"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Workspace Identifier
            </label>
            <input
              id="workspaceId"
              type="text"
              required
              value={workspaceIdentifier}
              onChange={(e) => setWorkspaceIdentifier(e.target.value)}
              placeholder="e.g. ultimatetechapp or org_ultimatetechapp"
              className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
            />
          </div>

          <div>
            <label
              htmlFor="passcode"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Access Passcode
            </label>
            <input
              id="passcode"
              type="password"
              required
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter workspace passcode"
              className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2"
          >
            {submitting ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In With Passcode</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      )}

      <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-3 text-center">
        <p className="text-xs text-slate-600">
          New to CareFlow?{' '}
          <Link href="/onboarding" className="font-bold text-teal-700 hover:text-teal-900 underline underline-offset-4">
            Register your business
          </Link>
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Home</span>
        </Link>
      </div>
    </div>
  );
}

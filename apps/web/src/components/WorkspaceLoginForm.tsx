'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Mail,
  Eye,
  EyeOff,
} from 'lucide-react';
import { CAREFLOW_NAME, type ApiResponse } from '@careflow/shared';
import type { AdminSessionStatusDto } from '@/app/api/admin/session/route';
import { TurnstileWidget } from '@/components/TurnstileWidget';

export function WorkspaceLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectOrg = searchParams.get('org');
  const queryAction = searchParams.get('action');
  const queryToken = searchParams.get('token');

  const [sessionState, setSessionState] = useState<AdminSessionStatusDto | null>(null);
  const [, setLoading] = useState(true);

  // Mode: 'account' | 'mfa' | 'forgot-request' | 'forgot-confirm'
  const [authMode, setAuthMode] = useState<
    'account' | 'mfa' | 'forgot-request' | 'forgot-confirm'
  >('account');

  // Account login fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // MFA challenge fields
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  // Password reset fields
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [devResetTokenPreview, setDevResetTokenPreview] = useState<string | null>(null);

  const [turnstileToken, setTurnstileToken] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Handle ?action=verify-email&token=... or ?action=reset-password&token=...
  useEffect(() => {
    if (queryAction === 'reset-password' && queryToken) {
      setResetToken(queryToken);
      setAuthMode('forgot-confirm');
    } else if (queryAction === 'verify-email' && queryToken) {
      let active = true;
      async function verifyFromUrl(token: string) {
        setSubmitting(true);
        setErrorMessage(null);
        try {
          const res = await fetch('/api/auth/verify-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const body = (await res.json()) as ApiResponse<{ verified: boolean; message: string }>;
          if (!active) return;
          if (!body.ok) {
            setErrorMessage(body.error.message);
          } else {
            setStatusMessage(body.data.message);
          }
        } catch {
          if (active) setErrorMessage('Unable to verify email token.');
        } finally {
          if (active) setSubmitting(false);
        }
      }
      void verifyFromUrl(queryToken);
      return () => {
        active = false;
      };
    }
  }, [queryAction, queryToken]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        const body = (await res.json()) as ApiResponse<AdminSessionStatusDto>;
        if (!active || !body.ok) return;
        setSessionState(body.data);
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
    setStatusMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          turnstileToken: turnstileToken || undefined,
        }),
      });

      const body = (await res.json()) as ApiResponse<{
        authenticated: boolean;
        mfaRequired?: boolean;
        challengeToken?: string;
        mfaChallengeToken?: string;
        redirectUrl?: string;
        message?: string;
      }>;

      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      const issuedChallengeToken = body.data.challengeToken || body.data.mfaChallengeToken;
      if (body.data.mfaRequired && issuedChallengeToken) {
        setMfaChallengeToken(issuedChallengeToken);
        setMfaCode('');
        setAuthMode('mfa');
        setStatusMessage(
          body.data.message || 'Enter the 6-digit code from your authenticator app.'
        );
        return;
      }

      router.push(body.data.redirectUrl || '/admin');
    } catch {
      setErrorMessage('Unable to reach CustomCare authentication service.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/mfa/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeToken: mfaChallengeToken,
          code: mfaCode.trim(),
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
      setErrorMessage('Unable to verify MFA security code.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotRequestSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setDevResetTokenPreview(null);

    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: resetEmail.trim().toLowerCase(),
          turnstileToken: turnstileToken || undefined,
        }),
      });

      const body = (await res.json()) as ApiResponse<{
        accepted: boolean;
        message: string;
        devToken?: string;
      }>;

      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      setStatusMessage(body.data.message);
      if (body.data.devToken) {
        setDevResetTokenPreview(body.data.devToken);
        setResetToken(body.data.devToken);
      }
      setAuthMode('forgot-confirm');
    } catch {
      setErrorMessage('Unable to request password reset.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotConfirmSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken.trim(),
          newPassword,
          confirmPassword,
        }),
      });

      const body = (await res.json()) as ApiResponse<{
        reset: boolean;
        message: string;
      }>;

      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      setStatusMessage(body.data.message);
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setDevResetTokenPreview(null);
      setAuthMode('account');
    } catch {
      setErrorMessage('Unable to complete password reset.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md w-full rounded-3xl border border-slate-200 bg-white p-8 sm:p-9 shadow-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {authMode === 'mfa'
            ? 'Two-Factor Verification'
            : authMode === 'forgot-request' || authMode === 'forgot-confirm'
            ? 'Reset Your Password'
            : `Sign In to ${CAREFLOW_NAME}`}
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-slate-600 leading-relaxed">
          {authMode === 'mfa'
            ? 'Enter the 6-digit verification code from your authenticator app or a single-use recovery code.'
            : authMode === 'forgot-request'
            ? 'Enter your account email address to receive a single-use password recovery token.'
            : authMode === 'forgot-confirm'
            ? 'Enter your single-use recovery token and choose a strong new password.'
            : 'Sign in to your business workspace or support agent dashboard to handle customer conversations.'}
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

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5 text-xs font-semibold text-rose-800 flex items-start gap-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-600 mt-1.5 shrink-0" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {statusMessage && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-3.5 text-xs font-semibold text-teal-900 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <div className="flex-1">{statusMessage}</div>
        </div>
      )}

      {/* 1. Account Login (Email + Password) */}
      {authMode === 'account' && (
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
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="accPassword"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setResetEmail(email);
                  setErrorMessage(null);
                  setStatusMessage(null);
                  setAuthMode('forgot-request');
                }}
                className="text-xs font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
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
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <TurnstileWidget
            onVerify={(t) => setTurnstileToken(t)}
            onExpire={() => setTurnstileToken('')}
          />

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
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
      )}

      {/* 2. TOTP MFA Challenge Step */}
      {authMode === 'mfa' && (
        <form onSubmit={handleMfaSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="mfaCode"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              6-Digit Authenticator or Recovery Code
            </label>
            <input
              id="mfaCode"
              type="text"
              required
              autoFocus
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="123456 or ABCD-EFGH"
              className="w-full px-4 py-3 text-sm font-mono tracking-widest rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || mfaCode.trim().length < 6}
            className="w-full py-3.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            {submitting ? 'Verifying Code...' : 'Verify & Continue'}
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode('account');
              setMfaChallengeToken('');
              setMfaCode('');
              setErrorMessage(null);
            }}
            className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Back to Sign In
          </button>
        </form>
      )}

      {/* 3. Forgot Password — Step 1: Request Reset Token */}
      {authMode === 'forgot-request' && (
        <form onSubmit={handleForgotRequestSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="resetEmail"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
            >
              Account Email Address
            </label>
            <input
              id="resetEmail"
              type="email"
              required
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none"
            />
          </div>

          <TurnstileWidget
            onVerify={(t) => setTurnstileToken(t)}
            onExpire={() => setTurnstileToken('')}
          />

          <button
            type="submit"
            disabled={submitting || !resetEmail.trim()}
            className="w-full py-3.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm cursor-pointer"
          >
            {submitting ? 'Sending Recovery Token...' : 'Send Password Recovery Token'}
          </button>

          <div className="flex items-center justify-between text-xs pt-1">
            <button
              type="button"
              onClick={() => {
                setAuthMode('forgot-confirm');
                setErrorMessage(null);
              }}
              className="font-semibold text-teal-700 hover:text-teal-900 cursor-pointer"
            >
              Already have a reset token?
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('account');
                setErrorMessage(null);
              }}
              className="font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Back to Sign In
            </button>
          </div>
        </form>
      )}

      {/* 4. Forgot Password — Step 2: Confirm Token & New Password */}
      {authMode === 'forgot-confirm' && (
        <form onSubmit={handleForgotConfirmSubmit} className="space-y-4">
          {devResetTokenPreview && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
              <div className="font-bold">Development / Worker URL Reset Token Preview:</div>
              <code className="block font-mono text-[11px] break-all bg-white px-2 py-1 rounded border border-amber-200">
                {devResetTokenPreview}
              </code>
            </div>
          )}

          <div>
            <label
              htmlFor="resetToken"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
            >
              Single-Use Recovery Token
            </label>
            <input
              id="resetToken"
              type="text"
              required
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Paste recovery token"
              className="w-full px-3.5 py-2.5 text-xs font-mono rounded-xl border border-slate-200 focus:border-teal-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="newResetPassword"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
            >
              New Password
            </label>
            <input
              id="newResetPassword"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, upper, lower & number"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="confirmResetPassword"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1"
            >
              Confirm New Password
            </label>
            <input
              id="confirmResetPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat new password"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:border-teal-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || !resetToken.trim() || !newPassword || !confirmPassword}
            className="w-full py-3.5 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm cursor-pointer"
          >
            {submitting ? 'Resetting Password...' : 'Reset Password'}
          </button>

          <button
            type="button"
            onClick={() => {
              setAuthMode('account');
              setErrorMessage(null);
            }}
            className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Back to Sign In
          </button>
        </form>
      )}

      <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-3 text-center">
        <p className="text-xs text-slate-600">
          New to CustomCare?{' '}
          <Link
            href="/onboarding"
            className="font-bold text-teal-700 hover:text-teal-900 underline underline-offset-4"
          >
            Register as a Business or Support Agent
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

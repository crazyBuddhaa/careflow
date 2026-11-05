'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Smartphone,
  MailCheck,
  MailWarning,
  Laptop,
  Trash2,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Lock,
  Activity,
} from 'lucide-react';
import type {
  AccountSecurityOverviewDto,
  ApiResponse,
  MfaEnrollmentSetupDto,
} from '@careflow/shared';

interface AccountSecurityManagerProps {
  autoStartMfaEnrollment?: boolean;
  onSessionUpdated?: () => void;
}

export function AccountSecurityManager({
  autoStartMfaEnrollment = false,
  onSessionUpdated,
}: AccountSecurityManagerProps) {
  const [overview, setOverview] = useState<AccountSecurityOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Email verification state
  const [verifyTokenInput, setVerifyTokenInput] = useState('');
  const [devVerificationToken, setDevVerificationToken] = useState<string | null>(null);
  const [verifyingEmail, setVerifyingEmail] = useState(false);

  // MFA enrollment state
  const [mfaSetup, setMfaSetup] = useState<MfaEnrollmentSetupDto | null>(null);
  const [mfaVerifyCode, setMfaVerifyCode] = useState('');
  const [mfaEnrollmentPassword, setMfaEnrollmentPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [copiedRecovery, setCopiedRecovery] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);

  // MFA disable state
  const [disableMfaPassword, setDisableMfaPassword] = useState('');
  const [disableMfaCode, setDisableMfaCode] = useState('');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);

  // Session revocation state
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  const loadSecurityOverview = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/auth/sessions', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<AccountSecurityOverviewDto>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setOverview(body.data);
    } catch {
      setErrorMessage('Failed to load account security overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSecurityOverview();
  }, [loadSecurityOverview]);

  useEffect(() => {
    if (
      overview &&
      !overview.mfaEnabled &&
      !mfaSetup &&
      !mfaBusy &&
      (autoStartMfaEnrollment || (overview.mfaEnforcementActive && overview.mfaRequiredForRole))
    ) {
      void handleStartMfaEnrollment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    overview?.mfaEnabled,
    overview?.mfaEnforcementActive,
    overview?.mfaRequiredForRole,
    autoStartMfaEnrollment,
  ]);

  async function handleRequestVerificationEmail() {
    setVerifyingEmail(true);
    setErrorMessage(null);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend' }),
      });
      const body = (await res.json()) as ApiResponse<{
        sent: boolean;
        message: string;
        devToken?: string;
      }>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setStatusBanner(body.data.message);
      if (body.data.devToken) {
        setDevVerificationToken(body.data.devToken);
        setVerifyTokenInput(body.data.devToken);
      }
    } catch {
      setErrorMessage('Unable to request verification email.');
    } finally {
      setVerifyingEmail(false);
    }
  }

  async function handleConfirmEmailVerification(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyTokenInput.trim()) return;
    setVerifyingEmail(true);
    setErrorMessage(null);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: verifyTokenInput.trim() }),
      });
      const body = (await res.json()) as ApiResponse<{ verified: boolean; message: string }>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setStatusBanner(body.data.message);
      setVerifyTokenInput('');
      setDevVerificationToken(null);
      await loadSecurityOverview();
      onSessionUpdated?.();
    } catch {
      setErrorMessage('Unable to verify email token.');
    } finally {
      setVerifyingEmail(false);
    }
  }

  async function handleStartMfaEnrollment() {
    setMfaBusy(true);
    setErrorMessage(null);
    setStatusBanner(null);
    setRecoveryCodes(null);
    try {
      const res = await fetch('/api/auth/mfa/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const body = (await res.json()) as ApiResponse<MfaEnrollmentSetupDto>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setMfaSetup(body.data);
    } catch {
      setErrorMessage('Failed to start TOTP MFA enrollment.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleCompleteMfaEnrollment(e: React.FormEvent) {
    e.preventDefault();
    setMfaBusy(true);
    setErrorMessage(null);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: mfaVerifyCode.trim(),
          currentPassword: mfaEnrollmentPassword || undefined,
        }),
      });
      const body = (await res.json()) as ApiResponse<{
        enabled: boolean;
        recoveryCodes: string[];
        message: string;
      }>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setRecoveryCodes(body.data.recoveryCodes);
      setMfaSetup(null);
      setMfaVerifyCode('');
      setMfaEnrollmentPassword('');
      setStatusBanner(body.data.message);
      await loadSecurityOverview();
      onSessionUpdated?.();
    } catch {
      setErrorMessage('Failed to verify TOTP code.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleDisableMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaBusy(true);
    setErrorMessage(null);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/auth/mfa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: disableMfaPassword,
          code: disableMfaCode.trim(),
        }),
      });
      const body = (await res.json()) as ApiResponse<{ disabled: boolean; message: string }>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setDisableMfaPassword('');
      setDisableMfaCode('');
      setRecoveryCodes(null);
      setStatusBanner(body.data.message);
      await loadSecurityOverview();
      onSessionUpdated?.();
    } catch {
      setErrorMessage('Failed to disable MFA.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setChangingPassword(true);
    setErrorMessage(null);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/auth/password-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmNewPassword,
          revokeOtherSessions,
        }),
      });
      const body = (await res.json()) as ApiResponse<{ changed: boolean; message: string }>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setStatusBanner(body.data.message);
      await loadSecurityOverview();
    } catch {
      setErrorMessage('Failed to change account password.');
    } finally {
      setChangingPassword(false);
    }
  }

  async function handleRevokeSession(options: {
    sessionId?: string;
    revokeAllOther?: boolean;
    revokeAll?: boolean;
  }) {
    setRevokingSessionId(options.sessionId ?? 'bulk');
    setErrorMessage(null);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      const body = (await res.json()) as ApiResponse<{
        revokedCount: number;
        signedOutCurrentDevice: boolean;
        message: string;
      }>;
      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }
      setStatusBanner(body.data.message);
      if (body.data.signedOutCurrentDevice) {
        onSessionUpdated?.();
        return;
      }
      await loadSecurityOverview();
    } catch {
      setErrorMessage('Failed to revoke session.');
    } finally {
      setRevokingSessionId(null);
    }
  }

  function handleCopyRecoveryCodes() {
    if (!recoveryCodes) return;
    void navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopiedRecovery(true);
    setTimeout(() => setCopiedRecovery(false), 2000);
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-4">
        <div className="h-6 w-52 rounded bg-slate-100 animate-pulse" />
        <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0 w-full">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-teal-700 text-xs font-bold uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>CustomCare Identity & Account Security</span>
          </div>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            Account Security, MFA & Active Sessions
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Manage email verification, Authenticator App (TOTP) multi-factor authentication,
            password rotation, and active device sessions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSecurityOverview()}
          className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 self-start sm:self-auto shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{errorMessage}</span>
        </div>
      )}

      {statusBanner && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-xs font-semibold text-teal-900 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{statusBanner}</span>
        </div>
      )}

      {/* Section 1: Email Verification Status */}
      {overview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-4 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  overview.user.emailVerified
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                {overview.user.emailVerified ? (
                  <MailCheck className="w-5 h-5" />
                ) : (
                  <MailWarning className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900 break-all">
                  Account Email: {overview.user.email}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {overview.user.emailVerified
                    ? 'Verified account email address'
                    : 'Your email address is not yet verified. Verify your email to enable full account recovery and security alerts.'}
                </p>
              </div>
            </div>
            <span
              className={`self-start shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase ${
                overview.user.emailVerified
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {overview.user.emailVerified ? 'Verified' : 'Unverified'}
            </span>
          </div>

          {!overview.user.emailVerified && (
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={verifyingEmail}
                  onClick={() => void handleRequestVerificationEmail()}
                  className="py-2 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {verifyingEmail ? 'Sending...' : 'Send Verification Token'}
                </button>
                {!overview.infrastructure.resendConfigured && (
                  <span className="text-[11px] text-slate-500">
                    Development mode (no custom domain configured yet): verification token will be
                    shown directly below for immediate testing.
                  </span>
                )}
              </div>

              {devVerificationToken && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 space-y-1">
                  <div className="font-bold">
                    Single-Use Verification Token:
                  </div>
                  <code className="block font-mono text-[11px] break-all bg-white px-2.5 py-1.5 rounded border border-amber-200 select-all">
                    {devVerificationToken}
                  </code>
                </div>
              )}

              <form onSubmit={handleConfirmEmailVerification} className="flex flex-col sm:flex-row gap-2 max-w-md">
                <input
                  type="text"
                  value={verifyTokenInput}
                  onChange={(e) => setVerifyTokenInput(e.target.value)}
                  placeholder="Paste single-use verification token"
                  className="w-full sm:flex-1 min-w-0 px-3.5 py-2.5 text-xs rounded-xl border border-slate-200 focus:border-teal-600 outline-none"
                />
                <button
                  type="submit"
                  disabled={verifyingEmail || !verifyTokenInput.trim()}
                  className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold shrink-0 cursor-pointer"
                >
                  Verify Email
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Section 2: TOTP Multi-Factor Authentication (MFA) */}
      {overview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 space-y-5 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  overview.mfaEnabled
                    ? 'bg-teal-50 text-teal-600'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-slate-900">
                  Multi-Factor Authentication (TOTP Authenticator App)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Protect your CustomCare account and all connected businesses with RFC 6238
                  time-based one-time codes (Google Authenticator, Authy, 1Password, etc.) and
                  single-use recovery codes.
                </p>
              </div>
            </div>
            <span
              className={`self-start shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase ${
                overview.mfaEnabled
                  ? 'bg-teal-50 text-teal-800 border border-teal-200'
                  : overview.mfaRequiredForRole && overview.mfaEnforcementActive
                    ? 'bg-amber-50 text-amber-900 border border-amber-300'
                    : 'bg-slate-100 text-slate-600'
              }`}
            >
              {overview.mfaEnabled
                ? 'MFA Enabled'
                : overview.mfaRequiredForRole && overview.mfaEnforcementActive
                  ? '2FA Setup Required'
                  : 'Not Enrolled'}
            </span>
          </div>

          {/* Recovery codes modal/banner right after enrollment */}
          {recoveryCodes && recoveryCodes.length > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-amber-950">
                  Save Your Single-Use Recovery Codes Now
                </div>
                <button
                  type="button"
                  onClick={handleCopyRecoveryCodes}
                  className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-white border border-amber-300 text-[11px] font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                >
                  {copiedRecovery ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy All</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                Store these 8 recovery codes in a password manager. Each code can be used once if
                you lose access to your authenticator device. Only hashes are stored in CustomCare.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {recoveryCodes.map((code) => (
                  <code
                    key={code}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 font-mono text-xs font-bold text-slate-900 text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>
            </div>
          )}

          {!overview.mfaEnabled ? (
            !mfaSetup ? (
              <div>
                <button
                  type="button"
                  disabled={mfaBusy}
                  onClick={() => void handleStartMfaEnrollment()}
                  className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  {mfaBusy ? 'Preparing Authenticator Setup...' : 'Set Up Authenticator App (TOTP)'}
                </button>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  <div className="md:col-span-4 flex flex-col items-center justify-center bg-white p-4 rounded-2xl border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={mfaSetup.qrCodeSvgDataUrl}
                      alt="TOTP QR Code"
                      className="w-44 h-44 rounded-lg"
                    />
                    <span className="mt-2 text-[11px] font-semibold text-slate-500">
                      Scan with Authenticator App
                    </span>
                  </div>

                  <div className="md:col-span-8 space-y-3 min-w-0">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Manual Setup Key (Base32)
                      </div>
                      <code className="mt-1 block px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono text-xs font-bold text-slate-900 select-all break-all">
                        {mfaSetup.secret}
                      </code>
                    </div>

                    <form onSubmit={handleCompleteMfaEnrollment} className="space-y-3 pt-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            6-Digit Authenticator Code *
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={6}
                            value={mfaVerifyCode}
                            onChange={(e) => setMfaVerifyCode(e.target.value)}
                            placeholder="123456"
                            className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-200 bg-white focus:border-teal-600 outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Confirm Account Password
                          </label>
                          <input
                            type="password"
                            value={mfaEnrollmentPassword}
                            onChange={(e) => setMfaEnrollmentPassword(e.target.value)}
                            placeholder="Current password"
                            className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:border-teal-600 outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={mfaBusy || mfaVerifyCode.trim().length < 6}
                          className="py-2 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                        >
                          {mfaBusy ? 'Verifying...' : 'Verify & Activate MFA'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMfaSetup(null)}
                          className="py-2 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            )
          ) : (
            <form
              onSubmit={handleDisableMfa}
              className="pt-4 border-t border-slate-100 space-y-3 max-w-xl"
            >
              <div className="text-xs font-bold text-slate-800">
                Disable Multi-Factor Authentication (Requires Reauthentication)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  required
                  value={disableMfaPassword}
                  onChange={(e) => setDisableMfaPassword(e.target.value)}
                  placeholder="Current account password"
                  className="px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-600 outline-none"
                />
                <input
                  type="text"
                  required
                  value={disableMfaCode}
                  onChange={(e) => setDisableMfaCode(e.target.value)}
                  placeholder="6-digit TOTP or recovery code"
                  className="px-3.5 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:border-teal-600 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={mfaBusy || !disableMfaPassword || !disableMfaCode.trim()}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                {mfaBusy ? 'Disabling...' : 'Disable MFA'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Section 3: Change Password */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Change Account Password</h3>
            <p className="text-xs text-slate-600">
              Minimum 8 characters with uppercase, lowercase, and numeric characters.
            </p>
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3 max-w-xl">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-600 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 8 chars"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-600 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Repeat new password"
                className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:border-teal-600 outline-none"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={revokeOtherSessions}
              onChange={(e) => setRevokeOtherSessions(e.target.checked)}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>Automatically sign out all other active devices when password changes</span>
          </label>

          <button
            type="submit"
            disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
            className="py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
          >
            {changingPassword ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Section 4: Active Sessions & Device Management */}
      {overview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Active Sessions ({overview.activeSessions.length})
                </h3>
                <p className="text-xs text-slate-600">
                  Server-side sessions stored in Cloudflare D1. Revoke any unfamiliar device
                  immediately.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {overview.activeSessions.length > 1 && (
                <button
                  type="button"
                  disabled={revokingSessionId !== null}
                  onClick={() => void handleRevokeSession({ revokeAllOther: true })}
                  className="py-2 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Sign Out Other Devices
                </button>
              )}
              <button
                type="button"
                disabled={revokingSessionId !== null}
                onClick={() => void handleRevokeSession({ revokeAll: true })}
                className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-700 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out All Devices</span>
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {overview.activeSessions.length === 0 ? (
              <div className="p-4 text-xs text-slate-500">
                No server-tracked user sessions found (signed in via legacy workspace passcode).
              </div>
            ) : (
              overview.activeSessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-900 break-words">
                        {sess.userAgent || 'Browser Session'}
                      </span>
                      {sess.isCurrent && (
                        <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 border border-teal-200 text-[10px] font-bold uppercase shrink-0">
                          Current Device
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 break-words">
                      IP: {sess.ipAddress || '127.0.0.1'} · Last active:{' '}
                      {new Date(sess.lastActiveAt).toLocaleString()} · Expires:{' '}
                      {new Date(sess.expiresAt).toLocaleString()}
                    </div>
                  </div>

                  {!sess.isCurrent && (
                    <button
                      type="button"
                      disabled={revokingSessionId === sess.id}
                      onClick={() => void handleRevokeSession({ sessionId: sess.id })}
                      className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold self-start sm:self-auto cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revoke</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Section 5: Security Audit Events & Infrastructure Readiness */}
      {overview && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Activity className="w-4 h-4 text-teal-600" />
              <span>Recent Security Events</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {overview.recentEvents.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">No security events recorded yet.</p>
              ) : (
                overview.recentEvents.map((ev) => (
                  <div key={ev.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-bold text-slate-800">{ev.eventType}</span>
                      <span className="text-slate-500 ml-2">IP: {ev.ipAddress}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 shrink-0">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Lock className="w-4 h-4 text-teal-600" />
              <span>Email & Bot Protection Status</span>
            </div>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">Resend Transactional Email</div>
                  <div className="text-[11px] text-slate-500">
                    RESEND_API_KEY + CAREFLOW_EMAIL_FROM_ADDRESS
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    overview.infrastructure.resendConfigured
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {overview.infrastructure.resendConfigured ? 'Configured' : 'Dev Fallback'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">Cloudflare Turnstile Bot Defense</div>
                  <div className="text-[11px] text-slate-500">
                    TURNSTILE_SECRET_KEY server verification
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    overview.infrastructure.turnstileConfigured
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {overview.infrastructure.turnstileConfigured ? 'Active' : 'Optional / Dev'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

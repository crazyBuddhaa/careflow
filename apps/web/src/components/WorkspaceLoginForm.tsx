'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Lock, CheckCircle2 } from 'lucide-react';
import { CAREFLOW_NAME, type ApiResponse } from '@careflow/shared';
import type { AdminSessionStatusDto } from '@/app/api/admin/session/route';

export function WorkspaceLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectOrg = searchParams.get('org');

  const [sessionState, setSessionState] = useState<AdminSessionStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const res = await fetch('/api/admin/session', { cache: 'no-store' });
        const body = (await res.json()) as ApiResponse<AdminSessionStatusDto>;
        if (!active || !body.ok) return;
        setSessionState(body.data);

        const matchedByParam = preselectOrg
          ? body.data.availableWorkspaces.find(
              (w) => w.id === preselectOrg || w.slug === preselectOrg
            )
          : undefined;

        if (matchedByParam) {
          setSelectedOrgId(matchedByParam.id);
        } else if (body.data.session?.organizationId) {
          setSelectedOrgId(body.data.session.organizationId);
        } else if (body.data.availableWorkspaces[0]) {
          setSelectedOrgId(body.data.availableWorkspaces[0].id);
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: selectedOrgId,
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
    <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 space-y-6">
      <div>
        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
          <Lock className="w-5 h-5" aria-hidden="true" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
          Business Workspace Sign In
        </h1>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Sign in to manage your business&apos;s knowledge articles, FAQs, chatbot rules, and
          customer support conversations.
        </p>
      </div>

      {sessionState?.authenticated && sessionState.session && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-teal-900">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
            <span>Active session: {sessionState.session.organizationName}</span>
          </div>
          <Link
            href="/admin"
            className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <span>Continue to {sessionState.session.organizationName} Dashboard</span>
            <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {loading ? (
        <div className="space-y-3 py-2">
          <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
          <div className="h-10 rounded-xl bg-slate-100 animate-pulse" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-workspace-select"
              className="block text-xs font-semibold text-slate-700"
            >
              Business Organization
            </label>
            <select
              id="login-workspace-select"
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            >
              {(sessionState?.availableWorkspaces ?? []).map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name} ({ws.slug}.careflow.com)
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="login-passcode"
                className="block text-xs font-semibold text-slate-700"
              >
                Workspace Access Passcode
              </label>
              {sessionState?.usesDefaultDevPasscode && (
                <button
                  type="button"
                  onClick={() => setPasscode('careflow-dev-admin')}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                >
                  Fill dev passcode
                </button>
              )}
            </div>
            <input
              id="login-passcode"
              type="password"
              required
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="Enter workspace admin passcode"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
            />
            {sessionState?.usesDefaultDevPasscode && (
              <p className="mt-1.5 text-xs text-slate-500">
                Development passcode:{' '}
                <span className="font-mono text-slate-800">careflow-dev-admin</span>
              </p>
            )}
          </div>

          {errorMessage && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !selectedOrgId}
            className="w-full py-2.5 px-5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
          >
            {submitting ? 'Signing In...' : 'Sign In to Workspace'}
          </button>
        </form>
      )}

      <div className="pt-5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{CAREFLOW_NAME} Home</span>
        </Link>
        <Link href="/portals" className="font-semibold text-blue-600 hover:text-blue-700">
          Customer? Browse Support Portals &rarr;
        </Link>
      </div>
    </div>
  );
}

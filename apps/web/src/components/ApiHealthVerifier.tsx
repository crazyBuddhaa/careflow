'use client';

import React, { useState } from 'react';
import type { ApiResponse, HealthCheckReport } from '@careflow/shared';

export function ApiHealthVerifier() {
  const [report, setReport] = useState<HealthCheckReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runHealthCheck() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<HealthCheckReport>;
      if (!body.ok) {
        setError(body.error.message);
      } else {
        setReport(body.data);
      }
    } catch {
      setError('Failed to query /api/health endpoint.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-slate-200 bg-white p-6 sm:p-8 rounded-xl flex flex-col justify-between gap-6">
      <div>
        <p className="text-xs text-slate-500">
          REST Endpoint · <span className="font-mono">GET /api/health</span>
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
          Verify Route Handler & Environment Contract
        </h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Query the live Next.js Route Handler to inspect server-side Zod environment validation,
          Supabase client readiness, and registered monorepo domain modules.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          Error: {error}
        </p>
      )}

      {report && (
        <div className="border-t border-slate-200 pt-5 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-slate-500 block">Service & Version</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {report.service} v{report.version}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Health Status</span>
              <span className="font-mono font-semibold text-slate-900 capitalize">
                {report.status} ({report.environment})
              </span>
            </div>
            <div>
              <span className="text-slate-500 block">Initial Client</span>
              <span className="font-semibold text-slate-900">{report.client}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Scaffolded Modules</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {report.modules.length} registered
              </span>
            </div>
          </div>
          <p className="text-slate-500 pt-1 font-mono tabular-nums">
            Supabase Anon Client: {report.supabase.publicClientConfigured ? 'Configured' : 'Awaiting .env'} · Service Role: {report.supabase.serverRoleConfigured ? 'Configured (Server-Only)' : 'Awaiting .env'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-500">Zero service-role exposure</span>
        <button
          type="button"
          onClick={runHealthCheck}
          disabled={loading}
          className="py-2 px-4 text-xs font-semibold text-slate-900 bg-stone-100 hover:bg-stone-200 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {loading ? 'Checking Endpoint...' : report ? 'Refresh Health Check' : 'Run Health Check'}
        </button>
      </div>
    </div>
  );
}

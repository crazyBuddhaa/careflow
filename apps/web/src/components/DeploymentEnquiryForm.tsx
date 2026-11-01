'use client';

import React, { useState } from 'react';
import { SupportChannel, type ApiResponse } from '@careflow/shared';
import type { DeploymentEnquiryReceipt } from '@/app/api/enquiries/route';

export function DeploymentEnquiryForm() {
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [organization, setOrganization] = useState('UltimateTechApp');
  const [primaryChannel, setPrimaryChannel] = useState<SupportChannel>(SupportChannel.WebWidget);
  const [monthlyTicketVolume, setMonthlyTicketVolume] = useState<
    'under_1k' | '1k_10k' | '10k_50k' | '50k_plus'
  >('1k_10k');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<DeploymentEnquiryReceipt | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          workEmail,
          organization,
          primaryChannel,
          monthlyTicketVolume,
          notes: notes.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as ApiResponse<DeploymentEnquiryReceipt>;

      if (!payload.ok) {
        setErrorMessage(payload.error.message);
      } else {
        setReceipt(payload.data);
      }
    } catch {
      setErrorMessage('Unable to reach the CareFlow API. Please verify your connection.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (receipt) {
    return (
      <div className="border border-slate-200 bg-white p-8 rounded-xl">
        <p className="text-xs text-slate-500">
          Reference <span className="font-mono tabular-nums text-slate-900">{receipt.referenceCode}</span> · Confirmed
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
          Architecture review scheduled for {receipt.organization}
        </h3>
        <p className="mt-3 text-base text-slate-600 leading-relaxed max-w-xl">
          Your workspace configuration request has been validated by our Zod intake schema. Our
          platform engineering team will follow up with migration credentials and channel webhook
          guides.
        </p>
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-slate-500 font-mono tabular-nums">
            Recorded {new Date(receipt.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} UTC
          </p>
          <button
            type="button"
            onClick={() => {
              setReceipt(null);
              setNotes('');
            }}
            className="py-2 px-4 text-sm font-semibold text-slate-700 hover:text-slate-900 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border border-slate-200 bg-white p-6 sm:p-8 rounded-xl space-y-6"
      noValidate
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="cf-full-name" className="block text-sm font-semibold text-slate-900">
            Full Name
          </label>
          <input
            id="cf-full-name"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Elena Rostova"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
          />
        </div>

        <div>
          <label htmlFor="cf-work-email" className="block text-sm font-semibold text-slate-900">
            Work Email
          </label>
          <input
            id="cf-work-email"
            type="email"
            required
            value={workEmail}
            onChange={(e) => setWorkEmail(e.target.value)}
            placeholder="elena@ultimatetechapp.com"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="cf-organization" className="block text-sm font-semibold text-slate-900">
            Client Organization
          </label>
          <input
            id="cf-organization"
            type="text"
            required
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
          />
        </div>

        <div>
          <label htmlFor="cf-volume" className="block text-sm font-semibold text-slate-900">
            Monthly Enquiry Volume
          </label>
          <select
            id="cf-volume"
            value={monthlyTicketVolume}
            onChange={(e) =>
              setMonthlyTicketVolume(
                e.target.value as 'under_1k' | '1k_10k' | '10k_50k' | '50k_plus'
              )
            }
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
          >
            <option value="under_1k">Under 1,000 enquiries / mo</option>
            <option value="1k_10k">1,000 – 10,000 enquiries / mo</option>
            <option value="10k_50k">10,000 – 50,000 enquiries / mo</option>
            <option value="50k_plus">50,000+ enquiries / mo</option>
          </select>
        </div>
      </div>

      <div>
        <span className="block text-sm font-semibold text-slate-900">
          Primary Intake Channel
        </span>
        <div
          role="group"
          aria-label="Primary Intake Channel"
          className="mt-2 inline-flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-lg border border-slate-200"
        >
          {[
            { value: SupportChannel.WebWidget, label: 'Website Widget' },
            { value: SupportChannel.Telegram, label: 'Telegram Channel' },
            { value: SupportChannel.Portal, label: 'Customer Portal' },
          ].map((option) => {
            const active = primaryChannel === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPrimaryChannel(option.value)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label htmlFor="cf-notes" className="block text-sm font-semibold text-slate-900">
          Integration Notes <span className="font-normal text-slate-500">(Optional)</span>
        </label>
        <textarea
          id="cf-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Specify existing helpdesk migration requirements or SLA escalation rules..."
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/20"
        />
      </div>

      {errorMessage && (
        <p role="alert" className="text-sm font-semibold text-red-700">
          Validation error: {errorMessage}
        </p>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
        <p className="text-xs text-slate-500">
          Validated server-side via <span className="font-mono">@careflow/validation</span>
        </p>
        <button
          type="submit"
          disabled={isSubmitting}
          className="py-2.5 px-5 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
        >
          {isSubmitting ? 'Validating Request...' : 'Request Deployment Briefing'}
        </button>
      </div>
    </form>
  );
}

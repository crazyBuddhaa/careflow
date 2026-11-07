'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Lock, Search } from 'lucide-react';
import type { ComplaintCategoryRecord } from '@careflow/shared';

interface PortalClaimsWidgetProps {
  slug: string;
  displayName: string;
}

export function PortalClaimsWidget({ slug, displayName }: PortalClaimsWidgetProps) {
  const [categories, setCategories] = useState<ComplaintCategoryRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'submit' | 'status'>('submit');

  // Submit form state
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [orderId, setOrderId] = useState('');
  const [productOrService, setProductOrService] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [suppliedLoginIdentifier, setSuppliedLoginIdentifier] = useState('');
  const [suppliedLoginSecret, setSuppliedLoginSecret] = useState('');
  const [suppliedLoginNotes, setSuppliedLoginNotes] = useState('');
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [customValues, setCustomValues] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedClaim, setSubmittedClaim] = useState<{
    referenceCode: string;
    status: string;
    categoryName: string;
  } | null>(null);

  // Lookup state
  const [lookupRef, setLookupRef] = useState('');
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<{
    referenceCode: string;
    orderId: string | null;
    productOrService: string;
    categoryName: string;
    status: string;
    decisionOutcome: string | null;
    decisionReason: string | null;
    replacementIssued: boolean;
    updatedAt: string;
  } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/${encodeURIComponent(slug)}/complaints`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.data?.categories) {
          setCategories(json.data.categories);
          if (json.data.categories[0]?.id) {
            setCategoryId(json.data.categories[0].id);
          }
        }
      })
      .catch(() => null);
  }, [slug]);

  const activeCategory =
    categories.find((c) => c.id === categoryId) || categories[0] || null;

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(slug)}/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerEmail,
          orderId: orderId.trim() || undefined,
          productOrService,
          categoryId: activeCategory?.id,
          categoryName: activeCategory?.name,
          description,
          suppliedLoginIdentifier: suppliedLoginIdentifier.trim() || undefined,
          suppliedLoginSecret: suppliedLoginSecret.trim() || undefined,
          suppliedLoginNotes: suppliedLoginNotes.trim() || undefined,
          customFields: customValues,
          evidenceItems: evidenceTitle.trim()
            ? [
                {
                  fileName: evidenceTitle.trim(),
                  fileUrlOrData: evidenceTitle.trim(),
                  description: 'Customer portal evidence',
                },
              ]
            : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setSubmitError(json.error?.message || 'Unable to submit claim.');
        return;
      }
      setSubmittedClaim(json.data);
      setCustomValues({});
    } catch {
      setSubmitError('Network error while submitting claim.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookupClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setLookupResult(null);

    try {
      const res = await fetch(
        `/api/portal/${encodeURIComponent(slug)}/complaints?referenceCode=${encodeURIComponent(
          lookupRef.trim()
        )}&customerEmail=${encodeURIComponent(lookupEmail.trim())}`
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setLookupError(json.error?.message || 'Claim reference not found.');
        return;
      }
      setLookupResult(json.data.complaint);
    } catch {
      setLookupError('Unable to check claim status.');
    }
  };

  return (
    <section className="border-t border-slate-200 bg-white py-14">
      <div className="max-w-4xl mx-auto px-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-teal-700">
              Product & Account Resolution Center
            </p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Report an Order or Account Issue
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Submit a formal claim for invalid credentials, incomplete login info, or product replacement at {displayName}, or track an existing claim reference.
            </p>
          </div>

          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 self-start">
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                activeTab === 'submit'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Submit Claim
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('status')}
              className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                activeTab === 'status'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Track Claim Status
            </button>
          </div>
        </div>

        {activeTab === 'submit' ? (
          submittedClaim ? (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-6 space-y-3">
              <div className="flex items-center gap-2 text-teal-900 font-bold">
                <CheckCircle2 className="h-5 w-5 text-teal-700" />
                <span>
                  Claim Submitted · Reference Code:{' '}
                  <span className="font-mono text-base underline">
                    {submittedClaim.referenceCode}
                  </span>
                </span>
              </div>
              <p className="text-xs text-slate-700">
                Save your reference code (<strong>{submittedClaim.referenceCode}</strong>) to track supervisor investigation and replacement progress at any time.
              </p>
              <button
                type="button"
                onClick={() => setSubmittedClaim(null)}
                className="rounded-xl bg-teal-700 px-4 py-2 text-xs font-bold text-white hover:bg-teal-800"
              >
                Submit Another Claim
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmitClaim}
              className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 sm:p-7 space-y-4 text-xs"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block font-bold text-slate-700">
                    Complaint Category *
                  </label>
                  <select
                    value={activeCategory?.id || ''}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700">
                    Purchased Product or Service *
                  </label>
                  <input
                    type="text"
                    required
                    value={productOrService}
                    onChange={(e) => setProductOrService(e.target.value)}
                    placeholder="e.g. Pro Account / Subscription Plan"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700">Your Name *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Full name"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700">
                    Order ID {activeCategory?.requiresOrderId ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    required={Boolean(activeCategory?.requiresOrderId)}
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value)}
                    placeholder="e.g. ORD-49201"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700">
                    Supporting Evidence / Screenshot Link{' '}
                    {activeCategory?.requiresEvidence ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    required={Boolean(activeCategory?.requiresEvidence)}
                    value={evidenceTitle}
                    onChange={(e) => setEvidenceTitle(e.target.value)}
                    placeholder="Screenshot description or URL"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900"
                  />
                </div>
              </div>

              {activeCategory?.requiresLoginInfo && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-amber-900">
                    <Lock className="h-4 w-4 text-amber-700" />
                    <span>
                      Account Login Details for Verification (Encrypted at Rest)
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <input
                      type="text"
                      required
                      value={suppliedLoginIdentifier}
                      onChange={(e) => setSuppliedLoginIdentifier(e.target.value)}
                      placeholder="Account Username / Email *"
                      className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-slate-900"
                    />
                    <input
                      type="password"
                      required
                      value={suppliedLoginSecret}
                      onChange={(e) => setSuppliedLoginSecret(e.target.value)}
                      placeholder="Received Password / Key *"
                      className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-slate-900"
                    />
                    <input
                      type="text"
                      value={suppliedLoginNotes}
                      onChange={(e) => setSuppliedLoginNotes(e.target.value)}
                      placeholder="Error message seen"
                      className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-slate-900"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700">
                  Issue Description *
                </label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what happened with your purchased product or account..."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3.5 text-slate-900"
                />
              </div>

              {submitError && (
                <p className="font-semibold text-red-700">{submitError}</p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-teal-700 px-6 py-2.5 text-xs font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                >
                  {submitting ? 'Submitting Claim...' : 'Submit Official Claim'}
                </button>
              </div>
            </form>
          )
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 space-y-4 text-xs">
            <form onSubmit={handleLookupClaim} className="grid gap-3 sm:grid-cols-3">
              <input
                type="text"
                required
                value={lookupRef}
                onChange={(e) => setLookupRef(e.target.value)}
                placeholder="Claim Reference (e.g. CLM-2026-1001)"
                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-slate-900"
              />
              <input
                type="email"
                required
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
                placeholder="Your Email Address"
                className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-900"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 font-bold text-white hover:bg-slate-800"
              >
                <Search className="h-3.5 w-3.5" />
                Check Claim Status
              </button>
            </form>

            {lookupError && <p className="font-semibold text-red-700">{lookupError}</p>}

            {lookupResult && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-teal-800">
                    {lookupResult.referenceCode}
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold uppercase text-slate-800">
                    {lookupResult.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-slate-700">
                  Product: <strong>{lookupResult.productOrService}</strong> (
                  {lookupResult.categoryName})
                </p>
                {lookupResult.decisionReason && (
                  <p className="text-slate-700">
                    Update / Resolution Note: <strong>{lookupResult.decisionReason}</strong>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

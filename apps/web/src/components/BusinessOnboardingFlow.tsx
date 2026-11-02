'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Building2,
  User,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Globe,
  Briefcase,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { CAREFLOW_NAME, type ApiResponse } from '@careflow/shared';

const BUSINESS_CATEGORIES = [
  'Technology',
  'E-commerce and retail',
  'Financial services',
  'Healthcare',
  'Education',
  'Hospitality',
  'Professional services',
  'Logistics and transportation',
  'Other',
];

const COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Nigeria',
  'Ghana',
  'Kenya',
  'South Africa',
  'Germany',
  'France',
  'Australia',
  'India',
  'Singapore',
  'United Arab Emirates',
  'Brazil',
  'Other Country',
];

export function BusinessOnboardingFlow() {
  const router = useRouter();

  // Stage: 1 = Personal Account, 2 = First Business Setup
  const [currentStage, setCurrentStage] = useState<1 | 2>(1);

  // Stage 1 Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  // Stage 2 Fields
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('Technology');
  const [customIndustry, setCustomIndustry] = useState('');
  const [country, setCountry] = useState('United States');
  const [website, setWebsite] = useState('');

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    orgId: string;
    slug: string;
    businessName: string;
  } | null>(null);

  // Validation helpers
  const passwordHasMinLength = password.length >= 8;
  const passwordHasSymbolOrNumber = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  function handleContinueToBusiness(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (!passwordHasMinLength || !passwordHasSymbolOrNumber) {
      setErrorMessage(
        'Password must be at least 8 characters long and contain at least one number or special character.'
      );
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage('Passwords do not match. Please re-enter your password confirmation.');
      return;
    }
    if (!agreeToTerms) {
      setErrorMessage('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }

    setCurrentStage(2);
  }

  async function handleFinalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    if (!businessName.trim()) {
      setErrorMessage('Please enter your business name.');
      setSubmitting(false);
      return;
    }

    const selectedIndustry = industry === 'Other' && customIndustry.trim()
      ? customIndustry.trim()
      : industry;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
          agreeToTerms,
          businessName: businessName.trim(),
          industry: selectedIndustry,
          country,
          website: website.trim(),
        }),
      });

      const body = (await res.json()) as ApiResponse<{
        user: { id: string; email: string; fullName: string };
        organization: { id: string; slug: string; name: string };
        redirectUrl: string;
      }>;

      if (!body.ok) {
        setErrorMessage(body.error.message);
        return;
      }

      setSuccessInfo({
        orgId: body.data.organization.id,
        slug: body.data.organization.slug,
        businessName: body.data.organization.name,
      });

      // Brief pause to show confirmation then enter workspace dashboard
      setTimeout(() => {
        router.push(body.data.redirectUrl || '/admin');
      }, 1200);
    } catch {
      setErrorMessage('Network error while creating workspace. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const generatedSlugPreview = businessName
    ? businessName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 36) || 'your-business'
    : 'your-business';

  if (successInfo) {
    return (
      <div className="max-w-xl mx-auto rounded-3xl border border-teal-200 bg-white p-8 sm:p-10 shadow-sm text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Workspace Provisioned Successfully!
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Welcome to {CAREFLOW_NAME}, <span className="font-semibold text-slate-900">{fullName}</span>.
            We’ve created your business workspace for <span className="font-semibold text-teal-800">{successInfo.businessName}</span>.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-mono text-slate-700 text-left space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500 font-sans">Organization ID:</span>
            <span className="font-bold">{successInfo.orgId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-sans">Assigned Role:</span>
            <span className="font-bold text-teal-700">Owner</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-sans">Portal URL:</span>
            <span className="font-bold">{successInfo.slug}.careflow.com</span>
          </div>
        </div>

        <p className="text-xs text-slate-500 animate-pulse">
          Opening your business dashboard and guided onboarding...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step Stepper Header */}
      <div className="mb-8 grid grid-cols-2 gap-3 text-xs font-semibold">
        <button
          type="button"
          onClick={() => currentStage === 2 && setCurrentStage(1)}
          className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-all text-left ${
            currentStage === 1
              ? 'border-teal-600 bg-teal-50/70 text-teal-900 shadow-sm'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
              currentStage === 1 ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            1
          </div>
          <div>
            <div className="text-[11px] text-slate-500 uppercase tracking-wider">Step 1</div>
            <div>Account Info</div>
          </div>
        </button>

        <div
          className={`flex items-center gap-2.5 p-3 rounded-2xl border text-left ${
            currentStage === 2
              ? 'border-teal-600 bg-teal-50/70 text-teal-900 shadow-sm'
              : 'border-slate-200 bg-white text-slate-400'
          }`}
        >
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
              currentStage === 2 ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-400'
            }`}
          >
            2
          </div>
          <div>
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">Step 2</div>
            <div>First Business</div>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs font-semibold text-rose-800 flex items-start gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-600 mt-1.5 shrink-0" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Stage 1: Personal Account Information */}
      {currentStage === 1 && (
        <form
          onSubmit={handleContinueToBusiness}
          className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <User className="w-6 h-6 text-teal-600" aria-hidden="true" />
              <span>Create your CareFlow account</span>
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
              One account allows you to create and manage multiple businesses with isolated portals,
              knowledge workspaces, and specialist teams.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="fullName"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="fullName"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Alex Morgan"
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="accountEmail"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Email Address <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  id="accountEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="alex@example.com"
                  className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all pr-10"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                This will be your personal login email. You can configure separate public support emails later.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="password"
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

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 p-0.5"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Password security checks */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                    passwordHasMinLength ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  ✓
                </div>
                <span className={passwordHasMinLength ? 'text-teal-900 font-semibold' : 'text-slate-500'}>
                  At least 8 characters
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${
                    passwordHasSymbolOrNumber ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  ✓
                </div>
                <span className={passwordHasSymbolOrNumber ? 'text-teal-900 font-semibold' : 'text-slate-500'}>
                  At least one number or special character
                </span>
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={agreeToTerms}
                  onChange={(e) => setAgreeToTerms(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  I agree to the <span className="font-semibold text-slate-900">CareFlow Terms of Service</span> and{' '}
                  <span className="font-semibold text-slate-900">Privacy Policy</span>.
                </span>
              </label>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Already have an account? Sign In
            </Link>
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold tracking-wide transition-all shadow-sm"
            >
              <span>Continue to Business Info</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* Stage 2: Initial Business Setup */}
      {currentStage === 2 && (
        <form
          onSubmit={handleFinalSubmit}
          className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-teal-600" aria-hidden="true" />
              <span>Set up your first business</span>
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
              Enter your core business details. You will be assigned as the organization Owner and can
              configure branding, knowledge, and operating hours progressively in your dashboard.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="businessName"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Business Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="businessName"
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Apex Health Systems"
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
              />
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <span>Portal preview URL:</span>
                <span className="font-semibold text-teal-700">{generatedSlugPreview}.careflow.com</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="industry"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Industry / Category <span className="text-rose-500">*</span>
                </label>
                <select
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                >
                  {BUSINESS_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="country"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Country of Operation <span className="text-rose-500">*</span>
                </label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {industry === 'Other' && (
              <div>
                <label
                  htmlFor="customIndustry"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                >
                  Specify Industry <span className="text-rose-500">*</span>
                </label>
                <input
                  id="customIndustry"
                  type="text"
                  required
                  value={customIndustry}
                  onChange={(e) => setCustomIndustry(e.target.value)}
                  placeholder="e.g. Renewable Energy, Biotech"
                  className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="website"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Business Website <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                id="website"
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                You can add your full business description, support hours, and logo inside the guided dashboard.
              </p>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCurrentStage(1)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors py-2.5 px-3"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Account</span>
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm"
            >
              {submitting ? (
                <span>Provisioning Workspace...</span>
              ) : (
                <>
                  <span>Create Workspace & Enter Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

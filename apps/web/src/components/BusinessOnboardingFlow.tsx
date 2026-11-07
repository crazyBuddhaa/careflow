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
  Mail,
  Eye,
  EyeOff,
  Globe,
  Headphones,
  KeyRound,
} from 'lucide-react';
import { CAREFLOW_NAME, type ApiResponse } from '@careflow/shared';
import { TurnstileWidget } from '@/components/TurnstileWidget';

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

  // Registration role: 'business' or 'agent' (strictly independent account types)
  const [registrationRole, setRegistrationRole] = useState<'business' | 'agent'>('business');

  // Stage: 1 = Account Info & Role (or complete Agent registration), 2 = First Business Setup (Business only)
  const [currentStage, setCurrentStage] = useState<1 | 2>(1);

  // Common Account Fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  // Business Setup Fields (only used when registrationRole === 'business')
  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('Technology');
  const [customIndustry, setCustomIndustry] = useState('');
  const [country, setCountry] = useState('United States');
  const [website, setWebsite] = useState('');

  // Support Agent Fields (only used when registrationRole === 'agent')
  const [agentSpecialty, setAgentSpecialty] = useState('Customer Support');
  const [invitationToken, setInvitationToken] = useState('');

  const [turnstileToken, setTurnstileToken] = useState('');

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    orgId: string;
    slug: string;
    businessName: string;
    roleLabel: string;
    isAgentAccount: boolean;
  } | null>(null);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role');
      if (roleParam === 'agent') {
        setRegistrationRole('agent');
        setCurrentStage(1);
      } else if (roleParam === 'business') {
        setRegistrationRole('business');
      }
    }
  }, []);

  // Validation helpers
  const passwordHasMinLength = password.length >= 8;
  const passwordHasSymbolOrNumber = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  function validateAccountFields(): boolean {
    if (!fullName.trim()) {
      setErrorMessage('Please enter your full name.');
      return false;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.');
      return false;
    }
    if (!passwordHasMinLength || !passwordHasSymbolOrNumber) {
      setErrorMessage(
        'Password must be at least 8 characters long and contain at least one number or special character.'
      );
      return false;
    }
    if (!passwordsMatch) {
      setErrorMessage('Passwords do not match. Please re-enter your password confirmation.');
      return false;
    }
    if (!agreeToTerms) {
      setErrorMessage('Please accept the Terms of Use, Privacy Policy, and Compliance Terms to continue.');
      return false;
    }
    return true;
  }

  function handleStepOneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!validateAccountFields()) {
      return;
    }

    // Support Agent accounts never go to Business Setup — submit immediately!
    if (registrationRole === 'agent') {
      void submitRegistration('agent');
      return;
    }

    setCurrentStage(2);
  }

  async function handleBusinessFinalSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!businessName.trim()) {
      setErrorMessage('Please enter your business name.');
      return;
    }

    await submitRegistration('business');
  }

  async function submitRegistration(roleToSubmit: 'business' | 'agent') {
    setSubmitting(true);
    setErrorMessage(null);

    const selectedIndustry =
      industry === 'Other' && customIndustry.trim() ? customIndustry.trim() : industry;

    // Normalize invitation token if user pasted a full /invite/<token> URL
    const cleanedInviteToken = invitationToken.trim()
      ? invitationToken.trim().split('/invite/').pop()?.split('?')[0]?.trim() ||
        invitationToken.trim()
      : undefined;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registrationRole: roleToSubmit,
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          confirmPassword,
          agreeToTerms,
          businessName: roleToSubmit === 'business' ? businessName.trim() : undefined,
          industry: roleToSubmit === 'business' ? selectedIndustry : undefined,
          country: roleToSubmit === 'business' ? country : undefined,
          website: roleToSubmit === 'business' ? website.trim() : undefined,
          specialty: roleToSubmit === 'agent' ? agentSpecialty.trim() || 'Customer Support' : undefined,
          invitationToken: roleToSubmit === 'agent' ? cleanedInviteToken : undefined,
          turnstileToken: turnstileToken || undefined,
        }),
      });

      const body = (await res.json()) as ApiResponse<{
        user: { id: string; email: string; fullName: string; accountType?: string };
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
        roleLabel: roleToSubmit === 'agent' ? 'Support Agent' : 'Business Owner',
        isAgentAccount: roleToSubmit === 'agent',
      });

      setTimeout(() => {
        router.push(body.data.redirectUrl || '/admin');
      }, 1200);
    } catch {
      setErrorMessage('Network error while creating your CustomCare account. Please try again.');
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
    const isUninvitedAgent =
      successInfo.isAgentAccount && successInfo.orgId === 'org_customcare_agent_hub';

    return (
      <div className="max-w-xl mx-auto rounded-3xl border border-teal-200 bg-white p-8 sm:p-10 shadow-sm text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
          <CheckCircle2 className="w-9 h-9" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {successInfo.isAgentAccount
              ? 'Support Agent Account Created!'
              : 'Business Workspace Provisioned!'}
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Welcome to {CAREFLOW_NAME},{' '}
            <span className="font-semibold text-slate-900">{fullName}</span>.{' '}
            {isUninvitedAgent ? (
              <>
                Your dedicated Support Agent account is active.{' '}
                <span className="font-semibold text-teal-800">
                  Get an invite from a business workspace to start working.
                </span>
              </>
            ) : successInfo.isAgentAccount ? (
              <>
                Your Support Agent account is active and connected to{' '}
                <span className="font-semibold text-teal-800">{successInfo.businessName}</span>.
              </>
            ) : (
              <>
                We’ve created your business workspace for{' '}
                <span className="font-semibold text-teal-800">{successInfo.businessName}</span>.
              </>
            )}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs font-mono text-slate-700 text-left space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500 font-sans">Account Type:</span>
            <span className="font-bold text-teal-700">{successInfo.roleLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500 font-sans">Workspace Status:</span>
            <span className="font-bold">
              {isUninvitedAgent ? 'Awaiting Workspace Invite' : successInfo.businessName}
            </span>
          </div>
          {!successInfo.isAgentAccount && (
            <div className="flex justify-between">
              <span className="text-slate-500 font-sans">Portal URL:</span>
              <span className="font-bold">{successInfo.slug}.getcustomcare.xyz</span>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500 animate-pulse">
          Opening your {successInfo.isAgentAccount ? 'Support Agent' : 'Business'} dashboard...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step Header: Only show 2-step indicator for Business accounts; Support Agent is a direct 1-step registration */}
      {registrationRole === 'business' ? (
        <div className="mb-8 grid grid-cols-2 gap-3 text-xs font-semibold">
          <button
            type="button"
            onClick={() => currentStage === 2 && setCurrentStage(1)}
            className={`flex items-center gap-2.5 p-3 rounded-2xl border transition-all text-left cursor-pointer ${
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
              <div>Business Owner Account</div>
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
              <div>Business Workspace Details</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-8 flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-teal-600 bg-teal-50/70 text-teal-900 shadow-sm text-xs font-semibold">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-teal-600 text-white flex items-center justify-center">
              <Headphones className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-teal-700 uppercase tracking-wider">
                Direct Support Agent Registration
              </div>
              <div>Create your Support Agent account in one step — no business setup required</div>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs font-semibold text-rose-800 flex items-start gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-600 mt-1.5 shrink-0" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Stage 1: Role Selection & Account Information (Direct Submit for Agent, Step 1 for Business) */}
      {currentStage === 1 && (
        <form
          onSubmit={handleStepOneSubmit}
          className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <User className="w-6 h-6 text-teal-600" aria-hidden="true" />
              <span>Choose your account type</span>
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-600 leading-relaxed">
              Business accounts and Support Agent accounts work independently. Select{' '}
              <strong>Business Owner</strong> to launch a company workspace, or{' '}
              <strong>Support Agent</strong> to join a business team via invitation.
            </p>
          </div>

          {/* Role Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <button
              type="button"
              onClick={() => {
                setRegistrationRole('business');
                setErrorMessage(null);
              }}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                registrationRole === 'business'
                  ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                    registrationRole === 'business'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Business Account
                </span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">
                I am registering a Business
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Create an isolated business workspace, knowledge base, Telegram &amp; web support
                channels, and invite your support team.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setRegistrationRole('agent');
                setCurrentStage(1);
                setErrorMessage(null);
              }}
              className={`p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                registrationRole === 'agent'
                  ? 'border-teal-600 bg-teal-50/60 ring-2 ring-teal-100'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Headphones className="w-5 h-5" />
                </div>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                    registrationRole === 'agent'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Support Agent Account
                </span>
              </div>
              <h3 className="mt-3 text-sm font-bold text-slate-900">
                I am a Support Agent
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Create a dedicated Support Agent account to receive workspace invitations from
                businesses and handle customer conversations.
              </p>
            </button>
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
                {registrationRole === 'agent'
                  ? 'Use the email address where business administrators send your workspace invitations.'
                  : 'This will be your login email. You can configure public support emails inside your workspace.'}
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

            {/* Support Agent Specific Fields (rendered inline so Agent registration completes in 1 step) */}
            {registrationRole === 'agent' && (
              <div className="pt-2 space-y-4 border-t border-slate-100">
                <div>
                  <label
                    htmlFor="agentSpecialty"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                  >
                    Primary Support Specialty / Department
                  </label>
                  <input
                    id="agentSpecialty"
                    type="text"
                    required
                    value={agentSpecialty}
                    onChange={(e) => setAgentSpecialty(e.target.value)}
                    placeholder="e.g. Technical Support, Billing & Accounts, Customer Success"
                    className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="invitationToken"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                  >
                    Workspace Invitation Token or Link{' '}
                    <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="invitationToken"
                      type="text"
                      value={invitationToken}
                      onChange={(e) => setInvitationToken(e.target.value)}
                      placeholder="Paste invite token or https://getcustomcare.xyz/invite/..."
                      className="w-full px-4 py-3 text-sm font-mono rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all pr-10"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Have an invite already? Paste it here to join the workspace immediately. No invite
                    yet? Leave blank — you can get an invite to start working anytime after signing in.
                  </p>
                </div>
              </div>
            )}

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
                  I agree to the{' '}
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-semibold text-slate-900 underline underline-offset-2 hover:text-teal-700"
                  >
                    CustomCare Terms of Use
                  </Link>
                  ,{' '}
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="font-semibold text-slate-900 underline underline-offset-2 hover:text-teal-700"
                  >
                    Privacy Policy
                  </Link>
                  , and{' '}
                  <Link
                    href="/compliance"
                    target="_blank"
                    className="font-semibold text-slate-900 underline underline-offset-2 hover:text-teal-700"
                  >
                    Workspace Isolation &amp; Compliance Notes
                  </Link>
                  .
                </span>
              </label>
            </div>

            {registrationRole === 'agent' && (
              <TurnstileWidget
                onVerify={(t) => setTurnstileToken(t)}
                onExpire={() => setTurnstileToken('')}
              />
            )}
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
              disabled={submitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm cursor-pointer"
            >
              {registrationRole === 'agent' ? (
                submitting ? (
                  <span>Creating Support Agent Account...</span>
                ) : (
                  <>
                    <span>Create Agent Account &amp; Enter Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )
              ) : (
                <>
                  <span>Continue to Business Info</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Stage 2: Business Setup (Strictly for Business Accounts only) */}
      {currentStage === 2 && registrationRole === 'business' && (
        <form
          onSubmit={handleBusinessFinalSubmit}
          className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-500">
              Registering a Business Owner account
            </span>
            <button
              type="button"
              onClick={() => {
                setRegistrationRole('agent');
                setCurrentStage(1);
                setErrorMessage(null);
              }}
              className="text-xs font-bold text-teal-700 hover:text-teal-900 underline underline-offset-2 text-left sm:text-right cursor-pointer"
            >
              Creating a Support Agent account instead? Switch to Support Agent &rarr;
            </button>
          </div>

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
                placeholder="e.g. UltimateTechApp or Apex Health Systems"
                className="w-full px-4 py-3 text-sm rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none transition-all"
              />
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                <span>Portal preview URL:</span>
                <span className="font-semibold text-teal-700">{generatedSlugPreview}.getcustomcare.xyz</span>
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

            <TurnstileWidget
              onVerify={(t) => setTurnstileToken(t)}
              onExpire={() => setTurnstileToken('')}
            />
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setCurrentStage(1)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors py-2.5 px-3 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Account</span>
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold tracking-wide transition-all shadow-sm cursor-pointer"
            >
              {submitting ? (
                <span>Provisioning Workspace...</span>
              ) : (
                <>
                  <span>Create Workspace &amp; Enter Dashboard</span>
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

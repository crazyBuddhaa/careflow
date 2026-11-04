'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  QrCode,
  Send,
  Globe,
  MessageSquare,
  Mail,
  Smartphone,
  Webhook,
  Link2,
  Unlink,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Power,
} from 'lucide-react';
import {
  EscalationPriority,
  UserRole,
  type ApiResponse,
  type ChannelIntegrationCategory,
  type ChannelIntegrationLifecycleStatus,
  type ChannelIntegrationRecord,
  type TelegramAgentLinkCodeResponse,
  type TelegramAgentLinkRecord,
} from '@careflow/shared';

interface ChannelIntegrationsManagerProps {
  organizationName: string;
  organizationSlug: string;
  currentUserId: string;
  currentUserRole: UserRole;
}

const CHANNEL_DISPLAY_META: Record<
  ChannelIntegrationCategory,
  { title: string; description: string }
> = {
  telegram: {
    title: 'Central CustomCare Telegram Bot',
    description:
      'Customers message the official CustomCare Telegram bot via your unique business link or QR code. No BotFather setup required.',
  },
  portal: {
    title: 'Hosted Customer-Support Portal',
    description:
      'Optional public self-service knowledge base, guided assistant, and escalation portal.',
  },
  web_widget: {
    title: 'Website Chat Widget',
    description:
      'Optional embeddable customer chat launcher for your external website powered by your knowledge base and unified inbox.',
  },
  email: {
    title: 'Email Support Channel',
    description:
      'Transactional notifications via Resend and optional inbound support email forwarding.',
  },
  whatsapp: {
    title: 'WhatsApp Business',
    description:
      'Unified WhatsApp Business messaging channel (extensible adapter ready for upcoming release).',
  },
  api_webhooks: {
    title: 'External API & Webhooks',
    description:
      'Programmatic conversation intake and signed outbound event webhooks (planned release).',
  },
};

const STATUS_BADGE_STYLES: Record<
  ChannelIntegrationLifecycleStatus,
  { label: string; className: string }
> = {
  not_activated: {
    label: 'Not Activated',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  setup_required: {
    label: 'Setup Required',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  pending_verification: {
    label: 'Pending Verification',
    className: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  connected: {
    label: 'Connected',
    className: 'bg-teal-50 text-teal-800 border-teal-200',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  attention_required: {
    label: 'Attention Required',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
  disconnected: {
    label: 'Disconnected',
    className: 'bg-slate-100 text-slate-500 border-slate-200',
  },
};

export function ChannelIntegrationsManager({
  organizationName,
  organizationSlug,
  currentUserId,
  currentUserRole,
}: ChannelIntegrationsManagerProps) {
  const [integrations, setIntegrations] = useState<ChannelIntegrationRecord[]>([]);
  const [agentLinks, setAgentLinks] = useState<TelegramAgentLinkRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingChannel, setSavingChannel] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Active configuration tab
  const [activeTab, setActiveTab] = useState<
    'overview' | 'telegram' | 'agent_telegram' | 'web_widget' | 'portal' | 'email'
  >('overview');

  // Telegram config form state
  const [tgWelcome, setTgWelcome] = useState('');
  const [tgCategories, setTgCategories] = useState('');
  const [tgOfflineMessage, setTgOfflineMessage] = useState('');
  const [tgAllowEscalation, setTgAllowEscalation] = useState(true);
  const [tgDefaultPriority, setTgDefaultPriority] = useState<EscalationPriority>(
    EscalationPriority.Normal
  );
  const [tgNotifyAgents, setTgNotifyAgents] = useState(true);
  const [customSubBotTokenInput, setCustomSubBotTokenInput] = useState('');

  // Web Widget config form state
  const [wgtLauncherTitle, setWgtLauncherTitle] = useState('');
  const [wgtGreeting, setWgtGreeting] = useState('');
  const [wgtColor, setWgtColor] = useState('#0f766e');
  const [wgtPosition, setWgtPosition] = useState<'bottom-right' | 'bottom-left'>('bottom-right');
  const [wgtAllowEscalation, setWgtAllowEscalation] = useState(true);

  // Live Widget Preview tester state
  const [wgtTestMessage, setWgtTestMessage] = useState('');
  const [wgtTestSending, setWgtTestSending] = useState(false);
  const [wgtTestReply, setWgtTestReply] = useState<string | null>(null);

  // Telegram Agent Link Code state
  const [generatedLinkCode, setGeneratedLinkCode] =
    useState<TelegramAgentLinkCodeResponse | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const isAdminOrOwner =
    currentUserRole === UserRole.Owner || currentUserRole === UserRole.Admin;

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  const loadIntegrations = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/integrations', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<{
        integrations: ChannelIntegrationRecord[];
        agentLinks: TelegramAgentLinkRecord[];
      }>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setIntegrations(body.data.integrations);
      setAgentLinks(body.data.agentLinks);

      const tg = body.data.integrations.find((i) => i.channel === 'telegram');
      if (tg?.telegramConfig) {
        setTgWelcome(tg.telegramConfig.welcomeMessage);
        setTgCategories(tg.telegramConfig.supportCategories.join(', '));
        setTgOfflineMessage(tg.telegramConfig.offlineMessage);
        setTgAllowEscalation(tg.telegramConfig.allowHumanEscalation);
        setTgDefaultPriority(tg.telegramConfig.escalationPriorityDefault);
        setTgNotifyAgents(tg.telegramConfig.notifyAssignedAgentOnTelegram);
      }

      const wgt = body.data.integrations.find((i) => i.channel === 'web_widget');
      if (wgt?.widgetConfig) {
        setWgtLauncherTitle(wgt.widgetConfig.launcherTitle);
        setWgtGreeting(wgt.widgetConfig.welcomeGreeting);
        setWgtColor(wgt.widgetConfig.primaryColor);
        setWgtPosition(wgt.widgetConfig.position);
        setWgtAllowEscalation(wgt.widgetConfig.allowHumanEscalation);
      }
    } catch {
      setErrorBanner('Unable to load channel integrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIntegrations();
  }, [loadIntegrations]);

  async function handleChannelAction(
    channel: ChannelIntegrationCategory,
    action:
      | 'activate'
      | 'deactivate'
      | 'rotate_token'
      | 'update_config'
      | 'connect_subbot'
      | 'disconnect_subbot',
    extraPayload?: Record<string, unknown>
  ) {
    setSavingChannel(`${channel}:${action}`);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          action,
          ...extraPayload,
        }),
      });
      const body = (await res.json()) as ApiResponse<ChannelIntegrationRecord>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      if (action === 'connect_subbot') {
        setCustomSubBotTokenInput('');
      }
      showFeedback(`Updated ${channel} integration (${action.replace('_', ' ')}).`);
      await loadIntegrations();
    } catch {
      setErrorBanner('Network error while updating channel integration.');
    } finally {
      setSavingChannel(null);
    }
  }

  async function handleGenerateAgentLinkCode() {
    setGeneratingCode(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/integrations/telegram-link', {
        method: 'POST',
      });
      const body = (await res.json()) as ApiResponse<TelegramAgentLinkCodeResponse>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setGeneratedLinkCode(body.data);
      showFeedback('Generated single-use 10-minute Telegram Agent linking code.');
    } catch {
      setErrorBanner('Unable to generate Telegram Agent linking code.');
    } finally {
      setGeneratingCode(false);
    }
  }

  async function handleRevokeAgentLink(targetUserId: string, name: string) {
    setErrorBanner(null);
    try {
      const res = await fetch(
        `/api/admin/integrations/telegram-link?userId=${encodeURIComponent(targetUserId)}`,
        { method: 'DELETE' }
      );
      const body = (await res.json()) as ApiResponse<{ revoked: boolean }>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      showFeedback(`Unlinked Telegram account for ${name}.`);
      setGeneratedLinkCode(null);
      await loadIntegrations();
    } catch {
      setErrorBanner('Unable to revoke Telegram link.');
    }
  }

  async function handleTestWidgetMessage(e: React.FormEvent, publicToken: string) {
    e.preventDefault();
    if (!wgtTestMessage.trim()) return;
    setWgtTestSending(true);
    setWgtTestReply(null);
    try {
      const res = await fetch(`/api/widget/${encodeURIComponent(publicToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: wgtTestMessage.trim(),
          customerName: 'Dashboard Preview Visitor',
          sessionRef: `wgt_preview_${organizationSlug}`,
        }),
      });
      const body = (await res.json()) as ApiResponse<{
        botReply: string;
        conversationId: string;
      }>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setWgtTestReply(body.data.botReply);
      setWgtTestMessage('');
      showFeedback(`Widget message processed in conversation ${body.data.conversationId}.`);
    } catch {
      setErrorBanner('Unable to send test widget message.');
    } finally {
      setWgtTestSending(false);
    }
  }

  function copyToClipboard(value: string, label: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
      showFeedback(`Copied ${label} to clipboard.`);
    }
  }

  const tgIntegration = integrations.find((i) => i.channel === 'telegram');
  const portalIntegration = integrations.find((i) => i.channel === 'portal');
  const widgetIntegration = integrations.find((i) => i.channel === 'web_widget');
  const emailIntegration = integrations.find((i) => i.channel === 'email');
  const currentUserLink = agentLinks.find(
    (l) => l.userId === currentUserId && l.status === 'linked'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-teal-700">
              Multi-Channel Support OS · {organizationName}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Channels &amp; Integrations
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              One support platform. Every customer channel. One team workspace. Activate only the
              channels your business needs.
            </p>
          </div>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {(
            [
              ['overview', 'All Channels'],
              ['telegram', 'Customer Telegram Bot'],
              ['agent_telegram', 'Telegram Agent App'],
              ['web_widget', 'Website Chat Widget'],
              ['portal', 'Customer Portal'],
              ['email', 'Email Channel'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                activeTab === key
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-xs sm:text-sm font-semibold text-teal-900 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs text-teal-700 hover:text-teal-950"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs sm:text-sm font-semibold text-rose-900 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-xs text-rose-700 hover:text-rose-950"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-44 rounded-2xl bg-white border border-slate-200 animate-pulse p-6" />
          <div className="h-44 rounded-2xl bg-white border border-slate-200 animate-pulse p-6" />
        </div>
      ) : (
        <>
          {/* =================================================================
              TAB 1: OVERVIEW OF ALL 6 CHANNEL CATEGORIES
          ================================================================== */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {integrations.map((item) => {
                const badge = STATUS_BADGE_STYLES[item.status] ?? STATUS_BADGE_STYLES.not_activated;
                const meta = CHANNEL_DISPLAY_META[item.channel];
                const isPlanned = item.availabilityLabel === 'Planned' || !item.isSupportedNow;
                const Icon =
                  item.channel === 'telegram'
                    ? Send
                    : item.channel === 'portal'
                      ? Globe
                      : item.channel === 'web_widget'
                        ? MessageSquare
                        : item.channel === 'email'
                          ? Mail
                          : item.channel === 'whatsapp'
                            ? Smartphone
                            : Webhook;

                return (
                  <div
                    key={item.channel}
                    className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between gap-4 shadow-2xs"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h2 className="text-base font-bold text-slate-900">
                                {meta.title}
                              </h2>
                              {isPlanned && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                                  Planned
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              Channel ID: <span className="font-mono">{item.channel}</span>
                            </p>
                          </div>
                        </div>

                        <span
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold whitespace-nowrap ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">{meta.description}</p>

                      {item.deepLinkUrl && item.channel === 'telegram' && item.status === 'active' && (
                        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-mono text-slate-800 truncate">
                              {item.telegramConfig?.customBotDeepLinkUrl || item.deepLinkUrl}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  item.telegramConfig?.customBotDeepLinkUrl || item.deepLinkUrl!,
                                  'Telegram support link'
                                )
                              }
                              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-200 shrink-0 cursor-pointer"
                              title="Copy link"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {item.telegramConfig?.customBotUsername && (
                            <p className="text-[11px] font-semibold text-teal-700">
                              Dedicated Sub-Bot Active: @{item.telegramConfig.customBotUsername}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      {isPlanned ? (
                        <span className="text-xs font-semibold text-slate-400">
                          Extensible adapter ready · Coming in next release
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (item.channel === 'telegram') setActiveTab('telegram');
                            else if (item.channel === 'web_widget') setActiveTab('web_widget');
                            else if (item.channel === 'portal') setActiveTab('portal');
                            else if (item.channel === 'email') setActiveTab('email');
                          }}
                          className="py-2 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                        >
                          Configure Channel &rarr;
                        </button>
                      )}

                      {item.channel === 'telegram' && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('agent_telegram')}
                          className="py-2 px-3 rounded-xl border border-teal-200 bg-teal-50/70 hover:bg-teal-100 text-teal-900 text-xs font-bold transition-colors cursor-pointer"
                        >
                          Agent Telegram Link
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* =================================================================
              TAB 2: CUSTOMER TELEGRAM BOT (CENTRAL LINK + DEDICATED SUB-BOT)
          ================================================================== */}
          {activeTab === 'telegram' && tgIntegration && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-bold text-slate-900">
                        Customer Telegram Bot (Dual-Mode Support)
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold ${
                          STATUS_BADGE_STYLES[tgIntegration.status].className
                        }`}
                      >
                        {STATUS_BADGE_STYLES[tgIntegration.status].label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-slate-600">
                      Use the instant Central CustomCare Bot link (zero BotFather needed), connect
                      your own dedicated <code className="font-mono">@BotFather</code> Sub-Bot token,
                      or use both simultaneously. Customers can start with <code className="font-mono">/start</code>{' '}
                      or natural greetings like <code className="font-mono">&quot;Hi&quot;</code> or{' '}
                      <code className="font-mono">&quot;Hello&quot;</code>.
                    </p>
                  </div>

                  {isAdminOrOwner && (
                    <div className="flex items-center gap-2 shrink-0">
                      {tgIntegration.status === 'active' ? (
                        <button
                          type="button"
                          disabled={savingChannel !== null}
                          onClick={() => void handleChannelAction('telegram', 'deactivate')}
                          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold cursor-pointer"
                        >
                          <Power className="w-3.5 h-3.5" />
                          <span>Deactivate Channel</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={savingChannel !== null}
                          onClick={() => void handleChannelAction('telegram', 'activate')}
                          className="inline-flex items-center gap-1.5 py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Activate Customer Telegram Link</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* MODE A: Instant Central Bot Deep Link & QR Code */}
                {tgIntegration.deepLinkUrl && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center bg-slate-50 rounded-2xl p-5 border border-slate-200/80">
                    <div className="lg:col-span-8 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold uppercase">
                          Mode A · Zero BotFather Required
                        </span>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Central CustomCare Bot Deep-Link
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={tgIntegration.deepLinkUrl}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-mono text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              tgIntegration.deepLinkUrl!,
                              'Telegram deep link'
                            )
                          }
                          className="py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <p className="text-xs text-slate-500">
                        Public Token: <code className="font-mono">{tgIntegration.publicToken}</code>{' '}
                        · Works immediately without creating a bot in Telegram.
                      </p>

                      {isAdminOrOwner && (
                        <div className="pt-1">
                          <button
                            type="button"
                            disabled={savingChannel !== null}
                            onClick={() => void handleChannelAction('telegram', 'rotate_token')}
                            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Rotate &amp; Revoke Previous Link Token</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {tgIntegration.qrCodeSvgDataUrl && (
                      <div className="lg:col-span-4 flex flex-col items-center justify-center bg-white rounded-2xl p-4 border border-slate-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={tgIntegration.qrCodeSvgDataUrl}
                          alt={`Telegram QR code for ${organizationName}`}
                          className="w-36 h-36 rounded-lg"
                        />
                        <a
                          href={tgIntegration.qrCodeSvgDataUrl}
                          download={`${organizationSlug}-telegram-qr.svg`}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900"
                        >
                          <QrCode className="w-3.5 h-3.5" />
                          <span>Download SVG QR Code</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* MODE B: Optional Dedicated Business Sub-Bot (@BotFather Token) */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold uppercase">
                          Mode B · Optional Custom Branded Bot
                        </span>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Dedicated Business Sub-Bot (@BotFather Token)
                        </h3>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        Have your own Telegram bot from <code className="font-mono">@BotFather</code>?
                        Paste its token here (or send <code className="font-mono">/connectbot &lt;TOKEN&gt;</code>{' '}
                        to <code className="font-mono">@getcustomcarebot</code>). CustomCare automatically
                        registers its serverless webhook and slash commands so customers can message your
                        bot directly with <code className="font-mono">&quot;Hi&quot;</code> or{' '}
                        <code className="font-mono">/start</code>.
                      </p>
                    </div>
                  </div>

                  {tgIntegration.telegramConfig?.customBotUsername ? (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center bg-white rounded-xl p-4 border border-teal-200">
                      <div className="lg:col-span-8 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
                            Connected: @{tgIntegration.telegramConfig.customBotUsername}
                          </span>
                          {tgIntegration.telegramConfig.customBotTokenMasked && (
                            <span className="text-xs font-mono text-slate-500">
                              Token: {tgIntegration.telegramConfig.customBotTokenMasked}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 text-[11px] font-semibold">
                            Webhook:{' '}
                            {tgIntegration.telegramConfig.customBotWebhookRegistered
                              ? 'Verified & Active'
                              : 'Configured'}
                          </span>
                        </div>

                        {tgIntegration.telegramConfig.customBotDeepLinkUrl && (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={tgIntegration.telegramConfig.customBotDeepLinkUrl}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-900"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                copyToClipboard(
                                  tgIntegration.telegramConfig!.customBotDeepLinkUrl!,
                                  'Sub-Bot link'
                                )
                              }
                              className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy</span>
                            </button>
                            <a
                              href={tgIntegration.telegramConfig.customBotDeepLinkUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="py-2 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold inline-flex items-center gap-1 shrink-0"
                            >
                              <span>Open</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        )}

                        {isAdminOrOwner && (
                          <div className="pt-1">
                            <button
                              type="button"
                              disabled={savingChannel !== null}
                              onClick={() =>
                                void handleChannelAction('telegram', 'disconnect_subbot')
                              }
                              className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-xs font-bold text-rose-800 cursor-pointer"
                            >
                              <Unlink className="w-3.5 h-3.5" />
                              <span>Disconnect Sub-Bot</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {tgIntegration.telegramConfig.customBotQrCodeSvgDataUrl && (
                        <div className="lg:col-span-4 flex flex-col items-center justify-center bg-slate-50 rounded-xl p-3 border border-slate-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={tgIntegration.telegramConfig.customBotQrCodeSvgDataUrl}
                            alt={`Sub-Bot QR code for @${tgIntegration.telegramConfig.customBotUsername}`}
                            className="w-28 h-28 rounded-lg"
                          />
                          <span className="mt-1 text-[11px] font-mono text-slate-600">
                            @{tgIntegration.telegramConfig.customBotUsername}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {isAdminOrOwner && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <input
                        type="password"
                        value={customSubBotTokenInput}
                        onChange={(e) => setCustomSubBotTokenInput(e.target.value)}
                        placeholder="Paste @BotFather token (e.g. 123456789:AAH...)"
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-mono text-slate-900"
                      />
                      <button
                        type="button"
                        disabled={
                          savingChannel !== null || !customSubBotTokenInput.trim()
                        }
                        onClick={() =>
                          void handleChannelAction('telegram', 'connect_subbot', {
                            customBotToken: customSubBotTokenInput.trim(),
                          })
                        }
                        className="py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                      >
                        {tgIntegration.telegramConfig?.customBotUsername
                          ? 'Replace Sub-Bot Token'
                          : 'Connect Sub-Bot Token'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Business Bot Behavior Configuration */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleChannelAction('telegram', 'update_config', {
                      telegramConfig: {
                        welcomeMessage: tgWelcome,
                        supportCategories: tgCategories
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                        offlineMessage: tgOfflineMessage,
                        allowHumanEscalation: tgAllowEscalation,
                        escalationPriorityDefault: tgDefaultPriority,
                        notifyAssignedAgentOnTelegram: tgNotifyAgents,
                      },
                    });
                  }}
                  className="space-y-4 pt-2"
                >
                  <h3 className="text-sm font-bold text-slate-900">
                    Business Greeting, Topics &amp; Escalation Rules
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Customer Welcome Message (shown on /start or when customer says &quot;Hi&quot; / &quot;Hello&quot;)
                      </label>
                      <textarea
                        rows={2}
                        value={tgWelcome}
                        onChange={(e) => setTgWelcome(e.target.value)}
                        disabled={!isAdminOrOwner}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Supports <code className="font-mono">{'{name}'}</code> (customer&apos;s Telegram first name) and{' '}
                        <code className="font-mono">{'{business}'}</code> ({organizationName}). If{' '}
                        <code className="font-mono">{'{name}'}</code> is omitted, the bot automatically greets them with{' '}
                        <span className="font-semibold">Hi [First Name]! 👋</span>
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Support Categories (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={tgCategories}
                        onChange={(e) => setTgCategories(e.target.value)}
                        disabled={!isAdminOrOwner}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Default Escalation Priority
                      </label>
                      <select
                        value={tgDefaultPriority}
                        onChange={(e) =>
                          setTgDefaultPriority(e.target.value as EscalationPriority)
                        }
                        disabled={!isAdminOrOwner}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900"
                      >
                        <option value={EscalationPriority.Low}>Low</option>
                        <option value={EscalationPriority.Normal}>Normal</option>
                        <option value={EscalationPriority.High}>High</option>
                        <option value={EscalationPriority.Urgent}>Urgent</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Escalation / Specialist Handoff Message
                      </label>
                      <input
                        type="text"
                        value={tgOfflineMessage}
                        onChange={(e) => setTgOfflineMessage(e.target.value)}
                        disabled={!isAdminOrOwner}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 pt-1">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={tgAllowEscalation}
                        onChange={(e) => setTgAllowEscalation(e.target.checked)}
                        disabled={!isAdminOrOwner}
                        className="rounded border-slate-300"
                      />
                      <span>Allow customers to escalate to human specialists (/human)</span>
                    </label>

                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={tgNotifyAgents}
                        onChange={(e) => setTgNotifyAgents(e.target.checked)}
                        disabled={!isAdminOrOwner}
                        className="rounded border-slate-300"
                      />
                      <span>Notify linked Telegram agents on escalation</span>
                    </label>
                  </div>

                  {isAdminOrOwner && (
                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={savingChannel !== null}
                        className="py-2.5 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Save Telegram Bot Configuration
                      </button>
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 3: TELEGRAM AGENT INTERFACE & SECURE ACCOUNT LINKING
          ================================================================== */}
          {activeTab === 'agent_telegram' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-teal-600" />
                      <h2 className="text-lg font-bold text-slate-900">
                        Telegram Agent Workspace Connection
                      </h2>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-slate-600">
                      Link your personal Telegram account to receive escalations, inspect queues, add
                      private internal notes, and reply to customers on the go. Your personal
                      Telegram account is never exposed to customers.
                    </p>
                  </div>

                  <div className="shrink-0">
                    {currentUserLink ? (
                      <button
                        type="button"
                        onClick={() => void handleRevokeAgentLink(currentUserId, 'your account')}
                        className="inline-flex items-center gap-1.5 py-2 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold cursor-pointer"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                        <span>
                          Unlink My Telegram (@
                          {currentUserLink.telegramUsername || currentUserLink.telegramUserId})
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={generatingCode}
                        onClick={() => void handleGenerateAgentLinkCode()}
                        className="inline-flex items-center gap-1.5 py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                      >
                        <Link2 className="w-4 h-4" />
                        <span>
                          {generatingCode
                            ? 'Generating Code...'
                            : 'Generate 10-Min Agent Linking Code'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {generatedLinkCode && (
                  <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-900">
                        Single-Use Agent Linking Code (Expires in 10 minutes)
                      </span>
                      <span className="text-xs text-teal-800 font-mono">
                        Expires: {new Date(generatedLinkCode.expiresAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <code className="px-4 py-2.5 rounded-xl bg-white border border-teal-300 text-base font-mono font-bold text-slate-900">
                        /link {generatedLinkCode.linkingCode}
                      </code>
                      <button
                        type="button"
                        onClick={() =>
                          copyToClipboard(
                            `/link ${generatedLinkCode.linkingCode}`,
                            'agent linking command'
                          )
                        }
                        className="py-2.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Command</span>
                      </button>
                      <a
                        href={generatedLinkCode.deepLinkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="py-2.5 px-4 rounded-xl border border-teal-300 bg-white hover:bg-teal-50 text-teal-900 text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <span>Open in Telegram</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <p className="text-xs text-teal-900">
                      Send <code className="font-mono">/link {generatedLinkCode.linkingCode}</code>{' '}
                      to the central CustomCare bot from your Telegram account. Codes are hashed and
                      single-use.
                    </p>
                  </div>
                )}

                {/* Agent Command Reference */}
                <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-4 space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Supported Telegram Agent Commands (Synchronized with Web Workspace)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-slate-700 font-mono">
                    <div>/my — Assigned threads</div>
                    <div>/unassigned — Queue</div>
                    <div>/priority — High/Urgent</div>
                    <div>/search &lt;query&gt;</div>
                    <div>/open &lt;conv_id&gt;</div>
                    <div>/accept &lt;conv_id&gt;</div>
                    <div>/reply &lt;conv_id&gt; &lt;msg&gt;</div>
                    <div>/note &lt;conv_id&gt; &lt;note&gt;</div>
                    <div>/resolve &lt;conv_id&gt;</div>
                    <div>/reopen &lt;conv_id&gt;</div>
                    <div>/availability &lt;state&gt;</div>
                    <div>/workspace &lt;slug&gt;</div>
                  </div>
                </div>

                {/* Linked Specialists Table */}
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Linked Telegram Specialists in {organizationName}
                  </h3>
                  {agentLinks.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No specialists have linked a Telegram account in this workspace yet.
                    </p>
                  ) : (
                    <div className="rounded-xl border border-slate-200 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold">
                            <th className="py-2.5 px-4">Specialist</th>
                            <th className="py-2.5 px-4">Role</th>
                            <th className="py-2.5 px-4">Telegram Identity</th>
                            <th className="py-2.5 px-4">Status</th>
                            <th className="py-2.5 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {agentLinks.map((link) => (
                            <tr key={link.id}>
                              <td className="py-2.5 px-4">
                                <div className="font-semibold text-slate-900">
                                  {link.userFullName}
                                </div>
                                <div className="text-slate-500">{link.userEmail}</div>
                              </td>
                              <td className="py-2.5 px-4 uppercase font-semibold text-slate-700">
                                {link.role}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-slate-700">
                                {link.telegramUsername
                                  ? `@${link.telegramUsername}`
                                  : link.telegramUserId || 'Pending'}
                              </td>
                              <td className="py-2.5 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded font-bold ${
                                    link.status === 'linked'
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {link.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                {(isAdminOrOwner || link.userId === currentUserId) &&
                                  link.status !== 'revoked' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void handleRevokeAgentLink(
                                          link.userId,
                                          link.userFullName
                                        )
                                      }
                                      className="text-rose-700 hover:underline font-semibold cursor-pointer"
                                    >
                                      Revoke Link
                                    </button>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 4: OPTIONAL WEBSITE CHAT WIDGET
          ================================================================== */}
          {activeTab === 'web_widget' && widgetIntegration && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h2 className="text-lg font-bold text-slate-900">
                        Embeddable Website Chat Widget
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold ${
                          STATUS_BADGE_STYLES[widgetIntegration.status].className
                        }`}
                      >
                        {STATUS_BADGE_STYLES[widgetIntegration.status].label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs sm:text-sm text-slate-600">
                      Embed a lightweight customer support launcher on your existing website. Uses a
                      revocable public widget token and syncs with your unified inbox.
                    </p>
                  </div>

                  {isAdminOrOwner && (
                    <div className="flex items-center gap-2 shrink-0">
                      {widgetIntegration.status === 'active' ? (
                        <button
                          type="button"
                          disabled={savingChannel !== null}
                          onClick={() => void handleChannelAction('web_widget', 'deactivate')}
                          className="py-2 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold cursor-pointer"
                        >
                          Deactivate Widget
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={savingChannel !== null}
                          onClick={() => void handleChannelAction('web_widget', 'activate')}
                          className="py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                        >
                          Activate Website Widget
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {widgetIntegration.widgetEmbedScript && (
                  <div className="rounded-2xl bg-slate-900 text-slate-100 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
                        HTML Embed Snippet (Token: {widgetIntegration.publicToken})
                      </span>
                      <div className="flex items-center gap-2">
                        {isAdminOrOwner && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleChannelAction('web_widget', 'rotate_token')
                            }
                            className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                          >
                            Rotate Token
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(
                              widgetIntegration.widgetEmbedScript!,
                              'widget embed snippet'
                            )
                          }
                          className="py-1 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs font-bold text-white cursor-pointer"
                        >
                          Copy Snippet
                        </button>
                      </div>
                    </div>
                    <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap text-slate-200">
                      {widgetIntegration.widgetEmbedScript}
                    </pre>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleChannelAction('web_widget', 'update_config', {
                      widgetConfig: {
                        launcherTitle: wgtLauncherTitle,
                        welcomeGreeting: wgtGreeting,
                        primaryColor: wgtColor,
                        position: wgtPosition,
                        allowHumanEscalation: wgtAllowEscalation,
                      },
                    });
                  }}
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Widget Launcher Title
                    </label>
                    <input
                      type="text"
                      value={wgtLauncherTitle}
                      onChange={(e) => setWgtLauncherTitle(e.target.value)}
                      disabled={!isAdminOrOwner}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Launcher Position
                    </label>
                    <select
                      value={wgtPosition}
                      onChange={(e) =>
                        setWgtPosition(e.target.value as 'bottom-right' | 'bottom-left')
                      }
                      disabled={!isAdminOrOwner}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs text-slate-900"
                    >
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Welcome Greeting Message
                    </label>
                    <input
                      type="text"
                      value={wgtGreeting}
                      onChange={(e) => setWgtGreeting(e.target.value)}
                      disabled={!isAdminOrOwner}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                    />
                  </div>
                  {isAdminOrOwner && (
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={savingChannel !== null}
                        className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Save Widget Appearance
                      </button>
                    </div>
                  )}
                </form>

                {/* Live Widget API Simulator */}
                {widgetIntegration.status === 'active' && widgetIntegration.publicToken && (
                  <div className="pt-4 border-t border-slate-100 space-y-3">
                    <h3 className="text-sm font-bold text-slate-900">
                      Test Live Website Widget Intake
                    </h3>
                    <form
                      onSubmit={(e) =>
                        void handleTestWidgetMessage(e, widgetIntegration.publicToken!)
                      }
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={wgtTestMessage}
                        onChange={(e) => setWgtTestMessage(e.target.value)}
                        placeholder="Send a test customer message through the public widget API..."
                        className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={wgtTestSending || !wgtTestMessage.trim()}
                        className="py-2 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                      >
                        {wgtTestSending ? 'Sending...' : 'Send Test Message'}
                      </button>
                    </form>
                    {wgtTestReply && (
                      <div className="rounded-xl bg-teal-50 border border-teal-200 p-3 text-xs text-teal-950">
                        <strong>Bot Response:</strong> {wgtTestReply}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 5: OPTIONAL HOSTED CUSTOMER PORTAL
          ================================================================== */}
          {activeTab === 'portal' && portalIntegration && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-slate-900">
                      Hosted Customer-Support Portal
                    </h2>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold ${
                        STATUS_BADGE_STYLES[portalIntegration.status].className
                      }`}
                    >
                      {STATUS_BADGE_STYLES[portalIntegration.status].label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600">
                    Your hosted portal at <code>/portal/{organizationSlug}</code> remains private
                    until explicitly published. Businesses using only Telegram or the Website Widget
                    can keep the portal unpublished.
                  </p>
                </div>

                {isAdminOrOwner && (
                  <div className="flex items-center gap-2 shrink-0">
                    {portalIntegration.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => void handleChannelAction('portal', 'deactivate')}
                        className="py-2 px-4 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-bold cursor-pointer"
                      >
                        Unpublish Portal (Make Private)
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleChannelAction('portal', 'activate')}
                        className="py-2.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                      >
                        Publish Customer Portal
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 6: EMAIL SUPPORT CHANNEL
          ================================================================== */}
          {activeTab === 'email' && emailIntegration && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-bold text-slate-900">Email Support Channel</h2>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg border text-xs font-bold ${
                        STATUS_BADGE_STYLES[emailIntegration.status].className
                      }`}
                    >
                      {STATUS_BADGE_STYLES[emailIntegration.status].label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs sm:text-sm text-slate-600">
                    Transactional and escalation notifications are powered by Resend. Inbound email
                    routing into unified conversations requires a verified forwarding webhook.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

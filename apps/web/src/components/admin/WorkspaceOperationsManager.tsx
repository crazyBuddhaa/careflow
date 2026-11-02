'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  Send,
  Trash2,
  X,
  MessageSquare,
} from 'lucide-react';
import {
  ConversationStatus,
  SupportChannel,
  UserRole,
  type AgentAvailability,
  type ApiResponse,
  type WorkspaceAgentRecord,
  type WorkspaceAnalyticsSummary,
  type WorkspaceConversationItem,
  type WorkspaceCustomerRecord,
} from '@careflow/shared';

export type OperationsSubView = 'conversations' | 'customers' | 'agents' | 'analytics';

interface WorkspaceOperationsManagerProps {
  activeSubView: OperationsSubView;
  organizationName: string;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function WorkspaceOperationsManager({
  activeSubView,
  organizationName,
}: WorkspaceOperationsManagerProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Conversations state
  const [conversations, setConversations] = useState<WorkspaceConversationItem[]>([]);
  const [convStatusFilter, setConvStatusFilter] = useState<string>('all');
  const [convSearch, setConvSearch] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);

  // New conversation modal/form
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [newConvCustomerName, setNewConvCustomerName] = useState('');
  const [newConvCustomerEmail, setNewConvCustomerEmail] = useState('');
  const [newConvCategory, setNewConvCategory] = useState('General Support');
  const [newConvSubject, setNewConvSubject] = useState('');
  const [newConvMessage, setNewConvMessage] = useState('');

  // Customers state
  const [customers, setCustomers] = useState<WorkspaceCustomerRecord[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Agents state
  const [agents, setAgents] = useState<WorkspaceAgentRecord[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentFormOpen, setAgentFormOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentRole, setAgentRole] = useState<
    UserRole.Agent | UserRole.Supervisor | UserRole.Admin
  >(UserRole.Agent);
  const [agentSpecialty, setAgentSpecialty] = useState('Customer Support');
  const [savingAgent, setSavingAgent] = useState(false);

  // Analytics state
  const [analytics, setAnalytics] = useState<WorkspaceAnalyticsSummary | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => {
      setFeedback((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    setErrorBanner(null);
    try {
      const params = new URLSearchParams();
      if (convStatusFilter !== 'all') params.set('status', convStatusFilter);
      if (convSearch.trim()) params.set('search', convSearch.trim());
      const qs = params.toString() ? `?${params.toString()}` : '';

      const res = await fetch(`/api/admin/conversations${qs}`, { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<WorkspaceConversationItem[]>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setConversations(body.data);
      setSelectedConvId((prev) => {
        if (prev && body.data.some((c) => c.id === prev)) return prev;
        return body.data[0]?.id ?? null;
      });
    } catch {
      setErrorBanner('Unable to load workspace conversations.');
    } finally {
      setLoadingConversations(false);
    }
  }, [convStatusFilter, convSearch]);

  const loadCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    setErrorBanner(null);
    try {
      const qs = customerSearch.trim()
        ? `?search=${encodeURIComponent(customerSearch.trim())}`
        : '';
      const res = await fetch(`/api/admin/customers${qs}`, { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<WorkspaceCustomerRecord[]>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setCustomers(body.data);
    } catch {
      setErrorBanner('Unable to load workspace customer records.');
    } finally {
      setLoadingCustomers(false);
    }
  }, [customerSearch]);

  const loadAgents = useCallback(async () => {
    setLoadingAgents(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/agents', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<WorkspaceAgentRecord[]>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setAgents(body.data);
    } catch {
      setErrorBanner('Unable to load support specialists.');
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/analytics', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<WorkspaceAnalyticsSummary>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setAnalytics(body.data);
    } catch {
      setErrorBanner('Unable to compute workspace analytics.');
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  useEffect(() => {
    if (activeSubView === 'conversations') void loadConversations();
    if (activeSubView === 'customers') void loadCustomers();
    if (activeSubView === 'agents') void loadAgents();
    if (activeSubView === 'analytics') void loadAnalytics();
  }, [activeSubView, loadConversations, loadCustomers, loadAgents, loadAnalytics]);

  const activeConversation =
    conversations.find((c) => c.id === selectedConvId) ?? conversations[0] ?? null;

  async function handleSendReply(
    event: React.FormEvent,
    nextStatus?: ConversationStatus
  ) {
    event.preventDefault();
    if (!activeConversation || !replyBody.trim()) return;
    setSendingReply(true);
    setErrorBanner(null);

    try {
      const res = await fetch(
        `/api/admin/conversations/${encodeURIComponent(activeConversation.id)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            body: replyBody.trim(),
            nextStatus,
          }),
        }
      );
      const body = (await res.json()) as ApiResponse<WorkspaceConversationItem>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setReplyBody('');
      showFeedback(
        nextStatus === ConversationStatus.Resolved
          ? 'Sent specialist reply and marked conversation resolved.'
          : 'Sent specialist reply.'
      );
      await loadConversations();
    } catch {
      setErrorBanner('Network error while sending reply.');
    } finally {
      setSendingReply(false);
    }
  }

  async function handleUpdateConvStatus(
    convId: string,
    status: ConversationStatus
  ) {
    try {
      const res = await fetch(`/api/admin/conversations/${encodeURIComponent(convId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as ApiResponse<WorkspaceConversationItem>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      showFeedback(`Conversation status updated to ${status}.`);
      await loadConversations();
    } catch {
      setErrorBanner('Unable to update conversation status.');
    }
  }

  async function handleCreateConversation(event: React.FormEvent) {
    event.preventDefault();
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: newConvCustomerName,
          customerEmail: newConvCustomerEmail,
          channel: SupportChannel.Portal,
          category: newConvCategory,
          subject: newConvSubject,
          message: newConvMessage,
        }),
      });
      const body = (await res.json()) as ApiResponse<WorkspaceConversationItem>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setNewConvOpen(false);
      setNewConvCustomerName('');
      setNewConvCustomerEmail('');
      setNewConvSubject('');
      setNewConvMessage('');
      setSelectedConvId(body.data.id);
      showFeedback('Logged customer enquiry into workspace queue.');
      await loadConversations();
    } catch {
      setErrorBanner('Unable to create conversation.');
    }
  }

  async function handleCreateAgent(event: React.FormEvent) {
    event.preventDefault();
    setSavingAgent(true);
    setErrorBanner(null);
    try {
      const res = await fetch('/api/admin/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: agentName,
          email: agentEmail,
          role: agentRole,
          specialty: agentSpecialty,
          availability: 'available',
        }),
      });
      const body = (await res.json()) as ApiResponse<WorkspaceAgentRecord>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setAgentFormOpen(false);
      setAgentName('');
      setAgentEmail('');
      showFeedback(`Added ${body.data.displayName} to ${organizationName} support team.`);
      await loadAgents();
    } catch {
      setErrorBanner('Unable to add support specialist.');
    } finally {
      setSavingAgent(false);
    }
  }

  async function handleAgentAvailabilityChange(
    agentId: string,
    availability: AgentAvailability
  ) {
    try {
      const res = await fetch(`/api/admin/agents/${encodeURIComponent(agentId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability }),
      });
      const body = (await res.json()) as ApiResponse<WorkspaceAgentRecord>;
      if (body.ok) {
        showFeedback(`${body.data.displayName} is now ${availability}.`);
        await loadAgents();
      }
    } catch {
      setErrorBanner('Unable to update specialist availability.');
    }
  }

  async function handleRemoveAgent(agentId: string, name: string) {
    try {
      const res = await fetch(`/api/admin/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
      });
      const body = (await res.json()) as ApiResponse<{ deleted: boolean }>;
      if (body.ok) {
        showFeedback(`Removed ${name} from workspace roster.`);
        await loadAgents();
      }
    } catch {
      setErrorBanner('Unable to remove specialist.');
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm font-semibold text-teal-900 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs text-teal-700 hover:text-teal-950 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-xs text-red-700 hover:text-red-950 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =====================================================================
          1. CONVERSATIONS INBOX & ESCALATION QUEUE
      ====================================================================== */}
      {activeSubView === 'conversations' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-teal-700">
                  Operations · {organizationName}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Support Conversations
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Review escalated portal enquiries with attached troubleshooting context and reply
                  directly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewConvOpen(true)}
                className="inline-flex items-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Log Enquiry</span>
              </button>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Interactive Status Filter Buttons */}
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl self-start">
                {(
                  [
                    ['all', 'All'],
                    [ConversationStatus.Escalated, 'Escalated'],
                    [ConversationStatus.Open, 'Open'],
                    [ConversationStatus.Resolved, 'Resolved'],
                  ] as const
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setConvStatusFilter(val)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      convStatusFilter === val
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="w-full md:w-72 relative">
                <Search
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={convSearch}
                  onChange={(e) => setConvSearch(e.target.value)}
                  placeholder="Search subject or customer..."
                  aria-label="Search conversations"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {newConvOpen && (
            <form
              onSubmit={handleCreateConversation}
              className="rounded-2xl border border-blue-200 bg-white p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Log Customer Enquiry</h2>
                <button
                  type="button"
                  onClick={() => setNewConvOpen(false)}
                  aria-label="Close form"
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  value={newConvCustomerName}
                  onChange={(e) => setNewConvCustomerName(e.target.value)}
                  placeholder="Customer name"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <input
                  type="email"
                  required
                  value={newConvCustomerEmail}
                  onChange={(e) => setNewConvCustomerEmail(e.target.value)}
                  placeholder="Customer email"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={newConvCategory}
                  onChange={(e) => setNewConvCategory(e.target.value)}
                  placeholder="Category"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={newConvSubject}
                  onChange={(e) => setNewConvSubject(e.target.value)}
                  placeholder="Subject"
                  className="sm:col-span-3 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
                <textarea
                  rows={3}
                  required
                  value={newConvMessage}
                  onChange={(e) => setNewConvMessage(e.target.value)}
                  placeholder="Initial customer message..."
                  className="sm:col-span-3 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewConvOpen(false)}
                  className="py-1.5 px-3 text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Save Enquiry
                </button>
              </div>
            </form>
          )}

          {loadingConversations ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 space-y-3">
              <div className="h-14 rounded-xl bg-slate-100 animate-pulse" />
              <div className="h-14 rounded-xl bg-slate-100 animate-pulse" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center space-y-3">
              <MessageSquare className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-900">
                No conversations match the current filter
              </h2>
              <p className="text-xs text-slate-500">
                Escalations submitted by customers on your public portal appear here immediately.
              </p>
              <button
                type="button"
                onClick={() => setNewConvOpen(true)}
                className="py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
              >
                Log First Enquiry
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              {/* Left Queue List */}
              <div className="xl:col-span-5 rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                {conversations.map((conv) => {
                  const isSelected = activeConversation?.id === conv.id;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setSelectedConvId(conv.id)}
                      className={`w-full text-left p-5 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <p className="text-xs text-slate-500">
                        <span
                          className={
                            conv.status === ConversationStatus.Escalated
                              ? 'font-semibold text-red-700'
                              : conv.status === ConversationStatus.Resolved
                                ? 'font-semibold text-teal-700'
                                : 'font-semibold text-blue-700'
                          }
                        >
                          {conv.status.charAt(0).toUpperCase() + conv.status.slice(1)}
                        </span>
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        <span>{conv.category}</span>
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono tabular-nums">
                          {formatDateTime(conv.updatedAt)}
                        </span>
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-900 line-clamp-1">
                        {conv.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600 truncate">
                        {conv.customerName} · {conv.customerEmail}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Right Active Thread Inspector */}
              {activeConversation && (
                <div className="xl:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4">
                    <div>
                      <p className="text-xs text-slate-500">
                        {activeConversation.category} · Channel: {activeConversation.channel}
                        {activeConversation.customerExternalRef && (
                          <>
                            {' '}
                            · Ref:{' '}
                            <span className="font-mono text-slate-800">
                              {activeConversation.customerExternalRef}
                            </span>
                          </>
                        )}
                      </p>
                      <h2 className="mt-1 text-lg font-bold text-slate-900">
                        {activeConversation.subject}
                      </h2>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Customer: <strong>{activeConversation.customerName}</strong> (
                        {activeConversation.customerEmail})
                        {activeConversation.assignedAgentName && (
                          <> · Specialist: {activeConversation.assignedAgentName}</>
                        )}
                      </p>
                    </div>

                    <select
                      aria-label="Conversation status"
                      value={activeConversation.status}
                      onChange={(e) =>
                        handleUpdateConvStatus(
                          activeConversation.id,
                          e.target.value as ConversationStatus
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none shrink-0"
                    >
                      <option value={ConversationStatus.Open}>Open</option>
                      <option value={ConversationStatus.Troubleshooting}>Troubleshooting</option>
                      <option value={ConversationStatus.Escalated}>Escalated</option>
                      <option value={ConversationStatus.Resolved}>Resolved</option>
                    </select>
                  </div>

                  {/* Message Thread */}
                  <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                    {activeConversation.messages.map((m) => {
                      const isSystem = m.senderType === 'system';
                      const isAgent = m.senderType === 'agent';
                      return (
                        <div
                          key={m.id}
                          className={`rounded-xl p-3.5 text-sm ${
                            isSystem
                              ? 'bg-amber-50/70 border border-amber-200/70 text-slate-800 text-xs'
                              : isAgent
                                ? 'bg-blue-50/70 border border-blue-100 text-slate-900 ml-6'
                                : 'bg-slate-50 border border-slate-200/70 text-slate-900 mr-6'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                            <span className="font-semibold text-slate-800">{m.senderName}</span>
                            <span className="font-mono tabular-nums">
                              {formatDateTime(m.createdAt)}
                            </span>
                          </div>
                          <p className="leading-relaxed whitespace-pre-line">{m.body}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Agent Reply Composer */}
                  <form
                    onSubmit={(e) => handleSendReply(e)}
                    className="pt-4 border-t border-slate-100 space-y-3"
                  >
                    <textarea
                      rows={3}
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      placeholder={`Write a reply to ${activeConversation.customerName}...`}
                      className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {activeConversation.status !== ConversationStatus.Resolved && (
                        <button
                          type="button"
                          disabled={sendingReply || !replyBody.trim()}
                          onClick={(e) => handleSendReply(e, ConversationStatus.Resolved)}
                          className="py-2 px-4 text-xs font-semibold text-teal-900 bg-teal-50 hover:bg-teal-100 disabled:opacity-50 rounded-xl whitespace-nowrap cursor-pointer"
                        >
                          Reply &amp; Mark Resolved
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={sendingReply || !replyBody.trim()}
                        className="inline-flex items-center gap-1.5 py-2 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl whitespace-nowrap cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{sendingReply ? 'Sending...' : 'Send Reply'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          2. CUSTOMERS DIRECTORY
      ====================================================================== */}
      {activeSubView === 'customers' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-teal-700">
                Operations · {organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Customer Directory
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Organization-isolated customer records and support interaction totals.
              </p>
            </div>
            <div className="w-full sm:w-72 relative">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search name, email, or ref..."
                aria-label="Search customers"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            {loadingCustomers ? (
              <div className="p-8 space-y-3">
                <div className="h-10 rounded bg-slate-100 animate-pulse" />
                <div className="h-10 rounded bg-slate-100 animate-pulse" />
              </div>
            ) : customers.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm font-semibold text-slate-900">No matching customer records</p>
                <p className="mt-1 text-xs text-slate-500">
                  Customers are indexed automatically when enquiries enter this business workspace.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 px-5">Customer</th>
                    <th className="py-3.5 px-5">External Reference</th>
                    <th className="py-3.5 px-5">Channel</th>
                    <th className="py-3.5 px-5 text-right">Total Threads</th>
                    <th className="py-3.5 px-5 text-right">Open</th>
                    <th className="py-3.5 px-5 text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {customers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-slate-900">{cust.displayName}</p>
                        <p className="text-xs text-slate-500">{cust.email}</p>
                      </td>
                      <td className="py-3.5 px-5 font-mono text-xs text-slate-700">
                        {cust.externalRef || '—'}
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-600">
                        {cust.preferredChannel}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-slate-900">
                        {cust.totalConversations}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-slate-900">
                        {cust.openConversations}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-xs text-slate-500">
                        {formatDateTime(cust.lastInteractionAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          3. SUPPORT AGENTS & SPECIALISTS
      ====================================================================== */}
      {activeSubView === 'agents' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-teal-700">
                Operations · {organizationName}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Human Support Specialists
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Manage specialist roles, queue availability, and escalation routing for{' '}
                {organizationName}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAgentFormOpen(true)}
              className="inline-flex items-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Add Specialist</span>
            </button>
          </div>

          {agentFormOpen && (
            <form
              onSubmit={handleCreateAgent}
              className="rounded-2xl border border-blue-200 bg-white p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Add Support Specialist</h2>
                <button
                  type="button"
                  onClick={() => setAgentFormOpen(false)}
                  aria-label="Close form"
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="agt-name"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Full Name
                  </label>
                  <input
                    id="agt-name"
                    type="text"
                    required
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="Specialist name"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="agt-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Work Email
                  </label>
                  <input
                    id="agt-email"
                    type="email"
                    required
                    value={agentEmail}
                    onChange={(e) => setAgentEmail(e.target.value)}
                    placeholder="specialist@company.com"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="agt-role"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Workspace Role
                  </label>
                  <select
                    id="agt-role"
                    value={agentRole}
                    onChange={(e) =>
                      setAgentRole(
                        e.target.value as UserRole.Agent | UserRole.Supervisor | UserRole.Admin
                      )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  >
                    <option value={UserRole.Agent}>Agent</option>
                    <option value={UserRole.Supervisor}>Supervisor</option>
                    <option value={UserRole.Admin}>Administrator</option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="agt-spec"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Specialty Queue
                  </label>
                  <input
                    id="agt-spec"
                    type="text"
                    required
                    value={agentSpecialty}
                    onChange={(e) => setAgentSpecialty(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAgentFormOpen(false)}
                  className="py-2 px-4 text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAgent}
                  className="py-2 px-5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  {savingAgent ? 'Adding...' : 'Add Specialist'}
                </button>
              </div>
            </form>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white overflow-x-auto">
            {loadingAgents ? (
              <div className="p-8 space-y-3">
                <div className="h-10 rounded bg-slate-100 animate-pulse" />
                <div className="h-10 rounded bg-slate-100 animate-pulse" />
              </div>
            ) : agents.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  No support specialists added yet
                </p>
                <button
                  type="button"
                  onClick={() => setAgentFormOpen(true)}
                  className="py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Add First Specialist
                </button>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 px-5">Specialist</th>
                    <th className="py-3.5 px-5">Role &amp; Specialty</th>
                    <th className="py-3.5 px-5 text-right">Active Load</th>
                    <th className="py-3.5 px-5">Availability</th>
                    <th className="py-3.5 px-5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {agents.map((agt) => (
                    <tr key={agt.id} className="hover:bg-slate-50/70">
                      <td className="py-3.5 px-5">
                        <p className="font-semibold text-slate-900">{agt.displayName}</p>
                        <p className="text-xs text-slate-500">{agt.email}</p>
                      </td>
                      <td className="py-3.5 px-5 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">
                          {agt.role.charAt(0).toUpperCase() + agt.role.slice(1)}
                        </span>{' '}
                        · {agt.specialty}
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono tabular-nums text-slate-900">
                        {agt.activeConversations}
                      </td>
                      <td className="py-3.5 px-5">
                        <select
                          aria-label={`Availability for ${agt.displayName}`}
                          value={agt.availability}
                          onChange={(e) =>
                            handleAgentAvailabilityChange(
                              agt.id,
                              e.target.value as AgentAvailability
                            )
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 focus:border-blue-600 focus:outline-none"
                        >
                          <option value="available">Available</option>
                          <option value="busy">Busy</option>
                          <option value="offline">Offline</option>
                        </select>
                      </td>
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveAgent(agt.id, agt.displayName)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Remove</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          4. WORKSPACE ANALYTICS (REAL SQL COUNTS — ZERO FAKE SCORES)
      ====================================================================== */}
      {activeSubView === 'analytics' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 sm:p-8">
            <p className="text-xs font-semibold text-teal-700">
              Operations · {organizationName}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Workspace Support Metrics
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Live counts computed directly from {organizationName}&apos;s isolated knowledge base
              and conversation tables.
            </p>

            {loadingAnalytics || !analytics ? (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
                <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
              </div>
            ) : (
              <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <p className="text-xs text-slate-500">Total Conversations</p>
                  <p className="mt-1.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                    {analytics.conversations.total}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                    {analytics.conversations.resolved} resolved ·{' '}
                    {analytics.conversations.escalated} escalated
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Published Knowledge</p>
                  <p className="mt-1.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                    {analytics.knowledge.publishedArticles + analytics.knowledge.publishedFaqs}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                    {analytics.knowledge.publishedArticles} articles ·{' '}
                    {analytics.knowledge.publishedFaqs} FAQs
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Active Procedures</p>
                  <p className="mt-1.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                    {analytics.knowledge.publishedProcedures}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                    Across {analytics.knowledge.totalCategories} categories
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">Available Specialists</p>
                  <p className="mt-1.5 text-3xl font-bold text-slate-900 font-mono tabular-nums">
                    {analytics.team.availableSpecialists} / {analytics.team.totalSpecialists}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Human escalation coverage</p>
                </div>
              </div>
            )}
          </div>

          {analytics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">
                  Enquiries by Topic Category
                </h2>
                {analytics.topCategories.length === 0 ? (
                  <p className="text-xs text-slate-500">No conversations recorded yet.</p>
                ) : (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    {analytics.topCategories.map((item) => {
                      const pct =
                        analytics.conversations.total > 0
                          ? Math.round((item.count / analytics.conversations.total) * 100)
                          : 0;
                      return (
                        <div key={item.category} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800">{item.category}</span>
                            <span className="font-mono tabular-nums text-slate-500">
                              {item.count} ({pct}%)
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-blue-600 rounded-full"
                              style={{ width: `${Math.max(pct, 6)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900">Intake Channels</h2>
                {analytics.channels.length === 0 ? (
                  <p className="text-xs text-slate-500">No channel activity recorded yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
                    {analytics.channels.map((ch) => (
                      <div
                        key={ch.channel}
                        className="py-3 flex items-center justify-between gap-4"
                      >
                        <span className="font-semibold text-slate-800">{ch.channel}</span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {ch.count} threads
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  Lock,
  Bookmark,
  History,
  UserCheck,
} from 'lucide-react';
import {
  ConversationStatus,
  EscalationPriority,
  SupportChannel,
  UserRole,
  type AgentAvailability,
  type ApiResponse,
  type SavedReplyRecord,
  type WorkspaceAgentRecord,
  type WorkspaceAnalyticsSummary,
  type WorkspaceConversationItem,
  type WorkspaceCustomerRecord,
} from '@careflow/shared';

export type OperationsSubView = 'conversations' | 'customers' | 'agents' | 'analytics';

interface WorkspaceOperationsManagerProps {
  activeSubView: OperationsSubView;
  organizationName: string;
  currentUserName?: string;
  currentUserRole?: UserRole;
  onNavigateSubView?: (view: OperationsSubView) => void;
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
  currentUserName,
  currentUserRole = UserRole.Owner,
  onNavigateSubView,
}: WorkspaceOperationsManagerProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Conversations state & unified inbox filters
  const [conversations, setConversations] = useState<WorkspaceConversationItem[]>([]);
  const [inboxPreset, setInboxPreset] = useState<
    'all' | 'my' | 'unassigned' | 'escalated' | 'open' | 'pending' | 'priority' | 'resolved'
  >('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [convSearch, setConvSearch] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sendingReply, setSendingReply] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);

  // Saved replies state
  const [savedReplies, setSavedReplies] = useState<SavedReplyRecord[]>([]);
  const [savedReplyModalOpen, setSavedReplyModalOpen] = useState(false);
  const [newSavedReplyTitle, setNewSavedReplyTitle] = useState('');
  const [newSavedReplyCategory, setNewSavedReplyCategory] = useState('General');
  const [newSavedReplyBody, setNewSavedReplyBody] = useState('');

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

  const canAssignOthers =
    currentUserRole === UserRole.Owner ||
    currentUserRole === UserRole.Admin ||
    currentUserRole === UserRole.Supervisor;

  const isViewer = currentUserRole === UserRole.Viewer;

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
      if (inboxPreset === 'my') params.set('assignedTo', 'me');
      else if (inboxPreset === 'unassigned') params.set('assignedTo', 'unassigned');
      else if (inboxPreset === 'priority') params.set('priority', 'high_or_urgent');
      else if (inboxPreset === 'escalated') params.set('status', ConversationStatus.Escalated);
      else if (inboxPreset === 'open') params.set('status', ConversationStatus.Open);
      else if (inboxPreset === 'pending') params.set('status', ConversationStatus.Pending);
      else if (inboxPreset === 'resolved') params.set('status', ConversationStatus.Resolved);

      if (channelFilter !== 'all') params.set('channel', channelFilter);
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
  }, [inboxPreset, channelFilter, convSearch]);

  const loadSavedReplies = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/saved-replies', { cache: 'no-store' });
      const body = (await res.json()) as ApiResponse<SavedReplyRecord[]>;
      if (body.ok) {
        setSavedReplies(body.data);
      }
    } catch {
      // ignore
    }
  }, []);

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
    if (activeSubView === 'conversations') {
      void loadConversations();
      void loadSavedReplies();
      void loadAgents();
    }
    if (activeSubView === 'customers') void loadCustomers();
    if (activeSubView === 'agents') void loadAgents();
    if (activeSubView === 'analytics') void loadAnalytics();
  }, [
    activeSubView,
    loadConversations,
    loadSavedReplies,
    loadCustomers,
    loadAgents,
    loadAnalytics,
  ]);

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
            isInternalNote,
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
        isInternalNote
          ? 'Saved private internal note (hidden from customer).'
          : nextStatus === ConversationStatus.Resolved
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

  async function handlePatchConversation(
    convId: string,
    payload: {
      status?: ConversationStatus;
      priority?: EscalationPriority;
      category?: string;
      assignedAgentName?: string | null;
    }
  ) {
    try {
      const res = await fetch(`/api/admin/conversations/${encodeURIComponent(convId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as ApiResponse<WorkspaceConversationItem>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      showFeedback('Updated conversation metadata.');
      await loadConversations();
    } catch {
      setErrorBanner('Unable to update conversation.');
    }
  }

  async function handleCreateSavedReply(e: React.FormEvent) {
    e.preventDefault();
    if (!newSavedReplyTitle.trim() || !newSavedReplyBody.trim()) return;
    try {
      const res = await fetch('/api/admin/saved-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newSavedReplyTitle.trim(),
          category: newSavedReplyCategory.trim() || 'General',
          body: newSavedReplyBody.trim(),
        }),
      });
      const body = (await res.json()) as ApiResponse<SavedReplyRecord>;
      if (!body.ok) {
        setErrorBanner(body.error.message);
        return;
      }
      setSavedReplyModalOpen(false);
      setNewSavedReplyTitle('');
      setNewSavedReplyBody('');
      showFeedback(`Created saved reply "${body.data.title}".`);
      await loadSavedReplies();
    } catch {
      setErrorBanner('Unable to create saved reply.');
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

  const isBusinessManager =
    currentUserRole === UserRole.Owner || currentUserRole === UserRole.Admin;

  return (
    <div className="space-y-6">
      {onNavigateSubView && (
        <div className="rounded-2xl border border-slate-200 bg-white p-2 flex flex-wrap items-center gap-1.5">
          {(
            isBusinessManager
              ? ([
                  ['conversations', 'Support Inbox'],
                  ['customers', 'Customers'],
                  ['agents', 'Team & Specialists'],
                  ['analytics', 'Analytics & Metrics'],
                ] as const)
              : ([
                  ['conversations', 'My Support Inbox'],
                  ['customers', 'Customer Directory'],
                ] as const)
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigateSubView(key)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                activeSubView === key
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

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
          1. UNIFIED MULTI-CHANNEL CONVERSATIONS INBOX & ESCALATION QUEUE
      ====================================================================== */}
      {activeSubView === 'conversations' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-teal-700">
                  Unified Support Inbox · {organizationName}
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                  Support Conversations
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Manage customer conversations across Telegram, Website Chat Widget, and Hosted
                  Support Portal in one synchronized team workspace.
                </p>
              </div>
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => setNewConvOpen(true)}
                  className="inline-flex items-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap self-start sm:self-auto cursor-pointer"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>Log Enquiry</span>
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {/* Inbox Queue Preset Filter Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      ['all', 'All'],
                      ['my', 'My Assigned'],
                      ['unassigned', 'Unassigned'],
                      ['escalated', 'Escalated'],
                      ['open', 'Open'],
                      ['pending', 'Pending'],
                      ['priority', 'High Priority'],
                      ['resolved', 'Resolved'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setInboxPreset(val)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                        inboxPreset === val
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Channel Filter + Search */}
                <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                  <select
                    aria-label="Filter by channel"
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800"
                  >
                    <option value="all">All Channels</option>
                    <option value={SupportChannel.Telegram}>Telegram</option>
                    <option value={SupportChannel.Portal}>Customer Portal</option>
                    <option value={SupportChannel.WebWidget}>Website Widget</option>
                    <option value={SupportChannel.Email}>Email</option>
                  </select>

                  <div className="flex-1 md:w-64 relative">
                    <Search
                      className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      type="search"
                      value={convSearch}
                      onChange={(e) => setConvSearch(e.target.value)}
                      placeholder="Search subject, customer, ref..."
                      aria-label="Search conversations"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
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

          {savedReplyModalOpen && (
            <form
              onSubmit={handleCreateSavedReply}
              className="rounded-2xl border border-teal-200 bg-white p-6 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-bold text-slate-900">Create Saved Reply Template</h2>
                <button
                  type="button"
                  onClick={() => setSavedReplyModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={newSavedReplyTitle}
                  onChange={(e) => setNewSavedReplyTitle(e.target.value)}
                  placeholder="Template title (e.g. Refund Confirmation)"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
                <input
                  type="text"
                  value={newSavedReplyCategory}
                  onChange={(e) => setNewSavedReplyCategory(e.target.value)}
                  placeholder="Category (e.g. Billing)"
                  className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
                <textarea
                  rows={3}
                  required
                  value={newSavedReplyBody}
                  onChange={(e) => setNewSavedReplyBody(e.target.value)}
                  placeholder="Saved reply message body..."
                  className="sm:col-span-2 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSavedReplyModalOpen(false)}
                  className="py-1.5 px-3 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="py-2 px-4 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg cursor-pointer"
                >
                  Save Template
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
                Customer conversations from Telegram, your Website Widget, and your Support Portal
                appear here automatically.
              </p>
              {!isViewer && (
                <button
                  type="button"
                  onClick={() => setNewConvOpen(true)}
                  className="py-2 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                >
                  Log First Enquiry
                </button>
              )}
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
                      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={
                              conv.status === ConversationStatus.Escalated
                                ? 'font-bold text-red-700'
                                : conv.status === ConversationStatus.Resolved
                                  ? 'font-bold text-teal-700'
                                  : conv.status === ConversationStatus.Pending
                                    ? 'font-bold text-amber-700'
                                    : 'font-bold text-blue-700'
                            }
                          >
                            {conv.status.toUpperCase()}
                          </span>
                          <span>·</span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] uppercase">
                            {conv.channel}
                          </span>
                          {(conv.priority === EscalationPriority.High ||
                            conv.priority === EscalationPriority.Urgent) && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px] uppercase">
                              {conv.priority}
                            </span>
                          )}
                        </div>
                        <span className="font-mono tabular-nums shrink-0">
                          {formatDateTime(conv.updatedAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-bold text-slate-900 line-clamp-1">
                        {conv.subject}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-600">
                        <span className="truncate">
                          {conv.customerName} · {conv.customerEmail}
                        </span>
                        <span className="text-[11px] text-slate-500 shrink-0">
                          {conv.assignedAgentName ? `👤 ${conv.assignedAgentName}` : 'Unassigned'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Right Active Thread Inspector */}
              {activeConversation && (
                <div className="xl:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 space-y-5">
                  <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold uppercase text-[11px]">
                            {activeConversation.channel}
                          </span>
                          <span>·</span>
                          <span>{activeConversation.category}</span>
                          {activeConversation.customerExternalRef && (
                            <>
                              <span>·</span>
                              <span className="font-mono text-slate-800">
                                {activeConversation.customerExternalRef}
                              </span>
                            </>
                          )}
                        </div>
                        <h2 className="mt-1.5 text-lg font-bold text-slate-900">
                          {activeConversation.subject}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-600">
                          Customer: <strong>{activeConversation.customerName}</strong> (
                          {activeConversation.customerEmail})
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {/* Accept Quick Button for Unassigned */}
                        {!isViewer &&
                          !activeConversation.assignedAgentName &&
                          currentUserName && (
                            <button
                              type="button"
                              onClick={() =>
                                void handlePatchConversation(activeConversation.id, {
                                  assignedAgentName: currentUserName,
                                })
                              }
                              className="inline-flex items-center gap-1 py-1.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Accept</span>
                            </button>
                          )}

                        <button
                          type="button"
                          onClick={() => setShowActivityLog((v) => !v)}
                          className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Activity ({activeConversation.activityLogs?.length ?? 0})</span>
                        </button>
                      </div>
                    </div>

                    {/* Metadata Controls: Status, Priority, Assignment */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Status
                        </label>
                        <select
                          aria-label="Conversation status"
                          disabled={isViewer}
                          value={activeConversation.status}
                          onChange={(e) =>
                            void handlePatchConversation(activeConversation.id, {
                              status: e.target.value as ConversationStatus,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          <option value={ConversationStatus.Open}>Open</option>
                          <option value={ConversationStatus.Pending}>Pending</option>
                          <option value={ConversationStatus.Troubleshooting}>
                            Troubleshooting
                          </option>
                          <option value={ConversationStatus.Escalated}>Escalated</option>
                          <option value={ConversationStatus.Resolved}>Resolved</option>
                          <option value={ConversationStatus.Closed}>Closed</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Priority
                        </label>
                        <select
                          aria-label="Conversation priority"
                          disabled={isViewer}
                          value={activeConversation.priority}
                          onChange={(e) =>
                            void handlePatchConversation(activeConversation.id, {
                              priority: e.target.value as EscalationPriority,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          <option value={EscalationPriority.Low}>Low</option>
                          <option value={EscalationPriority.Normal}>Normal</option>
                          <option value={EscalationPriority.High}>High</option>
                          <option value={EscalationPriority.Urgent}>Urgent</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                          Assigned Specialist
                        </label>
                        <select
                          aria-label="Assigned specialist"
                          disabled={isViewer || (!canAssignOthers && Boolean(activeConversation.assignedAgentName))}
                          value={activeConversation.assignedAgentName ?? ''}
                          onChange={(e) =>
                            void handlePatchConversation(activeConversation.id, {
                              assignedAgentName: e.target.value || null,
                            })
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
                        >
                          <option value="">Unassigned</option>
                          {currentUserName &&
                            !agents.some((a) => a.displayName === currentUserName) && (
                              <option value={currentUserName}>{currentUserName} (You)</option>
                            )}
                          {agents.map((agt) => (
                            <option key={agt.id} value={agt.displayName}>
                              {agt.displayName} ({agt.role})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Optional Activity Log Drawer */}
                    {showActivityLog && activeConversation.activityLogs && (
                      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2 max-h-40 overflow-y-auto">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Conversation Audit &amp; Assignment History
                        </p>
                        {activeConversation.activityLogs.length === 0 ? (
                          <p className="text-xs text-slate-500">No activity recorded yet.</p>
                        ) : (
                          activeConversation.activityLogs.map((log) => (
                            <div
                              key={log.id}
                              className="flex items-center justify-between gap-2 text-xs text-slate-700"
                            >
                              <span>
                                <strong>{log.actorName}</strong>: {log.details}
                              </span>
                              <span className="font-mono text-[11px] text-slate-400 shrink-0">
                                {formatDateTime(log.createdAt)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Message Thread */}
                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                    {activeConversation.messages.map((m) => {
                      const isSystem = m.senderType === 'system';
                      const isBot = m.senderType === 'bot';
                      const isAgent = m.senderType === 'agent';
                      const isNote = Boolean(m.isInternalNote);
                      return (
                        <div
                          key={m.id}
                          className={`rounded-xl p-3.5 text-sm ${
                            isNote
                              ? 'bg-amber-50 border border-amber-300 text-amber-950 ml-4'
                              : isSystem
                                ? 'bg-slate-100 border border-slate-200 text-slate-700 text-xs'
                                : isBot
                                  ? 'bg-teal-50/70 border border-teal-100 text-slate-900 ml-4'
                                  : isAgent
                                    ? 'bg-blue-50/70 border border-blue-100 text-slate-900 ml-6'
                                    : 'bg-slate-50 border border-slate-200/70 text-slate-900 mr-6'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1">
                            <div className="flex items-center gap-1.5">
                              {isNote && <Lock className="w-3.5 h-3.5 text-amber-700" />}
                              <span className="font-semibold text-slate-900">{m.senderName}</span>
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/80 text-slate-600 font-semibold">
                                {isNote ? 'Internal Note' : m.senderType}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 font-mono tabular-nums text-[11px]">
                              {m.deliveryStatus && m.senderType === 'agent' && !isNote && (
                                <span
                                  className={
                                    m.deliveryStatus === 'failed'
                                      ? 'text-rose-600 font-bold'
                                      : 'text-teal-700'
                                  }
                                >
                                  {m.deliveryStatus}
                                </span>
                              )}
                              <span>{formatDateTime(m.createdAt)}</span>
                            </div>
                          </div>
                          <p className="leading-relaxed whitespace-pre-line">{m.body}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Agent Reply & Internal Note Composer */}
                  {!isViewer && (
                    <form
                      onSubmit={(e) => handleSendReply(e)}
                      className="pt-4 border-t border-slate-100 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* Mode Toggle: Public Reply vs Private Internal Note */}
                        <div className="inline-flex p-1 rounded-xl bg-slate-100">
                          <button
                            type="button"
                            onClick={() => setIsInternalNote(false)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                              !isInternalNote
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600'
                            }`}
                          >
                            Reply to Customer ({activeConversation.channel})
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsInternalNote(true)}
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                              isInternalNote
                                ? 'bg-amber-500 text-white shadow-2xs'
                                : 'text-slate-600'
                            }`}
                          >
                            <Lock className="w-3 h-3" />
                            <span>Internal Team Note</span>
                          </button>
                        </div>

                        {/* Saved Replies Selector */}
                        <div className="flex items-center gap-1.5">
                          <Bookmark className="w-3.5 h-3.5 text-slate-400" />
                          <select
                            aria-label="Insert saved reply"
                            value=""
                            onChange={(e) => {
                              const found = savedReplies.find((r) => r.id === e.target.value);
                              if (found) {
                                setReplyBody((prev) =>
                                  prev ? `${prev}\n${found.body}` : found.body
                                );
                              }
                            }}
                            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                          >
                            <option value="">Insert Saved Reply...</option>
                            {savedReplies.map((sr) => (
                              <option key={sr.id} value={sr.id}>
                                {sr.title} ({sr.category})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setSavedReplyModalOpen(true)}
                            className="py-1 px-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                            title="Create saved reply"
                          >
                            + Template
                          </button>
                        </div>
                      </div>

                      <textarea
                        rows={3}
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder={
                          isInternalNote
                            ? 'Add a private internal note visible only to your support team...'
                            : `Write a reply to ${activeConversation.customerName} (delivered via ${activeConversation.channel})...`
                        }
                        className={`w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none ${
                          isInternalNote
                            ? 'border-amber-300 bg-amber-50/40 focus:border-amber-500'
                            : 'border-slate-300 focus:border-blue-600'
                        }`}
                      />
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {!isInternalNote &&
                          activeConversation.status !== ConversationStatus.Resolved && (
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
                          className={`inline-flex items-center gap-1.5 py-2 px-5 text-xs font-semibold text-white disabled:opacity-50 rounded-xl whitespace-nowrap cursor-pointer ${
                            isInternalNote
                              ? 'bg-amber-600 hover:bg-amber-700'
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {isInternalNote ? (
                            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                          ) : (
                            <Send className="w-3.5 h-3.5" aria-hidden="true" />
                          )}
                          <span>
                            {sendingReply
                              ? 'Saving...'
                              : isInternalNote
                                ? 'Save Internal Note'
                                : 'Send Reply'}
                          </span>
                        </button>
                      </div>
                    </form>
                  )}
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
                Manage specialist roles, queue availability, Telegram Agent connection status, and
                escalation routing for {organizationName}.
              </p>
            </div>
            {(currentUserRole === UserRole.Owner || currentUserRole === UserRole.Admin) && (
              <button
                type="button"
                onClick={() => setAgentFormOpen(true)}
                className="inline-flex items-center gap-2 py-2.5 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Add Specialist</span>
              </button>
            )}
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
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <th className="py-3.5 px-5">Specialist</th>
                    <th className="py-3.5 px-5">Role &amp; Specialty</th>
                    <th className="py-3.5 px-5">Telegram App</th>
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
                      <td className="py-3.5 px-5 text-xs">
                        {agt.telegramLinked ? (
                          <span className="px-2 py-0.5 rounded bg-teal-50 text-teal-800 font-semibold">
                            {agt.telegramUsername ? `@${agt.telegramUsername}` : 'Linked'}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not Linked</span>
                        )}
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
                        {(currentUserRole === UserRole.Owner ||
                          currentUserRole === UserRole.Admin) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAgent(agt.id, agt.displayName)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Remove</span>
                          </button>
                        )}
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
              Real-time support activity, published knowledge coverage, and specialist availability
              for {organizationName}.
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

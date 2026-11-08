'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Filter,
  FolderPlus,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  MessageSquare,
  PackageCheck,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  type ApiResponse,
  type ClaimStatus,
  type ComplaintCategoryRecord,
  type ComplaintCustomFieldDefinition,
  EscalationPriority,
  type OrganizationOperationsConfig,
  type ReplacementInventoryItemRecord,
  SupportChannel,
  type SupportComplaintRecord,
  UserRole,
  type WorkspaceAgentRecord,
} from '@careflow/shared';

interface ClaimsWorkspaceDto {
  config: OrganizationOperationsConfig;
  categories: ComplaintCategoryRecord[];
  complaints: SupportComplaintRecord[];
  supervisors: WorkspaceAgentRecord[];
  agents: WorkspaceAgentRecord[];
  availableReplacements: ReplacementInventoryItemRecord[];
}

interface ClaimsAndSupervisorManagerProps {
  mode: 'claims' | 'supervisor';
  currentUserId?: string;
  currentUserName: string;
  currentUserRole: UserRole;
  initialLinkedConversation?: {
    conversationId: string;
    customerName: string;
    customerEmail: string;
    channel: SupportChannel;
    subject: string;
  } | null;
  onClearInitialConversation?: () => void;
}

const SUPERVISOR_QUEUES: Array<{
  key: ClaimStatus | 'all';
  label: string;
  badgeColor: string;
}> = [
  {
    key: 'pending_review',
    label: '1. Pending Review',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    key: 'in_progress',
    label: '2. In Progress',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    key: 'awaiting_information',
    label: '3. Awaiting Information',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    key: 'approved',
    label: '4. Approved',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    key: 'awaiting_replacement',
    label: '5. Awaiting Replacement',
    badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  },
  {
    key: 'declined',
    label: '6. Declined',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-200',
  },
  {
    key: 'resolved',
    label: '7. Resolved',
    badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    key: 'all',
    label: 'All Cases',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
  },
];

const STATUS_BADGE_MAP: Record<ClaimStatus, string> = {
  submitted: 'bg-slate-100 text-slate-800 border-slate-200',
  pending_review: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  awaiting_information: 'bg-purple-100 text-purple-800 border-purple-200',
  approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  awaiting_replacement: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  declined: 'bg-rose-100 text-rose-800 border-rose-200',
  resolved: 'bg-slate-100 text-slate-600 border-slate-200',
};

const PRIORITY_BADGE_MAP: Record<EscalationPriority, string> = {
  [EscalationPriority.Low]: 'bg-slate-100 text-slate-600',
  [EscalationPriority.Normal]: 'bg-blue-50 text-blue-700',
  [EscalationPriority.High]: 'bg-amber-100 text-amber-800',
  [EscalationPriority.Urgent]: 'bg-rose-100 text-rose-800 font-bold',
};

export function ClaimsAndSupervisorManager({
  mode,
  currentUserId,
  currentUserName,
  currentUserRole,
  initialLinkedConversation,
  onClearInitialConversation,
}: ClaimsAndSupervisorManagerProps) {
  const [workspaceData, setWorkspaceData] = useState<ClaimsWorkspaceDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Filters
  const [activeQueue, setActiveQueue] = useState<ClaimStatus | 'all'>(
    mode === 'supervisor' ? 'pending_review' : 'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Selected complaint detail
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null);
  const [selectedComplaintDetail, setSelectedComplaintDetail] =
    useState<SupportComplaintRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Revealed credentials state
  const [revealedCustomerLogin, setRevealedCustomerLogin] = useState<string | null>(null);
  const [revealedReplacementCreds, setRevealedReplacementCreds] = useState<string | null>(null);
  const [revealingCreds, setRevealingCreds] = useState(false);

  // Action forms inside detail drawer
  const [internalNoteText, setInternalNoteText] = useState('');
  const [internalNoteType, setInternalNoteType] = useState<
    'internal_note' | 'supervisor_instruction' | 'info_request'
  >('internal_note');
  const [noteVisibleToCustomer, setNoteVisibleToCustomer] = useState(false);

  // Escalation modal/panel state
  const [escalateSupervisorId, setEscalateSupervisorId] = useState('');
  const [escalatePriority, setEscalatePriority] = useState<EscalationPriority>(
    EscalationPriority.High,
  );
  const [escalateNotes, setEscalateNotes] = useState('');

  // Supervisor Decision state
  const [decisionType, setDecisionType] = useState<'approve' | 'decline' | 'request_info'>(
    'approve',
  );
  const [decisionReason, setDecisionReason] = useState('');
  const [authorizeReplacementCheck, setAuthorizeReplacementCheck] = useState(true);

  // Specialised Personnel & Reassignment state
  const [routingTargetRole, setRoutingTargetRole] = useState<'specialist' | 'agent' | 'supervisor'>(
    'specialist',
  );
  const [specialistName, setSpecialistName] = useState('Adaeze Okafor (Treasury Specialist)');
  const [specialistDepartment, setSpecialistDepartment] = useState(
    'Treasury & Deposit Reconciliation',
  );
  const [reassignAgentId, setReassignAgentId] = useState('');
  const [reassignSupervisorId, setReassignSupervisorId] = useState('');
  const [routingReason, setRoutingReason] = useState('');

  // Replacement Allocation state
  const [selectedReplacementItemId, setSelectedReplacementItemId] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Evidence attachment state
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceDataUrl, setEvidenceDataUrl] = useState('');

  // Create Complaint Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newOrderId, setNewOrderId] = useState('');
  const [newProductOrService, setNewProductOrService] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newPriority, setNewPriority] = useState<EscalationPriority>(EscalationPriority.Normal);
  const [newDescription, setNewDescription] = useState('');
  const [newLoginCredentials, setNewLoginCredentials] = useState('');
  const [newCustomFieldValues, setNewCustomFieldValues] = useState<Record<string, string>>({});
  const [newLinkedConversationId, setNewLinkedConversationId] = useState<string | undefined>(
    undefined,
  );
  const [newAutoEscalate, setNewAutoEscalate] = useState(false);

  // Category Configuration Modal (for Admins/Supervisors)
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catReqOrder, setCatReqOrder] = useState(true);
  const [catReqLogin, setCatReqLogin] = useState(false);
  const [catReqEvidence, setCatReqEvidence] = useState(false);
  const [catAutoEscalate, setCatAutoEscalate] = useState(true);
  const [catDefaultPriority, setCatDefaultPriority] = useState<EscalationPriority>(
    EscalationPriority.Normal,
  );
  const [catCustomFields, setCatCustomFields] = useState<ComplaintCustomFieldDefinition[]>([]);
  const [submittingAction, setSubmittingAction] = useState(false);

  const isSupervisorOrAdmin =
    currentUserRole === UserRole.Admin ||
    currentUserRole === UserRole.Owner ||
    currentUserRole === UserRole.Supervisor;

  const canApproveOrDecline =
    isSupervisorOrAdmin || Boolean(workspaceData?.config?.allowAgentDirectApproval);

  const showToastMessage = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/claims', { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<ClaimsWorkspaceDto>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to load claims workspace');
      }
      setWorkspaceData(json.data);
      if (!newCategoryId && json.data.categories.length > 0) {
        setNewCategoryId(json.data.categories[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claims workspace');
    } finally {
      setLoading(false);
    }
  }, [newCategoryId]);

  const loadComplaintDetail = useCallback(async (complaintId: string) => {
    setDetailLoading(true);
    setRevealedCustomerLogin(null);
    setRevealedReplacementCreds(null);
    try {
      const res = await fetch(`/api/admin/claims/${complaintId}`, { cache: 'no-store' });
      const json = (await res.json()) as ApiResponse<SupportComplaintRecord>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to load complaint details');
      }
      setSelectedComplaintDetail(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load complaint details');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (selectedComplaintId) {
      void loadComplaintDetail(selectedComplaintId);
    } else {
      setSelectedComplaintDetail(null);
    }
  }, [selectedComplaintId, loadComplaintDetail]);

  // Open Create Complaint modal automatically if linked from a conversation
  useEffect(() => {
    if (initialLinkedConversation) {
      setNewLinkedConversationId(initialLinkedConversation.conversationId);
      setNewCustomerName(initialLinkedConversation.customerName || '');
      setNewCustomerEmail(initialLinkedConversation.customerEmail || '');
      setNewProductOrService(initialLinkedConversation.subject || '');
      setShowCreateModal(true);
      onClearInitialConversation?.();
    }
  }, [initialLinkedConversation, onClearInitialConversation]);

  const selectedCategoryObj = useMemo(() => {
    return workspaceData?.categories.find((c) => c.id === newCategoryId) ?? null;
  }, [workspaceData?.categories, newCategoryId]);

  const queueCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const q of SUPERVISOR_QUEUES) {
      if (q.key !== 'all') counts[q.key] = 0;
    }
    for (const item of workspaceData?.complaints ?? []) {
      counts.all = (counts.all || 0) + 1;
      counts[item.status] = (counts[item.status] || 0) + 1;
    }
    return counts;
  }, [workspaceData?.complaints]);

  const filteredComplaints = useMemo(() => {
    const list = workspaceData?.complaints ?? [];
    return list.filter((item) => {
      if (activeQueue !== 'all' && item.status !== activeQueue) {
        return false;
      }
      if (categoryFilter !== 'all' && item.categoryId !== categoryFilter) {
        return false;
      }
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          item.referenceCode.toLowerCase().includes(q) ||
          item.customerName.toLowerCase().includes(q) ||
          item.customerEmail.toLowerCase().includes(q) ||
          item.orderId.toLowerCase().includes(q) ||
          item.productOrService.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [workspaceData?.complaints, activeQueue, categoryFilter, priorityFilter, searchQuery]);

  const handleCreateComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomerName.trim() || !newProductOrService.trim() || !newDescription.trim()) {
      setError('Customer name, product/service, and complaint description are required.');
      return;
    }
    setSubmittingAction(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: newLinkedConversationId,
          customerName: newCustomerName.trim(),
          customerEmail: newCustomerEmail.trim(),
          orderId: newOrderId.trim(),
          productOrService: newProductOrService.trim(),
          categoryId: newCategoryId || undefined,
          categoryName: selectedCategoryObj?.name || 'General Complaint',
          priority: newPriority,
          description: newDescription.trim(),
          rawLoginInfo: newLoginCredentials.trim() || undefined,
          customFields: newCustomFieldValues,
          assignedAgentId: currentUserId,
          assignedAgentName: currentUserName,
          escalateImmediately: newAutoEscalate || selectedCategoryObj?.autoEscalateToSupervisor,
        }),
      });
      const json = (await res.json()) as ApiResponse<SupportComplaintRecord>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to submit complaint');
      }
      showToastMessage(
        `Complaint ${json.data.referenceCode} created${
          json.data.isPotentialDuplicate
            ? ` (Warning: Duplicate order detected with ${json.data.duplicateReferenceCode})`
            : ''
        }.`,
      );
      setShowCreateModal(false);
      setNewOrderId('');
      setNewDescription('');
      setNewLoginCredentials('');
      setNewCustomFieldValues({});
      setNewLinkedConversationId(undefined);
      await loadWorkspace();
      setSelectedComplaintId(json.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create complaint');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleClaimAction = async (payload: Record<string, unknown>, successMsg: string) => {
    if (!selectedComplaintDetail) return;
    setSubmittingAction(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/claims/${selectedComplaintDetail.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as ApiResponse<SupportComplaintRecord>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Operation failed');
      }
      setSelectedComplaintDetail(json.data);
      showToastMessage(successMsg);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleRevealCustomerCredentials = async () => {
    if (!selectedComplaintDetail) return;
    setRevealingCreds(true);
    try {
      const res = await fetch(
        `/api/admin/claims/${selectedComplaintDetail.id}?revealCredentials=true`,
        { cache: 'no-store' },
      );
      const json = (await res.json()) as ApiResponse<{
        complaint: SupportComplaintRecord;
        revealedLoginInfo: string | null;
      }>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to reveal credentials');
      }
      setRevealedCustomerLogin(json.data.revealedLoginInfo || 'No credentials stored');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal credentials');
    } finally {
      setRevealingCreds(false);
    }
  };

  const handleRevealReplacementCredentials = async (inventoryItemId: string) => {
    setRevealingCreds(true);
    try {
      const res = await fetch(`/api/admin/inventory/${inventoryItemId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reveal_credentials' }),
      });
      const json = (await res.json()) as ApiResponse<{ credentials: string }>;
      if (!res.ok || !json.ok) {
        throw new Error(
          (!json.ok && json.error?.message) || 'Failed to reveal replacement credentials',
        );
      }
      setRevealedReplacementCreds(json.data.credentials);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal replacement credentials');
    } finally {
      setRevealingCreds(false);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setSubmittingAction(true);
    try {
      const res = await fetch('/api/admin/operations/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: catName.trim(),
          description: catDesc.trim(),
          requiresOrderId: catReqOrder,
          requiresLoginInfo: catReqLogin,
          requiresEvidence: catReqEvidence,
          autoEscalateToSupervisor: catAutoEscalate,
          defaultPriority: catDefaultPriority,
          customFields: catCustomFields,
        }),
      });
      const json = (await res.json()) as ApiResponse<ComplaintCategoryRecord>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to save category');
      }
      showToastMessage(`Complaint category "${json.data.name}" saved.`);
      setShowCategoryModal(false);
      setCatName('');
      setCatDesc('');
      setCatCustomFields([]);
      await loadWorkspace();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category');
    } finally {
      setSubmittingAction(false);
    }
  };

  const matchingAvailableReplacements = useMemo(() => {
    const all = workspaceData?.availableReplacements ?? [];
    if (!selectedComplaintDetail) return all;
    const prodLower = selectedComplaintDetail.productOrService.toLowerCase();
    const matched = all.filter(
      (r) =>
        r.productOrService.toLowerCase().includes(prodLower) ||
        prodLower.includes(r.productOrService.toLowerCase()) ||
        r.categoryName.toLowerCase().includes(prodLower),
    );
    return matched.length > 0 ? matched : all;
  }, [workspaceData?.availableReplacements, selectedComplaintDetail]);

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  mode === 'supervisor'
                    ? 'bg-amber-600 text-white'
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {mode === 'supervisor' ? (
                  <ShieldAlert className="w-5 h-5" />
                ) : (
                  <FileText className="w-5 h-5" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  {mode === 'supervisor'
                    ? 'Supervisor Verification & Resolution Workspace'
                    : 'Claims & Resolution Management'}
                </h1>
                <p className="text-xs text-slate-500">
                  {mode === 'supervisor'
                    ? 'Investigate escalated product/account claims, verify encrypted credentials, authorize replacements, and enforce audit compliance.'
                    : 'Log customer complaints, detect duplicate order claims, collect supporting evidence, and coordinate supervisor escalations.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadWorkspace()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {isSupervisorOrAdmin && (
              <button
                type="button"
                onClick={() => setShowCategoryModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <FolderPlus className="w-3.5 h-3.5 text-indigo-600" />
                Configure Forms &amp; Categories
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs"
            >
              <Plus className="w-4 h-4" />
              New Customer Claim
            </button>
          </div>
        </div>

        {/* 7 Supervisor Queues Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1">
          {SUPERVISOR_QUEUES.map((q) => {
            const active = activeQueue === q.key;
            const count = queueCounts[q.key] ?? 0;
            return (
              <button
                key={q.key}
                type="button"
                onClick={() => setActiveQueue(q.key)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0 ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50/80 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{q.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-md text-[11px] font-bold ${
                    active ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toast & Error Alerts */}
      {toast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            {toast}
          </span>
          <button type="button" onClick={() => setToast(null)} className="text-emerald-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            {error}
          </span>
          <button type="button" onClick={() => setError(null)} className="text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Claims List */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 space-y-2.5 bg-slate-50/50">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reference (CLM-...), order ID, customer, product..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700"
              >
                <option value="all">All Categories</option>
                {(workspaceData?.categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700"
              >
                <option value="all">All Priorities</option>
                <option value={EscalationPriority.Urgent}>Urgent</option>
                <option value={EscalationPriority.High}>High</option>
                <option value={EscalationPriority.Normal}>Normal</option>
                <option value={EscalationPriority.Low}>Low</option>
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-100 max-h-[700px] overflow-y-auto">
            {loading && !workspaceData ? (
              <div className="p-10 flex items-center justify-center text-slate-400 text-xs gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading claims queue...
              </div>
            ) : filteredComplaints.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-semibold text-slate-600">No complaints in this queue</p>
                <p className="text-[11px] text-slate-400">
                  Switch queue filters above or create a new customer claim.
                </p>
              </div>
            ) : (
              filteredComplaints.map((item) => {
                const isSelected = item.id === selectedComplaintId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedComplaintId(item.id)}
                    className={`w-full text-left p-4 transition-colors hover:bg-slate-50/90 ${
                      isSelected ? 'bg-indigo-50/60 border-l-4 border-l-indigo-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700">
                          {item.referenceCode}
                        </span>
                        {item.isPotentialDuplicate && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            <Copy className="w-2.5 h-2.5" /> Duplicate Order
                          </span>
                        )}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          STATUS_BADGE_MAP[item.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900 truncate">
                      {item.productOrService}{' '}
                      {item.orderId ? (
                        <span className="font-mono font-normal text-slate-500">
                          (Order #{item.orderId})
                        </span>
                      ) : null}
                    </div>

                    <p className="text-[11px] text-slate-600 line-clamp-2 mt-1">
                      {item.description}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-700">{item.customerName}</span>
                        <span>•</span>
                        <span>{item.categoryName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded uppercase font-semibold ${
                            PRIORITY_BADGE_MAP[item.priority]
                          }`}
                        >
                          {item.priority}
                        </span>
                        {item.assignedSupervisorName && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                            Sup: {item.assignedSupervisorName}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Selected Case Investigation & Action Workspace */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {!selectedComplaintId ? (
            <div className="p-14 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">
                Select a Complaint Case to Investigate or Fulfil
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                View customer order details, inspect encrypted login credentials with full audit
                logging, exchange private internal notes between agents and supervisors, and
                allocate replacement inventory.
              </p>
            </div>
          ) : detailLoading || !selectedComplaintDetail ? (
            <div className="p-14 flex items-center justify-center text-slate-400 text-xs gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading complaint record...
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {/* Case Header */}
              <div className="p-5 bg-slate-50/60 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-indigo-700">
                        {selectedComplaintDetail.referenceCode}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          STATUS_BADGE_MAP[selectedComplaintDetail.status]
                        }`}
                      >
                        {selectedComplaintDetail.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                          PRIORITY_BADGE_MAP[selectedComplaintDetail.priority]
                        }`}
                      >
                        {selectedComplaintDetail.priority}
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900 mt-1">
                      {selectedComplaintDetail.productOrService} —{' '}
                      {selectedComplaintDetail.categoryName}
                    </h2>
                  </div>

                  {/* Quick Status Actions for Resolved / Reopen */}
                  <div className="flex items-center gap-2">
                    {selectedComplaintDetail.status !== 'resolved' &&
                      (selectedComplaintDetail.status === 'approved' ||
                        selectedComplaintDetail.status === 'declined' ||
                        Boolean(selectedComplaintDetail.deliveredAt)) && (
                        <button
                          type="button"
                          disabled={submittingAction}
                          onClick={() =>
                            void handleClaimAction(
                              {
                                action: 'close_resolved',
                                resolutionSummary:
                                  'Complaint closed after customer notification.',
                              },
                              'Case marked as resolved.',
                            )
                          }
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          Close as Resolved
                        </button>
                      )}
                  </div>
                </div>

                {/* Duplicate Alert Banner */}
                {selectedComplaintDetail.isPotentialDuplicate && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <strong>Possible Duplicate Order Claim:</strong> Order{' '}
                      <span className="font-mono font-bold">{selectedComplaintDetail.orderId}</span>{' '}
                      also appears on complaint{' '}
                      <span className="font-mono font-bold">
                        {selectedComplaintDetail.duplicateReferenceCode ||
                          selectedComplaintDetail.duplicateOfComplaintId}
                      </span>{' '}
                      ({selectedComplaintDetail.previousOrderComplaintsCount || 1} total claims for
                      this order).
                    </div>
                  </div>
                )}

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-1 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">
                      Customer
                    </div>
                    <div className="font-semibold text-slate-800 truncate">
                      {selectedComplaintDetail.customerName}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {selectedComplaintDetail.customerEmail || 'No email'}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">
                      Order ID &amp; SLA
                    </div>
                    <div className="font-mono font-bold text-slate-800">
                      {selectedComplaintDetail.orderId || 'Not specified'}
                    </div>
                    {selectedComplaintDetail.slaDeadlineAt && (
                      <div className="text-[10px] text-amber-700 font-medium truncate">
                        SLA: {new Date(selectedComplaintDetail.slaDeadlineAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">
                      Assigned Agent
                    </div>
                    <div className="font-semibold text-slate-800 truncate">
                      {selectedComplaintDetail.assignedAgentName || 'Unassigned'}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">
                      Supervisor
                    </div>
                    <div className="font-semibold text-slate-800 truncate">
                      {selectedComplaintDetail.assignedSupervisorName || 'Unassigned'}
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">
                      Specialised Personnel
                    </div>
                    <div className="font-semibold text-indigo-800 truncate">
                      {selectedComplaintDetail.assignedSpecialistName || 'Not routed'}
                    </div>
                    {selectedComplaintDetail.assignedSpecialistDepartment && (
                      <div className="text-[10px] text-slate-500 truncate">
                        {selectedComplaintDetail.assignedSpecialistDepartment}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Customer Description & Encrypted Login Credentials */}
              <div className="p-5 space-y-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Customer Complaint Description
                  </h4>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs text-slate-800 whitespace-pre-wrap">
                    {selectedComplaintDetail.description}
                  </div>
                </div>

                {/* Custom Fields if any */}
                {Object.keys(selectedComplaintDetail.customFields || {}).length > 0 && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {Object.entries(selectedComplaintDetail.customFields).map(([k, val]) => (
                      <div
                        key={k}
                        className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-xs"
                      >
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          {k}
                        </span>
                        <span className="font-medium text-slate-800">{val}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Encrypted Login Info Vault */}
                {selectedComplaintDetail.hasEncryptedLoginInfo && (
                  <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        <KeyRound className="w-4 h-4 text-amber-400" />
                        <span>Submitted Account Credentials (AES-256-GCM Encrypted)</span>
                      </div>
                      {revealedCustomerLogin ? (
                        <button
                          type="button"
                          onClick={() => setRevealedCustomerLogin(null)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium"
                        >
                          <EyeOff className="w-3.5 h-3.5" /> Hide
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={revealingCreds}
                          onClick={() => void handleRevealCustomerCredentials()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] font-bold"
                        >
                          <Eye className="w-3.5 h-3.5" />{' '}
                          {revealingCreds ? 'Decrypting...' : 'Reveal Credentials (Audited)'}
                        </button>
                      )}
                    </div>
                    <div className="font-mono text-xs bg-black/40 px-3 py-2 rounded-lg border border-white/10">
                      {revealedCustomerLogin
                        ? revealedCustomerLogin
                        : selectedComplaintDetail.loginInfoMasked || '••••••••'}
                    </div>
                  </div>
                )}

                {/* Supervisor Decision Banner if already reviewed */}
                {selectedComplaintDetail.decision && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs ${
                      selectedComplaintDetail.decision === 'approved'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : selectedComplaintDetail.decision === 'declined'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-purple-50 border-purple-200 text-purple-900'
                    }`}
                  >
                    <div className="font-bold flex items-center justify-between">
                      <span>
                        Supervisor Decision: {selectedComplaintDetail.decision.toUpperCase()}
                      </span>
                      <span className="text-[11px] font-normal">
                        By {selectedComplaintDetail.reviewedBySupervisorName || 'Supervisor'}
                      </span>
                    </div>
                    <p className="mt-1">
                      <strong>Reason:</strong> {selectedComplaintDetail.decisionReason}
                    </p>
                  </div>
                )}
              </div>

              {/* Escalation & Supervisor Investigation Controls */}
              <div className="p-5 bg-slate-50/40 space-y-5">
                {/* 1. Agent Escalation to Supervisor */}
                {(selectedComplaintDetail.status === 'submitted' ||
                  selectedComplaintDetail.status === 'awaiting_information') && (
                  <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <ArrowUpRight className="w-4 h-4 text-indigo-600" />
                      Escalate Complaint to Supervisor Queue
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <select
                        value={escalateSupervisorId}
                        onChange={(e) => setEscalateSupervisorId(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                      >
                        <option value="">Auto-assign / Any Available Supervisor</option>
                        {(workspaceData?.supervisors ?? []).map((sup) => (
                          <option key={sup.id} value={sup.userId || sup.id}>
                            {sup.displayName} ({sup.role})
                          </option>
                        ))}
                      </select>
                      <select
                        value={escalatePriority}
                        onChange={(e) => setEscalatePriority(e.target.value as EscalationPriority)}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-xs bg-white"
                      >
                        <option value={EscalationPriority.Normal}>Normal Priority</option>
                        <option value={EscalationPriority.High}>High Priority</option>
                        <option value={EscalationPriority.Urgent}>Urgent Priority</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      value={escalateNotes}
                      onChange={(e) => setEscalateNotes(e.target.value)}
                      placeholder="Internal escalation handover note for supervisor..."
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs"
                    />
                    <button
                      type="button"
                      disabled={submittingAction}
                      onClick={() => {
                        const sup = workspaceData?.supervisors.find(
                          (s) => (s.userId || s.id) === escalateSupervisorId,
                        );
                        void handleClaimAction(
                          {
                            action: 'escalate',
                            supervisorId: escalateSupervisorId || undefined,
                            supervisorName: sup?.displayName || undefined,
                            priority: escalatePriority,
                            note:
                              escalateNotes.trim() ||
                              'Escalated to supervisor for verification.',
                          },
                          'Complaint escalated to Supervisor Pending Review queue.',
                        );
                        setEscalateNotes('');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                    >
                      Escalate to Supervisor
                    </button>
                  </div>
                )}

                {/* 2. Supervisor Decision Panel & Specialised Personnel Routing (Role-gated) */}
                {canApproveOrDecline ? (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                          <ShieldAlert className="w-4 h-4 text-amber-600" />
                          Supervisor Verification &amp; Official Decision
                        </h4>
                        {selectedComplaintDetail.status === 'pending_review' && (
                          <button
                            type="button"
                            disabled={submittingAction}
                            onClick={() =>
                              void handleClaimAction(
                                {
                                  action: 'start_investigation',
                                  note: 'Supervisor started active investigation.',
                                },
                                'Moved case to In Progress queue.',
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[11px] font-semibold"
                          >
                            Mark In Progress
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setDecisionType('approve')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            decisionType === 'approve'
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Approve Claim
                        </button>
                        <button
                          type="button"
                          onClick={() => setDecisionType('decline')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            decisionType === 'decline'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Decline Claim
                        </button>
                        <button
                          type="button"
                          onClick={() => setDecisionType('request_info')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            decisionType === 'request_info'
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Request Missing Information
                        </button>
                      </div>

                      {decisionType === 'approve' && (
                        <label className="flex items-center gap-2 text-xs text-slate-700">
                          <input
                            type="checkbox"
                            checked={authorizeReplacementCheck}
                            onChange={(e) => setAuthorizeReplacementCheck(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          Authorize Replacement Inventory Fulfilment (moves to Awaiting Replacement)
                        </label>
                      )}

                      <textarea
                        rows={2}
                        value={decisionReason}
                        onChange={(e) => setDecisionReason(e.target.value)}
                        placeholder={
                          decisionType === 'request_info'
                            ? 'Specify what additional screenshot, order proof, or detail is required...'
                            : 'Mandatory decision reason (recorded in supervisor audit trail)...'
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                      />

                      <button
                        type="button"
                        disabled={submittingAction || !decisionReason.trim()}
                        onClick={() => {
                          void handleClaimAction(
                            {
                              action: decisionType,
                              reason: decisionReason.trim(),
                              authorizeReplacement:
                                decisionType === 'approve' ? authorizeReplacementCheck : false,
                            },
                            `Recorded supervisor decision: ${decisionType.toUpperCase()}`,
                          );
                          setDecisionReason('');
                        }}
                        className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold"
                      >
                        Record Official Decision
                      </button>
                    </div>

                    {/* Multi-Tier Routing: Assign to Specialised Personnel / Return to Agent / Reassign Supervisor */}
                    <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-200/80 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-indigo-600" />
                            Multi-Tier Case Routing (Customer → Agent → Supervisor → Specialised Personnel)
                          </h4>
                          <p className="text-[11px] text-slate-600">
                            Route case to Specialised Personnel (e.g. Treasury / Tier-3 Technical), return to Support Agent, or reassign Supervisor.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setRoutingTargetRole('specialist')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                            routingTargetRole === 'specialist'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Assign to Specialised Personnel
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoutingTargetRole('agent')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                            routingTargetRole === 'agent'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Return to Support Agent
                        </button>
                        <button
                          type="button"
                          onClick={() => setRoutingTargetRole('supervisor')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                            routingTargetRole === 'supervisor'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Reassign Supervisor
                        </button>
                      </div>

                      {routingTargetRole === 'specialist' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <input
                            type="text"
                            value={specialistName}
                            onChange={(e) => setSpecialistName(e.target.value)}
                            placeholder="Specialist Name (e.g. Adaeze Okafor)..."
                            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                          />
                          <select
                            value={specialistDepartment}
                            onChange={(e) => setSpecialistDepartment(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                          >
                            <option value="Treasury & Deposit Reconciliation">
                              Treasury &amp; Deposit Reconciliation
                            </option>
                            <option value="Tier-3 Technical Engineering">
                              Tier-3 Technical Engineering
                            </option>
                            <option value="Account & Security Verification">
                              Account &amp; Security Verification
                            </option>
                            <option value="Billing & Fulfilment Operations">
                              Billing &amp; Fulfilment Operations
                            </option>
                          </select>
                        </div>
                      ) : routingTargetRole === 'agent' ? (
                        <select
                          value={reassignAgentId}
                          onChange={(e) => setReassignAgentId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          <option value="">
                            {selectedComplaintDetail.assignedAgentName
                              ? `Return to ${selectedComplaintDetail.assignedAgentName}`
                              : '-- Select Support Agent --'}
                          </option>
                          {(workspaceData?.agents ?? []).map((ag) => (
                            <option key={ag.id} value={ag.userId || ag.id}>
                              {ag.displayName} ({ag.role})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={reassignSupervisorId}
                          onChange={(e) => setReassignSupervisorId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          <option value="">-- Select Target Supervisor --</option>
                          {(workspaceData?.supervisors ?? []).map((sup) => (
                            <option key={sup.id} value={sup.userId || sup.id}>
                              {sup.displayName} ({sup.role})
                            </option>
                          ))}
                        </select>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={routingReason}
                          onChange={(e) => setRoutingReason(e.target.value)}
                          placeholder="Routing instruction / verification note..."
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                        />
                        <button
                          type="button"
                          disabled={submittingAction}
                          onClick={() => {
                            if (routingTargetRole === 'specialist') {
                              if (!specialistName.trim()) return;
                              void handleClaimAction(
                                {
                                  action: 'reassign',
                                  assignmentRole: 'specialist',
                                  toUserId: `specialist-${specialistName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                                  toUserName: specialistName.trim(),
                                  specialistDepartment,
                                  reason:
                                    routingReason.trim() ||
                                    `Routed to Specialised Personnel (${specialistDepartment}) for verification.`,
                                },
                                `Assigned case to ${specialistName.trim()} (${specialistDepartment}).`,
                              );
                            } else if (routingTargetRole === 'agent') {
                              const ag = workspaceData?.agents.find(
                                (a) => (a.userId || a.id) === reassignAgentId,
                              );
                              const targetName =
                                ag?.displayName ||
                                selectedComplaintDetail.assignedAgentName ||
                                'Support Agent';
                              const targetId =
                                ag?.userId ||
                                ag?.id ||
                                selectedComplaintDetail.assignedAgentId ||
                                targetName;
                              void handleClaimAction(
                                {
                                  action: 'reassign',
                                  assignmentRole: 'agent',
                                  toUserId: targetId,
                                  toUserName: targetName,
                                  reason:
                                    routingReason.trim() ||
                                    'Returned case to Support Agent with supervisor instructions.',
                                },
                                `Returned case to Support Agent: ${targetName}.`,
                              );
                            } else {
                              const sup = workspaceData?.supervisors.find(
                                (s) => (s.userId || s.id) === reassignSupervisorId,
                              );
                              if (!sup) return;
                              void handleClaimAction(
                                {
                                  action: 'reassign',
                                  assignmentRole: 'supervisor',
                                  toUserId: sup.userId || sup.id,
                                  toUserName: sup.displayName,
                                  reason:
                                    routingReason.trim() || 'Reassigned to another supervisor.',
                                },
                                `Reassigned case to Supervisor: ${sup.displayName}.`,
                              );
                            }
                            setRoutingReason('');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
                        >
                          Execute Routing Handoff
                        </button>
                      </div>

                      {(selectedComplaintDetail.assignmentHistory ?? []).length > 0 && (
                        <div className="pt-2 border-t border-indigo-200/60 space-y-1">
                          <div className="text-[10px] font-bold uppercase text-indigo-900">
                            Escalation &amp; Routing History
                          </div>
                          {(selectedComplaintDetail.assignmentHistory ?? [])
                            .slice(0, 5)
                            .map((h) => (
                              <div
                                key={h.id}
                                className="text-[11px] text-slate-700 flex items-center justify-between gap-2 bg-white/80 px-2.5 py-1 rounded border border-indigo-100"
                              >
                                <span>
                                  <strong className="uppercase text-[10px] text-indigo-700">
                                    [{h.assignmentRole}]
                                  </strong>{' '}
                                  {h.fromUserName ? `${h.fromUserName} → ` : ''}
                                  <strong>{h.toUserName}</strong>
                                  {h.reason ? ` — ${h.reason}` : ''}
                                </span>
                                <span className="text-[10px] text-slate-400 shrink-0">
                                  {new Date(h.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                    <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                    <span>
                      Only Supervisors and Administrators are authorized to approve or decline
                      complaints. Escalate this case above for supervisor verification.
                    </span>
                  </div>
                )}

                {/* 3. Replacement Inventory Allocation & Delivery Section */}
                {(selectedComplaintDetail.status === 'approved' ||
                  selectedComplaintDetail.status === 'awaiting_replacement' ||
                  Boolean(selectedComplaintDetail.allocatedReplacementId)) && (
                  <div className="p-4 rounded-xl bg-cyan-50/60 border border-cyan-200 space-y-3">
                    <h4 className="text-xs font-bold text-cyan-950 flex items-center gap-1.5">
                      <PackageCheck className="w-4 h-4 text-cyan-700" />
                      Replacement Inventory Allocation &amp; Fulfilment
                    </h4>

                    {selectedComplaintDetail.allocatedReplacementId ? (
                      <div className="space-y-2 text-xs">
                        <div className="p-3 rounded-lg bg-white border border-cyan-200 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-slate-900">
                              Allocated Replacement Item:{' '}
                              <span className="font-mono text-indigo-700">
                                {selectedComplaintDetail.allocatedReplacementMasked ||
                                  selectedComplaintDetail.allocatedReplacementId}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Status: {selectedComplaintDetail.allocatedReplacementStatus || 'ISSUED'}{' '}
                              {selectedComplaintDetail.deliveredAt
                                ? `• Delivered ${new Date(selectedComplaintDetail.deliveredAt).toLocaleString()}`
                                : '• Reserved (Pending Delivery)'}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={revealingCreds}
                            onClick={() =>
                              void handleRevealReplacementCredentials(
                                selectedComplaintDetail.allocatedReplacementId!,
                              )
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 text-white text-[11px] font-semibold"
                          >
                            {revealingCreds ? 'Decrypting...' : 'Reveal Replacement Credentials'}
                          </button>
                        </div>

                        {revealedReplacementCreds && (
                          <div className="p-3 rounded-lg bg-slate-900 text-amber-300 font-mono text-xs">
                            {revealedReplacementCreds}
                          </div>
                        )}

                        {!selectedComplaintDetail.deliveredAt && (
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              value={deliveryNotes}
                              onChange={(e) => setDeliveryNotes(e.target.value)}
                              placeholder="Delivery confirmation note to customer..."
                              className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                            />
                            <button
                              type="button"
                              disabled={submittingAction}
                              onClick={() =>
                                void handleClaimAction(
                                  {
                                    action: 'IssueReservedReplacement',
                                    notes:
                                      deliveryNotes.trim() ||
                                      'Delivered replacement item to customer.',
                                  },
                                  'Replacement issued and complaint resolved!',
                                )
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                            >
                              Confirm Delivery &amp; Issue
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <p className="text-[11px] text-cyan-900">
                          Fulfilment Policy:{' '}
                          <strong>
                            {workspaceData?.config.fulfilmentMethod.replace(/_/g, ' ')}
                          </strong>
                          . Select an available stock item below to reserve or issue directly.
                        </p>
                        <select
                          value={selectedReplacementItemId}
                          onChange={(e) => setSelectedReplacementItemId(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs"
                        >
                          <option value="">
                            -- Select Available Replacement Stock ({matchingAvailableReplacements.length}{' '}
                            available) --
                          </option>
                          {matchingAvailableReplacements.map((item) => (
                            <option key={item.id} value={item.id}>
                              [{item.productOrService}] {item.identifierMasked} (Category:{' '}
                              {item.categoryName})
                            </option>
                          ))}
                        </select>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={submittingAction || !selectedReplacementItemId}
                            onClick={() =>
                              void handleClaimAction(
                                {
                                  action: 'allocate_replacement',
                                  inventoryItemId: selectedReplacementItemId,
                                  issueImmediately: false,
                                  notes: 'Reserved replacement stock for approved complaint.',
                                },
                                'Replacement item reserved for this complaint.',
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold"
                          >
                            Reserve Stock Item
                          </button>
                          <button
                            type="button"
                            disabled={submittingAction || !selectedReplacementItemId}
                            onClick={() =>
                              void handleClaimAction(
                                {
                                  action: 'allocate_replacement',
                                  inventoryItemId: selectedReplacementItemId,
                                  issueImmediately: true,
                                  notes: 'Issued replacement stock directly and resolved complaint.',
                                },
                                'Replacement item issued and case marked Resolved!',
                              )
                            }
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                          >
                            Issue Replacement &amp; Resolve Immediately
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Evidence & Attachments */}
              <div className="p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Supporting Evidence &amp; Screenshots ({selectedComplaintDetail.evidence?.length || 0})
                </h4>
                {(selectedComplaintDetail.evidence ?? []).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(selectedComplaintDetail.evidence ?? []).map((ev) => (
                      <div
                        key={ev.id}
                        className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between text-xs"
                      >
                        <div className="truncate pr-2">
                          <div className="font-semibold text-slate-800 truncate">{ev.fileName}</div>
                          <div className="text-[10px] text-slate-500">
                            Added by {ev.uploadedByName} ({ev.uploadedByRole})
                          </div>
                        </div>
                        {ev.fileUrlOrData && (
                          <a
                            href={ev.fileUrlOrData}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded bg-white border border-slate-200 text-indigo-600 text-[11px] font-semibold shrink-0"
                          >
                            Open
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    type="text"
                    value={evidenceTitle}
                    onChange={(e) => setEvidenceTitle(e.target.value)}
                    placeholder="Evidence title / screenshot description..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                  />
                  <input
                    type="text"
                    value={evidenceDataUrl}
                    onChange={(e) => setEvidenceDataUrl(e.target.value)}
                    placeholder="Image/Document URL or proof note..."
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                  />
                  <button
                    type="button"
                    disabled={submittingAction || !evidenceTitle.trim()}
                    onClick={() => {
                      void handleClaimAction(
                        {
                          action: 'add_evidence',
                          fileName: evidenceTitle.trim(),
                          fileUrlOrData:
                            evidenceDataUrl.trim() ||
                            `data:text/plain;charset=utf-8,${encodeURIComponent(evidenceTitle.trim())}`,
                          description: evidenceTitle.trim(),
                        },
                        'Evidence attached to complaint.',
                      );
                      setEvidenceTitle('');
                      setEvidenceDataUrl('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold shrink-0"
                  >
                    <Paperclip className="w-3.5 h-3.5" /> Attach Proof
                  </button>
                </div>
              </div>

              {/* Internal Notes & Private Escalation Communication */}
              <div className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Internal Investigation Notes &amp; Escalation Log (
                    {selectedComplaintDetail.comments?.length || 0})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    Internal comments are hidden from customers by default
                  </span>
                </div>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {(selectedComplaintDetail.comments ?? []).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No notes recorded yet.</p>
                  ) : (
                    (selectedComplaintDetail.comments ?? []).map((c) => (
                      <div
                        key={c.id}
                        className={`p-3 rounded-xl border text-xs ${
                          c.isVisibleToCustomer
                            ? 'bg-blue-50/60 border-blue-200'
                            : c.commentType === 'supervisor_instruction'
                              ? 'bg-amber-50/70 border-amber-200'
                              : 'bg-slate-50 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                          <span className="font-bold text-slate-800">
                            {c.authorName} ({c.authorRole}) —{' '}
                            <span className="uppercase text-[10px] text-indigo-600">
                              {c.commentType.replace(/_/g, ' ')}
                            </span>
                          </span>
                          <span>
                            {c.isVisibleToCustomer ? 'Visible to Customer • ' : 'Internal Only • '}
                            {new Date(c.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-800 whitespace-pre-wrap">{c.body}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={internalNoteType}
                        onChange={(e) =>
                          setInternalNoteType(
                            e.target.value as
                              | 'internal_note'
                              | 'supervisor_instruction'
                              | 'info_request',
                          )
                        }
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs bg-white"
                      >
                        <option value="internal_note">Internal Investigation Note</option>
                        <option value="supervisor_instruction">
                          Supervisor Instruction to Agent
                        </option>
                        <option value="info_request">Customer Information Request</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={noteVisibleToCustomer}
                          onChange={(e) => setNoteVisibleToCustomer(e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        Share update with customer
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={internalNoteText}
                      onChange={(e) => setInternalNoteText(e.target.value)}
                      placeholder="Write an internal note, supervisor instruction, or customer update..."
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                    <button
                      type="button"
                      disabled={submittingAction || !internalNoteText.trim()}
                      onClick={() => {
                        void handleClaimAction(
                          {
                            action: 'add_comment',
                            commentType: noteVisibleToCustomer
                              ? 'customer_update'
                              : internalNoteType,
                            body: internalNoteText.trim(),
                            isVisibleToCustomer: noteVisibleToCustomer,
                          },
                          noteVisibleToCustomer
                            ? 'Customer update posted.'
                            : 'Internal note added.',
                        );
                        setInternalNoteText('');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold"
                    >
                      <Send className="w-3.5 h-3.5" /> Post
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODAL: CREATE NEW CUSTOMER COMPLAINT                                */}
      {/* =================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Log Customer Product / Service Complaint
                </h3>
                <p className="text-xs text-slate-500">
                  Creates a tracked CLM reference, checks for duplicate orders, and encrypts
                  submitted credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateComplaint} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Customer Email / Handle
                  </label>
                  <input
                    type="text"
                    value={newCustomerEmail}
                    onChange={(e) => setNewCustomerEmail(e.target.value)}
                    placeholder="alex@example.com or @telegram"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Complaint Category *
                  </label>
                  <select
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    {(workspaceData?.categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Priority Level
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as EscalationPriority)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    <option value={EscalationPriority.Low}>Low</option>
                    <option value={EscalationPriority.Normal}>Normal</option>
                    <option value={EscalationPriority.High}>High</option>
                    <option value={EscalationPriority.Urgent}>Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Order ID {selectedCategoryObj?.requiresOrderId ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    required={Boolean(selectedCategoryObj?.requiresOrderId)}
                    value={newOrderId}
                    onChange={(e) => setNewOrderId(e.target.value)}
                    placeholder="e.g. ORD-90210"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Product or Service Purchased *
                  </label>
                  <input
                    type="text"
                    required
                    value={newProductOrService}
                    onChange={(e) => setNewProductOrService(e.target.value)}
                    placeholder="e.g. Pro Annual Seat / Streaming Bundle"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              {/* Configurable Category Custom Fields */}
              {(selectedCategoryObj?.customFields ?? []).map((field) => (
                <div key={field.key}>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {field.label} {field.required ? '*' : ''}
                  </label>
                  <input
                    type="text"
                    required={field.required}
                    value={newCustomFieldValues[field.key] || ''}
                    onChange={(e) =>
                      setNewCustomFieldValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Supplied Account / Login Information (Encrypted at Rest){' '}
                  {selectedCategoryObj?.requiresLoginInfo ? '*' : '(Optional)'}
                </label>
                <input
                  type="text"
                  required={Boolean(selectedCategoryObj?.requiresLoginInfo)}
                  value={newLoginCredentials}
                  onChange={(e) => setNewLoginCredentials(e.target.value)}
                  placeholder="Username / Email / Password / PIN supplied by customer for verification..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Detailed Complaint Description *
                </label>
                <textarea
                  rows={3}
                  required
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Describe the exact issue reported by the customer..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={newAutoEscalate}
                  onChange={(e) => setNewAutoEscalate(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Immediately escalate to Supervisor Pending Review queue
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  {submittingAction ? 'Creating Claim...' : 'Create Complaint Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: CONFIGURE COMPLAINT CATEGORIES & FORMS                       */}
      {/* =================================================================== */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Configure Business Complaint Categories &amp; Forms
                </h3>
                <p className="text-xs text-slate-500">
                  Customize required fields, credential collection, and auto-escalation rules per
                  complaint type.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g. Region Lock / Subscription Mismatch"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Intake Guidance
                </label>
                <input
                  type="text"
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Instructions shown to customers and agents..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="space-y-2 text-xs text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={catReqOrder}
                    onChange={(e) => setCatReqOrder(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Require Order ID
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={catReqLogin}
                    onChange={(e) => setCatReqLogin(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Require Account Login Credentials (Encrypted)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={catReqEvidence}
                    onChange={(e) => setCatReqEvidence(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Require Screenshot / Supporting Evidence
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={catAutoEscalate}
                    onChange={(e) => setCatAutoEscalate(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Auto-Escalate New Claims to Supervisor Pending Review
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={submittingAction}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

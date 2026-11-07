'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  type ApiResponse,
  type DailyClosingReportDto,
  type DailyOperationsMetricsDto,
  type OperationalActivityCategory,
  type OperationalActivityEventRecord,
  type OperationsDatePreset,
  type OrganizationOperationsConfig,
  type ReplacementFulfilmentMethod,
  type SupportComplaintRecord,
  UserRole,
  type WorkspaceAgentRecord,
} from '@careflow/shared';

interface OperationsDashboardDto {
  config: OrganizationOperationsConfig;
  metrics: DailyOperationsMetricsDto;
  closingReport: DailyClosingReportDto;
  activityTimeline: OperationalActivityEventRecord[];
  teamMembers: WorkspaceAgentRecord[];
}

export type OperationsAnalyticsSection =
  | 'operations-dashboard'
  | 'team-performance'
  | 'activity-timeline'
  | 'reports-closing';

interface OperationsAnalyticsAndReportsManagerProps {
  initialSection?: OperationsAnalyticsSection;
  currentUserRole: UserRole;
  onNavigateToSection?: (
    section: 'claims-resolution' | 'supervisor-workspace' | 'replacement-inventory' | 'inbox',
  ) => void;
}

const DATE_PRESETS: Array<{ value: OperationsDatePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom Range' },
];

export function OperationsAnalyticsAndReportsManager({
  initialSection = 'operations-dashboard',
  currentUserRole,
  onNavigateToSection,
}: OperationsAnalyticsAndReportsManagerProps) {
  const [activeTab, setActiveTab] = useState<OperationsAnalyticsSection>(initialSection);
  const [datePreset, setDatePreset] = useState<OperationsDatePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Filters for Activity Timeline
  const [timelineCategoryFilter, setTimelineCategoryFilter] = useState<string>('');
  const [timelineActorFilter, setTimelineActorFilter] = useState<string>('');
  const [timelineRoleFilter, setTimelineRoleFilter] = useState<string>('');
  const [timelineRefSearch, setTimelineRefSearch] = useState<string>('');
  const [timelineProductSearch, setTimelineProductSearch] = useState<string>('');

  // Data
  const [data, setData] = useState<OperationsDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Drill-down modal for agent/supervisor cases
  const [drilldownModal, setDrilldownModal] = useState<{
    title: string;
    subtitle: string;
    complaints: SupportComplaintRecord[];
    loading: boolean;
  } | null>(null);

  // Operational Settings modal
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configFulfilmentMethod, setConfigFulfilmentMethod] =
    useState<ReplacementFulfilmentMethod>('both');
  const [configAllowAgentDirectApproval, setConfigAllowAgentDirectApproval] = useState(false);
  const [configTimezone, setConfigTimezone] = useState('UTC');
  const [configClosingTime, setConfigClosingTime] = useState('18:00');
  const [configSlaFirstResponse, setConfigSlaFirstResponse] = useState(15);
  const [configSlaResolutionHours, setConfigSlaResolutionHours] = useState(24);
  const [configSlaOverdueHours, setConfigSlaOverdueHours] = useState(24);
  const [configInactivityTimeout, setConfigInactivityTimeout] = useState(30);
  const [submittingConfig, setSubmittingConfig] = useState(false);

  const isAdmin =
    currentUserRole === UserRole.Admin || currentUserRole === UserRole.Owner;

  useEffect(() => {
    setActiveTab(initialSection);
  }, [initialSection]);

  const showToastMessage = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('preset', datePreset);
      if (datePreset === 'custom') {
        if (customFrom) params.set('from', new Date(customFrom).toISOString());
        if (customTo) params.set('to', new Date(customTo + 'T23:59:59').toISOString());
      }
      if (timelineCategoryFilter) params.set('eventCategory', timelineCategoryFilter);
      if (timelineActorFilter) params.set('actorUserId', timelineActorFilter);
      if (timelineRoleFilter) params.set('actorRole', timelineRoleFilter);
      if (timelineRefSearch.trim()) params.set('caseReference', timelineRefSearch.trim());
      if (timelineProductSearch.trim()) params.set('productOrService', timelineProductSearch.trim());

      const res = await fetch(`/api/admin/operations/dashboard?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as ApiResponse<OperationsDashboardDto>;
      if (!res.ok || !json.ok) {
        throw new Error(
          (!json.ok && json.error?.message) || 'Failed to load operations dashboard.',
        );
      }

      setData(json.data);
      const cfg = json.data.config;
      setConfigFulfilmentMethod(cfg.fulfilmentMethod);
      setConfigAllowAgentDirectApproval(cfg.allowAgentDirectApproval);
      setConfigTimezone(cfg.timezone);
      setConfigClosingTime(cfg.businessClosingTime);
      setConfigSlaFirstResponse(cfg.slaFirstResponseMinutes);
      setConfigSlaResolutionHours(cfg.slaResolutionHours);
      setConfigSlaOverdueHours(cfg.slaOverdueHours);
      setConfigInactivityTimeout(cfg.inactivityTimeoutMinutes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load operations data.');
    } finally {
      setLoading(false);
    }
  }, [
    datePreset,
    customFrom,
    customTo,
    timelineCategoryFilter,
    timelineActorFilter,
    timelineRoleFilter,
    timelineRefSearch,
    timelineProductSearch,
  ]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingConfig(true);
    try {
      const res = await fetch('/api/admin/operations/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fulfilmentMethod: configFulfilmentMethod,
          allowAgentDirectApproval: configAllowAgentDirectApproval,
          timezone: configTimezone,
          businessClosingTime: configClosingTime,
          slaFirstResponseMinutes: Number(configSlaFirstResponse) || 15,
          slaResolutionHours: Number(configSlaResolutionHours) || 24,
          slaOverdueHours: Number(configSlaOverdueHours) || 24,
          inactivityTimeoutMinutes: Number(configInactivityTimeout) || 30,
        }),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!res.ok || !json.ok) {
        throw new Error(
          (!json.ok && json.error?.message) || 'Failed to save operations settings.',
        );
      }
      setShowConfigModal(false);
      showToastMessage('Operational configuration saved.');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSubmittingConfig(false);
    }
  };

  const handleOpenEmployeeDrilldown = async (
    userId: string | null | undefined,
    displayName: string,
    role: 'agent' | 'supervisor',
  ) => {
    setDrilldownModal({
      title: `${displayName} — Assigned & Investigated Cases`,
      subtitle:
        role === 'supervisor'
          ? 'Supervisor case queue and verification history'
          : 'Support agent assigned and submitted complaints',
      complaints: [],
      loading: true,
    });

    try {
      const params = new URLSearchParams();
      if (userId) {
        if (role === 'supervisor') params.set('assignedSupervisorId', userId);
        else params.set('assignedAgentId', userId);
      } else {
        params.set('search', displayName);
      }
      const res = await fetch(`/api/admin/claims?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = (await res.json()) as ApiResponse<{
        complaints: SupportComplaintRecord[];
      }>;
      if (res.ok && json.ok) {
        setDrilldownModal((prev) =>
          prev ? { ...prev, complaints: json.data.complaints, loading: false } : null,
        );
      } else {
        setDrilldownModal((prev) => (prev ? { ...prev, loading: false } : null));
      }
    } catch {
      setDrilldownModal((prev) => (prev ? { ...prev, loading: false } : null));
    }
  };

  const handleExportReport = (format: 'csv' | 'excel' | 'print') => {
    if (!data) return;
    const { closingReport } = data;
    const { summary } = closingReport;

    if (format === 'print') {
      window.print();
      return;
    }

    const rows: string[][] = [
      ['CUSTOMCARE OPERATIONS & DAILY CLOSING REPORT'],
      ['Organization', closingReport.organizationName],
      ['Period Label', closingReport.reportPeriodLabel],
      ['From (ISO)', closingReport.fromIso],
      ['To (ISO)', closingReport.toIso],
      ['Timezone', closingReport.timezone],
      ['Configured Closing Time', closingReport.closingTime],
      ['Generated At', closingReport.generatedAt],
      [],
      ['EXECUTIVE SUMMARY METRICS', 'COUNT'],
      ['Unique Customers Attended', String(summary.customersAttended)],
      ['Conversations Received', String(summary.conversationsReceived)],
      ['Conversations Resolved', String(summary.conversationsResolved)],
      ['Outstanding Open Conversations', String(summary.outstandingConversations)],
      ['Complaints Received', String(summary.complaintsReceived)],
      ['Complaints Approved', String(summary.complaintsApproved)],
      ['Complaints Declined', String(summary.complaintsDeclined)],
      ['Pending Supervisor Investigations', String(summary.pendingInvestigations)],
      ['Replacements Issued', String(summary.replacementsIssued)],
      ['Replacement Stock Added', String(summary.inventoryAdded)],
      ['Replacement Stock Adjusted', String(summary.inventoryAdjusted)],
      ['Overdue Cases (>24h)', String(summary.overdueCasesCount)],
      [],
      ['AGENT ACTIVITY SUMMARY'],
      [
        'Agent Name',
        'Role',
        'Conversations Handled',
        'Conversations Resolved',
        'Complaints Submitted',
        'Replacements Delivered',
        'Last Meaningful Action',
      ],
      ...closingReport.agentActivitySummary.map((a) => [
        a.agentName,
        a.role,
        String(a.conversationsHandled),
        String(a.conversationsResolved),
        String(a.complaintsSubmitted),
        String(a.replacementsDelivered),
        a.lastMeaningfulActionAt || 'None',
      ]),
      [],
      ['SUPERVISOR ACTIVITY SUMMARY'],
      [
        'Supervisor Name',
        'Complaints Reviewed',
        'Approved',
        'Declined',
        'Pending Investigations',
      ],
      ...closingReport.supervisorActivitySummary.map((s) => [
        s.supervisorName,
        String(s.complaintsReviewed),
        String(s.complaintsApproved),
        String(s.complaintsDeclined),
        String(s.pendingInvestigations),
      ]),
      [],
      ['OUTSTANDING CASES & BACKLOG'],
      ['Reference', 'Type', 'Customer', 'Status', 'Priority', 'Assigned To', 'Age (Hours)'],
      ...closingReport.outstandingCases.map((c) => [
        c.referenceCode,
        c.type,
        c.customerName,
        c.status,
        c.priority,
        c.assignedTo,
        String(c.ageHours),
      ]),
      [],
      ['OPERATIONAL OBSERVATIONS & ANOMALIES'],
      ...closingReport.observations.map((obs) => [obs]),
    ];

    const escapeCell = (cell: string) => `"${String(cell ?? '').replace(/"/g, '""')}"`;
    const csvContent = rows.map((r) => r.map(escapeCell).join(',')).join('\n');

    const mimeType =
      format === 'excel'
        ? 'application/vnd.ms-excel;charset=utf-8;'
        : 'text/csv;charset=utf-8;';
    const ext = format === 'excel' ? 'xls' : 'csv';
    const blob = new Blob([csvContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `customcare-closing-report-${new Date().toISOString().slice(0, 10)}.${ext}`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToastMessage(`Exported report as ${ext.toUpperCase()}.`);
  };

  const metrics = data?.metrics;
  const closingReport = data?.closingReport;
  const timeline = useMemo(() => data?.activityTimeline ?? [], [data]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Administrator Operations, Accountability &amp; Reporting
                </h1>
                <p className="text-xs text-slate-500">
                  Real-time operational command center, agent/supervisor performance, SLA backlog
                  tracking, and daily closing reports.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Preset Selector */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setDatePreset(p.value)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    datePreset === p.value
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowConfigModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                Ops &amp; SLA Settings
              </button>
            )}

            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {datePreset === 'custom' && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">From:</label>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600">To:</label>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
              />
            </div>
          </div>
        )}

        {/* Sub-Navigation Tabs */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('operations-dashboard')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'operations-dashboard'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            1. Operations &amp; Backlog Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('team-performance')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'team-performance'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            2. Agent &amp; Supervisor Accountability
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('activity-timeline')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'activity-timeline'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            3. Daily Activity Timeline ({timeline.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reports-closing')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'reports-closing'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            4. Daily Closing &amp; Period Reports
          </button>
        </div>
      </div>

      {toast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            {toast}
          </span>
          <button type="button" onClick={() => setToast(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            {error}
          </span>
          <button type="button" onClick={() => setError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading && !data ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 flex items-center justify-center text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm font-medium">Calculating operational metrics...</span>
        </div>
      ) : null}

      {/* =================================================================== */}
      {/* TAB 1: DAILY OPERATIONS OVERVIEW, COMPLAINT/INVENTORY ANALYTICS & BACKLOG */}
      {/* =================================================================== */}
      {activeTab === 'operations-dashboard' && metrics && (
        <div className="space-y-6">
          {/* Primary Executive KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Unique Customers Attended
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {metrics.overview.uniqueCustomersAttended}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics.overview.newConversations} new conversations
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Conversations Handled
              </div>
              <div className="text-2xl font-bold text-indigo-700 mt-1">
                {metrics.overview.totalConversationsHandled}
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                {metrics.overview.resolvedConversations} resolved ·{' '}
                {metrics.overview.openConversations} open
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Support Tickets
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {metrics.overview.newTickets}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics.overview.closedTickets} closed in period
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Product Complaints
              </div>
              <div className="text-2xl font-bold text-amber-700 mt-1">
                {metrics.overview.newComplaints}
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                {metrics.overview.approvedComplaints} approved ·{' '}
                {metrics.overview.declinedComplaints} declined
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Replacements Issued
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {metrics.overview.replacementsIssued}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics.overview.pendingVerificationComplaints} awaiting review
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Response &amp; Resolution SLA
              </div>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {metrics.overview.avgFirstResponseMinutes !== null
                  ? `${metrics.overview.avgFirstResponseMinutes}m resp`
                  : 'N/A'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Avg resolution:{' '}
                {metrics.overview.avgResolutionHours !== null
                  ? `${metrics.overview.avgResolutionHours}h`
                  : 'N/A'}
              </div>
            </div>
          </div>

          {/* Open Issues & Backlog Monitoring */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-600" />
                  Open Issues &amp; Live Backlog Queues
                </h2>
                <p className="text-xs text-slate-500">
                  Real-time operational bottlenecks, unassigned conversations, pending supervisor
                  verifications, and SLA overdue cases (&gt;24h / &gt;48h).
                </p>
              </div>
              {onNavigateToSection && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateToSection('supervisor-workspace')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                  >
                    Open Supervisor Queue
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigateToSection('claims-resolution')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                  >
                    Open Claims Workspace
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Unassigned Convs
                </div>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  {metrics.backlogQueues.unassignedConversations}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                <div className="text-[10px] font-bold uppercase text-amber-800">
                  Awaiting Supervisor
                </div>
                <div className="text-xl font-bold text-amber-900 mt-0.5">
                  {metrics.backlogQueues.complaintsAwaitingSupervisorReview}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200">
                <div className="text-[10px] font-bold uppercase text-purple-800">
                  Awaiting Customer Info
                </div>
                <div className="text-xl font-bold text-purple-900 mt-0.5">
                  {metrics.backlogQueues.complaintsAwaitingCustomerInfo}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-cyan-50/70 border border-cyan-200">
                <div className="text-[10px] font-bold uppercase text-cyan-800">
                  Awaiting Replacement
                </div>
                <div className="text-xl font-bold text-cyan-900 mt-0.5">
                  {metrics.backlogQueues.approvedComplaintsAwaitingReplacement}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-50/70 border border-rose-200">
                <div className="text-[10px] font-bold uppercase text-rose-800">
                  Overdue &gt; 24 Hours
                </div>
                <div className="text-xl font-bold text-rose-700 mt-0.5">
                  {metrics.backlogQueues.overdueCases24h}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-100/80 border border-rose-300">
                <div className="text-[10px] font-bold uppercase text-rose-900">
                  Critical &gt; 48 Hours
                </div>
                <div className="text-xl font-bold text-rose-900 mt-0.5">
                  {metrics.backlogQueues.overdueCases48h}
                </div>
              </div>
            </div>

            {/* Active Backlog Table */}
            {metrics.backlogQueues.records.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2.5 px-3">Ref</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Product / Subject</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Assigned To</th>
                      <th className="py-2.5 px-3">Age</th>
                      <th className="py-2.5 px-3">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {metrics.backlogQueues.records.slice(0, 15).map((rec) => (
                      <tr key={`${rec.recordType}:${rec.id}`} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {rec.referenceCode}
                        </td>
                        <td className="py-2.5 px-3 capitalize text-slate-600">{rec.recordType}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          {rec.customerName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{rec.subjectOrProduct}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{rec.assignedTo}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{rec.ageHours}h</td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {rec.isOverdue48h ? (
                              <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">
                                &gt;48h SLA
                              </span>
                            ) : rec.isOverdue24h ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                &gt;24h
                              </span>
                            ) : null}
                            {rec.isUnassigned && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">
                                Unassigned
                              </span>
                            )}
                            {rec.isReopened && (
                              <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                                Reopened
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-xs text-slate-500 py-4 text-center bg-slate-50 rounded-xl">
                Zero active backlog records at this moment.
              </div>
            )}
          </div>

          {/* Complaint Analytics & Replacement Inventory Analytics Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Complaint Analytics */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Complaint Analytics &amp; Product Anomaly Detection
                  </h3>
                  <p className="text-xs text-slate-500">
                    Breakdown by category, product defect rates, and repeat order claims.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold">
                  {metrics.complaintAnalytics.repeatedOrderComplaintsCount} Repeat Order Claims
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700">
                  Complaints by Product / Service
                </div>
                {metrics.complaintAnalytics.byProduct.length === 0 ? (
                  <p className="text-xs text-slate-400">No product complaints recorded yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {metrics.complaintAnalytics.byProduct.map((prod) => (
                      <div
                        key={prod.productOrService}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {prod.productOrService}
                          </span>
                          {prod.isHighVolumeAnomaly && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                              <AlertTriangle className="w-3 h-3" /> High Defect Volume
                            </span>
                          )}
                        </div>
                        <div className="text-slate-600">
                          <span className="font-bold text-slate-900">{prod.count}</span> claims (
                          {prod.approvedCount} approved)
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-700">Complaints by Category</div>
                <div className="grid grid-cols-2 gap-2">
                  {metrics.complaintAnalytics.byCategory.map((cat) => (
                    <div
                      key={cat.category}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-700 truncate pr-2">{cat.category}</span>
                      <span className="font-bold text-slate-900">{cat.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Replacement Inventory Analytics */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Replacement Inventory &amp; Stock Accountability
                  </h3>
                  <p className="text-xs text-slate-500">
                    Available stock, consumption by product, and staff issuance accountability.
                  </p>
                </div>
                {onNavigateToSection && (
                  <button
                    type="button"
                    onClick={() => onNavigateToSection('replacement-inventory')}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                  >
                    Manage Stock
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <div className="text-[10px] font-bold uppercase text-emerald-800">Available</div>
                  <div className="text-xl font-bold text-emerald-900">
                    {metrics.inventoryAnalytics.availableStock}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200">
                  <div className="text-[10px] font-bold uppercase text-amber-800">Reserved</div>
                  <div className="text-xl font-bold text-amber-900">
                    {metrics.inventoryAnalytics.reservedStock}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200">
                  <div className="text-[10px] font-bold uppercase text-indigo-800">Issued</div>
                  <div className="text-xl font-bold text-indigo-900">
                    {metrics.inventoryAnalytics.issuedStock}
                  </div>
                </div>
              </div>

              {metrics.inventoryAnalytics.lowStockCategories.length > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Low Stock Alert ({metrics.inventoryAnalytics.lowStockCategories.length} pool
                    {metrics.inventoryAnalytics.lowStockCategories.length === 1 ? '' : 's'})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {metrics.inventoryAnalytics.lowStockCategories.map((c) => (
                      <span
                        key={c.id}
                        className="px-2 py-0.5 rounded bg-white border border-amber-300 text-[11px] font-semibold"
                      >
                        {c.name}: {c.availableCount} left (min {c.minStockThreshold})
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700">
                  Stock Consumption by Product / Service
                </div>
                {metrics.inventoryAnalytics.consumptionByProduct.length === 0 ? (
                  <p className="text-xs text-slate-400">No replacement stock pools configured.</p>
                ) : (
                  <div className="space-y-1.5">
                    {metrics.inventoryAnalytics.consumptionByProduct.map((item) => (
                      <div
                        key={item.productOrService}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs"
                      >
                        <span className="font-semibold text-slate-900">
                          {item.productOrService}
                        </span>
                        <span className="text-slate-600">
                          <strong className="text-indigo-700">{item.issuedCount} issued</strong> ·{' '}
                          {item.reservedCount} reserved ·{' '}
                          <strong className="text-emerald-700">
                            {item.availableCount} available
                          </strong>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: AGENT & SUPERVISOR PERFORMANCE & ACCOUNTABILITY              */}
      {/* =================================================================== */}
      {activeTab === 'team-performance' && metrics && (
        <div className="space-y-6">
          {/* Support Agent Performance Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                Support Agent Performance &amp; Real Activity Tracking
              </h2>
              <p className="text-xs text-slate-500">
                Clearly separates assigned conversations from conversations actually handled and
                resolved. Activity status is derived from real system actions (replies, claims,
                notes, resolutions), not passive page presence. Click any agent to drill down into
                their cases.
              </p>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-3 px-3">Agent</th>
                    <th className="py-3 px-3">Real Activity Status</th>
                    <th className="py-3 px-3">Assigned Convs</th>
                    <th className="py-3 px-3">Actually Handled</th>
                    <th className="py-3 px-3">Unique Customers</th>
                    <th className="py-3 px-3">Resolved Convs</th>
                    <th className="py-3 px-3">Claims Submitted</th>
                    <th className="py-3 px-3">Escalated</th>
                    <th className="py-3 px-3">Replacements Delivered</th>
                    <th className="py-3 px-3">Avg Resp / Res</th>
                    <th className="py-3 px-3 text-right">Drill-down</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {metrics.agentPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400">
                        No support agents registered in this workspace.
                      </td>
                    </tr>
                  ) : (
                    metrics.agentPerformance.map((agent) => (
                      <tr key={agent.agentId} className="hover:bg-slate-50">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{agent.displayName}</div>
                          <div className="text-[11px] text-slate-500">
                            {agent.email} · {agent.role}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                agent.activityStatus === 'actively_working'
                                  ? 'bg-emerald-500'
                                  : agent.activityStatus === 'idle'
                                    ? 'bg-amber-500'
                                    : 'bg-slate-300'
                              }`}
                            />
                            <span className="font-semibold capitalize text-slate-800">
                              {agent.activityStatus.replace('_', ' ')}
                            </span>
                          </div>
                          {agent.lastMeaningfulActionAt && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Last action:{' '}
                              {new Date(agent.lastMeaningfulActionAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700">
                          {agent.assignedConversations}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-indigo-700">
                          {agent.conversationsHandled}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-800">
                          {agent.uniqueCustomersAttended}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                          {agent.conversationsResolved}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-800">
                          {agent.complaintsSubmitted}
                        </td>
                        <td className="py-3 px-3 font-mono text-amber-700">
                          {agent.casesEscalated}
                        </td>
                        <td className="py-3 px-3 font-mono text-emerald-700 font-bold">
                          {agent.replacementsDelivered}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-600">
                          {agent.avgFirstResponseMinutes !== null
                            ? `${agent.avgFirstResponseMinutes}m`
                            : '—'}{' '}
                          /{' '}
                          {agent.avgResolutionHours !== null
                            ? `${agent.avgResolutionHours}h`
                            : '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              void handleOpenEmployeeDrilldown(
                                agent.userId || agent.agentId,
                                agent.displayName,
                                'agent',
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
                          >
                            View Cases
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Supervisor Performance Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                Supervisor Investigation &amp; Decision Performance
              </h2>
              <p className="text-xs text-slate-500">
                Tracks complaints received, reviewed, approved, declined, pending investigations,
                replacement authorizations, and average verification turnaround time.
              </p>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-3 px-3">Supervisor</th>
                    <th className="py-3 px-3">Received</th>
                    <th className="py-3 px-3">Reviewed</th>
                    <th className="py-3 px-3">Approved</th>
                    <th className="py-3 px-3">Declined</th>
                    <th className="py-3 px-3">Pending Review</th>
                    <th className="py-3 px-3">Replacements Auth</th>
                    <th className="py-3 px-3">Reassigned</th>
                    <th className="py-3 px-3">Avg Verification Time</th>
                    <th className="py-3 px-3 text-right">Drill-down</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {metrics.supervisorPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        No supervisors or administrators recorded yet.
                      </td>
                    </tr>
                  ) : (
                    metrics.supervisorPerformance.map((sup) => (
                      <tr key={sup.supervisorId} className="hover:bg-slate-50">
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">{sup.displayName}</div>
                          <div className="text-[11px] text-slate-500">
                            {sup.email} · {sup.role}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-800">
                          {sup.complaintsReceived}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-indigo-700">
                          {sup.complaintsReviewed}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-700">
                          {sup.complaintsApproved}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-rose-700">
                          {sup.complaintsDeclined}
                        </td>
                        <td className="py-3 px-3 font-mono text-amber-700 font-bold">
                          {sup.pendingInvestigations}
                        </td>
                        <td className="py-3 px-3 font-mono text-emerald-800">
                          {sup.replacementApprovals}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600">
                          {sup.reassignedCases}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700">
                          {sup.avgVerificationMinutes !== null
                            ? `${sup.avgVerificationMinutes} mins`
                            : '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              void handleOpenEmployeeDrilldown(
                                sup.userId || sup.supervisorId,
                                sup.displayName,
                                'supervisor',
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold"
                          >
                            View Queue
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: DAILY ACTIVITY TIMELINE                                      */}
      {/* =================================================================== */}
      {activeTab === 'activity-timeline' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" />
                Centralized Daily Operational Activity Timeline
              </h2>
              <p className="text-xs text-slate-500">
                Chronological, immutable audit stream of every operational action across agents,
                supervisors, claims, and replacement stock.
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-2">
            <select
              value={timelineCategoryFilter}
              onChange={(e) => setTimelineCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-medium text-slate-700"
            >
              <option value="">All Action Categories</option>
              <option value="complaint">Complaint &amp; Escalation</option>
              <option value="supervisor">Supervisor Decision</option>
              <option value="replacement">Replacement Fulfilment</option>
              <option value="inventory">Inventory Movement</option>
              <option value="conversation">Conversation &amp; Ticket</option>
              <option value="settings">Operations Settings</option>
            </select>

            <select
              value={timelineRoleFilter}
              onChange={(e) => setTimelineRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-medium text-slate-700"
            >
              <option value="">All Roles</option>
              <option value={UserRole.Owner}>Business Owner</option>
              <option value={UserRole.Admin}>Administrator</option>
              <option value={UserRole.Supervisor}>Supervisor</option>
              <option value={UserRole.Agent}>Support Agent</option>
            </select>

            <select
              value={timelineActorFilter}
              onChange={(e) => setTimelineActorFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-medium text-slate-700"
            >
              <option value="">All Team Members</option>
              {(data?.teamMembers ?? []).map((m) => (
                <option key={m.id} value={m.userId || m.id}>
                  {m.displayName} ({m.role})
                </option>
              ))}
            </select>

            <input
              type="text"
              value={timelineRefSearch}
              onChange={(e) => setTimelineRefSearch(e.target.value)}
              placeholder="Filter by Case Ref (e.g. CLM-...)"
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs"
            />

            <input
              type="text"
              value={timelineProductSearch}
              onChange={(e) => setTimelineProductSearch(e.target.value)}
              placeholder="Filter by Product / Service..."
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs"
            />
          </div>

          {/* Events Stream */}
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {timeline.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No operational activity events match the current filter criteria.
              </div>
            ) : (
              timeline.map((ev) => (
                <div
                  key={ev.id}
                  className="p-3.5 hover:bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                        {ev.eventCategory}
                      </span>
                      <span className="font-mono text-[11px] text-indigo-700 font-semibold">
                        {ev.eventType}
                      </span>
                      {ev.caseReference && (
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-[11px]">
                          {ev.caseReference}
                        </span>
                      )}
                      {ev.productOrService && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium text-[11px]">
                          {ev.productOrService}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-800 font-medium">{ev.summary}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold text-slate-900">
                      {ev.actorName}{' '}
                      <span className="text-[10px] font-normal text-slate-500">
                        ({ev.actorRole})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(ev.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: DAILY CLOSING & PERIOD REPORTS                               */}
      {/* =================================================================== */}
      {activeTab === 'reports-closing' && closingReport && (
        <div className="space-y-6 print:space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                  Official Operational Closing Statement
                </div>
                <h2 className="text-lg font-bold text-slate-900 mt-0.5">
                  {closingReport.organizationName} — {closingReport.reportPeriodLabel} Report
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Period: {new Date(closingReport.fromIso).toLocaleString()} to{' '}
                  {new Date(closingReport.toIso).toLocaleString()} ({closingReport.timezone} ·
                  Closing Time {closingReport.closingTime})
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => handleExportReport('csv')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleExportReport('excel')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                  Export Excel (.xls)
                </button>
                <button
                  type="button"
                  onClick={() => handleExportReport('print')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save PDF
                </button>
              </div>
            </div>

            {/* Closing Summary Numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Customers Attended
                </div>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  {closingReport.summary.customersAttended}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Convs Received / Resolved
                </div>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  {closingReport.summary.conversationsReceived} /{' '}
                  <span className="text-emerald-700">
                    {closingReport.summary.conversationsResolved}
                  </span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Complaints Recv / Appr / Decl
                </div>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  {closingReport.summary.complaintsReceived} /{' '}
                  <span className="text-emerald-700">
                    {closingReport.summary.complaintsApproved}
                  </span>{' '}
                  /{' '}
                  <span className="text-rose-700">{closingReport.summary.complaintsDeclined}</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Pending Investigations
                </div>
                <div className="text-xl font-bold text-amber-700 mt-0.5">
                  {closingReport.summary.pendingInvestigations}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Replacements Issued
                </div>
                <div className="text-xl font-bold text-emerald-700 mt-0.5">
                  {closingReport.summary.replacementsIssued}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase text-slate-500">
                  Stock Added / Adjusted
                </div>
                <div className="text-xl font-bold text-indigo-700 mt-0.5">
                  +{closingReport.summary.inventoryAdded} /{' '}
                  {closingReport.summary.inventoryAdjusted}
                </div>
              </div>
            </div>

            {/* Operational Observations */}
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2">
              <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                Automated Operational Observations &amp; Closing Notes
              </div>
              <ul className="list-disc list-inside text-xs text-indigo-900 space-y-1">
                {closingReport.observations.map((obs, idx) => (
                  <li key={idx}>{obs}</li>
                ))}
              </ul>
            </div>

            {/* Agent & Supervisor Closing Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Agent Activity Summary
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2 px-3">Agent</th>
                        <th className="py-2 px-3">Handled</th>
                        <th className="py-2 px-3">Resolved</th>
                        <th className="py-2 px-3">Claims</th>
                        <th className="py-2 px-3">Replacements</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {closingReport.agentActivitySummary.map((a, i) => (
                        <tr key={i}>
                          <td className="py-2 px-3 font-semibold text-slate-900">{a.agentName}</td>
                          <td className="py-2 px-3 font-mono">{a.conversationsHandled}</td>
                          <td className="py-2 px-3 font-mono text-emerald-700">
                            {a.conversationsResolved}
                          </td>
                          <td className="py-2 px-3 font-mono">{a.complaintsSubmitted}</td>
                          <td className="py-2 px-3 font-mono">{a.replacementsDelivered}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">
                  Supervisor Verification Summary
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                        <th className="py-2 px-3">Supervisor</th>
                        <th className="py-2 px-3">Reviewed</th>
                        <th className="py-2 px-3">Approved</th>
                        <th className="py-2 px-3">Declined</th>
                        <th className="py-2 px-3">Pending</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {closingReport.supervisorActivitySummary.map((s, i) => (
                        <tr key={i}>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {s.supervisorName}
                          </td>
                          <td className="py-2 px-3 font-mono">{s.complaintsReviewed}</td>
                          <td className="py-2 px-3 font-mono text-emerald-700">
                            {s.complaintsApproved}
                          </td>
                          <td className="py-2 px-3 font-mono text-rose-700">
                            {s.complaintsDeclined}
                          </td>
                          <td className="py-2 px-3 font-mono text-amber-700">
                            {s.pendingInvestigations}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: EMPLOYEE DRILLDOWN                                           */}
      {/* =================================================================== */}
      {drilldownModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{drilldownModal.title}</h3>
                <p className="text-xs text-slate-500">{drilldownModal.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setDrilldownModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2.5">
              {drilldownModal.loading ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading employee case history...
                </div>
              ) : drilldownModal.complaints.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  No complaints or escalated cases found for this team member.
                </div>
              ) : (
                drilldownModal.complaints.map((c) => (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-700">
                          {c.referenceCode}
                        </span>
                        <span className="font-semibold text-slate-900">{c.productOrService}</span>
                        <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[10px] font-bold uppercase">
                          {c.status}
                        </span>
                      </div>
                      <div className="text-slate-600 mt-0.5">
                        Customer: {c.customerName} · Order: {c.orderId || 'N/A'}
                      </div>
                    </div>
                    <div className="text-right text-[11px] text-slate-500">
                      <div>Priority: {c.priority}</div>
                      <div>{new Date(c.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: OPERATIONS & SLA CONFIGURATION                               */}
      {/* =================================================================== */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Operational Governance &amp; SLA Configuration
                </h3>
                <p className="text-xs text-slate-500">
                  Configure replacement fulfilment permissions, agent approval policies, and daily
                  closing schedules.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Replacement Fulfilment Mode
                </label>
                <select
                  value={configFulfilmentMethod}
                  onChange={(e) =>
                    setConfigFulfilmentMethod(e.target.value as ReplacementFulfilmentMethod)
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold"
                >
                  <option value="both">
                    Flexible (Both Supervisor Direct &amp; Agent-Assisted after Supervisor Approval)
                  </option>
                  <option value="supervisor_controlled">
                    Method 1 Only: Supervisor-Controlled Fulfilment Only
                  </option>
                  <option value="agent_assisted">
                    Method 2: Agent-Assisted Fulfilment (Requires Supervisor Approval First)
                  </option>
                </select>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={configAllowAgentDirectApproval}
                  onChange={(e) => setConfigAllowAgentDirectApproval(e.target.checked)}
                  className="rounded border-slate-300 mt-0.5"
                />
                <div>
                  <div className="font-bold text-slate-800">
                    Authorize Support Agents to Approve/Decline Complaints Directly
                  </div>
                  <div className="text-[11px] text-slate-500">
                    By default, support agents CANNOT approve or decline complaints and must
                    escalate to a supervisor. Enable only if your business authorizes agents to make
                    final claim decisions.
                  </div>
                </div>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Business Timezone
                  </label>
                  <input
                    type="text"
                    value={configTimezone}
                    onChange={(e) => setConfigTimezone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Daily Closing Time (HH:MM)
                  </label>
                  <input
                    type="time"
                    value={configClosingTime}
                    onChange={(e) => setConfigClosingTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    First Response SLA (Mins)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={configSlaFirstResponse}
                    onChange={(e) => setConfigSlaFirstResponse(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Agent Idle Timeout (Mins)
                  </label>
                  <input
                    type="number"
                    min={5}
                    value={configInactivityTimeout}
                    onChange={(e) => setConfigInactivityTimeout(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingConfig}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  {submittingConfig ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

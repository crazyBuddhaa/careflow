'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
  Star,
  TrendingUp,
  UserCheck,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import {
  type AgentScorecardDto,
  type ApiResponse,
  type AutomationRuleType,
  type CustomerFeedbackRecord,
  type DailyClosingReportDto,
  type DailyOperationsMetricsDto,
  type OperationalActivityEventRecord,
  type OperationsDatePreset,
  type OrganizationOperationsConfig,
  type QaEvaluationRecord,
  type ReplacementFulfilmentMethod,
  type SupportComplaintRecord,
  UserRole,
  type WorkflowAutomationLogRecord,
  type WorkflowAutomationRuleRecord,
  type WorkspaceAgentRecord,
} from '@careflow/shared';

interface OperationsDashboardDto {
  config: OrganizationOperationsConfig;
  metrics: DailyOperationsMetricsDto;
  closingReport: DailyClosingReportDto;
  activityTimeline: OperationalActivityEventRecord[];
  teamMembers: WorkspaceAgentRecord[];
  agentScorecards?: AgentScorecardDto[];
  qaEvaluations?: QaEvaluationRecord[];
  automationRules?: WorkflowAutomationRuleRecord[];
  automationLogs?: WorkflowAutomationLogRecord[];
  customerFeedback?: CustomerFeedbackRecord[];
}

export type OperationsAnalyticsSection =
  | 'operations-dashboard'
  | 'team-performance'
  | 'activity-timeline'
  | 'reports-closing'
  | 'workflow-automation';

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

const AUTOMATION_RULE_TYPE_LABELS: Record<AutomationRuleType, string> = {
  auto_assign_enquiry: '1. Auto-Assign New Enquiries',
  auto_categorise_enquiry: '2. Auto-Categorise Incoming Enquiries',
  auto_escalate_condition: '3. Auto-Escalate High-Risk Complaints',
  notify_supervisor_overdue: '4. Alert Supervisor on Overdue Cases',
  reassign_unavailable_agent: '5. Reassign from Unavailable Agents',
  notify_agent_sla_warning: '6. Agent Approaching-SLA Warning',
  notify_customer_status_change: '7. Customer Status Change Notification',
  trigger_pending_followup: '8. Automated Pending Case Follow-Up',
};

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

  // Multi-Dimensional Backlog Filters (Phase 3)
  const [backlogDeptFilter, setBacklogDeptFilter] = useState<string>('all');
  const [backlogAgentFilter, setBacklogAgentFilter] = useState<string>('all');
  const [backlogSupervisorFilter, setBacklogSupervisorFilter] = useState<string>('all');
  const [backlogCategoryFilter, setBacklogCategoryFilter] = useState<string>('all');
  const [backlogPriorityFilter, setBacklogPriorityFilter] = useState<string>('all');
  const [backlogStatusFilter, setBacklogStatusFilter] = useState<string>('all');
  const [backlogAgeFilter, setBacklogAgeFilter] = useState<string>('all');
  const [backlogSlaConditionFilter, setBacklogSlaConditionFilter] = useState<string>('all');

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

  // Demo Scenario Modal
  const [runningDemo, setRunningDemo] = useState(false);
  const [demoResultModal, setDemoResultModal] = useState<{
    referenceCode: string;
    conversationId: string;
    complaintId: string;
    stepsCompleted: string[];
  } | null>(null);

  // QA Evaluation Form state
  const [qaTargetType, setQaTargetType] = useState<'complaint' | 'conversation'>('complaint');
  const [qaTargetRef, setQaTargetRef] = useState('');
  const [qaAgentName, setQaAgentName] = useState('');
  const [qaAccuracy, setQaAccuracy] = useState(5);
  const [qaProfessionalism, setQaProfessionalism] = useState(5);
  const [qaResolution, setQaResolution] = useState(5);
  const [qaComplexity, setQaComplexity] = useState<'simple' | 'standard' | 'complex' | 'critical'>(
    'standard',
  );
  const [qaNotes, setQaNotes] = useState('');
  const [qaCoaching, setQaCoaching] = useState('');
  const [submittingQa, setSubmittingQa] = useState(false);

  // Workflow Automation state
  const [runningSweep, setRunningSweep] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');
  const [newRuleType, setNewRuleType] = useState<AutomationRuleType>('auto_assign_enquiry');
  const [submittingRule, setSubmittingRule] = useState(false);

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
  const isSupervisorOrAdmin =
    isAdmin || currentUserRole === UserRole.Supervisor;

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
      if (!qaAgentName && json.data.teamMembers.length > 0) {
        setQaAgentName(json.data.teamMembers[0].displayName);
      }
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
    qaAgentName,
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

  const handleRunDemoScenario = async () => {
    setRunningDemo(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/operations/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_demo_scenario' }),
      });
      const json = (await res.json()) as ApiResponse<{
        conversationId: string;
        complaintId: string;
        demoReferenceCode?: string;
        referenceCode?: string;
        stepsCompleted: string[];
      }>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to run demo scenario.');
      }
      const refCode = json.data.demoReferenceCode || json.data.referenceCode || 'CLM-DEMO';
      setDemoResultModal({
        conversationId: json.data.conversationId,
        complaintId: json.data.complaintId,
        referenceCode: refCode,
        stepsCompleted: json.data.stepsCompleted,
      });
      showToastMessage(`Executed 10-step [DEMO] Deposit Complaint Scenario (${refCode}).`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run demo scenario.');
    } finally {
      setRunningDemo(false);
    }
  };

  const handleCreateQaEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaAgentName.trim() || !qaTargetRef.trim()) {
      setError('Target case reference and agent name are required for QA evaluation.');
      return;
    }
    setSubmittingQa(true);
    try {
      const matchedMember = data?.teamMembers.find((m) => m.displayName === qaAgentName);
      const res = await fetch('/api/admin/operations/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_qa_evaluation',
          targetType: qaTargetType,
          targetId: qaTargetRef.trim(),
          caseReference: qaTargetRef.trim(),
          agentId: matchedMember?.userId || matchedMember?.id || qaAgentName.trim(),
          agentName: qaAgentName.trim(),
          accuracyScore: qaAccuracy,
          professionalismScore: qaProfessionalism,
          resolutionEffectivenessScore: qaResolution,
          caseComplexity:
            qaComplexity === 'simple'
              ? 'low'
              : qaComplexity === 'critical'
                ? 'complex'
                : qaComplexity,
          feedbackNotes: qaNotes.trim(),
          coachingRecommendations: qaCoaching.trim(),
        }),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to record QA evaluation.');
      }
      setQaTargetRef('');
      setQaNotes('');
      setQaCoaching('');
      showToastMessage('Quality Assurance (QA) evaluation recorded and agent scorecard updated.');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save QA evaluation.');
    } finally {
      setSubmittingQa(false);
    }
  };

  const handleToggleAutomationRule = async (ruleId: string, isEnabled: boolean) => {
    try {
      const res = await fetch('/api/admin/operations/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_automation_rule',
          ruleId,
          isEnabled,
        }),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to toggle rule.');
      }
      showToastMessage(`Automation rule ${isEnabled ? 'enabled' : 'paused'}.`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule.');
    }
  };

  const handleRunAutomationSweep = async () => {
    setRunningSweep(true);
    try {
      const res = await fetch('/api/admin/operations/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_automation_sweep' }),
      });
      const json = (await res.json()) as ApiResponse<{
        executedActionsCount: number;
        logs: WorkflowAutomationLogRecord[];
      }>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to execute automation sweep.');
      }
      showToastMessage(
        `Automation sweep completed: ${json.data.executedActionsCount} new actions triggered (loop-deduplicated).`,
      );
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute automation sweep.');
    } finally {
      setRunningSweep(false);
    }
  };

  const handleCreateAutomationRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim()) return;
    setSubmittingRule(true);
    try {
      const res = await fetch('/api/admin/operations/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upsert_automation_rule',
          name: newRuleName.trim(),
          description: newRuleDesc.trim(),
          ruleType: newRuleType,
          isEnabled: true,
        }),
      });
      const json = (await res.json()) as ApiResponse<unknown>;
      if (!res.ok || !json.ok) {
        throw new Error((!json.ok && json.error?.message) || 'Failed to create automation rule.');
      }
      setNewRuleName('');
      setNewRuleDesc('');
      showToastMessage('Custom workflow automation rule saved.');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create automation rule.');
    } finally {
      setSubmittingRule(false);
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
  const scorecards = useMemo(() => data?.agentScorecards ?? [], [data]);
  const qaEvaluations = useMemo(() => data?.qaEvaluations ?? [], [data]);
  const automationRules = useMemo(() => data?.automationRules ?? [], [data]);
  const automationLogs = useMemo(() => data?.automationLogs ?? [], [data]);

  // Extract unique options for Backlog Filters
  const backlogRecords = useMemo(() => metrics?.backlogQueues.records ?? [], [metrics]);
  const filteredBacklogRecords = useMemo(() => {
    return backlogRecords.filter((rec) => {
      if (backlogDeptFilter !== 'all' && (rec.department || 'General Support') !== backlogDeptFilter) {
        return false;
      }
      if (backlogAgentFilter !== 'all' && (rec.assignedAgentName || 'Unassigned') !== backlogAgentFilter) {
        return false;
      }
      if (
        backlogSupervisorFilter !== 'all' &&
        (rec.assignedSupervisorName || 'Unassigned') !== backlogSupervisorFilter
      ) {
        return false;
      }
      if (backlogCategoryFilter !== 'all' && (rec.category || 'General') !== backlogCategoryFilter) {
        return false;
      }
      if (backlogPriorityFilter !== 'all' && rec.priority.toLowerCase() !== backlogPriorityFilter) {
        return false;
      }
      if (backlogStatusFilter !== 'all' && rec.status.toLowerCase() !== backlogStatusFilter) {
        return false;
      }
      if (backlogAgeFilter === 'under_4h' && rec.ageHours >= 4) return false;
      if (backlogAgeFilter === '4h_to_24h' && (rec.ageHours < 4 || rec.ageHours >= 24)) return false;
      if (backlogAgeFilter === 'over_24h' && rec.ageHours < 24) return false;
      if (backlogAgeFilter === 'over_48h' && rec.ageHours < 48) return false;

      if (backlogSlaConditionFilter === 'approaching_sla' && rec.slaCondition !== 'approaching_sla') {
        return false;
      }
      if (backlogSlaConditionFilter === 'overdue_24h' && !rec.isOverdue24h) return false;
      if (backlogSlaConditionFilter === 'overdue_48h' && !rec.isOverdue48h) return false;
      if (backlogSlaConditionFilter === 'awaiting_customer' && rec.waitingOn !== 'customer') {
        return false;
      }
      if (backlogSlaConditionFilter === 'awaiting_agent' && rec.waitingOn !== 'agent') {
        return false;
      }
      if (backlogSlaConditionFilter === 'awaiting_supervisor' && rec.waitingOn !== 'supervisor') {
        return false;
      }
      if (backlogSlaConditionFilter === 'awaiting_specialist' && rec.waitingOn !== 'specialist') {
        return false;
      }
      if (backlogSlaConditionFilter === 'reopened' && !rec.isReopened) return false;

      return true;
    });
  }, [
    backlogRecords,
    backlogDeptFilter,
    backlogAgentFilter,
    backlogSupervisorFilter,
    backlogCategoryFilter,
    backlogPriorityFilter,
    backlogStatusFilter,
    backlogAgeFilter,
    backlogSlaConditionFilter,
  ]);

  const uniqueBacklogDepts = useMemo(
    () => Array.from(new Set(backlogRecords.map((r) => r.department || 'General Support'))),
    [backlogRecords],
  );
  const uniqueBacklogCategories = useMemo(
    () => Array.from(new Set(backlogRecords.map((r) => r.category || 'General'))),
    [backlogRecords],
  );

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
                  Administrator Operations, Accountability, QA &amp; Automation
                </h1>
                <p className="text-xs text-slate-500">
                  Real-time operational command center, agent scorecards, supervisor QA evaluations,
                  multi-channel analytics, SLA backlog filters, and workflow automation.
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

            <button
              type="button"
              disabled={runningDemo}
              onClick={() => void handleRunDemoScenario()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-xs font-bold text-indigo-800"
            >
              <Play className="w-3.5 h-3.5 text-indigo-600" />
              {runningDemo ? 'Running Demo...' : 'Run [DEMO] Deposit Scenario'}
            </button>

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
            1. Operations, Analytics &amp; Backlog
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
            2. Scorecards, Accountability &amp; QA ({scorecards.length})
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
          <button
            type="button"
            onClick={() => setActiveTab('workflow-automation')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'workflow-automation'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Workflow className="w-3.5 h-3.5" />
            5. Workflow Automation Engine ({automationRules.length})
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
      {/* TAB 1: DAILY OPERATIONS OVERVIEW, CHANNEL/TREND ANALYTICS & BACKLOG */}
      {/* =================================================================== */}
      {activeTab === 'operations-dashboard' && metrics && (
        <div className="space-y-6">
          {/* Primary Executive KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Customers Attended
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {metrics.overview.uniqueCustomersAttended}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics.overview.newConversations} new enquiries
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Convs Handled
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
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Support Tickets
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {metrics.overview.newTickets}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics.overview.closedTickets} closed
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Product Complaints
              </div>
              <div className="text-2xl font-bold text-amber-700 mt-1">
                {metrics.overview.newComplaints}
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                {metrics.overview.approvedComplaints} appr ·{' '}
                {metrics.overview.declinedComplaints} decl
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Replacements Issued
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {metrics.overview.replacementsIssued}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics.overview.pendingVerificationComplaints} pending review
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Response / Res Time
              </div>
              <div className="text-lg font-bold text-slate-900 mt-1">
                {metrics.overview.avgFirstResponseMinutes !== null
                  ? `${metrics.overview.avgFirstResponseMinutes}m`
                  : 'N/A'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Res:{' '}
                {metrics.overview.avgResolutionHours !== null
                  ? `${metrics.overview.avgResolutionHours}h`
                  : 'N/A'}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                SLA Compliance
              </div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {metrics.overview.slaCompliancePercentage ?? 100}%
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics.overview.escalatedCasesCount ?? 0} escalated
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-3.5">
              <div className="text-[10px] font-bold text-slate-500 uppercase">
                Customer CSAT
              </div>
              <div className="text-2xl font-bold text-amber-600 mt-1 flex items-center gap-1">
                {metrics.overview.customerSatisfactionScore !== null
                  ? `${metrics.overview.customerSatisfactionScore}/5`
                  : '—'}
                <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {(data?.customerFeedback ?? []).length} ratings
              </div>
            </div>
          </div>

          {/* Channel Analytics & 7-Day Trend Analytics Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel Analytics */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Multi-Channel Support Analytics
                </h3>
                <p className="text-xs text-slate-500">
                  Enquiry volume, resolution rate, and response time across Website Widget, Support
                  Portal, and Telegram.
                </p>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2 px-3">Channel</th>
                      <th className="py-2 px-3">Total Convs</th>
                      <th className="py-2 px-3">Open</th>
                      <th className="py-2 px-3">Resolved</th>
                      <th className="py-2 px-3">Escalated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(metrics.channelAnalytics ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400">
                          No channel traffic recorded in this period.
                        </td>
                      </tr>
                    ) : (
                      (metrics.channelAnalytics ?? []).map((ch) => (
                        <tr key={ch.channel} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {ch.label}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-indigo-700">
                            {ch.totalConversations}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-700">
                            {ch.openCount}
                          </td>
                          <td className="py-2 px-3 font-mono text-emerald-700">
                            {ch.resolvedCount}
                          </td>
                          <td className="py-2 px-3 font-mono text-amber-700">
                            {ch.escalatedCount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 7-Day Trend Analytics */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  7-Day Operational Volume &amp; Resolution Trend
                </h3>
                <p className="text-xs text-slate-500">
                  Daily trajectory of new conversations, resolved enquiries, complaints, and net
                  backlog.
                </p>
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">New Convs</th>
                      <th className="py-2 px-3">Resolved</th>
                      <th className="py-2 px-3">New Claims</th>
                      <th className="py-2 px-3">Resolved Claims</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(metrics.trendAnalytics ?? []).map((t) => (
                      <tr key={t.dateLabel} className="hover:bg-slate-50">
                        <td className="py-1.5 px-3 font-mono font-semibold text-slate-800">
                          {t.dateLabel}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-indigo-700">
                          {t.newConversations}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-emerald-700">
                          {t.resolvedConversations}
                        </td>
                        <td className="py-1.5 px-3 font-mono text-amber-700">
                          {t.newComplaints}
                        </td>
                        <td className="py-1.5 px-3 font-mono font-bold text-emerald-800">
                          {t.resolvedComplaints}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Open Issues & Backlog Monitoring with 8-Dimensional Filter Bar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-rose-600" />
                  Backlog &amp; Complaint Management Queues
                </h2>
                <p className="text-xs text-slate-500">
                  Track unassigned complaints, unattended enquiries, overdue tickets, escalated
                  cases, cases awaiting customer/agent/supervisor/specialised personnel, and
                  reopened complaints.
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

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
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
              <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200">
                <div className="text-[10px] font-bold uppercase text-indigo-800">
                  Awaiting Specialist
                </div>
                <div className="text-xl font-bold text-indigo-900 mt-0.5">
                  {metrics.backlogQueues.casesAwaitingSpecialisedPersonnel ?? 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200">
                <div className="text-[10px] font-bold uppercase text-purple-800">
                  Awaiting Customer
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
                  Overdue &gt; 24h
                </div>
                <div className="text-xl font-bold text-rose-700 mt-0.5">
                  {metrics.backlogQueues.overdueCases24h}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-rose-100/80 border border-rose-300">
                <div className="text-[10px] font-bold uppercase text-rose-900">
                  Critical &gt; 48h
                </div>
                <div className="text-xl font-bold text-rose-900 mt-0.5">
                  {metrics.backlogQueues.overdueCases48h}
                </div>
              </div>
            </div>

            {/* 8-Dimensional Backlog Filter Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1">
              <select
                value={backlogDeptFilter}
                onChange={(e) => setBacklogDeptFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">All Departments</option>
                {uniqueBacklogDepts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                value={backlogAgentFilter}
                onChange={(e) => setBacklogAgentFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">All Agents</option>
                <option value="Unassigned">Unassigned</option>
                {(data?.teamMembers ?? []).map((m) => (
                  <option key={m.id} value={m.displayName}>
                    {m.displayName}
                  </option>
                ))}
              </select>

              <select
                value={backlogSupervisorFilter}
                onChange={(e) => setBacklogSupervisorFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">All Supervisors</option>
                <option value="Unassigned">Unassigned</option>
                {(data?.teamMembers ?? [])
                  .filter(
                    (m) =>
                      m.role === UserRole.Supervisor ||
                      m.role === UserRole.Admin ||
                      m.role === UserRole.Owner,
                  )
                  .map((m) => (
                    <option key={m.id} value={m.displayName}>
                      {m.displayName}
                    </option>
                  ))}
              </select>

              <select
                value={backlogCategoryFilter}
                onChange={(e) => setBacklogCategoryFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">All Categories</option>
                {uniqueBacklogCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={backlogPriorityFilter}
                onChange={(e) => setBacklogPriorityFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>

              <select
                value={backlogStatusFilter}
                onChange={(e) => setBacklogStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="submitted">Submitted</option>
                <option value="pending_review">Pending Review</option>
                <option value="in_progress">In Progress</option>
                <option value="awaiting_information">Awaiting Info</option>
                <option value="awaiting_replacement">Awaiting Replacement</option>
                <option value="open">Open Conversation</option>
                <option value="escalated">Escalated Conversation</option>
              </select>

              <select
                value={backlogAgeFilter}
                onChange={(e) => setBacklogAgeFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
              >
                <option value="all">Any Case Age</option>
                <option value="under_4h">&lt; 4 Hours</option>
                <option value="4h_to_24h">4 – 24 Hours</option>
                <option value="over_24h">&gt; 24 Hours</option>
                <option value="over_48h">&gt; 48 Hours</option>
              </select>

              <select
                value={backlogSlaConditionFilter}
                onChange={(e) => setBacklogSlaConditionFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white font-semibold"
              >
                <option value="all">All SLA / Waiting States</option>
                <option value="approaching_sla">Approaching SLA</option>
                <option value="overdue_24h">Overdue &gt; 24h</option>
                <option value="overdue_48h">Critical &gt; 48h</option>
                <option value="awaiting_customer">Awaiting Customer</option>
                <option value="awaiting_agent">Awaiting Agent</option>
                <option value="awaiting_supervisor">Awaiting Supervisor</option>
                <option value="awaiting_specialist">Awaiting Specialised Personnel</option>
                <option value="reopened">Reopened Cases</option>
              </select>
            </div>

            {/* Active Backlog Table */}
            {filteredBacklogRecords.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2.5 px-3">Ref</th>
                      <th className="py-2.5 px-3">Type / Dept</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3">Product / Category</th>
                      <th className="py-2.5 px-3">Status &amp; Waiting On</th>
                      <th className="py-2.5 px-3">Assigned Personnel</th>
                      <th className="py-2.5 px-3">Age / SLA Deadline</th>
                      <th className="py-2.5 px-3">SLA &amp; Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredBacklogRecords.slice(0, 25).map((rec) => (
                      <tr key={`${rec.recordType}:${rec.id}`} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {rec.referenceCode}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="capitalize font-semibold text-slate-700">
                            {rec.recordType}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {rec.department || 'General Support'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">
                          {rec.customerName}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-slate-800 font-medium">{rec.subjectOrProduct}</div>
                          <div className="text-[10px] text-slate-500">{rec.category}</div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {rec.status}
                          </span>
                          {rec.waitingOn && (
                            <div className="text-[10px] text-indigo-700 font-semibold mt-0.5 uppercase">
                              Waiting: {rec.waitingOn}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          <div>{rec.assignedTo}</div>
                          {rec.assignedSpecialistName && (
                            <div className="text-[10px] text-indigo-700 font-semibold">
                              Specialist: {rec.assignedSpecialistName}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          <div className="font-bold">{rec.ageHours}h elapsed</div>
                          {rec.slaDeadlineAt && (
                            <div className="text-[10px] text-slate-500">
                              Due: {new Date(rec.slaDeadlineAt).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {rec.isOverdue48h ? (
                              <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold">
                                &gt;48h SLA
                              </span>
                            ) : rec.isOverdue24h ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                &gt;24h SLA
                              </span>
                            ) : rec.slaCondition === 'approaching_sla' ? (
                              <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-800 text-[10px] font-bold">
                                Approaching SLA
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                                Within SLA
                              </span>
                            )}
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
                No backlog records match the selected filter criteria.
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
      {/* TAB 2: AGENT SCORECARDS, ACCOUNTABILITY & QUALITY ASSURANCE (QA)     */}
      {/* =================================================================== */}
      {activeTab === 'team-performance' && metrics && (
        <div className="space-y-6">
          {/* Agent Performance Scorecards (Daily / Weekly / Monthly Targets + QA + CSAT) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-600" />
                Agent Performance Scorecards (Daily / Weekly / Monthly Targets, SLA &amp; QA)
              </h2>
              <p className="text-xs text-slate-500">
                Tracks daily, weekly, and monthly output against targets, resolution rate,
                escalation rate, reopened cases, SLA compliance %, QA evaluation average, CSAT, and
                case complexity index.
              </p>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-3 px-3">Agent</th>
                    <th className="py-3 px-3">Daily vs Target</th>
                    <th className="py-3 px-3">Weekly vs Target</th>
                    <th className="py-3 px-3">Monthly vs Target</th>
                    <th className="py-3 px-3">Resolution %</th>
                    <th className="py-3 px-3">Escalation %</th>
                    <th className="py-3 px-3">Reopened</th>
                    <th className="py-3 px-3">SLA %</th>
                    <th className="py-3 px-3">Avg QA Score</th>
                    <th className="py-3 px-3">Avg CSAT</th>
                    <th className="py-3 px-3">Workload Index</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {scorecards.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-6 text-center text-slate-400">
                        No agent scorecards available yet.
                      </td>
                    </tr>
                  ) : (
                    scorecards.map((sc) => (
                      <tr key={sc.agentId} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{sc.displayName}</div>
                          <div className="text-[10px] text-slate-500">{sc.role}</div>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className="font-bold text-indigo-700">{sc.dailyHandled}</span> / 5
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className="font-bold text-indigo-700">{sc.weeklyHandled}</span> /{' '}
                          {sc.weeklyTarget}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className="font-bold text-indigo-700">{sc.monthlyHandled}</span> /{' '}
                          {sc.weeklyTarget * 4}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                          {sc.resolutionRatePercent}%
                        </td>
                        <td className="py-2.5 px-3 font-mono text-amber-700">
                          {sc.escalationRatePercent}%
                        </td>
                        <td className="py-2.5 px-3 font-mono text-rose-700">
                          {sc.reopenedCasesCount}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">
                          {sc.slaCompliancePercent}%
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-800">
                          {sc.avgQaScore !== null
                            ? `${sc.avgQaScore}% (${sc.qaEvaluationsCount})`
                            : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-amber-700 font-bold">
                          {sc.avgCsatScore !== null ? `${sc.avgCsatScore}/5` : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {sc.workloadComplexityScore} pts
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Support Agent Real Activity Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                Support Agent Real Activity &amp; Case Drilldown
              </h2>
              <p className="text-xs text-slate-500">
                Separates assigned conversations from conversations actually handled and resolved.
                Activity status is derived from real system actions (replies, claims, notes,
                resolutions).
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

          {/* Supervisor Quality Assurance (QA) Evaluations & Coaching */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                Supervisor Quality Assurance (QA) Evaluations &amp; Coaching
              </h2>
              <p className="text-xs text-slate-500">
                Evaluate agent conversations and complaints across Accuracy (1–5), Professionalism
                (1–5), and Resolution Effectiveness (1–5), assign case complexity, and log coaching
                recommendations.
              </p>
            </div>

            {isSupervisorOrAdmin && (
              <form
                onSubmit={handleCreateQaEvaluation}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
              >
                <div className="font-bold text-slate-800">Record New QA Evaluation</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Target Type
                    </label>
                    <select
                      value={qaTargetType}
                      onChange={(e) =>
                        setQaTargetType(e.target.value as 'complaint' | 'conversation')
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                    >
                      <option value="complaint">Complaint Case</option>
                      <option value="conversation">Support Conversation</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Case Reference / ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={qaTargetRef}
                      onChange={(e) => setQaTargetRef(e.target.value)}
                      placeholder="e.g. CLM-2026-1001"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Evaluated Agent *
                    </label>
                    <input
                      type="text"
                      required
                      value={qaAgentName}
                      onChange={(e) => setQaAgentName(e.target.value)}
                      placeholder="Agent Display Name"
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Case Complexity
                    </label>
                    <select
                      value={qaComplexity}
                      onChange={(e) =>
                        setQaComplexity(
                          e.target.value as 'simple' | 'standard' | 'complex' | 'critical',
                        )
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white"
                    >
                      <option value="simple">Simple (1x)</option>
                      <option value="standard">Standard (1.5x)</option>
                      <option value="complex">Complex (2.5x)</option>
                      <option value="critical">Critical (4x)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Accuracy Score (1–5): <strong>{qaAccuracy}/5</strong>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={qaAccuracy}
                      onChange={(e) => setQaAccuracy(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Professionalism Score (1–5): <strong>{qaProfessionalism}/5</strong>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={qaProfessionalism}
                      onChange={(e) => setQaProfessionalism(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Resolution Effectiveness (1–5): <strong>{qaResolution}/5</strong>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={5}
                      value={qaResolution}
                      onChange={(e) => setQaResolution(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={qaNotes}
                    onChange={(e) => setQaNotes(e.target.value)}
                    placeholder="Evaluation feedback notes..."
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                  <input
                    type="text"
                    value={qaCoaching}
                    onChange={(e) => setQaCoaching(e.target.value)}
                    placeholder="Coaching recommendation for agent..."
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingQa}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                  >
                    {submittingQa ? 'Recording QA...' : 'Save QA Evaluation'}
                  </button>
                </div>
              </form>
            )}

            {/* QA Evaluations History */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-2.5 px-3">Case Ref</th>
                    <th className="py-2.5 px-3">Agent</th>
                    <th className="py-2.5 px-3">Evaluator</th>
                    <th className="py-2.5 px-3">Complexity</th>
                    <th className="py-2.5 px-3">Acc / Prof / Res</th>
                    <th className="py-2.5 px-3">Overall QA</th>
                    <th className="py-2.5 px-3">Feedback &amp; Coaching</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {qaEvaluations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-400">
                        No supervisor QA evaluations recorded yet.
                      </td>
                    </tr>
                  ) : (
                    qaEvaluations.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                          {ev.caseReference}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{ev.agentName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{ev.evaluatorName}</td>
                        <td className="py-2.5 px-3 uppercase text-[10px] font-bold text-slate-700">
                          {ev.caseComplexity}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">
                          {ev.accuracyScore} / {ev.professionalismScore} /{' '}
                          {ev.resolutionEffectivenessScore}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                          {ev.overallScore}%
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">
                          <div>{ev.feedbackNotes || '—'}</div>
                          {ev.coachingRecommendations && (
                            <div className="text-[11px] text-indigo-700 font-medium">
                              Coaching: {ev.coachingRecommendations}
                            </div>
                          )}
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
                supervisors, claims, QA, automation, and replacement stock.
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
              <option value="supervisor">Supervisor Decision &amp; QA</option>
              <option value="replacement">Replacement Fulfilment</option>
              <option value="inventory">Inventory Movement</option>
              <option value="conversation">Conversation &amp; Ticket</option>
              <option value="settings">Operations &amp; Automation</option>
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
      {/* TAB 5: WORKFLOW AUTOMATION ENGINE (PHASE FOUR)                      */}
      {/* =================================================================== */}
      {activeTab === 'workflow-automation' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Workflow className="w-4 h-4 text-indigo-600" />
                  Configurable Workflow Automation Engine
                </h2>
                <p className="text-xs text-slate-500">
                  Automates routine operational tasks without code: enquiry assignment,
                  categorisation, high-risk escalation, overdue supervisor alerts, unavailable agent
                  reassignment, SLA warnings, customer status updates, and pending follow-ups.
                  Includes built-in loop deduplication and full execution audit logging.
                </p>
              </div>
              <button
                type="button"
                disabled={runningSweep}
                onClick={() => void handleRunAutomationSweep()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shrink-0 shadow-xs"
              >
                <Zap className="w-4 h-4" />
                {runningSweep ? 'Running Sweep...' : 'Run Automation Sweep Now'}
              </button>
            </div>

            {/* Active Rules Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {automationRules.map((rule) => (
                <div
                  key={rule.id}
                  className={`p-4 rounded-xl border text-xs flex flex-col justify-between gap-3 ${
                    rule.isEnabled
                      ? 'bg-white border-slate-200'
                      : 'bg-slate-50/70 border-slate-200/60 opacity-75'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold text-[10px]">
                        {AUTOMATION_RULE_TYPE_LABELS[rule.ruleType] || rule.ruleType}
                      </span>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.isEnabled}
                          onChange={(e) =>
                            void handleToggleAutomationRule(rule.id, e.target.checked)
                          }
                          className="rounded border-slate-300"
                        />
                        <span className="font-bold text-[11px] text-slate-700">
                          {rule.isEnabled ? 'Enabled' : 'Paused'}
                        </span>
                      </label>
                    </div>
                    <div className="font-bold text-slate-900 text-sm">{rule.name}</div>
                    <p className="text-slate-600 text-[11px]">{rule.description}</p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                    <span>
                      Triggered: <strong className="text-slate-800">{rule.executionCount}x</strong>
                    </span>
                    <span>
                      {rule.lastTriggeredAt
                        ? `Last run: ${new Date(rule.lastTriggeredAt).toLocaleString()}`
                        : 'Ready'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Custom Automation Rule Form */}
            {isSupervisorOrAdmin && (
              <form
                onSubmit={handleCreateAutomationRule}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs"
              >
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-indigo-600" />
                  Create Custom Workflow Automation Rule
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <input
                    type="text"
                    required
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    placeholder="Rule Name (e.g. Escalate VIP Deposit Claims)..."
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  />
                  <select
                    value={newRuleType}
                    onChange={(e) => setNewRuleType(e.target.value as AutomationRuleType)}
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  >
                    {Object.entries(AUTOMATION_RULE_TYPE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newRuleDesc}
                      onChange={(e) => setNewRuleDesc(e.target.value)}
                      placeholder="Rule condition & action description..."
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-200 bg-white"
                    />
                    <button
                      type="submit"
                      disabled={submittingRule}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold shrink-0"
                    >
                      Save Rule
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>

          {/* Automation Execution Audit Trail */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Automation Execution Audit Log ({automationLogs.length})
              </h3>
              <p className="text-xs text-slate-500">
                Every automated assignment, categorisation, escalation, and SLA alert is logged and
                deduplicated per target record to prevent infinite loops.
              </p>
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                    <th className="py-2.5 px-3">Rule</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Target Ref</th>
                    <th className="py-2.5 px-3">Automated Action Summary</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {automationLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-400">
                        No automated actions triggered yet. Click &ldquo;Run Automation Sweep
                        Now&rdquo; above to evaluate all active rules.
                      </td>
                    </tr>
                  ) : (
                    automationLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-semibold text-slate-900">{log.ruleName}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-indigo-700">
                          {log.ruleType}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          {log.targetReference}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{log.actionSummary}</td>
                        <td className="py-2.5 px-3 text-slate-500">
                          {new Date(log.createdAt).toLocaleString()}
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
      {/* MODAL: [DEMO] DEPOSIT COMPLAINT SCENARIO LIFECYCLE                  */}
      {/* =================================================================== */}
      {demoResultModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-bold uppercase text-indigo-600">
                  Phase 9 Demonstration Scenario Complete
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  [DEMO] Customer Deposit Complaint Lifecycle ({demoResultModal.referenceCode})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDemoResultModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2.5 text-xs">
              <p className="text-slate-600">
                All 10 operational stages have been executed in the database and are now visible in
                your Claims Workspace, Supervisor Queue, Scorecards, QA Evaluations, and Analytics:
              </p>
              <div className="space-y-2">
                {demoResultModal.stepsCompleted.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="font-medium">{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setDemoResultModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold"
              >
                Done
              </button>
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

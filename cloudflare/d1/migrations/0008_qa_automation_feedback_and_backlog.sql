-- Migration 0008: QA Evaluations, Customer Feedback (CSAT), Workflow Automation Engine, and Specialised Personnel / SLA Columns

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS qa_evaluations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  conversation_id TEXT,
  complaint_id TEXT,
  case_reference TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  evaluator_user_id TEXT,
  evaluator_name TEXT NOT NULL,
  accuracy_score INTEGER NOT NULL DEFAULT 5 CHECK (accuracy_score BETWEEN 1 AND 5),
  professionalism_score INTEGER NOT NULL DEFAULT 5 CHECK (professionalism_score BETWEEN 1 AND 5),
  resolution_effectiveness_score INTEGER NOT NULL DEFAULT 5 CHECK (resolution_effectiveness_score BETWEEN 1 AND 5),
  overall_score INTEGER NOT NULL DEFAULT 100 CHECK (overall_score BETWEEN 0 AND 100),
  case_complexity TEXT NOT NULL DEFAULT 'standard' CHECK (case_complexity IN ('low', 'standard', 'complex')),
  feedback_notes TEXT NOT NULL DEFAULT '',
  coaching_recommendations TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qa_evaluations_org_agent
  ON qa_evaluations (organization_id, agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_feedback_ratings (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  conversation_id TEXT,
  complaint_id TEXT,
  case_reference TEXT NOT NULL DEFAULT '',
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT 'portal',
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_feedback_org_created
  ON customer_feedback_ratings (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS workflow_automation_rules (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rule_type TEXT NOT NULL CHECK (rule_type IN ('auto_assign_enquiry', 'auto_categorise_enquiry', 'auto_escalate_condition', 'notify_supervisor_overdue', 'reassign_unavailable_agent', 'notify_agent_sla_warning', 'notify_customer_status_change', 'trigger_pending_followup')),
  trigger_event TEXT NOT NULL DEFAULT 'on_case_event',
  conditions_json TEXT NOT NULL DEFAULT '{}',
  actions_json TEXT NOT NULL DEFAULT '{}',
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  priority_order INTEGER NOT NULL DEFAULT 10,
  execution_count INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TEXT,
  created_by_name TEXT NOT NULL DEFAULT 'Administrator',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_automation_rules_org
  ON workflow_automation_rules (organization_id, is_enabled, priority_order ASC);

CREATE TABLE IF NOT EXISTS workflow_automation_logs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'complaint',
  target_id TEXT NOT NULL,
  target_reference TEXT NOT NULL DEFAULT '',
  action_summary TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT 'Automation Engine',
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_automation_logs_org_created
  ON workflow_automation_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_automation_logs_dedup
  ON workflow_automation_logs (organization_id, rule_id, target_id);

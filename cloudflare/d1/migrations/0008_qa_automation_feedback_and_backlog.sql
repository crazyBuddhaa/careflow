-- =============================================================================
-- Migration 0008: Operational Management, Claims & Supervisor Verification,
-- Replacement Inventory, QA Evaluations, Customer Feedback (CSAT),
-- Workflow Automation Engine & Backlog Tracking
-- Safe, non-destructive migration for Cloudflare D1 (SQLite)
-- =============================================================================

PRAGMA foreign_keys = ON;

-- 1. Organization Operations & SLA Configuration
CREATE TABLE IF NOT EXISTS organization_operations_configs (
  organization_id TEXT PRIMARY KEY NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  business_closing_time TEXT NOT NULL DEFAULT '18:00',
  fulfilment_method TEXT NOT NULL DEFAULT 'both' CHECK (fulfilment_method IN ('supervisor_controlled', 'agent_assisted', 'both')),
  allow_agent_direct_approval INTEGER NOT NULL DEFAULT 0 CHECK (allow_agent_direct_approval IN (0, 1)),
  auto_assign_supervisor INTEGER NOT NULL DEFAULT 1 CHECK (auto_assign_supervisor IN (0, 1)),
  sla_first_response_minutes INTEGER NOT NULL DEFAULT 30,
  sla_resolution_hours INTEGER NOT NULL DEFAULT 24,
  sla_overdue_hours INTEGER NOT NULL DEFAULT 48,
  inactivity_timeout_minutes INTEGER NOT NULL DEFAULT 15,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- 2. Configurable Complaint Categories
CREATE TABLE IF NOT EXISTS complaint_categories (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  requires_order_id INTEGER NOT NULL DEFAULT 1 CHECK (requires_order_id IN (0, 1)),
  requires_login_info INTEGER NOT NULL DEFAULT 0 CHECK (requires_login_info IN (0, 1)),
  requires_evidence INTEGER NOT NULL DEFAULT 0 CHECK (requires_evidence IN (0, 1)),
  custom_fields_json TEXT NOT NULL DEFAULT '[]',
  default_priority TEXT NOT NULL DEFAULT 'normal' CHECK (default_priority IN ('low', 'normal', 'high', 'urgent')),
  auto_escalate_to_supervisor INTEGER NOT NULL DEFAULT 0 CHECK (auto_escalate_to_supervisor IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_complaint_categories_org
  ON complaint_categories (organization_id, is_active, display_order);

-- 3. Support Complaints & Multi-Tier Escalation Records
CREATE TABLE IF NOT EXISTS support_complaints (
  id TEXT PRIMARY KEY NOT NULL,
  reference_code TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  conversation_id TEXT,
  ticket_id TEXT,
  customer_id TEXT,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL DEFAULT '',
  order_id TEXT NOT NULL DEFAULT '',
  product_or_service TEXT NOT NULL DEFAULT '',
  category_id TEXT,
  category_name TEXT NOT NULL DEFAULT 'General Complaint',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'pending_review', 'in_progress', 'awaiting_information', 'approved', 'awaiting_replacement', 'declined', 'resolved')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  description TEXT NOT NULL,
  encrypted_login_info TEXT,
  login_info_masked TEXT NOT NULL DEFAULT '',
  custom_fields_json TEXT NOT NULL DEFAULT '{}',
  duplicate_of_complaint_id TEXT,
  is_potential_duplicate INTEGER NOT NULL DEFAULT 0 CHECK (is_potential_duplicate IN (0, 1)),
  created_by_user_id TEXT,
  created_by_name TEXT NOT NULL,
  created_by_role TEXT NOT NULL DEFAULT 'agent',
  assigned_agent_id TEXT,
  assigned_agent_name TEXT,
  assigned_supervisor_id TEXT,
  assigned_supervisor_name TEXT,
  assigned_specialist_name TEXT,
  assigned_specialist_department TEXT,
  sla_deadline_at TEXT,
  escalated_at TEXT,
  reviewed_by_supervisor_id TEXT,
  reviewed_by_supervisor_name TEXT,
  reviewed_at TEXT,
  decision TEXT CHECK (decision IN ('approved', 'declined', 'info_requested')),
  decision_reason TEXT,
  resolution_type TEXT,
  resolution_summary TEXT,
  allocated_replacement_id TEXT,
  delivered_at TEXT,
  resolved_at TEXT,
  reopened_count INTEGER NOT NULL DEFAULT 0,
  last_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, reference_code),
  UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_support_complaints_org_status
  ON support_complaints (organization_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_complaints_org_order
  ON support_complaints (organization_id, order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_complaints_org_supervisor
  ON support_complaints (organization_id, assigned_supervisor_id, status);

CREATE INDEX IF NOT EXISTS idx_support_complaints_org_agent
  ON support_complaints (organization_id, assigned_agent_id, status);

-- 4. Complaint Supporting Evidence & Screenshots
CREATE TABLE IF NOT EXISTS complaint_evidence (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  complaint_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  file_url_or_data TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  uploaded_by_user_id TEXT,
  uploaded_by_name TEXT NOT NULL,
  uploaded_by_role TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (complaint_id, organization_id) REFERENCES support_complaints(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_complaint_evidence_org_complaint
  ON complaint_evidence (organization_id, complaint_id, created_at ASC);

-- 5. Complaint Internal Notes, Supervisor Instructions & Customer Updates
CREATE TABLE IF NOT EXISTS complaint_internal_comments (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  complaint_id TEXT NOT NULL,
  author_user_id TEXT,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'agent',
  comment_type TEXT NOT NULL DEFAULT 'internal_note' CHECK (comment_type IN ('internal_note', 'escalation_note', 'supervisor_instruction', 'decision_reason', 'info_request', 'customer_update')),
  body TEXT NOT NULL,
  is_visible_to_customer INTEGER NOT NULL DEFAULT 0 CHECK (is_visible_to_customer IN (0, 1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (complaint_id, organization_id) REFERENCES support_complaints(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_complaint_comments_org_complaint
  ON complaint_internal_comments (organization_id, complaint_id, created_at ASC);

-- 6. Complaint Multi-Tier Assignment History (Agent / Supervisor / Specialist)
CREATE TABLE IF NOT EXISTS complaint_assignments_history (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  complaint_id TEXT NOT NULL,
  from_user_id TEXT,
  from_user_name TEXT,
  to_user_id TEXT,
  to_user_name TEXT NOT NULL,
  assignment_role TEXT NOT NULL DEFAULT 'supervisor' CHECK (assignment_role IN ('agent', 'supervisor', 'specialist')),
  reason TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (complaint_id, organization_id) REFERENCES support_complaints(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_complaint_assignments_org_complaint
  ON complaint_assignments_history (organization_id, complaint_id, created_at ASC);

-- 7. Replacement Inventory Categories, Stock Batches, Items & Movements
CREATE TABLE IF NOT EXISTS replacement_inventory_categories (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  product_or_service TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  min_stock_threshold INTEGER NOT NULL DEFAULT 5,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_replacement_inv_categories_org
  ON replacement_inventory_categories (organization_id, is_active, name);

CREATE TABLE IF NOT EXISTS replacement_stock_batches (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  batch_code TEXT NOT NULL,
  product_or_service TEXT NOT NULL,
  supplier_ref TEXT NOT NULL DEFAULT '',
  total_added INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by_user_id TEXT,
  created_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES replacement_inventory_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replacement_batches_org
  ON replacement_stock_batches (organization_id, category_id, created_at DESC);

CREATE TABLE IF NOT EXISTS replacement_inventory_items (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  batch_id TEXT,
  product_or_service TEXT NOT NULL,
  category_name TEXT NOT NULL,
  identifier_masked TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  supplier_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'INVALID', 'WITHDRAWN')),
  expires_at TEXT,
  associated_complaint_id TEXT,
  associated_order_id TEXT,
  reserved_by_user_id TEXT,
  reserved_by_name TEXT,
  reserved_at TEXT,
  issued_by_user_id TEXT,
  issued_by_name TEXT,
  issued_at TEXT,
  added_by_user_id TEXT,
  added_by_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES replacement_inventory_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replacement_items_org_status
  ON replacement_inventory_items (organization_id, status, category_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_replacement_items_org_complaint
  ON replacement_inventory_items (organization_id, associated_complaint_id);

CREATE TABLE IF NOT EXISTS replacement_inventory_movements (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  inventory_item_id TEXT NOT NULL,
  batch_id TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('added', 'bulk_imported', 'updated', 'reserved', 'reservation_released', 'issued', 'marked_expired', 'marked_invalid', 'withdrawn')),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  complaint_id TEXT,
  order_id TEXT,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'admin',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (inventory_item_id) REFERENCES replacement_inventory_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_replacement_movements_org_created
  ON replacement_inventory_movements (organization_id, created_at DESC);

-- 8. Centralized Operational Activity Events & Meaningful Agent Sessions
CREATE TABLE IF NOT EXISTS operational_activity_events (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  event_category TEXT NOT NULL CHECK (event_category IN ('agent_activity', 'conversation', 'ticket', 'complaint', 'supervisor', 'inventory', 'replacement', 'report', 'settings')),
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL DEFAULT 'agent',
  case_reference TEXT,
  complaint_id TEXT,
  conversation_id TEXT,
  inventory_item_id TEXT,
  product_or_service TEXT,
  summary TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_operational_activity_org_created
  ON operational_activity_events (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_activity_org_actor
  ON operational_activity_events (organization_id, actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_activity_org_case
  ON operational_activity_events (organization_id, case_reference, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_activity_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'agent',
  started_at TEXT NOT NULL,
  last_meaningful_action_at TEXT NOT NULL,
  last_action_type TEXT NOT NULL DEFAULT '',
  actions_count INTEGER NOT NULL DEFAULT 1,
  ended_at TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_activity_sessions_org_user
  ON agent_activity_sessions (organization_id, user_id, last_meaningful_action_at DESC);

-- 9. Supervisor QA Evaluations & Agent Scorecards
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

-- 10. Customer Satisfaction (CSAT) Ratings & Feedback
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

-- 11. Configurable Workflow Automation Rules & Deduplicated Execution Logs
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

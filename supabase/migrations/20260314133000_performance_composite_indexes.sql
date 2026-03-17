-- Composite indexes to improve common multi-tenant reads and sort patterns.

CREATE INDEX IF NOT EXISTS idx_tickets_company_status_created_at
  ON public.tickets(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tickets_company_priority_created_at
  ON public.tickets(company_id, priority, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_devices_company_health_last_seen
  ON public.devices(company_id, health_status, last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_devices_company_created_at
  ON public.devices(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_executions_company_created_at
  ON public.script_executions(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backups_company_status_created_at
  ON public.backups(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_company_category_created_at
  ON public.system_logs(company_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_company_read_created_at
  ON public.notifications(company_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_company_captured_at
  ON public.analytics(company_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_company_status_priority_created_at
  ON public.agent_tasks_queue(company_id, status, priority, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_company_schedule
  ON public.agent_tasks_queue(company_id, status, scheduled_for ASC);

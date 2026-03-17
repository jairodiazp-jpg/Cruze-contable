-- Agent orchestration and async queue foundations for SaaS multi-tenant scale

CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  agent_type text NOT NULL CHECK (agent_type IN ('planning-agent', 'automation-agent', 'scraping-agent', 'analysis-agent', 'notification-agent')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_heartbeat timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.agent_tasks_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_type text NOT NULL CHECK (agent_type IN ('planning-agent', 'automation-agent', 'scraping-agent', 'analysis-agent', 'notification-agent')),
  task_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_tasks_queue ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  agent_type text NOT NULL,
  run_status text NOT NULL DEFAULT 'running' CHECK (run_status IN ('running', 'completed', 'failed', 'cancelled')),
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  input_payload jsonb,
  output_payload jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app', 'email', 'webhook')),
  title text NOT NULL,
  body text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  read_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_name text NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agents_company_id ON public.agents(company_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_company_status ON public.agent_tasks_queue(company_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_company_priority ON public.agent_tasks_queue(company_id, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_company_id ON public.agent_runs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company_user ON public.notifications(company_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_company_metric_time ON public.analytics(company_id, metric_name, captured_at DESC);

-- High-impact indexes for existing multi-tenant tables
CREATE INDEX IF NOT EXISTS idx_devices_company_id ON public.devices(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON public.tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_company_id ON public.system_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_script_executions_company_id ON public.script_executions(company_id);
CREATE INDEX IF NOT EXISTS idx_backups_company_id ON public.backups(company_id);

-- RLS policies
CREATE POLICY "Users can view company agents" ON public.agents
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins and techs can manage company agents" ON public.agents
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  );

CREATE POLICY "Users can view own company queued tasks" ON public.agent_tasks_queue
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins and techs can manage own company queued tasks" ON public.agent_tasks_queue
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  );

CREATE POLICY "Users can view own company agent runs" ON public.agent_runs
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Service role can insert agent runs" ON public.agent_runs
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can view own company notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Service role can insert notifications" ON public.notifications
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can view own company analytics" ON public.analytics
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Service role can insert analytics" ON public.analytics
  FOR INSERT TO service_role
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enqueue_agent_task(
  p_company_id uuid,
  p_agent_type text,
  p_task_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_priority integer DEFAULT 5,
  p_scheduled_for timestamptz DEFAULT now(),
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  INSERT INTO public.agent_tasks_queue (
    company_id,
    agent_type,
    task_type,
    payload,
    priority,
    scheduled_for,
    created_by
  ) VALUES (
    p_company_id,
    p_agent_type,
    p_task_type,
    COALESCE(p_payload, '{}'::jsonb),
    COALESCE(p_priority, 5),
    COALESCE(p_scheduled_for, now()),
    p_created_by
  )
  RETURNING id INTO v_task_id;

  RETURN v_task_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_agent_task(uuid, text, text, jsonb, integer, timestamptz, uuid) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_tasks_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics;

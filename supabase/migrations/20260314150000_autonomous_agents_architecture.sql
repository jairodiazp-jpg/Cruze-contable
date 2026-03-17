-- Autonomous multi-agent architecture: workflow orchestration, inter-agent communication, and audit-ready execution.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agents_agent_type_check'
      AND conrelid = 'public.agents'::regclass
  ) THEN
    ALTER TABLE public.agents DROP CONSTRAINT agents_agent_type_check;
  END IF;
END;
$$;

ALTER TABLE public.agents
  ADD CONSTRAINT agents_agent_type_check
  CHECK (
    agent_type IN (
      'planning-agent',
      'execution-agent',
      'evaluation-agent',
      'automation-agent',
      'scraping-agent',
      'analysis-agent',
      'notification-agent'
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_tasks_queue_agent_type_check'
      AND conrelid = 'public.agent_tasks_queue'::regclass
  ) THEN
    ALTER TABLE public.agent_tasks_queue DROP CONSTRAINT agent_tasks_queue_agent_type_check;
  END IF;
END;
$$;

ALTER TABLE public.agent_tasks_queue
  ADD CONSTRAINT agent_tasks_queue_agent_type_check
  CHECK (
    agent_type IN (
      'planning-agent',
      'execution-agent',
      'evaluation-agent',
      'automation-agent',
      'scraping-agent',
      'analysis-agent',
      'notification-agent'
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_tasks_queue_status_check'
      AND conrelid = 'public.agent_tasks_queue'::regclass
  ) THEN
    ALTER TABLE public.agent_tasks_queue DROP CONSTRAINT agent_tasks_queue_status_check;
  END IF;
END;
$$;

ALTER TABLE public.agent_tasks_queue
  ADD CONSTRAINT agent_tasks_queue_status_check
  CHECK (status IN ('pending', 'running', 'completed', 'failed'));

ALTER TABLE public.agent_tasks_queue
  ADD COLUMN IF NOT EXISTS workflow_id uuid,
  ADD COLUMN IF NOT EXISTS parent_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS depends_on_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS result_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  root_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  workflow_name text NOT NULL,
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_task_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  workflow_id uuid REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  from_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  to_task_id uuid REFERENCES public.agent_tasks_queue(id) ON DELETE SET NULL,
  message_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_workflow_status
  ON public.agent_tasks_queue(company_id, workflow_id, status, scheduled_for ASC);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_queue_parent
  ON public.agent_tasks_queue(company_id, parent_task_id, status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_workflows_company_status
  ON public.agent_workflows(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_messages_workflow_time
  ON public.agent_task_messages(company_id, workflow_id, created_at DESC);

ALTER TABLE public.agent_tasks_queue
  ADD CONSTRAINT agent_tasks_queue_workflow_fk
  FOREIGN KEY (workflow_id)
  REFERENCES public.agent_workflows(id)
  ON DELETE CASCADE;

CREATE POLICY "Users can view own company workflows" ON public.agent_workflows
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Admins and techs can manage own company workflows" ON public.agent_workflows
  FOR ALL TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  )
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'technician'::public.app_role))
  );

CREATE POLICY "Service role can manage workflows" ON public.agent_workflows
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own company task messages" ON public.agent_task_messages
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Service role can manage task messages" ON public.agent_task_messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.enqueue_agent_workflow(
  p_company_id uuid,
  p_goal text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workflow_id uuid;
  v_task_id uuid;
BEGIN
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'company_id is required';
  END IF;

  IF p_goal IS NULL OR length(trim(p_goal)) = 0 THEN
    RAISE EXCEPTION 'goal is required';
  END IF;

  INSERT INTO public.agent_workflows (
    company_id,
    workflow_name,
    goal,
    status,
    context,
    created_by,
    started_at,
    updated_at
  ) VALUES (
    p_company_id,
    'autonomous-workflow',
    p_goal,
    'pending',
    COALESCE(p_payload, '{}'::jsonb),
    p_created_by,
    now(),
    now()
  )
  RETURNING id INTO v_workflow_id;

  INSERT INTO public.agent_tasks_queue (
    company_id,
    workflow_id,
    agent_type,
    task_type,
    payload,
    priority,
    status,
    created_by,
    scheduled_for,
    updated_at
  ) VALUES (
    p_company_id,
    v_workflow_id,
    'planning-agent',
    'plan_workflow',
    jsonb_build_object('goal', p_goal, 'context', COALESCE(p_payload, '{}'::jsonb)),
    1,
    'pending',
    p_created_by,
    now(),
    now()
  )
  RETURNING id INTO v_task_id;

  UPDATE public.agent_workflows
  SET root_task_id = v_task_id,
      updated_at = now()
  WHERE id = v_workflow_id;

  RETURN v_workflow_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enqueue_agent_workflow(uuid, text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_agent_workflow(uuid, text, jsonb, uuid) TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_workflows;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_task_messages;

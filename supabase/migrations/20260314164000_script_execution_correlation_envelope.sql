-- Correlation envelope for agent action execution safety.
-- Adds ticket/action correlation and anti-replay controls.

ALTER TABLE public.script_executions
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS action_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS action_nonce text NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text),
  ADD COLUMN IF NOT EXISTS action_expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
  ADD COLUMN IF NOT EXISTS result_reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS nonce_consumed_at timestamptz;

-- Ensure legacy rows are backfilled deterministically.
UPDATE public.script_executions
SET
  action_id = COALESCE(action_id, gen_random_uuid()),
  action_nonce = COALESCE(action_nonce, md5(random()::text || clock_timestamp()::text || gen_random_uuid()::text)),
  action_expires_at = COALESCE(action_expires_at, created_at + interval '30 minutes')
WHERE action_id IS NULL OR action_nonce IS NULL OR action_expires_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_script_executions_action_id
  ON public.script_executions(action_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_script_executions_action_nonce
  ON public.script_executions(action_nonce);

CREATE INDEX IF NOT EXISTS idx_script_executions_ticket_company
  ON public.script_executions(ticket_id, company_id);

CREATE INDEX IF NOT EXISTS idx_script_executions_nonce_consumed
  ON public.script_executions(nonce_consumed_at);

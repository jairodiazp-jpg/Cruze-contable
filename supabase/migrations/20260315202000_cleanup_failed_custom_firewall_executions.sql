-- Cleanup legacy failed firewall executions created with disallowed script_type 'custom'.
-- Keeps all successful runs and all non-policy failures untouched.

DELETE FROM public.script_executions
WHERE status = 'failed'
  AND script_type = 'custom'
  AND error_log ILIKE 'Blocked by server policy:%script_type ''custom'' is not allowed%';

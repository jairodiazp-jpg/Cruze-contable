create extension if not exists pgcrypto;

create table if not exists public.agent_api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('user', 'agent', 'ip')),
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scope, key_hash)
);

create index if not exists idx_agent_api_rate_limits_scope_window
  on public.agent_api_rate_limits (scope, window_started_at);

create or replace function public.consume_agent_api_rate_limit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  v_key_hash text := encode(digest(p_key, 'sha256'), 'hex');
  v_record public.agent_api_rate_limits%rowtype;
  v_remaining integer;
  v_retry_after integer;
begin
  if p_scope not in ('user', 'agent', 'ip') then
    return jsonb_build_object('allowed', false, 'error', 'invalid_scope');
  end if;

  if p_limit <= 0 or p_window_seconds <= 0 then
    return jsonb_build_object('allowed', false, 'error', 'invalid_limit_window');
  end if;

  select *
    into v_record
    from public.agent_api_rate_limits
   where scope = p_scope
     and key_hash = v_key_hash
   for update;

  if not found then
    insert into public.agent_api_rate_limits (scope, key_hash, window_started_at, request_count)
    values (p_scope, v_key_hash, v_now, 1)
    returning * into v_record;

    return jsonb_build_object(
      'allowed', true,
      'remaining', greatest(p_limit - 1, 0),
      'retry_after_seconds', 0
    );
  end if;

  if v_record.window_started_at < v_window_start then
    update public.agent_api_rate_limits
       set window_started_at = v_now,
           request_count = 1,
           updated_at = v_now
     where id = v_record.id
     returning * into v_record;

    return jsonb_build_object(
      'allowed', true,
      'remaining', greatest(p_limit - 1, 0),
      'retry_after_seconds', 0
    );
  end if;

  if v_record.request_count < p_limit then
    update public.agent_api_rate_limits
       set request_count = request_count + 1,
           updated_at = v_now
     where id = v_record.id
     returning * into v_record;

    v_remaining := greatest(p_limit - v_record.request_count, 0);

    return jsonb_build_object(
      'allowed', true,
      'remaining', v_remaining,
      'retry_after_seconds', 0
    );
  end if;

  v_retry_after := greatest(
    p_window_seconds - extract(epoch from (v_now - v_record.window_started_at))::integer,
    1
  );

  return jsonb_build_object(
    'allowed', false,
    'remaining', 0,
    'retry_after_seconds', v_retry_after
  );
end;
$$;

revoke all on function public.consume_agent_api_rate_limit(text, text, integer, integer) from public;
grant execute on function public.consume_agent_api_rate_limit(text, text, integer, integer) to service_role;

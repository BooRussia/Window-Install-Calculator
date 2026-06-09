-- Security hardening (vulnerability audit 2026-06-09)
--
-- 1) consume_ai_credit / refund_ai_credit: atomic per-user AI usage accounting.
--    The previous pattern (read counter -> call paid AI API -> write counter+1)
--    let N parallel requests all observe used = cap-1 and all pass, blowing
--    through plan caps with unbounded paid-API spend. The debit now happens
--    atomically BEFORE the AI call (single UPDATE with the cap in the WHERE,
--    so concurrent requests serialize on the row lock), and the caller refunds
--    on upstream failure.
-- 2) Pin search_path = '' on profiles_block_stripe_customer_id_update to match
--    the project's SECURITY DEFINER hardening standard.

create or replace function public.consume_ai_credit(p_user uuid, p_key text, p_cap int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  update public.profiles
     set data = jsonb_set(
           jsonb_set(
             jsonb_set(coalesce(data, '{}'::jsonb),
               '{config}', coalesce(data->'config', '{}'::jsonb), true),
             '{config,entitlements}',
             coalesce(data->'config'->'entitlements', '{}'::jsonb), true),
           array['config','entitlements', p_key],
           to_jsonb(coalesce((data#>>array['config','entitlements', p_key])::numeric, 0) + 1),
           true)
   where id = p_user
     and coalesce((data#>>array['config','entitlements', p_key])::numeric, 0) < p_cap;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.refund_ai_credit(p_user uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set data = jsonb_set(data, array['config','entitlements', p_key],
           to_jsonb(greatest(coalesce((data#>>array['config','entitlements', p_key])::numeric, 0) - 1, 0)),
           true)
   where id = p_user
     and data #> array['config','entitlements'] is not null;
end;
$$;

-- Edge functions call these with the service role; clients must not.
revoke execute on function public.consume_ai_credit(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.refund_ai_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.consume_ai_credit(uuid, text, int) to service_role;
grant execute on function public.refund_ai_credit(uuid, text) to service_role;

alter function public.profiles_block_stripe_customer_id_update() set search_path = '';

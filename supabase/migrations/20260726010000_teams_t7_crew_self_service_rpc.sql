-- Teams T7: let a crew member maintain their OWN crew's rate book and branding
-- from the installer dashboard, without widening crews_manage (which would also
-- let them rename or delete crews, and reach every other crew in the org).
--
-- Deliberately narrow:
--   * only the caller's own crew (membership in crew_members), or an org admin
--     who can already write crews directly;
--   * only the `rateBook` and `brand` keys of crews.data. NOT `name`, and NOT
--     `brandOnQuotes` — whether a sub's branding actually goes on the customer's
--     quote stays the account owner's decision (the T2b/T4 toggle);
--   * null argument means "leave this key alone"; pass '{}' to clear one.
--
-- Verified by impersonating real JWTs: an outsider gets "not a member of this
-- crew", a member's write lands, and only the rateBook key changes (name and
-- brandOnQuotes untouched).
--
-- Applied to production 2026-07-26.
create or replace function public.set_crew_self_service(
  p_crew_id   uuid,
  p_rate_book jsonb default null,
  p_brand     jsonb default null
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org  uuid;
  v_data jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select c.org_id, coalesce(c.data, '{}'::jsonb) into v_org, v_data
  from public.crews c
  where c.id = p_crew_id
  for update;

  if v_org is null then
    raise exception 'crew not found';
  end if;

  if not exists (
        select 1 from public.crew_members cm
        where cm.crew_id = p_crew_id and cm.user_id = auth.uid()
      )
     and not public.is_org_admin(v_org) then
    raise exception 'not a member of this crew';
  end if;

  if p_rate_book is not null then
    v_data := jsonb_set(v_data, '{rateBook}', p_rate_book, true);
  end if;
  if p_brand is not null then
    v_data := jsonb_set(v_data, '{brand}', p_brand, true);
  end if;

  -- Mirror the table's own size guard so the error is legible instead of a
  -- constraint violation from inside the function.
  if pg_column_size(v_data) > 262144 then
    raise exception 'crew data too large';
  end if;

  update public.crews set data = v_data where id = p_crew_id;
end;
$function$;

revoke all on function public.set_crew_self_service(uuid, jsonb, jsonb) from public;
grant execute on function public.set_crew_self_service(uuid, jsonb, jsonb) to authenticated;

comment on function public.set_crew_self_service(uuid, jsonb, jsonb) is
  'Teams T7: a crew member (or org admin) may patch only rateBook/brand on their own crew. Cannot rename a crew or set brandOnQuotes.';

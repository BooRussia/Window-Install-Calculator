-- Teams T7b: the shopping list an installer can actually see.
--
-- Why a purpose-built table instead of letting installers read `jobs`: that blob
-- carries sellingPrice / cost / margin / profit and customer contact details, and
-- RLS is row-level, so any read policy on `jobs` leaks the owner's margins. Here
-- the owner PUBLISHES a payload constructed to contain only what a crew needs to
-- buy materials — item name, quantity, unit, how many packs to buy — and no money
-- at all. Nothing is redacted after the fact; money never enters.
--
-- Verified by impersonating real JWTs: a crew member can read their crew's list
-- and tick items through the RPC, but an UPDATE or DELETE from them affects 0 rows
-- (RLS filters it — not an error, simply no effect), and a non-member sees 0 rows
-- and is rejected by the RPC with "not a member of this crew".
--
-- Applied to production 2026-07-26.

create table if not exists public.crew_shopping_lists (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  crew_id      uuid not null references public.crews(id)         on delete cascade,
  job_id       uuid,                        -- soft link: the job may be deleted later
  job_label    text not null default '',    -- what the crew should call it
  site_note    text not null default '',    -- address / access notes
  items        jsonb not null default '[]'::jsonb,
  checked      jsonb not null default '{}'::jsonb,
  published_by uuid,
  published_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint crew_shopping_lists_items_size check (pg_column_size(items) <= 262144),
  constraint crew_shopping_lists_job_crew_uniq unique (job_id, crew_id)
);

create index if not exists crew_shopping_lists_crew_idx on public.crew_shopping_lists (crew_id);
create index if not exists crew_shopping_lists_org_idx  on public.crew_shopping_lists (org_id);

alter table public.crew_shopping_lists enable row level security;

drop policy if exists crew_shopping_lists_manage on public.crew_shopping_lists;
create policy crew_shopping_lists_manage on public.crew_shopping_lists
  for all to authenticated
  using (user_org_role(org_id) = any (array['owner','admin','dispatcher']))
  with check (user_org_role(org_id) = any (array['owner','admin','dispatcher']));

-- Read only for crew members; check-off goes through the RPC so they cannot
-- rewrite items or reassign a list to another crew.
drop policy if exists crew_shopping_lists_crew_read on public.crew_shopping_lists;
create policy crew_shopping_lists_crew_read on public.crew_shopping_lists
  for select to authenticated
  using (exists (
    select 1 from public.crew_members cm
    where cm.crew_id = crew_shopping_lists.crew_id and cm.user_id = auth.uid()
  ));

create or replace function public.set_crew_shopping_check(
  p_list_id uuid,
  p_item_id text,
  p_checked boolean
) returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_crew uuid;
  v_org  uuid;
  v_chk  jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_item_id is null or length(trim(p_item_id)) = 0 or length(p_item_id) > 64 then
    raise exception 'bad item id';
  end if;

  select l.crew_id, l.org_id, coalesce(l.checked, '{}'::jsonb)
    into v_crew, v_org, v_chk
  from public.crew_shopping_lists l
  where l.id = p_list_id
  for update;

  if v_crew is null then
    raise exception 'list not found';
  end if;

  if not exists (
        select 1 from public.crew_members cm
        where cm.crew_id = v_crew and cm.user_id = auth.uid()
      )
     and not (public.user_org_role(v_org) = any (array['owner','admin','dispatcher'])) then
    raise exception 'not a member of this crew';
  end if;

  if p_checked then
    v_chk := jsonb_set(v_chk, array[p_item_id], 'true'::jsonb, true);
  else
    v_chk := v_chk - p_item_id;
  end if;

  update public.crew_shopping_lists
     set checked = v_chk, updated_at = now()
   where id = p_list_id;
end;
$function$;

revoke all on function public.set_crew_shopping_check(uuid, text, boolean) from public;
grant execute on function public.set_crew_shopping_check(uuid, text, boolean) to authenticated;

comment on table public.crew_shopping_lists is
  'Teams T7b: a shopping list the owner publishes to a crew. Contains quantities and pack counts only - never prices, cost, margin or selling price. This exists so installers never need read access to public.jobs.';

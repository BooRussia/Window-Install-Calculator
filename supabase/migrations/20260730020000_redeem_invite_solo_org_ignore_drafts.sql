-- Vestigial-solo-org cleanup on invite redemption. Applied to fzitkcvmbvyeilwzclme
-- on 2026-07-30. Supersedes 20260730010000, which blocked on ANY row in jobs --
-- wrong, because the app writes an auto working DRAFT as soon as the calculator
-- paints, so a brand-new invitee's throwaway org always had one and the cleanup
-- could never fire. Only a SAVED job means the org holds real work worth keeping.
--
-- THE BUG THIS FIXES
-- Every signup gets a solo org from the on_auth_user_created_org trigger (shared
-- with the anchor-field app, so left alone). fetchOrgContext() picks the OLDEST
-- membership; the solo org's row is written at signup, the invited org's at first
-- sign-in seconds later. The solo org therefore always won, the invitee read as
-- role "owner", isCrewAccount() bailed on the CREW_PRIVILEGED_ROLES check, and
-- they got no crew cage, the plan-choice gate, a free trial, and an app scoped to
-- the wrong org -- hence no shopping list from the team that invited them.
--
-- Note the app's own logic was already correct: needsPlanChoice() checks
-- isCrewAccount(). The data was wrong, not the code.
--
-- Drafts pointing at the removed org have their stamp cleared rather than being
-- deleted -- the draft belongs to the user, not the org. A real shop owner who
-- later accepts an invite has a solo org holding SAVED jobs, so it is kept and
-- they correctly continue to read as an owner.

create or replace function public.redeem_org_invite(p_code text)
returns table(org_id uuid, org_name text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_invite public.org_invites%rowtype;
  v_org_name text;
  v_solo uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select i.* into v_invite
  from public.org_invites i
  where upper(i.code) = upper(trim(p_code))
    and i.expires_at > now()
    and i.uses < i.max_uses
  for update;

  if not found then
    raise exception 'invalid or expired code';
  end if;

  if exists (
    select 1 from public.org_members m
    where m.org_id = v_invite.org_id and m.user_id = auth.uid()
  ) then
    raise exception 'already a member';
  end if;

  insert into public.org_members (org_id, user_id, role, has_tracker_seat)
  values (v_invite.org_id, auth.uid(), v_invite.role, false);

  if v_invite.crew_id is not null
     and exists (select 1 from public.crews c
                  where c.id = v_invite.crew_id and c.org_id = v_invite.org_id) then
    insert into public.crew_members (org_id, crew_id, user_id)
    values (v_invite.org_id, v_invite.crew_id, auth.uid())
    on conflict do nothing;
  end if;

  update public.org_invites i set uses = i.uses + 1 where i.id = v_invite.id;

  -- Provably empty: they own it, it is not the org just joined, they are its
  -- only member, and it holds no crews, job sites, invites or SAVED jobs.
  for v_solo in
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
      and o.id <> v_invite.org_id
      and (select count(*) from public.org_members m2 where m2.org_id = o.id) = 1
      and exists (select 1 from public.org_members m3
                   where m3.org_id = o.id and m3.user_id = auth.uid())
      and not exists (select 1 from public.crews c2      where c2.org_id = o.id)
      and not exists (select 1 from public.job_sites j2  where j2.org_id = o.id)
      and not exists (select 1 from public.org_invites i2 where i2.org_id = o.id)
      and not exists (select 1 from public.jobs jb
                       where jb.org_id = o.id
                         and coalesce(jb.data->>'isDraft', 'false') <> 'true')
  loop
    update public.jobs set org_id = null, crew_id = null where org_id = v_solo;
    delete from public.org_members where org_id = v_solo;
    delete from public.organizations where id = v_solo;
  end loop;

  select o.name into v_org_name
  from public.organizations o
  where o.id = v_invite.org_id;

  return query select v_invite.org_id, v_org_name;
end;
$function$;

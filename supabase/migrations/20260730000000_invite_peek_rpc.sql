-- Read-only companion to redeem_org_invite, so an invite link can name the team
-- BEFORE the visitor has an account.
--
-- Why it has to exist: org_invites SELECT is admin-only (is_org_admin(org_id))
-- and organizations SELECT is members-only, so an anonymous visitor arriving on
-- a ?join= link can resolve neither. That is why the link could only drop them
-- on the marketing home page with no sign they had been invited and no idea
-- which company invited them.
--
-- Deliberately minimal: the team name, the role they would join as, and whether
-- the code is still good. No org id, no invite id, no member or crew data. It
-- grants nothing — redeem_org_invite still does all the work and still requires
-- a session.
--
-- Enumeration: codes are 8 chars from an alphabet excluding I/O/0/1, so the
-- space is ~1e12. Returning a company name for a correctly-guessed live code is
-- the same exposure every invite-link system accepts.
--
-- Applied to fzitkcvmbvyeilwzclme on 2026-07-30.

create or replace function public.peek_org_invite(p_code text)
returns table(org_name text, invite_role text, valid boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_invite public.org_invites%rowtype;
  v_org_name text;
begin
  select i.* into v_invite
  from public.org_invites i
  where upper(i.code) = upper(trim(coalesce(p_code, '')))
    and i.expires_at > now()
    and i.uses < i.max_uses;

  if not found then
    return query select null::text, null::text, false;
    return;
  end if;

  select o.name into v_org_name
  from public.organizations o
  where o.id = v_invite.org_id;

  -- A valid invite whose org row has vanished is not joinable.
  if v_org_name is null then
    return query select null::text, null::text, false;
    return;
  end if;

  return query select v_org_name, v_invite.role::text, true;
end;
$function$;

revoke all on function public.peek_org_invite(text) from public;
grant execute on function public.peek_org_invite(text) to anon, authenticated;

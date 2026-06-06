-- E-sign Phase C: enable Realtime on shared_quotes so the installer gets a
-- live in-app alert the moment a customer signs. Realtime respects RLS, so
-- each owner only receives change events for their own rows (the owner-only
-- SELECT policy from Phase A). The catch-up-on-load path covers the case
-- where the app wasn't open when the signature landed.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_quotes'
  ) then
    alter publication supabase_realtime add table public.shared_quotes;
  end if;
end $$;

-- FULL replica identity so Realtime change payloads include every column and
-- server-side filters on non-PK columns (we filter on user_id) work reliably.
alter table public.shared_quotes replica identity full;

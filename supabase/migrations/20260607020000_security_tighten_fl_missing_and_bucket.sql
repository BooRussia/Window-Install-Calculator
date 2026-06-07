-- Security hardening: tighten two externally-facing surfaces.

-- 1) fl-approvals is a PUBLIC bucket; its broad SELECT policy let anyone LIST
--    every file. The app only reads objects via the public CDN endpoint
--    (/storage/v1/object/public/fl-approvals/...), which does not need an RLS
--    policy, so dropping the listing policy has no functional impact.
drop policy if exists "Public read on fl-approvals" on storage.objects;

-- 2) fl_missing powers the public "report a missing FL approval" feature, so it
--    must accept anonymous inserts — but the old policy used WITH CHECK (true),
--    allowing arbitrary oversized rows. Bound the payload instead.
drop policy if exists "fl_missing anyone insert" on public.fl_missing;
create policy "fl_missing anyone insert" on public.fl_missing
  for insert to anon, authenticated
  with check (
    char_length(coalesce(fl, '')) between 1 and 120
    and char_length(coalesce(source, '')) <= 40
    and char_length(coalesce(user_email, '')) <= 200
  );

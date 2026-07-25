-- Teams T2b — the in-house vs subcontracted toggle, plus a per-crew data bag.
-- Both ADDITIVE and nullable/defaulted so the companion Anchor Field mobile app
-- is unaffected: it selects named columns from organizations, and select('*')
-- from crews (an extra column is simply ignored by its TS type).
--
-- team_mode: how this company uses teams.
--   'inhouse'     — one company that sells AND installs. Crews are internal;
--                   customer PDFs always carry the MAIN company brand.
--   'subcontract' — sells, subs the installs out. Each crew is a separate
--                   subcontractor with its own brand; the crew assigned to a job
--                   supplies the branding on that job's PDFs.
--   null          — not chosen yet (the calculator shows the mode picker).
alter table public.organizations
  add column if not exists team_mode text;

alter table public.organizations
  drop constraint if exists organizations_team_mode_chk;
alter table public.organizations
  add constraint organizations_team_mode_chk
  check (team_mode is null or team_mode in ('inhouse','subcontract'));

-- crews.data: calculator-side extras for a crew — { brand: {companyName, logo,
-- phone, email, license}, brandOnQuotes: bool, color, pay: {...} }. Kept as one
-- jsonb so the mobile app's crews table shape is otherwise untouched.
alter table public.crews
  add column if not exists data jsonb not null default '{}'::jsonb;

-- Guardrail: a logo data-URL lives in here, so cap the bag rather than letting a
-- client push an unbounded blob into a row the mobile app also reads.
alter table public.crews
  drop constraint if exists crews_data_bytes;
alter table public.crews
  add constraint crews_data_bytes check (pg_column_size(data) <= 262144);

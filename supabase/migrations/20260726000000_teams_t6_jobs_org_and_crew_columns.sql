-- Teams T6: promote the job's org + assigned crew out of the `data` jsonb into
-- real columns, so the server can filter by them (needed for the installer
-- dashboard and for any org-wide revenue rollup — neither can query inside a
-- jsonb efficiently).
--
-- Deliberately ADDITIVE ONLY. No RLS policy changes: `jobs.data` is a single blob
-- that contains sellingPrice / cost / margin / profit and customer contact
-- details, and RLS is row-level — so a policy letting a crew member read their
-- crew's jobs would also hand them the owner's margins. The installer dashboard
-- will read a narrow projection (view or edge function) instead. The existing
-- "own jobs" policies (auth.uid() = user_id) remain the only read path.
--
-- Applied to production 2026-07-26.

alter table public.jobs
  add column if not exists org_id  uuid references public.organizations(id) on delete set null,
  add column if not exists crew_id uuid references public.crews(id)         on delete set null;

-- Partial indexes: most rows are solo-account jobs where both are NULL.
create index if not exists jobs_org_id_idx  on public.jobs (org_id)  where org_id  is not null;
create index if not exists jobs_crew_id_idx on public.jobs (crew_id) where crew_id is not null;

-- Backfill the assignment the client has been writing into the jsonb since T3a.
-- Only rows whose embedded id resolves to a live crew are touched.
update public.jobs j
set crew_id = c.id,
    org_id  = c.org_id
from public.crews c
where c.id::text = j.data->>'assignedCrewId'
  and j.crew_id is null;

-- Unassigned jobs still get their owner's primary org (oldest membership — the
-- same "primary org" rule the client and the anchor-field app already use).
update public.jobs j
set org_id = sub.org_id
from (
  select om.user_id, om.org_id,
         row_number() over (partition by om.user_id order by om.created_at) as rn
  from public.org_members om
) sub
where sub.user_id = j.user_id
  and sub.rn = 1
  and j.org_id is null;

comment on column public.jobs.org_id  is 'Owning organization (Teams T6). Mirrors the account''s primary org at save time.';
comment on column public.jobs.crew_id is 'Crew/subcontractor this job is assigned to (Teams T6). Mirrors data->>assignedCrewId; set null if that crew is deleted.';

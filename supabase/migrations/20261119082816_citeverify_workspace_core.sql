-- CiteVerify workspace tables. Names are prefixed to coexist with other apps
-- already using this Supabase project.
create table if not exists public.cv_audits (
  owner_id uuid not null references auth.users(id) on delete cascade,
  audit_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, audit_id)
);

create table if not exists public.cv_claims (
  owner_id uuid not null,
  audit_id text not null,
  claim_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, audit_id, claim_id),
  foreign key (owner_id, audit_id) references public.cv_audits(owner_id, audit_id) on delete cascade
);

create table if not exists public.cv_references (
  owner_id uuid not null,
  audit_id text not null,
  reference_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, audit_id, reference_id),
  foreign key (owner_id, audit_id) references public.cv_audits(owner_id, audit_id) on delete cascade
);

create table if not exists public.cv_consistency_findings (
  owner_id uuid not null,
  audit_id text not null,
  finding_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, audit_id, finding_id),
  foreign key (owner_id, audit_id) references public.cv_audits(owner_id, audit_id) on delete cascade
);

create table if not exists public.cv_claim_feedback (
  owner_id uuid not null,
  audit_id text not null,
  claim_id text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, audit_id, claim_id),
  foreign key (owner_id, audit_id) references public.cv_audits(owner_id, audit_id) on delete cascade
);

-- Account-scoped settings and saved research features that do not need a
-- public, shared record table (seeds, collections, networks, alerts, projects).
create table if not exists public.cv_user_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('setting','seed','collection','collection_paper','network','alert','project')),
  record_id text not null,
  parent_id text,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, entity_type, record_id)
);

create index if not exists cv_claims_audit_idx on public.cv_claims(owner_id, audit_id);
create index if not exists cv_references_audit_idx on public.cv_references(owner_id, audit_id);
create index if not exists cv_findings_audit_idx on public.cv_consistency_findings(owner_id, audit_id);
create index if not exists cv_user_records_parent_idx on public.cv_user_records(owner_id, entity_type, parent_id);

alter table public.cv_audits enable row level security;
alter table public.cv_claims enable row level security;
alter table public.cv_references enable row level security;
alter table public.cv_consistency_findings enable row level security;
alter table public.cv_claim_feedback enable row level security;
alter table public.cv_user_records enable row level security;

grant select, insert, update, delete on public.cv_audits to authenticated;
grant select, insert, update, delete on public.cv_claims to authenticated;
grant select, insert, update, delete on public.cv_references to authenticated;
grant select, insert, update, delete on public.cv_consistency_findings to authenticated;
grant select, insert, update, delete on public.cv_claim_feedback to authenticated;
grant select, insert, update, delete on public.cv_user_records to authenticated;

create policy "CiteVerify owners manage their audits" on public.cv_audits
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "CiteVerify owners manage their claims" on public.cv_claims
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "CiteVerify owners manage their references" on public.cv_references
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "CiteVerify owners manage their consistency findings" on public.cv_consistency_findings
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "CiteVerify owners manage their feedback" on public.cv_claim_feedback
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
create policy "CiteVerify owners manage their saved research data" on public.cv_user_records
  for all to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

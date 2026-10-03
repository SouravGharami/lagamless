-- ============================================================================
-- LAGAMLESS — Part 33: VTON job queue for the Kaggle FASHN GPU worker (idempotent)
--
-- The website (admin only) creates a job + uploads the person/garment images to a PRIVATE storage bucket.
-- The Kaggle notebook never talks to the database: it calls the `vton-worker` Edge Function with a shared worker token,
-- which claims jobs, hands out signed image URLs and stores the result. No service-role key leaves Supabase.
-- Does NOT touch product_mockups, generated_model_mockups or any other existing table.
-- Requires public.is_admin() (part-08b2a-admin-security.sql).
-- ============================================================================

do $check$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_admin') then
    raise exception 'public.is_admin() is missing. Run supabase/part-08b2a-admin-security.sql first.';
  end if;
end
$check$;

create table if not exists public.vton_jobs (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid,
  view         text not null default 'front',
  category     text not null default 'tops',
  status       text not null default 'queued',
  person_path  text not null,
  garment_path text not null,
  result_path  text,
  error        text,
  worker_id    text,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  finished_at  timestamptz,
  updated_at   timestamptz not null default now()
);

do $cons$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.vton_jobs'::regclass and conname = 'vton_jobs_status_check') then
    alter table public.vton_jobs add constraint vton_jobs_status_check
      check (status in ('queued','processing','completed','failed','cancelled'));
  end if;
end
$cons$;

create index if not exists idx_vton_jobs_queue on public.vton_jobs (status, created_at);

create or replace function public.vton_jobs_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists trg_vton_jobs_updated_at on public.vton_jobs;
create trigger trg_vton_jobs_updated_at
  before update on public.vton_jobs
  for each row execute function public.vton_jobs_touch_updated_at();

alter table public.vton_jobs enable row level security;
drop policy if exists "Admins can manage vton jobs" on public.vton_jobs;
create policy "Admins can manage vton jobs"
  on public.vton_jobs for all
  using (public.is_admin())
  with check (public.is_admin());
grant select, insert, update, delete on public.vton_jobs to authenticated;

-- Worker liveness (written only by the Edge Function with the service role; admins can read it).
create table if not exists public.vton_worker_status (
  id        text primary key,
  last_seen timestamptz not null default now(),
  info      text
);
alter table public.vton_worker_status enable row level security;
drop policy if exists "Admins can read vton worker status" on public.vton_worker_status;
create policy "Admins can read vton worker status"
  on public.vton_worker_status for select
  using (public.is_admin());
grant select on public.vton_worker_status to authenticated;

-- Atomically claims the oldest queued job (jobs stuck in 'processing' for 20+ minutes go back to the queue first).
create or replace function public.claim_next_vton_job(p_worker text)
returns setof public.vton_jobs
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  update public.vton_jobs set status = 'queued', worker_id = null
   where status = 'processing' and claimed_at < now() - interval '20 minutes';

  select id into v_id from public.vton_jobs
   where status = 'queued'
   order by created_at
   for update skip locked
   limit 1;

  if v_id is null then
    return;
  end if;

  return query
    update public.vton_jobs
       set status = 'processing', worker_id = p_worker, claimed_at = now(), error = null
     where id = v_id
    returning *;
end;
$fn$;

revoke all on function public.claim_next_vton_job(text) from public, anon, authenticated;
grant execute on function public.claim_next_vton_job(text) to service_role;

-- PRIVATE bucket for job inputs/outputs (person photos and unpublished designs must not be public).
insert into storage.buckets (id, name, public) values ('vton-jobs', 'vton-jobs', false)
on conflict (id) do nothing;

drop policy if exists "Admins manage vton job files" on storage.objects;
create policy "Admins manage vton job files"
  on storage.objects for all
  using (bucket_id = 'vton-jobs' and public.is_admin())
  with check (bucket_id = 'vton-jobs' and public.is_admin());

notify pgrst, 'reload schema';

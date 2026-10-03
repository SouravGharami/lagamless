-- ============================================================================
-- LAGAMLESS — Part 32 REPAIR: generated human-model mockups (idempotent)
--
-- Run this ONCE in the Supabase SQL Editor if the browser shows
--   PGRST205 "Could not find the table 'public.generated_model_mockups' in the schema cache".
-- Same schema as part-32-generated-model-mockups.sql (the frontend contract in src/services/generatedMockups.js);
-- this version also repairs a half-applied table, guarantees its helper functions exist, and reloads the PostgREST schema cache.
-- It does NOT touch product_mockups, product_images or any other table, and never weakens existing RLS.
-- ============================================================================

-- Helpers (created only if an earlier part was skipped; existing definitions are left untouched).
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_updated_at') then
    execute $f$create function public.set_updated_at() returns trigger language plpgsql as $b$
      begin new.updated_at = now(); return new; end; $b$$f$;
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_admin') then
    raise exception 'public.is_admin() is missing. Run supabase/part-08b2a-admin-security.sql first.';
  end if;
end $$;

create table if not exists public.generated_model_mockups (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products (id) on delete cascade,
  source_garment_id   text,
  human_model_id      text,
  provider            text not null,
  provider_job_id     text,
  view                text not null,
  image_path          text not null,
  image_url           text not null,
  width               integer,
  height              integer,
  status              text not null default 'pending',
  approved            boolean not null default false,
  priority            integer,
  is_main             boolean not null default false,
  promoted_image_id   uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Repair a table that exists but is missing columns.
alter table public.generated_model_mockups add column if not exists source_garment_id text;
alter table public.generated_model_mockups add column if not exists human_model_id text;
alter table public.generated_model_mockups add column if not exists provider_job_id text;
alter table public.generated_model_mockups add column if not exists width integer;
alter table public.generated_model_mockups add column if not exists height integer;
alter table public.generated_model_mockups add column if not exists status text not null default 'pending';
alter table public.generated_model_mockups add column if not exists approved boolean not null default false;
alter table public.generated_model_mockups add column if not exists priority integer;
alter table public.generated_model_mockups add column if not exists is_main boolean not null default false;
alter table public.generated_model_mockups add column if not exists promoted_image_id uuid;
alter table public.generated_model_mockups add column if not exists created_at timestamptz not null default now();
alter table public.generated_model_mockups add column if not exists updated_at timestamptz not null default now();

-- Constraints (added only when missing).
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.generated_model_mockups'::regclass and conname = 'generated_model_mockups_view_check') then
    alter table public.generated_model_mockups add constraint generated_model_mockups_view_check
      check (view in ('front','three_quarter_front','side','back','three_quarter_back','detail'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.generated_model_mockups'::regclass and conname = 'generated_model_mockups_status_check') then
    alter table public.generated_model_mockups add constraint generated_model_mockups_status_check
      check (status in ('pending','approved','rejected'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.generated_model_mockups'::regclass and conname = 'generated_model_mockups_priority_check') then
    alter table public.generated_model_mockups add constraint generated_model_mockups_priority_check
      check (priority is null or priority >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.generated_model_mockups'::regclass and conname = 'generated_model_mockups_approved_matches_status') then
    alter table public.generated_model_mockups add constraint generated_model_mockups_approved_matches_status
      check (approved = (status = 'approved'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.generated_model_mockups'::regclass and conname = 'generated_model_mockups_main_needs_approval') then
    alter table public.generated_model_mockups add constraint generated_model_mockups_main_needs_approval
      check (not is_main or approved);
  end if;
end $$;

create index if not exists idx_generated_model_mockups_product on public.generated_model_mockups (product_id, priority);
create unique index if not exists uq_generated_model_mockups_one_main on public.generated_model_mockups (product_id) where is_main;

drop trigger if exists trg_generated_model_mockups_updated_at on public.generated_model_mockups;
create trigger trg_generated_model_mockups_updated_at
  before update on public.generated_model_mockups
  for each row execute function public.set_updated_at();

alter table public.generated_model_mockups enable row level security;

drop policy if exists "Admins can manage generated model mockups" on public.generated_model_mockups;
create policy "Admins can manage generated model mockups"
  on public.generated_model_mockups for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on public.generated_model_mockups to authenticated;

create or replace function public.set_main_generated_mockup(p_mockup_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_product uuid;
  v_approved boolean;
begin
  select product_id, approved into v_product, v_approved from public.generated_model_mockups where id = p_mockup_id;
  if v_product is null then
    raise exception 'Generated mockup not found';
  end if;
  if not v_approved then
    raise exception 'Only an approved mockup can be the main image';
  end if;
  update public.generated_model_mockups set is_main = false where product_id = v_product and is_main and id <> p_mockup_id;
  update public.generated_model_mockups set is_main = true where id = p_mockup_id;
end;
$$;

create or replace function public.reorder_generated_mockups(p_product_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
as $$
begin
  update public.generated_model_mockups m
     set priority = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where m.id = o.id and m.product_id = p_product_id and m.approved;
end;
$$;

grant execute on function public.set_main_generated_mockup(uuid) to authenticated;
grant execute on function public.reorder_generated_mockups(uuid, uuid[]) to authenticated;

-- Make PostgREST see the new table/functions immediately (fixes the PGRST205 "schema cache" 404).
notify pgrst, 'reload schema';

-- ============================================================================
-- LAGAMLESS — Part 30 migration: real-photo mockup template library (Step 5-2)
--
-- WHY A TABLE: the template library has to survive a page reload and be shared
-- between admins. Nothing equivalent exists yet (`products.mockup_config`
-- stores one product's layout, `product_images` stores a product's published
-- photos) — a reusable, product-independent photo template is a different
-- thing, so it gets its own small table.
--
-- STORAGE: no new bucket. Photos are uploaded into the existing `product-images`
-- bucket under the `mockup-templates/` prefix, so the existing storage policies
-- (public read, admin-only write) apply unchanged. Files are named by content
-- hash, so the same photo is never stored twice.
--
-- SECURITY: RLS on, admin-only (same `is_admin()` used everywhere else). No
-- anonymous or customer access. No existing policy or table is touched.
--
-- SOFT DELETE: "Delete" in the UI sets `deleted_at`; the row and the file are
-- kept. "Deactivate" sets `active = false` and keeps the template listed.
--
-- Safe to re-run. Run in the Supabase SQL Editor.
-- ============================================================================

create table if not exists mockup_templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  description       text not null default '',
  source_type       text not null default 'stored_template'
                      check (source_type in ('stored_template', 'uploaded_photo')),
  asset_kind        text not null default 'REAL_PHOTO'
                      check (asset_kind in ('REAL_PHOTO', 'GENERATED_OUTPUT')),
  source_image      text not null,          -- public URL of the photograph
  source_path       text,                   -- path inside the product-images bucket
  preview_image     text,
  angle             text not null
                      check (angle in ('FRONT','THREE_QUARTER_FRONT','SIDE','BACK','THREE_QUARTER_BACK','DETAIL')),
  garment_type      text not null default 'OVERSIZED_TSHIRT',
  supported_colors  text[] not null default '{any}',
  supported_regions text[] not null default '{}',
  placement         jsonb not null default '{}'::jsonb,   -- default per-region rectangles (optional)
  image_info        jsonb not null default '{}'::jsonb,   -- width, height, fileType, bytes, contentHash
  mask_data         jsonb not null default '{}'::jsonb,   -- RESERVED for Step 5-3+ (masks, perspective, lighting); stays empty
  active            boolean not null default true,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_mockup_templates_angle on mockup_templates (angle) where deleted_at is null;

drop trigger if exists trg_mockup_templates_updated_at on mockup_templates;
create trigger trg_mockup_templates_updated_at
  before update on mockup_templates
  for each row execute function set_updated_at();

alter table mockup_templates enable row level security;

drop policy if exists "Admins can manage mockup templates" on mockup_templates;
create policy "Admins can manage mockup templates"
  on mockup_templates for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on mockup_templates to authenticated;

-- ============================================================================
-- End of Part 30 migration.
-- ============================================================================

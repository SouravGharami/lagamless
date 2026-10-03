-- ============================================================================
-- LAGAMLESS — Part 31 migration: admin Mockup Gallery (Step 5-5)
--
-- WHY A NEW TABLE (and not `product_images`): every `product_images` row of a
-- published product is publicly readable and is what the storefront renders.
-- Saving a generated mockup must NOT publish it, so gallery records live in a
-- separate, ADMIN-ONLY table. A future step can copy/promote a mockup into
-- `product_images` deliberately. `products` is not duplicated: `product_id`
-- references it and cascades on delete.
--
-- STORAGE: no new bucket. Files go into the existing `product-images` bucket
-- under `mockups/<product_id>/...`, so the existing storage policies (public
-- read, admin-only write) apply unchanged.
--
-- REGENERATION: `render_config` holds the studio's per-view render job (photo,
-- masks, artwork placements/transform/fabric/warp) with Storage PATHS instead
-- of session-only blob: URLs. `source_paths` lists those paths so "is this
-- source file still used by another mockup?" is a cheap indexed query.
--
-- Safe to re-run. Run in the Supabase SQL Editor.
-- ============================================================================

create table if not exists product_mockups (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products (id) on delete cascade,
  view_type      text not null
                   check (view_type in ('FRONT','THREE_QUARTER_FRONT','SIDE','BACK','THREE_QUARTER_BACK','DETAIL')),
  image_path     text not null,               -- path inside the product-images bucket (the FINAL render)
  image_url      text not null,               -- public URL of that file
  width          integer,
  height         integer,
  is_main        boolean not null default false,
  sort_order     integer not null default 0,
  origin         text not null default 'studio' check (origin in ('studio', 'uploaded')),
  render_config  jsonb,                       -- null = cannot be regenerated
  source_paths   text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (product_id, view_type)              -- one mockup per view; use Replace for a second image
);

create index if not exists idx_product_mockups_product on product_mockups (product_id, sort_order);
create index if not exists idx_product_mockups_sources on product_mockups using gin (source_paths);
-- At most one MAIN mockup per product, enforced by the database.
create unique index if not exists uq_product_mockups_one_main on product_mockups (product_id) where is_main;

drop trigger if exists trg_product_mockups_updated_at on product_mockups;
create trigger trg_product_mockups_updated_at
  before update on product_mockups
  for each row execute function set_updated_at();

alter table product_mockups enable row level security;

drop policy if exists "Admins can manage product mockups" on product_mockups;
create policy "Admins can manage product mockups"
  on product_mockups for all
  using (public.is_admin())
  with check (public.is_admin());

grant select, insert, update, delete on product_mockups to authenticated;

-- Atomic "Set as Main": clears the previous main and sets the new one in one
-- transaction. SECURITY INVOKER, so the table's RLS (admin only) still applies.
create or replace function public.set_main_product_mockup(p_mockup_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_product uuid;
begin
  select product_id into v_product from product_mockups where id = p_mockup_id;
  if v_product is null then
    raise exception 'Mockup not found';
  end if;
  update product_mockups set is_main = false where product_id = v_product and is_main and id <> p_mockup_id;
  update product_mockups set is_main = true where id = p_mockup_id;
end;
$$;

-- Atomic reorder: sort_order becomes each id's index in the given array.
-- Only rows belonging to p_product_id are touched.
create or replace function public.reorder_product_mockups(p_product_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
as $$
begin
  update product_mockups m
     set sort_order = o.ord - 1
    from unnest(p_ids) with ordinality as o(id, ord)
   where m.id = o.id and m.product_id = p_product_id;
end;
$$;

grant execute on function public.set_main_product_mockup(uuid) to authenticated;
grant execute on function public.reorder_product_mockups(uuid, uuid[]) to authenticated;

-- ============================================================================
-- End of Part 31 migration.
-- ============================================================================

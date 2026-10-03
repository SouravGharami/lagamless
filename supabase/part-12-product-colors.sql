-- ============================================================================
-- LAGAMLESS — Part 12 migration: product colors (multi-color swatches on a
-- single set of photos)
--
-- Problem this solves: today a "color" only exists implicitly, parsed out of
-- a product's name after an em dash (see src/lib/productColor.js) — so
-- offering the same garment in 3 colors meant creating 3 separate product
-- rows, each with its own full photo shoot. This migration lets ONE product
-- declare an explicit list of colors it comes in, with just the one photo
-- set already uploaded for it. The storefront then recolors that single set
-- of photos on the fly (CSS grayscale + color-blend, see ProductGallery.jsx)
-- when a shopper picks a swatch other than the first ("true to photo") one.
--
-- New table only — nothing existing is touched:
--
--   product_colors
--     id          uuid, pk
--     product_id  uuid, fk -> products(id), cascade delete
--     name        text, e.g. "Stone", "Charcoal", "Olive"
--     hex_code    text, e.g. "#b7ab95" — what the storefront recolors toward
--     sort_order  integer — display order; index 0 is treated by the
--                 storefront as "matches the uploaded photo as-is", so put
--                 the actual photographed color first
--
-- A product with zero rows here is unaffected: the storefront already falls
-- back to the single legacy name-parsed color (getProductColor()) when
-- `product.colors` is empty — see src/lib/productColor.js's
-- getProductColors().
--
-- Safe to re-run: `create table if not exists`, `create index if not
-- exists`, and every policy is dropped and recreated. Nothing existing is
-- dropped or altered. Run this in the Supabase SQL Editor, after schema.sql
-- + part-08b2a-admin-security.sql have already been run, and BEFORE
-- deploying the matching app code (the admin form and storefront both
-- start requesting `product_colors` as soon as this is live).
-- ============================================================================

create table if not exists product_colors (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  name text not null,
  hex_code text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, name)
);

create index if not exists idx_product_colors_product_id on product_colors (product_id);

-- ----------------------------------------------------------------------------
-- RLS — same shape as product_images / product_variants in schema.sql +
-- part-08b2a-admin-security.sql: public can read colors of published
-- products, admins can manage colors on any product (including drafts).
-- ----------------------------------------------------------------------------

alter table product_colors enable row level security;

drop policy if exists "Public can read colors of published products" on product_colors;
create policy "Public can read colors of published products"
  on product_colors for select
  using (
    exists (
      select 1 from products
      where products.id = product_colors.product_id
        and products.status = 'published'
    )
  );

drop policy if exists "Admins can manage product colors" on product_colors;
create policy "Admins can manage product colors"
  on product_colors for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- End of Part 12 migration.
-- ============================================================================

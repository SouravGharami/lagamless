-- ============================================================================
-- LAGAMLESS — Part 11 migration: product collections ("store placement" tags)
--
-- Adds ONE column to `products`:
--
--   collections text[]  — slugs of the homepage / Shop page categories a
--                         product is ticked into, e.g. {gen-z,graphic-tees}.
--
-- The admin product form (Admin -> Add / Edit product -> "Where this product
-- appears") writes this column. The Shop page and the homepage category strip
-- read it to decide which products appear under which category.
--
-- The list of valid slugs lives in the app (src/data/collections.js), not in
-- the database, so adding a new category later never needs another migration.
--
-- "Featured Tees" (homepage) and "New Arrivals" reuse the existing
-- `is_featured` and `is_new_arrival` columns — nothing to add for those.
--
-- No index is added on purpose: the Shop page already loads the full
-- published catalog once and filters it in the browser (see Part 09 notes),
-- so there is no server-side query that would use one.
--
-- Safe to re-run: `add column if not exists`, no data is changed or dropped.
-- Run this BEFORE deploying the matching app code.
-- ============================================================================

alter table public.products
  add column if not exists collections text[] not null default '{}';

-- ============================================================================
-- End of Part 11 migration.
-- ============================================================================

-- ============================================================================
-- LAGAMLESS — Part 09 migration: performance indexes (Performance Optimization Pass 01)
--
-- Adds exactly two composite indexes, each justified by an actual
-- storefront query pattern in src/services/products.js — not added
-- speculatively.
--
-- 1. (status, created_at DESC) — getAllProducts() filters
--    `status = 'published'` and orders by `created_at DESC`; the same
--    `created_at DESC` tiebreak is also the second ORDER BY key in
--    getFeaturedProducts(). Today this only has the single-column
--    `idx_products_status` to lean on, so Postgres filters via that index
--    and then performs a separate sort step. A composite index lets it
--    satisfy the filter AND the sort in one index scan — the single most
--    common query the storefront makes (every Shop page load, every
--    homepage load).
--
-- 2. (status, category) — getRelatedProducts() filters on BOTH
--    `status = 'published'` AND `category = <the current product's
--    category>` together (see the Product Details page — this runs on
--    every single product view, since related products always load).
--    The existing `idx_products_status` and `idx_products_category`
--    indexes are single-column, so this exact combination currently
--    can't be satisfied by either alone as efficiently as a composite
--    covering both.
--
-- Deliberately NOT added: any index that isn't backed by a real query
-- above. In particular, category filtering on the Shop page itself
-- happens client-side (see src/lib/productQuery.js's filterProducts()) —
-- the full published catalog is fetched once already, then filtered in
-- memory — so there is no server-side "status + category" Shop query to
-- optimize beyond what getRelatedProducts() above already justifies.
--
-- Safe to re-run: `create index if not exists`, no data changes, no
-- changes to any historical migration file.
-- ============================================================================

create index if not exists idx_products_status_created_at
  on public.products (status, created_at desc);

create index if not exists idx_products_status_category
  on public.products (status, category);

-- ============================================================================
-- End of Part 09 migration.
-- ============================================================================

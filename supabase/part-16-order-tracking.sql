-- ============================================================================
-- LAGAMLESS — Part 16 migration: shipment tracking on orders
--
-- Context: the admin Orders page (/admin/orders) lets an admin move an
-- order to "Shipped", but there was nowhere to record *how* to track that
-- shipment — the courier name, the courier's own tracking/AWB number, and
-- a link to the courier's tracking page. Customers had no way to see any
-- of that on the "Track your order" screen (/login → OrderLookup.jsx).
--
-- This migration adds three nullable columns to `orders` for that:
--   - tracking_courier  — e.g. "Delhivery", "Blue Dart", "India Post"
--   - tracking_id       — the courier's AWB / consignment / tracking number
--   - tracking_url      — direct link to the courier's tracking page
--     (ideally already carrying the tracking id, e.g.
--     https://www.delhivery.com/track/package/<id>)
-- plus `shipped_at`, set the first time an order is marked shipped, so the
-- customer-facing page can show "Shipped on <date>" without relying on
-- `updated_at` (which changes on every later status change too).
--
-- All four columns are nullable and have no default — existing rows are
-- unaffected, and non-shipped orders simply have them as null. Nothing
-- here changes the `orders.status` check constraint (already includes
-- 'shipped' from schema.sql) or any RLS policy: the existing "Admins can
-- manage orders" policy from part-08b2a-admin-security.sql already covers
-- writes to these new columns, since it applies to the whole row.
--
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.
-- ============================================================================

alter table orders add column if not exists tracking_courier text;
alter table orders add column if not exists tracking_id text;
alter table orders add column if not exists tracking_url text;
alter table orders add column if not exists shipped_at timestamptz;

-- Loose sanity check: if a tracking URL is present, it should actually be
-- a link. Doesn't require http(s) elsewhere in the app to keep this
-- forgiving of courier links that use other schemes.
alter table orders drop constraint if exists orders_tracking_url_check;
alter table orders add constraint orders_tracking_url_check
  check (tracking_url is null or tracking_url ~* '^https?://');

-- ============================================================================
-- End of Part 16 migration.
--
-- After running this in the Supabase SQL Editor:
--   1. Marking an order "Shipped" from /admin/orders now opens a small
--      form asking for the courier name, tracking id, and tracking link
--      before the status actually changes (src/admin/pages/AdminOrders.jsx).
--   2. Those three fields are stored on the order row and can be edited
--      again later from the same "Shipped" action.
--   3. A customer looking up their order at /login (OrderLookup.jsx) sees
--      a "Track package" link once these fields are set, using
--      tracking_url if present, otherwise showing tracking_courier +
--      tracking_id as plain text.
-- ============================================================================

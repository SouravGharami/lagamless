-- ============================================================================
-- LAGAMLESS — Part 19 migration: admin Returns management (RLS + grants only)
--
-- Context: Part 17 (part-17-returns-table.sql) created `public.returns`
-- deliberately inert — RLS enabled, zero policies, zero grants. Part 18
-- wired up customer submission via the `submit-return-request` edge
-- function, which runs with the service-role key and so never needed a
-- policy or grant to work.
--
-- This step adds the new admin-facing Returns page (src/admin/pages/
-- AdminReturns.jsx), which reads/writes `public.returns` the same way
-- AdminOrders.jsx already reads/writes `public.orders`: as the signed-in
-- admin's own `authenticated` session, through PostgREST, not through an
-- edge function. That requires exactly the two things this migration
-- adds, following the same two-part pattern `orders` needed
-- (part-08b2a-admin-security.sql for the RLS policy,
-- part-13-orders-grants-fix.sql for the table grant — a hard "permission
-- denied" happens before RLS is even considered without it):
--
--   1. An admin RLS policy on `public.returns`, identical in shape to
--      "Admins can manage orders".
--   2. A table-level GRANT to `authenticated`, identical in shape to the
--      Part 13 fix.
--
-- Explicitly NOT in scope:
--   - No new columns, no new tables, no change to the `reason` check
--     constraint, no `status` check constraint (still intentionally left
--     open per part-17's header note — 'requested' stays the only value
--     any code assumes as a default; this migration adds no other
--     assumption about which values are valid, that lives in the
--     application layer, same as `orders.status` isn't re-litigated
--     here either).
--   - No customer-facing policy change. A customer still cannot read or
--     write `returns` directly — the only customer-facing path remains
--     the `submit-return-request` edge function from Part 18.
--   - No `anon` grant, for the same reason Part 13 didn't add one to
--     `orders`: guest flows for returns go through the service-role edge
--     function, which bypasses RLS/grants entirely.
--
-- Safe to re-run: DROP POLICY IF EXISTS + CREATE POLICY, and GRANT (which
-- is idempotent). Does not touch any existing row.
-- ============================================================================

-- 1. Admin RLS policy — same shape as "Admins can manage orders".
drop policy if exists "Admins can manage returns" on public.returns;
create policy "Admins can manage returns"
  on public.returns for all
  using (public.is_admin())
  with check (public.is_admin());

-- 2. Table grant — same shape as the Part 13 fix for orders/order_items/
--    payments/shipping. Row access is still narrowed to admins only by
--    the policy above; this just clears the base-privilege check that
--    Postgres performs before RLS is even reached.
grant select, insert, update, delete on public.returns to authenticated;

-- ============================================================================
-- End of Part 19 migration.
--
-- After running this in the Supabase SQL Editor, an admin account
-- (profiles.role = 'admin') can load /admin/returns and see rows from
-- public.returns, and Approve/Reject there updates `returns.status`
-- in place ('approved' / 'rejected'). A non-admin session still gets
-- nothing back from either the SELECT or the UPDATE, same as every other
-- admin-only table in this project.
-- ============================================================================

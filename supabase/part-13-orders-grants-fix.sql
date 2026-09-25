-- ============================================================================
-- LAGAMLESS — Part 13 migration: orders table-privilege fix (defensive re-apply)
--
-- Context: the admin Orders page (/admin/orders) shows
--   "permission denied for table orders"
-- instead of the order list, even for a signed-in user whose
-- `profiles.role` is `'admin'`.
--
-- Root cause: this is NOT a Row Level Security problem. RLS already has
-- the right policy — "Admins can manage orders" from
-- part-08b2a-admin-security.sql, `for all using (public.is_admin())` — and
-- if that policy were simply failing to match, PostgREST/Postgres would
-- return an EMPTY result set for a SELECT, not an error. A hard
-- "permission denied for table X" means the querying role (`authenticated`,
-- here) has no base object privilege (SELECT/INSERT/UPDATE/DELETE) on the
-- table at all — a check Postgres performs *before* RLS policies are even
-- considered. RLS restricts which rows a privilege applies to; it is not a
-- substitute for the privilege itself.
--
-- `orders` / `order_items` / `payments` / `shipping` never received an
-- explicit GRANT anywhere in this project's migrations (schema.sql only
-- ever ran `alter table ... enable row level security`), unlike
-- `is_admin()`, which part-08b2a explicitly grants EXECUTE on. This
-- migration adds the missing table-level grants so the existing RLS
-- policies can actually take effect:
--   - authenticated: full statement-level privileges on all four tables,
--     narrowed per-row by the existing customer/admin policies exactly as
--     before (a non-admin still only ever sees their own rows; a
--     non-admin still cannot write to any of them, because the *row-level*
--     policies are unchanged by this migration).
--   - anon stays untouched (guest checkout and guest order-lookup both
--     already go through the service-role edge functions in
--     supabase/functions/, which bypass RLS/grants entirely — see
--     supabase/functions/README.md — so anon never needs direct table
--     access here).
--
-- Safe to re-run any number of times: GRANT is idempotent (re-granting an
-- already-held privilege is a no-op). Does not change any RLS policy,
-- does not touch any existing row.
-- ============================================================================

grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.shipping to authenticated;

-- ============================================================================
-- End of Part 13 migration.
--
-- After running this, refresh /admin/orders — the "permission denied"
-- banner should be gone, and (once at least one real checkout has
-- happened against this project) the order list, search box, and all
-- eight status filter chips (All/Pending/Payment failed/Confirmed/
-- Processing/Shipped/Delivered/Cancelled) will work exactly as already
-- coded in src/admin/pages/AdminOrders.jsx — that filtering logic was
-- never broken, it just had zero rows to operate on while every query
-- was being rejected before it reached RLS.
-- ============================================================================

-- ============================================================================
-- LAGAMLESS — Part 15: orders admin panel — consolidated fix + diagnostic
--
-- WHY THIS FILE EXISTS
-- Parts 08B-2A, 08B-3 and 13 each fixed one specific way the /admin/orders
-- page can end up showing nothing (missing RLS policy, missing SELECT
-- policy on profiles, missing table GRANT). Every one of those fixes is a
-- SQL file that only takes effect once it is actually *run* in the
-- Supabase SQL Editor — having it in the repo does nothing on its own.
-- The single most common reason "I've tried everything and it's still
-- empty" happens is that one of those files was never actually executed
-- against this project, or was run before an earlier one, or against the
-- wrong Supabase project.
--
-- This file does two things in one paste:
--   PART A — re-applies every grant + policy the orders admin panel needs,
--            from scratch, idempotently. Safe to run any number of times.
--   PART B — runs as the Supabase SQL Editor's own role, which bypasses
--            RLS entirely, so its output tells you the *ground truth*:
--            how many order rows really exist, whether the grants/policies
--            are actually in place, and which accounts are actually admins.
--
-- HOW TO USE
-- 1. Open the Supabase Dashboard for THIS project → SQL Editor → New query.
-- 2. Paste this whole file and click Run.
-- 3. Read the result sets at the bottom (scroll down — there are five).
--    They tell you exactly what's true right now. See the checklist below
--    each query for what a healthy answer looks like.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PART A — re-apply everything the orders admin panel depends on
-- ----------------------------------------------------------------------------

-- A1. is_admin() — recreated exactly as in part-08b2a, in case it's missing
-- or was ever altered.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- A2. orders.status check constraint — must allow 'payment_failed'
-- (added in part-10). If part-10 was skipped, this constraint would
-- reject a payment_failed row outright (and abort any batch insert that
-- includes one, e.g. part-14's sample seed, taking every other row in
-- that same statement down with it).
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'payment_failed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));

-- A3. RLS policies on orders / order_items / payments (part-08b2a).
drop policy if exists "Customers can read own orders" on public.orders;
create policy "Customers can read own orders"
  on public.orders for select
  using (auth.uid() = customer_id);

drop policy if exists "Admins can manage orders" on public.orders;
create policy "Admins can manage orders"
  on public.orders for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Customers can read own order items" on public.order_items;
create policy "Customers can read own order items"
  on public.order_items for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
        and orders.customer_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage order items" on public.order_items;
create policy "Admins can manage order items"
  on public.order_items for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Customers can read own payments" on public.payments;
create policy "Customers can read own payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.orders
      where orders.id = payments.order_id
        and orders.customer_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage payments" on public.payments;
create policy "Admins can manage payments"
  on public.payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- A4. Table-level GRANTs (part-13) — without these, Postgres rejects the
-- query before RLS is even consulted.
grant select, insert, update, delete on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.shipping to authenticated;

-- A5. profiles self-read policy (part-08b3) — the admin-status check
-- (is_admin()) doesn't need this directly (it's SECURITY DEFINER), but
-- the Account page and AuthContext's own profile fetch do, and a broken
-- profiles policy is worth ruling out here too.
alter table public.profiles enable row level security;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);


-- ----------------------------------------------------------------------------
-- PART B — diagnostic report (runs with RLS bypassed — this is ground truth)
-- ----------------------------------------------------------------------------

-- B1. How many order rows actually exist, by status.
--   Healthy: at least one row (from part-14's seed, or a real checkout).
--   If this returns zero rows total, the page is correctly showing "no
--   orders yet" — nothing is broken, there's just nothing to show. Either
--   run part-14-sample-orders-seed.sql, or place one real test order.
select 'B1: order counts by status' as report, status, count(*) as row_count
from public.orders
group by status
order by status;

-- B2. Table grants — confirms Part A4 actually landed.
--   Healthy: one row per table with 'INSERT/SELECT/UPDATE/DELETE' (order
--   may vary) for grantee = authenticated.
select
  'B2: table grants for authenticated' as report,
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where grantee = 'authenticated'
  and table_schema = 'public'
  and table_name in ('orders', 'order_items', 'payments', 'shipping')
group by table_name
order by table_name;

-- B3. RLS policies present on each table.
--   Healthy: each table shows both a "Customers can read own ..." select
--   policy and an "Admins can manage ..." all-command policy.
select 'B3: RLS policies' as report, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('orders', 'order_items', 'payments')
order by tablename, policyname;

-- B4. Who is actually an admin right now.
--   Healthy: the row for the email you're signing into /admin with shows
--   role = 'admin'. If it's missing entirely, or shows 'customer', that
--   account will correctly see zero orders no matter what else is fixed —
--   promote it per SETUP.md §11 ("First admin setup"), then sign out and
--   back in (or click "Retry" on the admin check) before testing again.
select 'B4: admin accounts' as report, p.id, p.role, u.email
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'
order by u.email;

-- B5. RLS is actually enabled on all four tables (it's possible for a
-- policy to exist but RLS to have been turned off on the table itself,
-- which — confusingly — makes every row visible to everyone rather than
-- filtering, so this isn't what's causing an *empty* result, but it's
-- worth confirming while you're here).
select 'B5: RLS enabled?' as report, relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relname in ('orders', 'order_items', 'payments', 'shipping')
  and relnamespace = 'public'::regnamespace;

-- ============================================================================
-- READING THE RESULTS
--
-- If B1 shows real rows, B2 shows all four privileges for all four tables,
-- B3 shows both policies on all three tables, and your account's row in B4
-- says role = 'admin' — the database side is fully correct. If /admin/orders
-- is STILL empty after that, the remaining cause is client-side (wrong
-- Supabase project in .env, signed into a different account than you
-- think, or a stale cached session) — see the updated AdminOrders page in
-- this same delivery, which now prints the exact Postgrest error
-- (code/message/hint) instead of a generic message, so the browser
-- console or the on-page error banner will say precisely what's wrong.
-- ============================================================================

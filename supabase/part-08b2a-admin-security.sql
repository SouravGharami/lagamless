-- ============================================================================
-- LAGAMLESS — Part 08B-2A migration: admin security + RLS foundation
--
-- Scope of this migration:
--   1. is_admin() — a single source of truth for "is the current user an
--      admin", usable inside RLS policies without recursive-RLS problems.
--   2. Role-escalation protection: a customer can no longer grant
--      themselves 'admin' by updating their own profiles row (closes the
--      gap documented in part-08b1-auth.sql).
--   3. Admin-scoped RLS on products / product_images / product_variants /
--      profiles / orders / order_items / payments / shipping.
--   4. Storage RLS on the product-images bucket (public read, admin-only
--      write).
--
-- Explicitly NOT in scope (Part 08B-2B+):
--   - Any customer-facing INSERT policy for orders/order_items/payments/
--     shipping (checkout doesn't write to these yet — Part 09).
--   - Admin product CRUD, image upload UI, order/customer management UI.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / DROP
-- ... IF EXISTS. Does not drop or recreate any table, and does not touch
-- existing rows in any table. Run this once in the Supabase SQL Editor,
-- after schema.sql + seed.sql + part-08b1-auth.sql have already been run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. is_admin() — the single admin check every policy below reuses.
--
-- - Reads `auth.uid()` only. Never accepts a user id argument from the
--   client — there is no way to ask "is *someone else* an admin".
-- - `security definer` + `set search_path = public` so it always resolves
--   `public.profiles` regardless of the caller's search_path, and — the
--   important part — so it runs with the *function owner's* privileges
--   (the migration-running role, which owns `profiles`) rather than the
--   calling user's. Table owners bypass their own table's RLS by default
--   in Postgres, so this one read does not re-trigger the `profiles`
--   SELECT policy that itself might reference `is_admin()`. Without this,
--   any policy calling `is_admin()` while `is_admin()` also queries
--   `profiles` under RLS would recurse.
-- - `stable`, not `volatile`: it only reads data, never writes, so the
--   planner may cache/reuse the result within a single statement.
-- ----------------------------------------------------------------------------

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

-- Both roles need to be able to call this — every RLS policy below runs as
-- whichever role the request came in as (anon for logged-out visitors,
-- authenticated for signed-in users), and the function itself is the
-- security boundary, not who's allowed to invoke it.
grant execute on function public.is_admin() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Role-escalation protection.
--
-- part-08b1-auth.sql's "Users can update own profile" policy (kept as-is
-- below — not dropped) lets a signed-in user update any column on their
-- own row, `role` included. That policy alone cannot safely distinguish
-- "the row's role didn't change" from "the row's role changed to admin",
-- because Postgres RLS's WITH CHECK only sees the proposed new row, not
-- the old one. A BEFORE UPDATE trigger can see both, so the invariant is
-- enforced there instead.
--
-- Behavior: if `role` is part of the update and the caller is not already
-- an admin, the new value is silently discarded and the row keeps its
-- previous role — every *other* field in the same update (full_name,
-- phone, updated_at) still goes through normally. This is deliberate: a
-- customer's profile-update request should never hard-fail just because
-- the request happened to (redundantly) echo back their existing role, or
-- because of a compromised/buggy client trying to slip `role` in
-- alongside a legitimate name change.
-- ----------------------------------------------------------------------------

create or replace function public.enforce_profile_role_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_role_immutable on profiles;
create trigger trg_profiles_role_immutable
  before update on profiles
  for each row execute function public.enforce_profile_role_immutable();

-- ----------------------------------------------------------------------------
-- 3. profiles — admin read/update, on top of the existing self-only
--    policies from part-08b1-auth.sql (which are left untouched).
--
-- No admin INSERT/DELETE policy: profile rows are still created only by
-- the handle_new_auth_user() trigger, and there is no account-deletion
-- feature yet. "Admins can access profiles as operationally required"
-- means read/update for now (e.g. a future customer list, or role
-- management) — not a blanket ability to fabricate or remove accounts.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins can read all profiles" on profiles;
create policy "Admins can read all profiles"
  on profiles for select
  using (public.is_admin());

drop policy if exists "Admins can update all profiles" on profiles;
create policy "Admins can update all profiles"
  on profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. products / product_variants / product_images — admin full management,
--    on top of the existing "public can read published X" policies from
--    schema.sql (left untouched). Admins can see/manage drafts too, which
--    the public SELECT policies intentionally never allow.
-- ----------------------------------------------------------------------------

drop policy if exists "Admins can manage products" on products;
create policy "Admins can manage products"
  on products for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage product variants" on product_variants;
create policy "Admins can manage product variants"
  on product_variants for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins can manage product images" on product_images;
create policy "Admins can manage product images"
  on product_images for all
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. orders / order_items / payments / shipping.
--
-- These tables had zero policies before this migration (schema.sql enables
-- RLS on them but defines none — "deny by default"). This migration adds:
--   - customers: read-only access to rows that are theirs
--   - admins: full operational access
-- No customer INSERT/UPDATE policy is added here — there is no checkout
-- flow writing to these tables yet (Part 09), so there is nothing for a
-- customer-facing write policy to support today. Adding one now, ahead of
-- the feature that would use it, is exactly the kind of premature broad
-- policy this migration is trying to avoid.
-- ----------------------------------------------------------------------------

-- orders: a customer may read rows where they are the customer.
drop policy if exists "Customers can read own orders" on orders;
create policy "Customers can read own orders"
  on orders for select
  using (auth.uid() = customer_id);

drop policy if exists "Admins can manage orders" on orders;
create policy "Admins can manage orders"
  on orders for all
  using (public.is_admin())
  with check (public.is_admin());

-- order_items: no customer_id column of its own — scope through the
-- parent order's customer_id instead.
drop policy if exists "Customers can read own order items" on order_items;
create policy "Customers can read own order items"
  on order_items for select
  using (
    exists (
      select 1 from orders
      where orders.id = order_items.order_id
        and orders.customer_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage order items" on order_items;
create policy "Admins can manage order items"
  on order_items for all
  using (public.is_admin())
  with check (public.is_admin());

-- payments: same "scope through the parent order" pattern as order_items.
drop policy if exists "Customers can read own payments" on payments;
create policy "Customers can read own payments"
  on payments for select
  using (
    exists (
      select 1 from orders
      where orders.id = payments.order_id
        and orders.customer_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage payments" on payments;
create policy "Admins can manage payments"
  on payments for all
  using (public.is_admin())
  with check (public.is_admin());

-- shipping: same pattern again.
drop policy if exists "Customers can read own shipping" on shipping;
create policy "Customers can read own shipping"
  on shipping for select
  using (
    exists (
      select 1 from orders
      where orders.id = shipping.order_id
        and orders.customer_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage shipping" on shipping;
create policy "Admins can manage shipping"
  on shipping for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- 6. Storage RLS — product-images bucket.
--
-- The bucket itself is created manually as "Public" (see SETUP.md §7),
-- which makes `getPublicUrl()` work without any policy at all. These
-- policies are still added for defense in depth, and — the part that
-- actually matters — because "Public" only affects unauthenticated
-- *reads*; without an explicit policy here, INSERT/UPDATE/DELETE on
-- storage.objects is denied to everyone (correct), and there was
-- previously no way for even a legitimate admin to upload. This section
-- adds exactly that, and nothing more:
--   - anyone can read objects in this bucket
--   - only admins can insert/update/delete objects in this bucket
--   - no anonymous or customer uploads are ever permitted
-- ============================================================================

alter table storage.objects enable row level security;

drop policy if exists "Public can read product images" on storage.objects;
create policy "Public can read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
  on storage.objects for update
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
  on storage.objects for delete
  using (bucket_id = 'product-images' and public.is_admin());

-- ============================================================================
-- End of Part 08B-2A migration.
--
-- After running this, promote your own account to admin using the
-- dashboard-only steps in supabase/SETUP.md §11 ("First admin setup") —
-- there is intentionally no public/UI way to do this.
-- ============================================================================

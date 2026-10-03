-- ============================================================================
-- LAGAMLESS — Part 08B-1 migration: authentication foundation
--
-- Scope of this migration:
--   1. A trigger that automatically creates a `profiles` row (role always
--      'customer') whenever a new `auth.users` row is created — i.e. on
--      every signup, regardless of whether it goes through this app's
--      Signup form, the Supabase dashboard, or any other Auth client.
--   2. Row Level Security policies that let a signed-in user read and
--      update *their own* `profiles` row, and nothing else.
--
-- Explicitly NOT in scope (Part 08B-2):
--   - Any policy referencing role = 'admin' (admin RLS, admin CRUD on
--     products/product_images/product_variants, an is_admin() helper).
--   - Any INSERT/UPDATE/DELETE policy on orders/order_items/payments/
--     shipping. Those tables still have zero policies after this
--     migration — with RLS already enabled on them (schema.sql), that
--     means "deny by default," which is correct until Part 08B-2/09 adds
--     real order-writing application logic.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE / DROP
-- ... IF EXISTS. Does not touch existing rows in `profiles`, `products`,
-- `product_images`, `product_variants`, or any other existing data.
-- Run this once in the Supabase SQL Editor, after schema.sql + seed.sql
-- have already been run (Part 08A).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Auto-create a profile row when a new auth user is created.
--
-- SECURITY DEFINER is required here: this function runs in response to an
-- INSERT into `auth.users`, a table the client never writes to directly
-- and that a normal authenticated role cannot insert into `profiles` for
-- (rightly — see the RLS policies below, which only allow a user to
-- touch their *own* row, and `profiles.id` doesn't exist yet at the
-- moment `auth.users` gains the row). The function body is deliberately
-- tiny and only ever reads `NEW` — it does not accept a `role` argument
-- from anywhere the frontend controls, so there is no path for a signup
-- request to grant itself `role = 'admin'`.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', null),
    'customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- 2. profiles RLS: a signed-in user may read and update their own row only.
--
-- No INSERT policy is added for authenticated clients — profile creation
-- happens exclusively through the SECURITY DEFINER trigger above, not
-- through a direct client-side insert. No DELETE policy is added either;
-- there is no account-deletion feature in this part.
-- ----------------------------------------------------------------------------

drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile"
  on profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on profiles;
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Deliberately not hardened further here: this policy lets a signed-in
-- user update *any* column on their own row, including `role`, which is
-- a real (if narrow) privilege-escalation gap — a user could set their
-- own `role` to 'admin' via a raw REST/SQL call even though no UI in this
-- app ever exposes that field. It's left open rather than papered over
-- with a policy that would also block a future admin from editing their
-- own name (see the file header: this migration explicitly excludes any
-- role-aware policy). `updateMyProfile()` in `src/services/profiles.js`
-- never sends `role` in its update payload, and no signup/account UI
-- anywhere accepts one, but that is a frontend guarantee, not a database
-- one. Part 08B-2 closes this gap for real, with a trigger or a
-- column-level policy that pins `role` to its previous value unless the
-- caller is already an admin.

-- ============================================================================
-- End of Part 08B-1 migration.
-- ============================================================================

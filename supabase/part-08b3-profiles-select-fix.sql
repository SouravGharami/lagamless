-- ============================================================================
-- LAGAMLESS — Part 08B-3 migration: profiles self-SELECT policy (defensive re-apply)
--
-- Context: the browser console reported
--   403 when selecting the signed-in user's own row from public.profiles
--
-- The correct policy already exists *in source* in
-- part-08b1-auth.sql ("Users can read own profile", USING (auth.uid() = id)),
-- and part-08b2a-admin-security.sql adds the admin-wide read policy on
-- top of it without touching it. If your live Supabase project still
-- returns 403 for a user reading their own row, the most likely causes
-- are:
--   1. part-08b1-auth.sql (and/or part-08b2a-admin-security.sql) was
--      never actually run against this project, or was run before
--      `profiles` existed / before RLS was enabled on it.
--   2. `alter table profiles enable row level security;` (schema.sql) ran,
--      but no SELECT policy was ever successfully created afterwards —
--      RLS enabled + zero matching policies = every row denied by
--      default, which reads as "403" from the client.
--
-- This migration does not change any security behavior beyond what
-- part-08b1-auth.sql already specifies — it only re-asserts the same
-- self-only SELECT policy, defensively, so re-running it fixes case (1)
-- or (2) above without requiring you to diff which earlier migration
-- files did or didn't get applied.
--
-- Safe to re-run any number of times: DROP POLICY IF EXISTS + CREATE
-- POLICY, no table structure changes, no data changes. Does NOT grant
-- any broader access — a user can still only read their own row via this
-- policy (admins get the separate, already-existing "Admins can read all
-- profiles" policy from part-08b2a-admin-security.sql).
-- ============================================================================

-- Make sure RLS is actually enabled (idempotent — a no-op if it already is).
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- ============================================================================
-- End of Part 08B-3 migration.
-- ============================================================================

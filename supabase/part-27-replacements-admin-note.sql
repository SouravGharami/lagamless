-- ============================================================================
-- LAGAMLESS — Part 27 migration: internal admin note on replacements
--
-- Adds a free-text `admin_note` column to public.replacements so an admin
-- can leave an internal note on a request (e.g. "called customer, confirmed
-- size" or "check with warehouse before shipping"). This is NOT shown to the
-- customer — it's separate from `rejection_reason`, which IS customer-facing
-- (see part-20's equivalent on returns). An admin note can be added/edited on
-- a request in any status and doesn't change `status` itself.
--
-- Uses the same "Admins can manage replacements" RLS policy + grant from
-- part-26 — no new policy needed, just the column.
--
-- Safe to re-run.
-- ============================================================================

alter table public.replacements
  add column if not exists admin_note text;

-- ============================================================================
-- End of Part 27. After running it, the admin Replacements page can save a
-- note per request via the "Add note" / "Edit note" action.
-- ============================================================================

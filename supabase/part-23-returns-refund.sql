-- ============================================================================
-- LAGAMLESS — Part 23 migration: return refund (Razorpay)
--
-- Context: the admin Returns page can already move a return from
-- 'inspection' to 'refund_pending' once inspection passes (Part 22 — see
-- part-22-returns-inspection.sql). This step adds the columns needed to
-- actually record a Razorpay refund against that return, driven by the
-- new `initiate-return-refund` edge function (see
-- supabase/functions/initiate-return-refund/index.ts):
--
--   refund_pending --[Initiate Refund, succeeds]--> refunded
--   refund_pending --[Initiate Refund, fails]-------> refund_pending (unchanged)
--
-- Scope of THIS migration: five nullable columns, nothing else.
--   - `refund_id text` — Razorpay's refund id (`rfnd_...`), set once, only
--     on a successful refund. Also doubles as one of the duplicate-refund
--     guards the edge function checks before calling Razorpay again (see
--     that function's header note) — a return with a non-null
--     `refund_id` has already been refunded, full stop.
--   - `refund_amount numeric(10, 2)` — the amount actually refunded, in
--     rupees (same unit as `payments.amount`), converted from the paise
--     figure Razorpay's API returns.
--   - `refund_status text` — Razorpay's own refund status
--     ('processing' | 'processed' | 'failed' in this project's usage; see
--     the edge function). Left unconstrained at the DB level, same as
--     `returns.status` itself (part-17's header note) — 'processing' is
--     also how the edge function takes out a short-lived exclusive lock
--     on a return before calling Razorpay, so two concurrent "Initiate
--     Refund" clicks (or a retry racing an in-flight request) can never
--     both place a refund for the same return: the edge function's
--     lock-acquiring UPDATE is guarded on
--     `refund_status is null or refund_status = 'failed'`, so once one
--     request has set it to 'processing' every other concurrent request
--     matches zero rows and is rejected before it ever calls Razorpay.
--   - `refund_initiated_at timestamptz` — stamped when that lock is
--     acquired (i.e. right before the Razorpay API call), independent of
--     whether the call goes on to succeed or fail — so "a refund attempt
--     is/was in flight" has a timestamp even for a failed attempt.
--   - `refunded_at timestamptz` — stamped only on a *successful* refund,
--     in the same update that sets `status = 'refunded'` and `refund_id`.
--   - `refund_failure_reason text` — set only when a Razorpay refund
--     attempt fails; cleared (set back to null) on a subsequent success.
--     `status` is deliberately left at `refund_pending` when this is set
--     — a failed attempt is not a terminal state, the admin can retry.
--
-- All five follow the same "nullable, no default, stamped by the app
-- layer" shape already established for `received_at`
-- (part-21-returns-received-at.sql) and `inspection_started_at`
-- (part-22-returns-inspection.sql).
--
-- No change to `payments`: `payments.status` already includes 'refunded'
-- in its check constraint (see schema.sql) — the edge function sets the
-- related payment row to that existing value on a successful refund, no
-- migration needed there.
--
-- Explicitly NOT in scope: no RLS/grant changes. The
-- `initiate-return-refund` edge function runs with the service-role key
-- (like every other function in supabase/functions/), which bypasses RLS
-- and table grants entirely — so, unlike part-19/20/21/22, this migration
-- adds no policy. Part 19's admin `for all` policy on `public.returns`
-- already covers these new columns anyway for the read-only path (the
-- admin Returns page's `getReturns()` SELECT), the same way it covers
-- every column added since.
--
-- Safe to re-run: every `alter table` uses `add column if not exists`;
-- the index uses `create index if not exists`. Does not touch any
-- existing row's data (every existing row simply gets `null` for all
-- five columns here).
-- ============================================================================

alter table public.returns add column if not exists refund_id text;
alter table public.returns add column if not exists refund_amount numeric(10, 2);
alter table public.returns add column if not exists refund_status text;
alter table public.returns add column if not exists refund_initiated_at timestamptz;
alter table public.returns add column if not exists refunded_at timestamptz;
alter table public.returns add column if not exists refund_failure_reason text;

-- One Razorpay refund id should never end up attached to two different
-- return rows (e.g. a bug re-using an old response). Partial index,
-- same style as idx_payments_razorpay_payment_id in
-- part-10-razorpay-checkout.sql.
create unique index if not exists idx_returns_refund_id
  on public.returns (refund_id)
  where refund_id is not null;

-- ============================================================================
-- End of Part 23 migration.
--
-- After running this in the Supabase SQL Editor and deploying the new
-- `initiate-return-refund` edge function (see
-- supabase/functions/initiate-return-refund/index.ts and the updated
-- supabase/functions/README.md), a return in 'refund_pending' status
-- will show an "Initiate Refund" button on /admin/returns. Clicking it
-- (after confirming) calls the edge function, which looks up the related
-- payment's `razorpay_payment_id`, verifies it's eligible for a refund,
-- calls Razorpay's Refund API in Test Mode, and on success sets
-- `status = 'refunded'` with `refund_id` / `refund_amount` /
-- `refund_status` / `refunded_at` all recorded. On failure, `status`
-- stays `refund_pending` and `refund_failure_reason` is saved so the
-- admin can see why and retry.
-- ============================================================================

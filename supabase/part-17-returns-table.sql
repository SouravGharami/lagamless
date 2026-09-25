-- ============================================================================
-- LAGAMLESS — Part 17 migration: returns table (structure only)
--
-- Context: Step 4 built the customer-facing return-request form
-- (src/components/ReturnRequestDialog.jsx, opened from a delivered order's
-- "Return" button on src/pages/OrderLookup.jsx) but it has nowhere to
-- write to yet — validation only, nothing is submitted or persisted.
--
-- Scope of THIS migration: create `public.returns` and its foreign keys /
-- indexes only. Explicitly NOT in scope (later steps):
--   - Any INSERT policy or grant that would let the form actually submit
--     a row (customer-facing submit wiring).
--   - Admin-facing Returns UI, approval/rejection, pickup, inspection.
--   - Refunds / Razorpay refund calls.
--   - A `status` check constraint — the full set of workflow states
--     (approved/rejected/picked up/refunded/etc.) isn't decided yet, so
--     constraining it now would just have to be re-migrated later. Only
--     the single default value this table starts every row with
--     ('requested') is assumed.
--
-- Modeled directly on the existing `orders` / `order_items` tables in
-- schema.sql:
--   - `id uuid primary key default gen_random_uuid()` — same as every
--     other table here.
--   - `updated_at` kept current via the same `set_updated_at()` trigger
--     function schema.sql already defines and orders/payments/profiles
--     already use — reused, not reimplemented.
--   - RLS is enabled with ZERO policies below, exactly how schema.sql
--     originally brought up orders/order_items/payments/shipping in Part
--     08A ("foundational tables ... but have no application logic yet")
--     before part-08b2a added policies once there was a real feature to
--     support. Right now there is no feature reading/writing this table,
--     so — same as those tables were for a while — it is deny-by-default
--     for every role including admins. No table grants are added either,
--     for the same reason (see part-13-orders-grants-fix.sql for why a
--     GRANT is required separately from RLS in this project).
--
-- Safe to re-run: every statement is guarded with IF NOT EXISTS /
-- OR REPLACE / DROP ... IF EXISTS where practical.
-- ============================================================================

create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),

  -- The order this return is against. Cascades on order deletion, same as
  -- order_items.order_id — a return record has no meaning once its order
  -- is gone.
  order_id uuid not null references public.orders (id) on delete cascade,

  -- Which line item the return is for, "if applicable" per spec (e.g. a
  -- return might later be raised at the order level rather than a single
  -- item). Nullable. Uses `on delete set null` rather than cascade: unlike
  -- order_items.order_id, an order_item row disappearing shouldn't erase
  -- the customer's return record along with it — the return request
  -- itself is what needs to stay auditable.
  order_item_id uuid references public.order_items (id) on delete set null,

  -- The requesting customer, "if available" per spec — guest checkouts
  -- have no profiles row, so this stays nullable, exactly like
  -- orders.customer_id. No `on delete` clause, same as orders.customer_id:
  -- a profile can't be deleted out from under a return that references it.
  customer_id uuid references public.profiles (id),

  -- Every order has a customer_email regardless of guest/account status
  -- (see orders.customer_email), so this is the reliable identity anchor
  -- for a return — required, unlike customer_id.
  customer_email text not null,

  -- Fixed set from the return-request form's dropdown
  -- (src/components/ReturnRequestDialog.jsx RETURN_REASONS). Constrained
  -- the same way orders.status/payments.status are constrained elsewhere
  -- in schema.sql, since — unlike `status` below — this list is fixed and
  -- already shipped in the UI.
  reason text not null
    check (reason in (
      'Size doesn''t fit',
      'Wrong product received',
      'Damaged product',
      'Defective product',
      'Different from description',
      'Other'
    )),

  -- Optional free-text note from the customer, matching the optional
  -- "Additional note" field in the form.
  customer_note text,

  -- Workflow status. Left unconstrained (see header note above) — only
  -- the starting value is fixed for now.
  status text not null default 'requested',

  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep updated_at current on any UPDATE, same trigger function every
-- other timestamped table in this project already uses.
drop trigger if exists trg_returns_updated_at on public.returns;
create trigger trg_returns_updated_at
  before update on public.returns
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Indexes — one per foreign key (a return's home lookups: "returns for
-- this order", "returns for this line item", "returns for this
-- customer"), plus status for the admin return-list filtering that will
-- come later (same reasoning as idx_orders_status), plus customer_email
-- for the guest-lookup path (same reasoning as customer_email being the
-- lookup key in get-orders-by-email).
-- ----------------------------------------------------------------------------

create index if not exists idx_returns_order_id on public.returns (order_id);
create index if not exists idx_returns_order_item_id on public.returns (order_item_id);
create index if not exists idx_returns_customer_id on public.returns (customer_id);
create index if not exists idx_returns_status on public.returns (status);
create index if not exists idx_returns_customer_email on public.returns (customer_email);

-- Deny-by-default: RLS on, no policies yet (see header note). No table
-- grants added either — both come in a later step alongside the feature
-- that actually needs them.
alter table public.returns enable row level security;

-- ============================================================================
-- End of Part 17 migration.
--
-- After running this in the Supabase SQL Editor, `public.returns` exists
-- with its structure, foreign keys, and indexes — but is completely
-- inert: RLS is on with no policies and no grants, so no role (including
-- admin) can read or write it via PostgREST yet, and nothing in the app
-- references this table. The return-request form still only validates
-- locally and does not submit anywhere. A later step adds the grants/RLS
-- policies and the actual submit wiring.
-- ============================================================================

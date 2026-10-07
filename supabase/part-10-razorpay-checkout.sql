-- ============================================================================
-- LAGAMLESS — Part 10 migration: Razorpay checkout (orders/payments go live)
--
-- Scope of this migration:
--   1. `orders.status` gains 'payment_failed' — an order whose payment
--      attempt failed is a distinct, real state from 'cancelled' (customer
--      can retry the same order; nothing here auto-cancels it).
--   2. `payments` gains the Razorpay-specific columns the edge functions
--      read/write: razorpay_order_id, razorpay_payment_id,
--      razorpay_signature, error_code, error_description, raw_response.
--   3. A unique index on `payments.razorpay_order_id` so the webhook and
--      the client-side verify call can never create two payment rows (or
--      double-apply) for the same Razorpay order — both paths do an
--      upsert keyed on this column.
--
-- Deliberately NOT in scope: any customer-facing RLS policy for orders /
-- order_items / payments. All reads and writes for checkout go through the
-- three edge functions in supabase/functions/ (create-razorpay-order,
-- verify-razorpay-payment, razorpay-webhook, get-order-status), which use
-- the service-role key and therefore bypass RLS entirely. That is
-- intentional, not an oversight — see supabase/functions/README.md — so
-- this migration does not open any new policy on these tables. Direct
-- client (anon/authenticated) access to orders/order_items/payments stays
-- fully denied by RLS, exactly as Part 08B-2A left it.
--
-- Safe to re-run: every statement uses IF NOT EXISTS / DROP ... IF EXISTS
-- and does not touch existing rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. orders.status: add 'payment_failed'
-- ----------------------------------------------------------------------------
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('pending', 'payment_failed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'));

-- ----------------------------------------------------------------------------
-- 2. payments: Razorpay-specific columns
-- ----------------------------------------------------------------------------
alter table payments add column if not exists razorpay_order_id text;
alter table payments add column if not exists razorpay_payment_id text;
alter table payments add column if not exists razorpay_signature text;
alter table payments add column if not exists error_code text;
alter table payments add column if not exists error_description text;
alter table payments add column if not exists raw_response jsonb;

-- ----------------------------------------------------------------------------
-- 3. Idempotency: one payment row per Razorpay order
-- ----------------------------------------------------------------------------
create unique index if not exists idx_payments_razorpay_order_id
  on payments (razorpay_order_id)
  where razorpay_order_id is not null;

create index if not exists idx_payments_razorpay_payment_id
  on payments (razorpay_payment_id)
  where razorpay_payment_id is not null;

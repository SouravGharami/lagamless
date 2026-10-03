-- ============================================================================
-- LAGAMLESS — Part 25 migration: Cash on Delivery — MANUAL "mark as paid"
--
-- Run this ONCE in the Supabase SQL Editor (after part-24). Safe to re-run.
--
-- Why: part-24 flipped a COD payment to 'paid' automatically the moment the
-- order was marked delivered. In practice "delivered" and "the money reached
-- me" are two different events (the courier remits COD cash days later, or the
-- customer pays by UPI). So payment is now its OWN step that the admin sets
-- by hand:
--
--     order status   pending → confirmed → processing → shipped → delivered
--     COD payment    pending (unpaid) ───────────────────────→ paid
--
-- What this migration does:
--   1. payments.paid_at            — when the admin recorded the money
--   2. payments.collection_method  — 'cash' | 'upi' | 'other' (how it arrived)
--      (an optional reference, e.g. UPI txn id / courier remittance no., goes
--       into the existing payments.provider_reference column)
--   3. Backfills paid_at for COD payments that part-24 already auto-marked paid.
--   4. Replaces the part-24 trigger: 'delivered' NO LONGER auto-marks the COD
--      payment paid. 'cancelled' still gives reserved stock back exactly once.
--   5. set_cod_payment_status(...) — the single, admin-only, atomic way to
--      mark a COD payment paid / undo it. It refuses cancelled orders, refuses
--      to touch a refunded payment, and is safe to call twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 + 2. Columns
-- ----------------------------------------------------------------------------
alter table payments add column if not exists paid_at timestamptz;
alter table payments add column if not exists collection_method text;

alter table payments drop constraint if exists payments_collection_method_check;
alter table payments add constraint payments_collection_method_check
  check (collection_method is null or collection_method in ('cash', 'upi', 'other'));

-- ----------------------------------------------------------------------------
-- 3. Backfill: COD payments the old trigger already marked paid
-- ----------------------------------------------------------------------------
update payments
   set paid_at = coalesce(paid_at, updated_at),
       collection_method = coalesce(collection_method, 'cash')
 where provider = 'cod' and status = 'paid' and paid_at is null;

-- ----------------------------------------------------------------------------
-- 4. Lifecycle trigger — cancelled restores stock; delivered no longer pays
-- ----------------------------------------------------------------------------
create or replace function public.orders_cod_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'cancelled' and old.stock_reserved then
      update product_variants v
         set stock = v.stock + oi.qty
        from (
          select variant_id, sum(quantity)::integer as qty
          from order_items
          where order_id = new.id and variant_id is not null
          group by variant_id
        ) oi
       where v.id = oi.variant_id;
      new.stock_reserved := false;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_cod_lifecycle on orders;
create trigger trg_orders_cod_lifecycle
  before update of status on orders
  for each row execute function public.orders_cod_lifecycle();

-- ----------------------------------------------------------------------------
-- 5. set_cod_payment_status — admin-only, atomic, idempotent
--
-- Errors are raised as  'CODE|human readable message'  (same convention as
-- place_cod_order) so the admin UI can show a clean message:
--   NOT_ADMIN         caller is not an admin
--   ORDER_NOT_FOUND   no such order
--   NOT_COD           the order has no Cash on Delivery payment
--   ORDER_CANCELLED   can't take payment on a cancelled / payment-failed order
--   ALREADY_REFUNDED  the payment was refunded; it can't be flipped any more
--   BAD_METHOD        collection method isn't cash / upi / other
-- ----------------------------------------------------------------------------
create or replace function public.set_cod_payment_status(
  p_order_id  uuid,
  p_paid      boolean,
  p_method    text default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order   orders%rowtype;
  v_pay     payments%rowtype;
  v_method  text := lower(nullif(trim(coalesce(p_method, '')), ''));
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN|Only an admin can change a payment.';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND|This order no longer exists.';
  end if;

  select * into v_pay
    from payments
   where order_id = p_order_id and provider = 'cod'
   order by created_at desc
   limit 1
   for update;
  if not found then
    raise exception 'NOT_COD|This order is not a Cash on Delivery order.';
  end if;

  if v_pay.status = 'refunded' then
    raise exception 'ALREADY_REFUNDED|This payment was already refunded, so its status can''t be changed.';
  end if;

  if p_paid then
    if v_order.status in ('cancelled', 'payment_failed') then
      raise exception 'ORDER_CANCELLED|A cancelled order can''t be marked paid.';
    end if;
    if v_method is not null and v_method not in ('cash', 'upi', 'other') then
      raise exception 'BAD_METHOD|Collection method must be cash, upi or other.';
    end if;

    -- Already paid -> nothing to do (double-click / two admins racing).
    if v_pay.status <> 'paid' then
      update payments
         set status            = 'paid',
             paid_at           = now(),
             collection_method = coalesce(v_method, 'cash'),
             provider_reference = nullif(trim(coalesce(p_reference, '')), '')
       where id = v_pay.id;
    end if;
  else
    -- Undo (recorded by mistake). Back to unpaid.
    if v_pay.status = 'paid' then
      update payments
         set status            = 'pending',
             paid_at           = null,
             collection_method = null,
             provider_reference = null
       where id = v_pay.id;
    end if;
  end if;

  return jsonb_build_object(
    'orderId', p_order_id,
    'paymentId', v_pay.id,
    'paid', p_paid
  );
end;
$$;

revoke all on function public.set_cod_payment_status(uuid, boolean, text, text)
  from public, anon;
grant execute on function public.set_cod_payment_status(uuid, boolean, text, text)
  to authenticated;

-- Helps the admin "COD unpaid" filter / dashboard total stay instant.
create index if not exists idx_payments_cod_status
  on payments (status)
  where provider = 'cod';

-- ============================================================================
-- End of Part 25. After running it:
--   1. Deploy the two updated edge functions so customers see the payment state:
--        supabase functions deploy get-orders-by-email --no-verify-jwt
--        supabase functions deploy get-order-status --no-verify-jwt
--   2. Admin → Orders: COD rows get a "Mark paid" button. Customers see
--      "Payment due ₹X" until you click it, then "Payment received".
-- ============================================================================

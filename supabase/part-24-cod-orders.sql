-- ============================================================================
-- LAGAMLESS — Part 24 migration: Cash on Delivery (COD) — complete lifecycle
--
-- Run this ONCE in the Supabase SQL Editor (after part-10 and the earlier
-- parts). Safe to re-run.
--
-- What it adds:
--   1. orders.delivery_method   — 'standard' | 'express' (what the customer picked)
--   2. orders.stock_reserved    — true while this order is holding stock, so a
--                                 cancelled order gives its stock back exactly
--                                 once and never twice.
--   3. orders.idempotency_key   — unique per checkout attempt. A double-click,
--                                 a retry after a flaky network, or a refresh
--                                 can never create two orders.
--   4. place_cod_order(...)     — ONE atomic transaction that locks the stock
--                                 rows, checks availability, decrements stock,
--                                 re-prices from the products table, and writes
--                                 orders + order_items + payments. Either the
--                                 whole order exists or nothing does — no
--                                 half-created orders, no overselling the last
--                                 item to two people at once.
--   5. A trigger on orders      — when status becomes:
--                                   'delivered' -> the COD payment is marked 'paid'
--                                                  (the cash was collected)
--                                   'cancelled' -> reserved stock is restored
--
-- Only the edge function (service role) may call place_cod_order — it is
-- explicitly NOT executable by anon/authenticated, so nobody can call it
-- straight from the browser to skip the server-side validation.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columns
-- ----------------------------------------------------------------------------
alter table orders add column if not exists delivery_method text not null default 'standard';
alter table orders add column if not exists stock_reserved boolean not null default false;
alter table orders add column if not exists idempotency_key text;

alter table orders drop constraint if exists orders_delivery_method_check;
alter table orders add constraint orders_delivery_method_check
  check (delivery_method in ('standard', 'express'));

create unique index if not exists idx_orders_idempotency_key
  on orders (idempotency_key)
  where idempotency_key is not null;

-- Speeds up the "too many open COD orders for this phone" abuse check below.
create index if not exists idx_orders_created_at on orders (created_at desc);

-- ----------------------------------------------------------------------------
-- 2. place_cod_order — atomic COD checkout
--
-- Errors are raised as  'CODE|human readable message'  so the edge function can
-- map them to the right HTTP status without string-guessing:
--   ITEM_UNAVAILABLE  (400)  product/size missing or not published
--   OUT_OF_STOCK      (409)  not enough stock
--   COD_LIMIT         (400)  order total above the configured COD cap
--   TOO_MANY_ORDERS   (429)  too many open COD orders for this phone/email
--   INVALID_TOTAL     (400)  total <= 0
-- ----------------------------------------------------------------------------
create or replace function public.place_cod_order(
  p_customer        jsonb,
  p_address         jsonb,
  p_items           jsonb,
  p_customer_id     uuid,
  p_shipping        numeric,
  p_delivery_method text,
  p_idempotency_key text default null,
  p_max_total       numeric default null,
  p_max_open_orders integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line      record;
  v_variant   record;
  v_lines     jsonb := '[]'::jsonb;
  v_subtotal  numeric(10, 2) := 0;
  v_total     numeric(10, 2);
  v_order_id  uuid;
  v_existing  orders%rowtype;
  v_open      integer;
  v_line_total numeric(10, 2);
  v_email     text := lower(trim(p_customer->>'email'));
  v_phone     text := trim(p_customer->>'phone');
begin
  -- Idempotent replay: same checkout attempt sent twice -> return the first order.
  if p_idempotency_key is not null then
    select * into v_existing from orders where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'orderId', v_existing.id, 'total', v_existing.total,
        'subtotal', v_existing.subtotal, 'shipping', v_existing.shipping_total,
        'duplicate', true
      );
    end if;
  end if;

  -- Abuse guard: cap how many still-unconfirmed COD orders one phone/email can
  -- have open at once (COD has the highest fake-order / return-to-origin rate).
  if p_max_open_orders is not null and p_max_open_orders > 0 then
    select count(*) into v_open
    from orders o
    join payments p on p.order_id = o.id and p.provider = 'cod'
    where o.status = 'pending'
      and o.created_at > now() - interval '24 hours'
      and (lower(o.customer_email) = v_email or o.shipping_address->>'phone' = v_phone);
    if v_open >= p_max_open_orders then
      raise exception 'TOO_MANY_ORDERS|You already have % open Cash on Delivery order(s) waiting for confirmation. Please wait for them to be confirmed, or pay online.', v_open;
    end if;
  end if;

  -- Lock + check + decrement stock for every line. Lines are merged per
  -- product+size and processed in a fixed order so two concurrent checkouts
  -- can never deadlock each other.
  for v_line in
    select (i->>'productId')::uuid as product_id,
           i->>'size'              as size,
           sum((i->>'quantity')::integer)::integer as qty
    from jsonb_array_elements(p_items) i
    group by 1, 2
    order by 1, 2
  loop
    select v.id as variant_id, v.stock, p.id as product_id, p.name, p.sku, p.price, p.status
      into v_variant
    from product_variants v
    join products p on p.id = v.product_id
    where v.product_id = v_line.product_id and v.size = v_line.size
    for update of v;

    if not found then
      raise exception 'ITEM_UNAVAILABLE|One of the items in your bag (size %) is no longer available.', v_line.size;
    end if;

    if v_variant.status <> 'published' then
      raise exception 'ITEM_UNAVAILABLE|% (size %) is no longer available.', v_variant.name, v_line.size;
    end if;

    if v_variant.stock < v_line.qty then
      raise exception 'OUT_OF_STOCK|% (size %): only % left in stock.', v_variant.name, v_line.size, v_variant.stock;
    end if;

    update product_variants set stock = stock - v_line.qty where id = v_variant.variant_id;

    v_line_total := round((v_variant.price * v_line.qty)::numeric, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_variant.product_id,
      'variant_id', v_variant.variant_id,
      'product_name', v_variant.name,
      'sku', v_variant.sku,
      'size', v_line.size,
      'quantity', v_line.qty,
      'unit_price', v_variant.price,
      'line_total', v_line_total
    );
  end loop;

  v_total := v_subtotal + coalesce(p_shipping, 0);

  if v_total <= 0 then
    raise exception 'INVALID_TOTAL|Order total must be greater than zero.';
  end if;

  if p_max_total is not null and v_total > p_max_total then
    raise exception 'COD_LIMIT|Cash on Delivery is available for orders up to Rs. %. Please pay online for this order.', p_max_total;
  end if;

  insert into orders (
    customer_id, customer_email, customer_name, status,
    subtotal, shipping_total, discount_total, total,
    shipping_address, delivery_method, stock_reserved, idempotency_key
  ) values (
    p_customer_id,
    trim(p_customer->>'email'),
    trim(concat_ws(' ', p_customer->>'firstName', p_customer->>'lastName')),
    'pending',
    v_subtotal, coalesce(p_shipping, 0), 0, v_total,
    p_address || jsonb_build_object('phone', v_phone),
    p_delivery_method, true, p_idempotency_key
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_id, variant_id, product_name, sku, size, quantity, unit_price, line_total
  )
  select v_order_id,
         (x->>'product_id')::uuid, (x->>'variant_id')::uuid,
         x->>'product_name', x->>'sku', x->>'size',
         (x->>'quantity')::integer, (x->>'unit_price')::numeric, (x->>'line_total')::numeric
  from jsonb_array_elements(v_lines) x;

  -- Cash not collected yet -> payment 'pending' (marked 'paid' by the trigger
  -- below once the admin marks the order delivered).
  insert into payments (order_id, provider, status, amount)
  values (v_order_id, 'cod', 'pending', v_total);

  return jsonb_build_object(
    'orderId', v_order_id, 'total', v_total,
    'subtotal', v_subtotal, 'shipping', coalesce(p_shipping, 0),
    'duplicate', false
  );

exception
  when unique_violation then
    -- Two identical requests raced past the idempotency check above; the loser
    -- lands here with ALL of its changes (including stock) rolled back. Hand
    -- back the winner's order.
    if p_idempotency_key is not null then
      select * into v_existing from orders where idempotency_key = p_idempotency_key;
      if found then
        return jsonb_build_object(
          'orderId', v_existing.id, 'total', v_existing.total,
          'subtotal', v_existing.subtotal, 'shipping', v_existing.shipping_total,
          'duplicate', true
        );
      end if;
    end if;
    raise;
end;
$$;

revoke all on function public.place_cod_order(jsonb, jsonb, jsonb, uuid, numeric, text, text, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.place_cod_order(jsonb, jsonb, jsonb, uuid, numeric, text, text, numeric, integer)
  to service_role;

-- ----------------------------------------------------------------------------
-- 3. Lifecycle trigger: delivered -> cash collected, cancelled -> stock back
--
-- BEFORE UPDATE so it can flip orders.stock_reserved on the same row without a
-- second UPDATE. SECURITY DEFINER so it works when an admin changes the status
-- from the browser (the admin's own RLS doesn't need to reach product_variants
-- or payments for this to work).
-- ----------------------------------------------------------------------------
create or replace function public.orders_cod_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'delivered' then
      update payments
         set status = 'paid'
       where order_id = new.id and provider = 'cod' and status = 'pending';
    end if;

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

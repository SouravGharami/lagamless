-- ============================================================================
-- LAGAMLESS — Part 14: sample orders (manual verification only)
--
-- Purpose: your /admin/orders page shows "No orders yet" because the
-- `orders` table genuinely has zero rows — no checkout has been completed
-- against this project, and seed.sql never seeded orders (it only seeds
-- products/categories). This script inserts 7 fake orders, one per status,
-- purely so you can confirm the page + every filter chip render real data
-- correctly. It uses no real product/customer IDs (product_id/customer_id
-- are left NULL, which the schema allows), so it's safe to run against any
-- project and easy to delete afterwards.
--
-- Run in the Supabase SQL Editor. Safe to re-run (it clears its own rows
-- first, tagged by customer_email like '%@sample-seed.test').
-- ============================================================================

delete from orders where customer_email like '%@sample-seed.test';

do $$
declare
  v_order_id uuid;
  v_status text;
  statuses text[] := array['pending', 'payment_failed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
begin
  foreach v_status in array statuses loop
    insert into orders (customer_email, customer_name, status, subtotal, shipping_total, discount_total, total, created_at)
    values (
      lower(v_status) || '@sample-seed.test',
      initcap(replace(v_status, '_', ' ')) || ' Sample',
      v_status,
      1999,
      0,
      0,
      1999,
      now() - (random() * interval '10 days')
    )
    returning id into v_order_id;

    insert into order_items (order_id, product_name, sku, size, quantity, unit_price, line_total)
    values (v_order_id, 'Sample Oversized Tee', 'SAMPLE-001', 'L', 1, 1999, 1999);
  end loop;
end $$;

-- ============================================================================
-- To remove the sample rows afterwards:
--   delete from orders where customer_email like '%@sample-seed.test';
-- (order_items cascades automatically via the FK's `on delete cascade`.)
-- ============================================================================

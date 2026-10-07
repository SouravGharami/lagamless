-- ============================================================================
-- LAGAMLESS — Part 26 migration: product REPLACEMENTS
--
-- Replacement is its own workflow, completely separate from returns/refunds.
-- This migration ONLY adds new objects — it does not alter public.returns,
-- any returns policy/grant, or any existing function.
--
--   requested --[Approve]--> approved --[Mark shipped]--> shipped
--                                                          --[Mark delivered]--> delivered
--   requested --[Reject]---> rejected   (rejection_reason saved)
--
-- A customer can only raise a replacement against a DELIVERED order, for the
-- SAME product they bought, choosing a different size and/or color that is
-- available (see the submit-replacement-request edge function, which
-- re-validates all of it server-side).
--
-- COLOR NOTE: checkout has never recorded which color a customer bought
-- (order_items has no color column and the cart doesn't carry one), so
-- `original_color` is always null today. `requested_color` null means
-- "keep the color I already have".
--
-- Access model (same as returns, see part-17/18/19):
--   * Customers never touch this table directly. They go through the
--     service-role edge functions (submit-replacement-request,
--     get-replacement-options, get-replacements-by-email).
--   * Admins read/update it as their own `authenticated` session, via the
--     admin RLS policy + table grant below.
--
-- STOCK: a replacement ships one more physical unit, so stock is reserved at
-- APPROVAL time, atomically, by approve_replacement() below (row-locked, so
-- two admins / a concurrent checkout can't both take the last unit).
--
-- Safe to re-run.
-- ============================================================================

create table if not exists public.replacements (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references public.orders (id) on delete cascade,

  -- Which line item is being replaced. `on delete set null` (not cascade) so
  -- the customer's request stays auditable, same reasoning as returns.
  order_item_id uuid references public.order_items (id) on delete set null,

  -- The product being replaced. Always the same product as the order item —
  -- the edge function takes it from order_items.product_id, never from the client.
  product_id uuid references public.products (id) on delete set null,

  customer_id uuid references public.profiles (id),
  customer_email text not null,

  original_size text,
  original_color text,            -- always null today, see COLOR NOTE above
  requested_size text not null,
  requested_color text,           -- null = keep the same color
  quantity integer not null default 1 check (quantity > 0),

  reason text not null
    check (reason in (
      'Wrong size',
      'Wrong color',
      'Damaged product',
      'Defective product',
      'Wrong item received',
      'Other'
    )),
  customer_note text,

  status text not null default 'requested'
    check (status in ('requested', 'approved', 'shipped', 'delivered', 'rejected')),
  rejection_reason text,

  -- True while this replacement is holding stock (set by approve_replacement).
  stock_reserved boolean not null default false,

  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_replacements_updated_at on public.replacements;
create trigger trg_replacements_updated_at
  before update on public.replacements
  for each row execute function public.set_updated_at();

create index if not exists idx_replacements_order_id on public.replacements (order_id);
create index if not exists idx_replacements_order_item_id on public.replacements (order_item_id);
create index if not exists idx_replacements_status on public.replacements (status);
create index if not exists idx_replacements_customer_email on public.replacements (lower(customer_email));

-- One live replacement per order item. Everything except `rejected` counts as
-- live, so a rejected request can be resubmitted but a delivered one can't be
-- repeated. This is the race-proof backstop for the edge function's own
-- duplicate check (two simultaneous submits -> the second gets a 23505).
create unique index if not exists uq_replacements_one_live_per_item
  on public.replacements (order_item_id)
  where order_item_id is not null and status <> 'rejected';

-- ----------------------------------------------------------------------------
-- Access: RLS on; admins only (customers use the service-role edge functions).
-- ----------------------------------------------------------------------------
alter table public.replacements enable row level security;

drop policy if exists "Admins can manage replacements" on public.replacements;
create policy "Admins can manage replacements"
  on public.replacements for all
  using (public.is_admin())
  with check (public.is_admin());

-- Base-privilege grant (needed in addition to RLS — see part-13 / part-19).
grant select, insert, update, delete on public.replacements to authenticated;

-- ----------------------------------------------------------------------------
-- approve_replacement — the ONLY way a replacement becomes 'approved'.
-- Locks the replacement and the target size's stock row, checks stock, takes
-- the units, and flips the status, all in one transaction.
-- ----------------------------------------------------------------------------
create or replace function public.approve_replacement(p_replacement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep     public.replacements%rowtype;
  v_variant record;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN|Only an admin can approve a replacement.';
  end if;

  select * into v_rep from public.replacements where id = p_replacement_id for update;
  if not found then
    raise exception 'NOT_FOUND|This replacement request no longer exists.';
  end if;

  -- Already approved (double-click / two admins racing): nothing to do.
  if v_rep.status = 'approved' then
    return jsonb_build_object('replacementId', v_rep.id, 'status', v_rep.status);
  end if;
  if v_rep.status <> 'requested' then
    raise exception 'BAD_STATE|Only a requested replacement can be approved (this one is %).', v_rep.status;
  end if;

  select id, stock into v_variant
    from public.product_variants
   where product_id = v_rep.product_id and size = v_rep.requested_size
   for update;
  if not found then
    raise exception 'OUT_OF_STOCK|Size % no longer exists for this product.', v_rep.requested_size;
  end if;
  if v_variant.stock < v_rep.quantity then
    raise exception 'OUT_OF_STOCK|Only % left in size % — not enough to send this replacement.',
      v_variant.stock, v_rep.requested_size;
  end if;

  update public.product_variants
     set stock = stock - v_rep.quantity
   where id = v_variant.id;

  update public.replacements
     set status = 'approved', stock_reserved = true, approved_at = now()
   where id = v_rep.id;

  return jsonb_build_object('replacementId', v_rep.id, 'status', 'approved');
end;
$$;

revoke all on function public.approve_replacement(uuid) from public, anon;
grant execute on function public.approve_replacement(uuid) to authenticated;

-- ============================================================================
-- End of Part 26. After running it:
--   1. Deploy the three new edge functions (see supabase/functions/README.md):
--        supabase functions deploy submit-replacement-request --no-verify-jwt
--        supabase functions deploy get-replacement-options --no-verify-jwt
--        supabase functions deploy get-replacements-by-email --no-verify-jwt
--   2. Delivered orders now show a "Replace" button; requests appear under
--      Admin -> Replacements.
-- ============================================================================

-- ============================================================================
-- LAGAMLESS — Part 28 migration: complete replacement lifecycle
--
-- Part 26 gave replacements a short flow (requested -> approved -> shipped ->
-- delivered) built around shipping the new item as soon as it was approved.
-- The real process needs the ORIGINAL item back and checked first:
--
--   requested            --[Approve]-----------------> awaiting_return
--   awaiting_return       --[Mark Return Received]----> return_received
--   return_received       --[Verification Passed]-----> replacement_processing
--   return_received       --[Verification Failed]-----> rejected  (rejection_reason saved, reserved stock released)
--   replacement_processing --[Ship Replacement]--------> replacement_shipped  (tracking saved, if given)
--   replacement_shipped   --[Mark Delivered]-----------> replacement_completed
--   requested             --[Reject]-------------------> rejected  (rejection_reason saved, unchanged from part-26)
--
-- This migration ONLY touches public.replacements and its two functions. It
-- does not add, alter, or touch public.returns, any returns policy/grant, or
-- any returns function — the return/refund workflow is completely untouched.
--
-- ----------------------------------------------------------------------------
-- Column plan — minimum additions, everything else is reused:
--   - `approved_at`   (existing, part-26) — still stamped by approve_replacement,
--                      now the moment the request enters `awaiting_return`.
--   - `return_received_at` (NEW) — stamped when an admin marks the original
--                      received back.
--   - `verified_at`   (NEW) — stamped when verification passes and the row
--                      moves to `replacement_processing`. A failed
--                      verification does NOT stamp this — it reuses the
--                      existing `rejection_reason` column instead (same
--                      pattern returns' inspection stage uses — see
--                      part-22-returns-inspection.sql's header note — one
--                      column means "why this ended in rejected" regardless
--                      of which stage the rejection happened at).
--   - `tracking_courier`, `tracking_id`, `tracking_url` (NEW) — the
--                      replacement shipment's tracking details, all
--                      optional/nullable ("if available" per spec). Same
--                      three column names orders already use for their own
--                      shipment tracking (part-16-order-tracking.sql), kept
--                      identical on purpose so the two features read the
--                      same way in the codebase.
--   - `shipped_at`, `delivered_at` (existing, part-26) — reused as-is for
--                      "Replacement Shipped" / "Replacement Completed".
--
-- ----------------------------------------------------------------------------
-- Status constraint: part-26 gave `replacements.status` an inline CHECK
-- constraint (unlike `returns.status`, which part-17 deliberately left
-- unconstrained for exactly this reason — see that migration's header note).
-- Renaming/extending the allowed values means replacing that constraint
-- rather than just adding to it, so this migration drops it in favour of the
-- same "unconstrained, validated in the app/edge functions" approach already
-- used for `returns.status` — one less migration needed the next time this
-- workflow grows a stage.
--
-- Existing rows are renamed to their new equivalent before the constraint is
-- dropped, so nothing is silently reinterpreted:
--   'approved'  -> 'awaiting_return'       (same meaning: approved, stock reserved)
--   'shipped'   -> 'replacement_shipped'
--   'delivered' -> 'replacement_completed'
--   'requested' / 'rejected' are unchanged.
--
-- Safe to re-run.
-- ============================================================================

alter table public.replacements drop constraint if exists replacements_status_check;

update public.replacements set status = 'awaiting_return'       where status = 'approved';
update public.replacements set status = 'replacement_shipped'   where status = 'shipped';
update public.replacements set status = 'replacement_completed' where status = 'delivered';

alter table public.replacements add column if not exists return_received_at timestamptz;
alter table public.replacements add column if not exists verified_at timestamptz;
alter table public.replacements add column if not exists tracking_courier text;
alter table public.replacements add column if not exists tracking_id text;
alter table public.replacements add column if not exists tracking_url text;

-- Same loose sanity check orders already use on their tracking_url (part-16).
alter table public.replacements drop constraint if exists replacements_tracking_url_check;
alter table public.replacements add constraint replacements_tracking_url_check
  check (tracking_url is null or tracking_url ~* '^https?://');

-- No RLS/grant changes needed: the existing "Admins can manage replacements"
-- `for all` policy + table grant from part-26 already cover every column on
-- this table, these new ones included.

-- ----------------------------------------------------------------------------
-- approve_replacement — now also validates the requested COLOR is still
-- offered (size+stock was already checked here; color wasn't), and lands the
-- request in 'awaiting_return' instead of 'approved'. Still the ONLY way a
-- replacement leaves 'requested' other than being rejected, and still
-- reserves stock atomically in the same transaction as before.
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
  if v_rep.status = 'awaiting_return' then
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

  -- Color wasn't stock-checked (product_colors carries no stock — it's a
  -- display swatch, see part-12), but it can have been discontinued on the
  -- product since the customer asked for it, so confirm it's still offered.
  if v_rep.requested_color is not null and not exists (
    select 1 from public.product_colors
     where product_id = v_rep.product_id and name = v_rep.requested_color
  ) then
    raise exception 'COLOR_UNAVAILABLE|"%" is no longer an available color for this product.', v_rep.requested_color;
  end if;

  update public.product_variants
     set stock = stock - v_rep.quantity
   where id = v_variant.id;

  update public.replacements
     set status = 'awaiting_return', stock_reserved = true, approved_at = now()
   where id = v_rep.id;

  return jsonb_build_object('replacementId', v_rep.id, 'status', 'awaiting_return');
end;
$$;

revoke all on function public.approve_replacement(uuid) from public, anon;
grant execute on function public.approve_replacement(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- fail_replacement_verification — the ONLY way a replacement in
-- 'return_received' becomes 'rejected'. Mirrors returns' "Inspection Failed"
-- (part-22): reuses `rejection_reason`, no new column. Unlike returns, a
-- replacement that fails verification is holding reserved stock (from
-- approve_replacement) that will now never ship — this function releases it
-- atomically in the same transaction, same row-locking discipline as
-- approve_replacement. Passing verification, by contrast, needs no stock
-- change and no new function — it's a plain guarded UPDATE from the app
-- layer (return_received -> replacement_processing), same as every other
-- forward step in this workflow.
-- ----------------------------------------------------------------------------
create or replace function public.fail_replacement_verification(p_replacement_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rep public.replacements%rowtype;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN|Only an admin can record a verification outcome.';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED|A reason is required when verification fails.';
  end if;

  select * into v_rep from public.replacements where id = p_replacement_id for update;
  if not found then
    raise exception 'NOT_FOUND|This replacement request no longer exists.';
  end if;

  -- Already recorded (double-click / two admins racing): nothing to do.
  if v_rep.status = 'rejected' then
    return jsonb_build_object('replacementId', v_rep.id, 'status', v_rep.status);
  end if;
  if v_rep.status <> 'return_received' then
    raise exception 'BAD_STATE|Only a request in Return Received can have its verification recorded (this one is %).',
      v_rep.status;
  end if;

  if v_rep.stock_reserved and v_rep.product_id is not null then
    update public.product_variants
       set stock = stock + v_rep.quantity
     where product_id = v_rep.product_id and size = v_rep.requested_size;
    -- Best-effort: if the variant itself was since deleted there's nothing
    -- to credit back, but the rejection still goes through below.
  end if;

  update public.replacements
     set status = 'rejected', rejection_reason = btrim(p_reason), stock_reserved = false
   where id = v_rep.id;

  return jsonb_build_object('replacementId', v_rep.id, 'status', 'rejected');
end;
$$;

revoke all on function public.fail_replacement_verification(uuid, text) from public, anon;
grant execute on function public.fail_replacement_verification(uuid, text) to authenticated;

-- ============================================================================
-- End of Part 28. After running it:
--   1. Redeploy the get-replacements-by-email edge function — its response
--      now includes the new fields (returnReceivedAt, verifiedAt,
--      trackingCourier, trackingId, trackingUrl):
--        supabase functions deploy get-replacements-by-email --no-verify-jwt
--   2. The admin Replacements page shows the full lifecycle: Approve now
--      leads to "Awaiting Return", followed by Mark Return Received, then
--      Verification (Passed/Failed), then Ship Replacement (with optional
--      tracking), then Mark Delivered.
--   3. Customers see the same stages, plus tracking details once shipped, on
--      their order's replacement timeline.
--   4. Returns/refunds (public.returns and everything in src/admin/pages/
--      AdminReturns.jsx) are completely unaffected.
-- ============================================================================

# Checkout + order edge functions

These Supabase Edge Functions power checkout, order lookup, and returns.
All of them run with the **service-role key** (auto-injected as
`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` by Supabase — you don't set
these) and are the *only* code path allowed to write to `orders` /
`order_items` / `payments` / `returns`. RLS on those tables stays fully
locked down (no client-facing insert/select policy exists) — that's
intentional, not unfinished: it means the service-role key, and therefore
pricing, order-state, and return-eligibility logic, never has to leave
this trusted environment.

| Function | Called by | Purpose |
|---|---|---|
| `create-razorpay-order` | Storefront, on "Pay now" | Re-prices the cart from the DB, creates the `orders`/`order_items`/`payments` rows (status `pending`), creates the matching Razorpay Order, returns what Checkout.js needs to open. |
| `create-cod-order` | Storefront, when the "COD" tab is selected and the customer clicks "Place your order" | Cash-on-Delivery counterpart to `create-razorpay-order`. Validates the request and prices shipping, then calls the `place_cod_order` Postgres function (part-24), which in ONE transaction re-prices the cart from the DB, reserves stock, and writes `orders`/`order_items`/`payments` (`payments.provider = 'cod'`). Retry-safe via an idempotency key. Never talks to Razorpay. Returns `{ orderId, amount, subtotal, shipping }`. |
| `verify-razorpay-payment` | Storefront, from Razorpay Checkout's `handler` callback | Verifies the payment signature + cross-checks the payment with Razorpay's API, updates `payments`/`orders`, and is what the frontend waits on to redirect to the success/failed page. |
| `razorpay-webhook` | Razorpay's servers | The **authoritative** source of truth — configure this URL in the Razorpay Dashboard. Handles `payment.captured` and `payment.failed`. Covers the case where the customer closes the tab before `verify-razorpay-payment` gets a chance to run. |
| `get-order-status` | Order Success / Order Failed pages | Read-only summary for a page refresh or shared link, when the router-state summary from just-completed checkout isn't available. |
| `get-orders-by-email` | "Track your order" (`/login` → OrderLookup.jsx) | Looks up every order for an email address (no password — see the function's own security note). |
| `submit-return-request` | The "Return" button's form (ReturnRequestDialog.jsx, from OrderLookup.jsx) | Validates order ownership/status/delivery date/return window/duplicate request, then inserts into `public.returns` with `status = 'requested'`. See supabase/part-17-returns-table.sql and part-18-returns-submit.sql. |
| `submit-replacement-request` | The "Replace" button's form (ReplacementRequestDialog.jsx, from OrderHistory.jsx) | Validates order ownership, that the order is **delivered**, that the item belongs to it, that the size is in stock and the color is offered **for the same product**, and that no live replacement / open return exists for the item; then inserts into `public.replacements` with `status = 'requested'`. See supabase/part-26-replacements.sql. |
| `get-replacement-options` | The Replace dialog, on open | Read-only. Per item on a delivered order: sizes (with an in-stock flag), colors, and a `blockedReason` if it can't be replaced. Uses the same helpers as the submit function (`_shared/replacements.ts`). |
| `get-replacements-by-email` | Order cards (OrderHistory.jsx) | Read-only list of a customer's replacement requests + status, for the order/account page. Separate from `get-orders-by-email`, which is untouched. |
| `initiate-return-refund` | The **admin-only** "Initiate Refund" button on `/admin/returns` (AdminReturns.jsx), for a return that is `refund_pending` | Looks up the related payment's `razorpay_payment_id`, re-verifies it's eligible for a refund directly against Razorpay's API, calls Razorpay's Refund API (Test Mode), and on success sets the return's `status` to `refunded` and saves `refund_id`/`refund_amount`/`refunded_at`. On failure, `status` stays `refund_pending` and `refund_failure_reason` is saved. See supabase/part-23-returns-refund.sql. For a Cash on Delivery order there is no Razorpay payment, so it instead records a manual UPI/bank-transfer refund (the admin enters the transfer reference). Unlike every other function above, this one requires the caller to be a signed-in admin (checked inside the function — see `getAdminUserIdFromRequest` in `_shared/supabaseAdmin.ts`), because it moves real money. |

## One-time setup

1. Run `supabase/schema.sql`, `supabase/seed.sql`, the `part-08b*` files,
   `part-09-performance-indexes.sql`, then `part-10-razorpay-checkout.sql`
   (in that order) in the Supabase SQL Editor, if you haven't already.
   For Cash on Delivery also run `part-24-cod-orders.sql` — it adds the atomic
   `place_cod_order` function and the cancelled-stock trigger that
   `create-cod-order` depends on — and then `part-25-cod-manual-payment.sql`,
   which makes COD payment a manual "Mark paid" step in the admin panel
   (delivery no longer auto-marks the payment paid). Run part-25 BEFORE
   re-deploying `get-order-status` / `get-orders-by-email`, which now read
   `payments.paid_at`.
2. Get your Razorpay **Key ID** and **Key Secret** (Razorpay Dashboard →
   Settings → API Keys). Use the **Test Mode** pair while developing.
3. Set the function secrets (from the project root, with the Supabase CLI
   logged in and linked):
   ```bash
   supabase secrets set RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
   supabase secrets set RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
   ```
4. Deploy the functions:
   ```bash
   supabase functions deploy create-razorpay-order
   supabase functions deploy create-cod-order
   supabase functions deploy verify-razorpay-payment
   supabase functions deploy razorpay-webhook --no-verify-jwt
   supabase functions deploy get-order-status --no-verify-jwt
   supabase functions deploy get-orders-by-email --no-verify-jwt
   supabase functions deploy submit-return-request --no-verify-jwt
   supabase functions deploy submit-replacement-request --no-verify-jwt
   supabase functions deploy get-replacement-options --no-verify-jwt
   supabase functions deploy get-replacements-by-email --no-verify-jwt
   supabase functions deploy initiate-return-refund
   ```
   (Re-deploy `get-order-status` and `get-orders-by-email` too if you're updating an
   existing project — they report the payment method for COD orders.)

   Optional COD settings (`supabase secrets set NAME=value`):
   - `COD_MAX_ORDER_TOTAL` — refuse COD above this order total (e.g. `10000`). Unset = no cap.
   - `COD_MAX_OPEN_PER_CONTACT` — max unconfirmed COD orders per phone/email in 24h. Default `5`.

   `--no-verify-jwt` is required on `razorpay-webhook` (Razorpay calls it
   with no Supabase auth header at all — the webhook signature check inside
   the function is what authenticates the request instead) and on
   `get-order-status`, `get-orders-by-email`, `submit-return-request`, and the three
   replacement functions
   (guest customers with no session still need to look up orders and
   request a return).

   `initiate-return-refund` is deliberately deployed WITHOUT
   `--no-verify-jwt` — it must run with the service-role key (to reach
   `RAZORPAY_KEY_SECRET`), but only a signed-in admin may call it, and
   Supabase's own JWT check is the first gate before the function's own
   `profiles.role = 'admin'` check even runs.
5. In the Razorpay Dashboard → Settings → Webhooks, add a webhook pointing
   at `https://<project-ref>.supabase.co/functions/v1/razorpay-webhook`,
   subscribed to at least `payment.captured` and `payment.failed`. Copy the
   **Webhook Secret** it gives you and set it too:
   ```bash
   supabase secrets set RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxx
   ```
6. Nothing to add to the frontend `.env` — `create-razorpay-order` returns
   the Key ID in its response, so `RAZORPAY_KEY_ID` set in step 3 is the
   only place it's configured. The frontend never reads a Razorpay key
   from its own env.

## Local testing

`supabase functions serve` runs all four locally. Razorpay's Checkout.js
still talks to Razorpay's real API even in local/test mode, so you can run
an end-to-end test with a Razorpay test card without deploying anything.
The webhook won't reach `localhost` from Razorpay's servers though — use
the Razorpay Dashboard's "Test Webhook" button, or a tunnel (e.g. `ngrok`),
if you need to exercise that path locally.

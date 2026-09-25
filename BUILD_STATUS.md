# LAGAMLESS — Build Status

**Part completed:** 10 — Razorpay checkout (orders, payments, and the success/failed hand-off finally go live)
**Status:** Checkout now writes real data and takes real payments. **New:** `supabase/part-10-razorpay-checkout.sql` (adds `payment_failed` to `orders.status`, adds Razorpay-specific columns to `payments`, adds a unique index on `payments.razorpay_order_id` for idempotency). **New — `supabase/functions/`** (Deno Edge Functions, service-role, the only code path allowed to write `orders`/`order_items`/`payments`; see `supabase/functions/README.md` for full deploy/secrets instructions): `create-razorpay-order` re-prices every cart line from `products`/`product_variants` (never trusts a client-sent price or total), checks stock, creates the `orders`+`order_items`+`payments` rows as `pending`, and creates the matching Razorpay Order; `verify-razorpay-payment` is called the instant Razorpay Checkout's `handler` fires, verifies the HMAC signature, cross-checks the payment against Razorpay's own API (status/amount/order id), and updates the order/payment rows; `razorpay-webhook` is the **authoritative** path (registered in the Razorpay Dashboard), handling `payment.captured`/`payment.failed` server-to-server so a customer closing the tab mid-payment still resolves correctly; `get-order-status` is a read-only summary for the new confirmation pages. **`src/pages/Checkout.jsx`** — the "Payment is coming soon" placeholder is replaced with a real "Pay now" button (`src/services/checkout.js` orchestrates create-order → open Razorpay Checkout.js (lazy-loaded via `src/lib/razorpay.js`) → verify → redirect); the cart is only cleared on a confirmed payment, never on a failed/cancelled one, so a failed attempt leaves the customer able to retry without re-entering anything (their form is still in `sessionStorage`, their cart is still intact). **New pages:** `src/pages/OrderSuccess.jsx` and `src/pages/OrderFailed.jsx` (+ shared `OrderStatus.css`), routed at `/order/success/:orderId` and `/order/failed/:orderId`, both backed by `get-order-status` so a refresh or shared link still resolves correctly instead of depending on in-memory router state. **Admin:** `StatusBadge.jsx` and `AdminOrders.jsx`'s status filter chips gained the new `payment_failed` variant so it doesn't fall through to an unstyled generic label. `src/services/adminOrders.js`'s header comment is corrected — it no longer says checkout doesn't create real orders yet.
**Deliberately not done:** shipping cost calculation (`orders.shipping_total` is written as `0`, matching the Checkout page's existing "To be calculated" copy — this part didn't touch that), a customer-facing order-history view (Account page is unchanged), and any RLS policy opening direct client access to `orders`/`order_items`/`payments` — every read/write for checkout goes through the four service-role edge functions instead, so the deny-by-default RLS Part 08B-2A left in place stays exactly as it was.

**Build verification:** No network access in this sandbox for `npm install`/Supabase CLI/Deno, so the edge functions could not be locally `supabase functions serve`'d or deployed from here, and `npm run build`/`npm run lint` could not be run. In its place: every new/changed `.jsx`/`.js` file was reviewed by hand for import-path correctness, hook rules, and brace/paren balance; every edge function was reviewed for Deno-specific concerns (raw-body-before-parsing for the webhook's signature check, `Deno.serve` signature, `esm.sh` import pins). This is **not** a substitute for running `npm run build && npm run lint`, and critically not a substitute for an actual end-to-end test against a real Razorpay test-mode account before this goes anywhere near production — **please run both, and a real test payment, yourself** before merging.

---

**Part completed:** 09H — Homepage Visual Redesign (full 12-section editorial spec)
**Status:** The homepage already had 8 of the 12 spec sections built (`Hero`, `BrandStatement`, `FeaturedProducts`, `ProductPhilosophy`, `OversizedChoice`, `Manifesto`, `CampaignEditorial`, `ShopCTA`); the header and footer were already redesigned to the same premium-editorial standard and were left untouched. This part fills the remaining gaps and reorders `Home.jsx` into the brief's narrative flow. **New section components:** `src/components/home/CollectionIntro.jsx` (spec §03 — "The current edit," a pure editorial hand-off with no product data), `src/components/home/ProductSpotlight.jsx` (spec §04 — a single garment presented as an object being exhibited, pulling the top result of the existing `getFeaturedProducts()` call and linking to the real `/product/:slug` route — no hardcoded product), `src/components/home/LookEditorial.jsx` (spec §09 — an overlapping styled-look composition with a "Shop the look" CTA, kept visually distinct from the §06 contact-sheet section so the two don't read as duplicates), `src/components/home/AttitudeIndex.jsx` (spec §10 — "Shop by attitude," five curated tiles that are presentation-only and link to the existing `/shop` route; per the brief's own fallback instruction, these are **not** wired to fake categories or URL params, because `Shop.jsx`'s filters are local component state with no query-string support today — wiring that up would have been a `Shop.jsx` business-logic change, which was out of scope). **Enhanced existing sections:** `CampaignEditorial` (spec §06) gained a third "detail" image toward the requested contact-sheet feel plus its eyebrow copy; `ProductPhilosophy` (spec §07) gained the hover-reveals-an-image behavior the brief explicitly asked for, which required one small additive fix to the shared `Reveal.jsx` (it wasn't forwarding arbitrary props like `onMouseEnter`/`onMouseLeave` to the rendered tag — now it spreads `...rest`, which is backward compatible with every existing call site). `src/data/homeImages.js` gained new named image slots (`collectionIntro`, `campaignDetail`, `lookPrimary`, `lookSecondary`, five `attitude*` slots) — all `src: null` placeholders rendering the shared `EditorialImage` treatment, same as every pre-existing slot, ready for real campaign photography to be dropped in later with no component changes. `Home.jsx` was reordered (not rewritten from scratch) to: Hero → BrandStatement → OversizedChoice → CollectionIntro → ProductSpotlight → FeaturedProducts → CampaignEditorial → ProductPhilosophy → Manifesto → LookEditorial → AttitudeIndex → ShopCTA. No routing, Supabase query, cart, auth, or admin logic was touched.

**Build verification:** No network access in this sandbox (`npm install` returns `403 Forbidden` from `registry.npmjs.org`), so a real `npm install && npm run build && npm run lint` could not be run here — **please run those yourself** before merging. In its place: an `esbuild` binary already present in this environment (bundled with a globally-installed `tsx`) was used to parse/transform every `.jsx`/`.js` file under `src/` with JSX-automatic mode — this catches real syntax errors (unclosed tags, bad braces, invalid JS) even though it can't resolve `node_modules` imports or run the React-specific oxlint rules. Every file in the project parsed clean, not just the ones touched this part. Every relative import path in every new/changed file was additionally cross-checked programmatically against the actual directory structure, and every `HOME_IMAGES.<key>` reference used across `components/home/*` was cross-checked against the keys actually defined in `data/homeImages.js` — no missing keys, no missing files. All CSS files in `src/` were checked for balanced braces. `react/rules-of-hooks` was checked by hand for the two files with new hooks (`ProductSpotlight.jsx`, `ProductPhilosophy.jsx`): both call their hooks unconditionally before any early return, so there's no conditional-hook violation.

---

**Part completed:** 08B-2B-2 — Admin Orders, Admin Customers, Admin Dashboard completion, Admin Settings
**Status:** All four remaining Part 08B-2B-2 screens are now real, Supabase-backed admin pages with no local-only or fabricated data. **New:** `src/services/adminOrders.js` (`getOrders`, `getOrder` — reads `orders` joined with `order_items`/`payments`) and `src/services/adminCustomers.js` (`getCustomers`, `getCustomerCount` — reads `profiles`, aggregates order counts/totals from `orders` client-side). `AdminOrders.jsx` and `AdminCustomers.jsx` are rewritten from Part 07 empty-state placeholders into real list/search/filter screens with loading, error, and (two distinct) empty states — an empty order list is still the expected, correct result today, since checkout doesn't create real orders yet (Part 09). `AdminDashboard.jsx` now catches rejected promises from both `getProducts()` and the new `getCustomerCount()` independently (a failure in one no longer leaves the other stuck at "—"), the "drawn from the local product catalog" copy is corrected to say Supabase, and a real "Total customers" stat was added — "Total orders"/"Pending orders"/"Revenue" deliberately stay "Not available yet" per the brief, since no order-write path exists yet. `AdminSettings.jsx` is rewritten from a local-only fake "store settings" form into a real authenticated-admin account view built on the existing `useAuth()`/`profiles` architecture: email (from Supabase Auth), role and profile name (from `profiles`, with a real edit path through the existing `updateMyProfile()`), account-created/last-signed-in timestamps, and a working logout — no new database table, no fake persistence, no payment/shipping credential fields anywhere.

**Build verification:** No network access in this sandbox (`npm install` returns `403 Forbidden` from `registry.npmjs.org` for every package, including `esbuild` — confirmed by two separate attempts — and no `node_modules` exists here to fall back on), so `npm install`, `npm run build`, and `npm run lint` could not be executed, and unlike the previous part's writeup, `esbuild` itself could not be installed to syntax-check with either. In its place: every new/changed file was reviewed by hand against React/JSX syntax (brace/paren/bracket balance, hook rules, JSX tag closure), and a small custom brace-balance script was run over every touched file as a mechanical cross-check (two files initially flagged an "unclosed" bracket — both were false positives from apostrophes inside JSX text, e.g. "aren't"/"You'll", being misread as string delimiters by the naive checker; both were manually re-verified line-by-line and are correctly balanced). Every import path in every new/changed file was manually traced against the actual directory structure (e.g. `src/admin/pages/AdminOrders.jsx` → `../../services/adminOrders.js` → `src/services/adminOrders.js`) and against the target file's actual exports. This is **not** a substitute for a real `npm install && npm run build && npm run lint` — **please run those yourself** before merging; given the scope of the changes (four page-level files + two new pure-Supabase service files, no changes to build config, dependencies, or shared primitives), any issue that surfaces should be small.

---

## Part 10 — what changed

### 1. `supabase/part-10-razorpay-checkout.sql` — schema catch-up
Three changes, all additive and re-runnable: (a) `orders.status`'s check constraint gains `payment_failed`, a distinct state from `cancelled` — a failed payment attempt doesn't mean the customer gave up on the order, and the Failed page's "Try payment again" button re-runs checkout against the same intent; (b) `payments` gains `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`, `error_code`, `error_description`, `raw_response` — everything the edge functions below need to read/write, and nothing they don't (no card numbers or other cardholder data ever touch this table, since Razorpay Checkout.js handles those directly with Razorpay's own servers); (c) a unique partial index on `payments.razorpay_order_id` (`where razorpay_order_id is not null`) so `verify-razorpay-payment` and `razorpay-webhook` — which race each other by design — can never produce two payment rows for the same attempt.

### 2. `supabase/functions/` — four new Edge Functions (service-role)
Full walkthrough in `supabase/functions/README.md`, including deploy commands and which two functions need `--no-verify-jwt`. Shared helpers live in `supabase/functions/_shared/`: `cors.ts` (consistent CORS headers + a `jsonResponse` wrapper), `supabaseAdmin.ts` (the service-role client, plus `getUserIdFromRequest()` — resolves an optional logged-in customer's id from the Authorization header without erroring for guests), `razorpay.ts` (a small `fetch`-based wrapper around the Orders/Payments REST API — no Razorpay SDK dependency, since it isn't published for Deno — plus the HMAC-SHA256 signature helpers, built on Web Crypto's `crypto.subtle`, and a constant-time string-compare so a signature check can't be timed).

- **`create-razorpay-order`** — the only place order pricing is decided. Validates the request shape, then re-fetches every cart line's product (published-only) and variant (stock check included) from the database and recomputes `unit_price`/`line_total`/`subtotal`/`total` from scratch — a client-tampered price or line total is simply never read. Inserts `orders` (`status: 'pending'`) + `order_items`, creates the matching Razorpay Order via the REST API, inserts the `payments` row (`status: 'pending'`), and returns exactly what Razorpay Checkout.js needs (`razorpayOrderId`, `amount` in paise, `keyId`, a `prefill` block) — never the Key Secret. If the Razorpay API call itself fails after the DB rows exist, the order is marked `payment_failed` rather than left in a silent `pending` limbo.
- **`verify-razorpay-payment`** — called from the frontend the instant Checkout.js's `handler` fires, so the customer gets an immediate redirect rather than waiting on the webhook round-trip. Verifies `HMAC(order_id|payment_id, key_secret)` against the signature Razorpay handed back, then — because a well-formed signature alone isn't proof of the right amount or status — fetches the Payment from Razorpay's own API and cross-checks `status`/`amount`/`order_id` before marking anything paid. Idempotent: if the payment's already settled (the webhook beat it there), it just reports the current state instead of redoing the work.
- **`razorpay-webhook`** — the authoritative path; register its URL in the Razorpay Dashboard, subscribed to `payment.captured`/`payment.failed`. Verifies `x-razorpay-signature` against the **raw** request body (parsing to JSON first and re-serializing to check the signature would silently break this, since byte-for-byte the re-serialized JSON is not guaranteed to match what Razorpay actually signed) before touching anything. This is what governs an order's final state if the customer's browser dies mid-payment before `verify-razorpay-payment` gets a chance to run — both functions write through the exact same idempotent upsert keyed on `razorpay_order_id`, so it doesn't matter which one gets there first.
- **`get-order-status`** — read-only summary (`status`, items, totals, shipping address) for the two new confirmation pages, for the case where they load without the in-memory context from just finishing checkout (a refresh, a bookmarked link). No RLS gate — reachable by anyone holding the order's UUID, which is the standard, intentional trade-off for a guest-checkout confirmation page (a v4 UUID isn't guessable); it deliberately still never returns anything from `payments` beyond a bare status string.

### 3. `src/pages/Checkout.jsx` + `src/services/checkout.js` — the real payment flow
`src/services/checkout.js` is new and holds all the orchestration: `createCheckoutOrder()` calls `create-razorpay-order`, `verifyCheckoutPayment()` calls `verify-razorpay-payment`, `getOrderStatus()` calls `get-order-status`, and `payWithRazorpay()` ties them together — creates the order, lazy-loads Checkout.js (`src/lib/razorpay.js`, new — the script is only fetched when a customer actually clicks "Pay now", not on every page load), opens the Razorpay modal, and resolves `{ outcome: 'paid' | 'failed', orderId }` whether the customer pays, fails, or just closes the modal (closing is treated the same as a failed attempt — the order already exists as `pending`, so a clear next step matters more than a silent return to the form). `Checkout.jsx`'s `ReviewPanel` no longer says "Payment is coming soon" — it has a real "Pay now" button wired to `payWithRazorpay()`, a loading state, and an inline error state for the (rare) case where even *starting* payment fails. The cart is only cleared (`clearCart()`, plus dropping the saved form from `sessionStorage`) on a confirmed `'paid'` outcome — a failed or cancelled attempt leaves both untouched, so `OrderFailed.jsx`'s "Try payment again" link back to `/checkout` has a fully prefilled form and an intact cart waiting for it.

### 4. `src/pages/OrderSuccess.jsx` / `src/pages/OrderFailed.jsx` — new
Both are routed with an `:orderId` param (`/order/success/:orderId`, `/order/failed/:orderId`) and call `getOrderStatus()` on mount rather than relying on router state, so they render correctly even from a refresh. Success shows the order id, a real items/totals breakdown, and the delivery address; a load failure for the summary doesn't block the page — the confirmation itself already happened, so it degrades to "here's your order number, hang onto it" rather than looking like the order failed. Failed explains nothing was charged and the cart is untouched, offers "Try payment again" (→ `/checkout`) and "Review your bag" (→ `/cart`) — except in the one edge case where the order actually did confirm by the time the page loads (the webhook beat the redirect), where it swaps the messaging and drops the retry button rather than inviting a double payment.

### 5. Admin — small compatibility additions, not new features
`StatusBadge.jsx` gained a `payment_failed` variant (negative/red, "Payment failed") and `AdminOrders.jsx`'s status filter chips gained the matching entry — without this, a payment-failed order would've rendered with the generic fallback badge (the raw enum value as its own label) instead of a designed one. `src/services/adminOrders.js`'s header comment, which said "checkout doesn't create real orders yet (Part 09)", is corrected to reflect that it now does — no logic in that file changed, `getOrders()`/`getOrder()` already read the real shape.

### What remains
- Shipping cost calculation — `shipping_total` is written as `0` by `create-razorpay-order`, same "To be calculated" state Checkout's UI has shown since Part 06; nothing in this part touches shipping rates.
- A customer-facing order-history view on `/account` — customers currently have no in-app way to look up a past order by anything other than the confirmation URL they were redirected to (or a receipt you send them separately).
- Refunds/cancellations — `payments.status` already has a `refunded` value and `orders.status` has `cancelled`, but nothing here writes either one; that's a distinct admin-initiated flow, not part of checkout.
- Any RLS policy for customer-facing reads/writes on `orders`/`order_items`/`payments` — intentionally still not added (see the top summary). If a future part wants customers to browse their own order history directly against Supabase rather than through an edge function, that's exactly the kind of scoped policy Part 08B-2A's `is_admin()`-style approach was built to extend into.

---

## Part 08B-2B-2 — what changed

### 1. `src/services/adminOrders.js` — new, real Supabase, read-only
`getOrders()` selects `*, order_items(*), payments(*)` from `orders`, ordered newest-first; `getOrder(id)` fetches one. Both map the Postgres row shape onto a small camelCase shape the UI consumes (`customerName`, `shippingTotal`, `items[]`, `payments[]`, etc.). Both throw a clear "Supabase is not configured" error (via the same `requireSupabase()` pattern as `adminProducts.js`) rather than silently returning empty data if the project isn't configured — an empty *result* from a working query (no orders exist yet) and a *failure to query at all* are kept distinguishable to the caller.

### 2. `src/services/adminCustomers.js` — new, real Supabase, read-only
`getCustomers()` runs two queries in parallel — `profiles` (id/full_name/phone/role/created_at) and `orders` (customer_id/total/subtotal) — and aggregates order count + total spent per customer client-side (one query for all orders, not one per customer). `getCustomerCount()` is a lightweight `count: 'exact', head: true` query used by the dashboard so it doesn't have to pull every profile + aggregate orders just to show one number.

**Security note, stated directly in the file:** every row returned by `getCustomers()` has `email: null`. `profiles` has no `email` column — email lives in Supabase Auth's `auth.users` table, which this frontend must never query directly (the brief's explicit instruction). Exposing it would require a secure server-side function (e.g. a Supabase Edge Function using the service-role key, which must never run in a frontend bundle) — out of scope here. `AdminCustomers.jsx` states this in its own page copy rather than silently omitting the column with no explanation.

### 3. `AdminOrders.jsx` — rewritten, real data
Replaces the Part 07 empty-`<tbody>` placeholder. Loading state → error state (Supabase failures shown inline, table not rendered) → two distinct empty states ("No orders yet" when the table is genuinely empty vs. "No orders match this view" when a search/filter has zero hits) → real table. Columns: Order # (first 8 chars of the UUID, uppercased), Customer (name + email if present, else "Guest"), Date, Items (product name × quantity × size per line), Total (falls back to "{subtotal} (subtotal)" when `total` is still `null` — never silently substitutes subtotal *as* the total), Payment (from the joined `payments` row's `status`, or "Not available" when no payment row exists yet — which is every order today), and Status (`StatusBadge`, reusing the exact six values `orders.status` is constrained to in `schema.sql`). Search matches order ID/customer name/customer email; status filter chips reuse the same six statuses. Because checkout doesn't write real orders yet, an empty list is the correct, expected result against a real project today — this page does not invent sample rows to look "done."

### 4. `AdminCustomers.jsx` — rewritten, real data
Same loading/error/two-empty-states/table structure. Columns: Name, Role (`StatusBadge`, new `admin`/`customer` variants — see below), Phone, Orders (count), Total spent (only shown once `orderCount > 0`, otherwise "—", so a customer with zero orders never displays a fabricated "₹0"), Joined. No Email column — see the security note above; the page header explains why in plain language instead of a silent gap. Search matches customer name only (there is no email to search against).

### 5. `AdminDashboard.jsx` — completed
- `getProducts()` and the new `getCustomerCount()` now run independently, each with its own `.catch()`, so a failure in one metric no longer leaves *both* stuck at "—" — each surfaces its own inline error message and the other metric still resolves normally if only one Supabase call fails.
- Copy corrected: "drawn from the local product catalog" → "drawn live from Supabase."
- **New:** a real "Total customers" stat card, backed by `getCustomerCount()` (a genuine `profiles` count where `role = 'customer'`).
- "Total orders", "Pending orders", and "Revenue" remain explicit "Not available yet" cards, per the brief's instruction to keep order/revenue metrics unavailable until the payment/order system is properly implemented — even though a literal `count(*)` on the (currently empty) `orders` table would technically "work," showing it before checkout can create real orders would invite exactly the kind of misleading-metric the brief warns against elsewhere. The Revenue card's label was also changed to "Revenue (captured payments)" to make explicit, once payments do exist, that this will be actual captured-payment revenue rather than order-total revenue (which can include unpaid/cancelled orders) — the distinction the brief asks to keep clear.

### 6. `AdminSettings.jsx` — rewritten, real authenticated-admin account view
The Part 07 local-only "store settings" form (store name/email/phone/address, currency, low-stock threshold, inert shipping/payments placeholder sections, a "Saved for this session only" fake-submit notice) is replaced entirely with a real account view built on the auth architecture that already exists:
- **Email** — `user.email` from `useAuth()`'s live Supabase Auth session (read-only; email changes aren't in scope here).
- **Role** — `profile.role` from the same `profiles` row `AdminRoute` already gates on (read-only; role changes are an admin-to-admin operation with no UI anywhere in this project, per Part 08B-1/2A's explicit design — this page doesn't add one).
- **Profile name** — `profile.full_name`, with a real "Edit profile name" action that calls the existing `updateMyProfile()` from `services/profiles.js` — a genuine Supabase write, not a local-only stand-in, reusing a function that already existed and was already scoped to "can only touch your own row" via RLS.
- **Account created / Last signed in** — timestamps from `profile.created_at`/`user.last_sign_in_at`.
- **Log out** — calls the same `signOut()` `AdminLayout`'s sidebar button already uses.
- **Shipping & payments** — kept as a clearly-labeled "coming in Part 09" section, same as before, and still explicitly states no API keys or credentials are collected anywhere in this panel. No settings table was created; nothing here is invented or session-only.

### 7. `StatusBadge.jsx` — extended, not replaced
Added four `payments.status` variants (`authorized`/`paid`/`failed`/`refunded`, matching `schema.sql`'s check constraint exactly) for `AdminOrders`' Payment column, and two profile-role variants (`admin`/`customer`) for `AdminCustomers`' Role column. Every existing variant (`published`/`draft`/the five stock states/the six order statuses) is unchanged.

## Files touched in Part 08B-2B-2

```
NEW      src/services/adminOrders.js         (getOrders, getOrder — real Supabase, read-only)
NEW      src/services/adminCustomers.js      (getCustomers, getCustomerCount — real Supabase, read-only)
REWRITTEN  src/admin/pages/AdminOrders.jsx     (real orders list, search, status filter, loading/error/empty states)
REWRITTEN  src/admin/pages/AdminCustomers.jsx  (real customer list, search, loading/error/empty states)
CHANGED  src/admin/AdminDashboard.jsx         (independent error handling, corrected copy, + Total customers stat)
REWRITTEN  src/admin/pages/AdminSettings.jsx  (real authenticated-admin account view, replacing fake local settings)
CHANGED  src/admin/components/StatusBadge.jsx (+ payment-status variants, + admin/customer role variants)
CHANGED  BUILD_STATUS.md
```

No file outside this list was touched. `AdminInventory.jsx`, `AdminProducts.jsx`, `ProductForm.jsx`, `ImageSlotManager.jsx`, every service from Part 08B-2B-1, every auth file from Part 08B-1/2A, and the entire customer-facing storefront were **not modified**.

## What remains after Part 08B-2B-2

- Real order **creation** (checkout writing to `orders`/`order_items`) — Part 09. Until then, `AdminOrders`' correctly-empty list is expected, not a bug.
- Payment gateway integration (Razorpay/Cashfree/etc.) writing to `payments` — Part 09. Until then, `AdminOrders`' Payment column will keep showing "Not available" for every row, and the dashboard's Revenue card will keep showing "Not available yet."
- Shipping provider integration — Part 09.
- A secure, server-side way to expose customer email to the admin panel (e.g. a Supabase Edge Function using the service-role key) — deliberately not built in this part, since doing it safely is a distinct piece of backend work, not a frontend query change.
- An admin-facing role-promotion UI (promote a customer to admin) — still dashboard/SQL-editor only, per Part 08B-2A's explicit design; `AdminSettings.jsx`'s Role field is read-only by design, not an oversight.
- A real `npm install && npm run build && npm run lint` run in an environment with network access — this sandbox could not reach the npm registry for any package, including `esbuild` (see "Build verification" above).

## Important technical decisions (Part 08B-2B-2)

- **Two independent `.catch()`s on the dashboard, not one shared error state** — `getProducts()` and `getCustomerCount()` are unrelated queries against unrelated tables; coupling their error handling would mean a customers-table hiccup incorrectly blanks out working product stats (or vice versa).
- **Customer email is `null`, explained, not silently dropped or guessed** — `services/adminCustomers.js`'s doc comment and `AdminCustomers.jsx`'s own page copy both state *why* the column is empty (auth.users is off-limits to the browser), rather than leaving a blank column an admin might mistake for a bug or a loading failure.
- **Order/customer aggregation happens in one extra query, not N+1** — `getCustomers()` fetches every relevant `orders` row once and reduces it in JS, rather than querying `orders` once per customer; at this project's scale that's both simpler and cheaper than a Postgres-side `group by` via PostgREST's aggregate functions.
- **"Total customers" is safe to show live; "Total orders"/"Revenue" deliberately are not, even though both are just as real** — the brief specifically asked to keep order/revenue metrics unavailable until the payment/order system exists, precisely because a `count(*)` of 0 real orders reads very differently on a dashboard next to real product stats. A customer count doesn't carry that same risk of being misread as "the store has processed 0 orders" when actually "the store can't process orders yet."
- **Settings became an account page, not a stripped-down settings page** — the brief's "no fake persistent settings, no settings table unless there's a strong reason" ruled out keeping any version of the old store-configuration form (it was always local-only and always going to stay that way until real settings requirements exist), so this part replaces it with the one thing that *is* real and useful today: the admin's own authenticated account, using infrastructure that already exists.
- **Editing the profile name reuses `updateMyProfile()` rather than adding a new update path** — that function already existed (Part 08B-1), was already correctly scoped by RLS to "only your own row," and already refuses to accept a `role` field — reusing it here means Settings' one piece of real interactivity carries zero new security surface.

---

## Part 08B-2B-1 — what changed

### 1. `src/services/adminProducts.js` — full rewrite, real Supabase, no local fallback
Every function now talks directly to Postgres:
- `getProducts()` / `getProduct(id)` — select with `product_images(*), product_variants(*)` embedded, no `status` filter (admins see drafts too), mapped through the existing `mapSupabaseProduct`.
- `createProduct(data)` / `updateProduct(id, data)` — write the `products` row, then call two new internal helpers, `syncVariants()` and `syncProductImages()` (below), so variants and images are always reconciled against the form's current state rather than blindly re-inserted.
- `deleteProduct(id)` — looks up every image's `storage_path` for the product **before** deleting the row, and removes those Storage files explicitly. `product_variants`/`product_images` rows themselves cascade via the existing `on delete cascade` FKs — but Storage is a separate system a Postgres cascade can't reach, so without this the file would be orphaned in the bucket forever.
- `duplicateProduct(id)` — generates a collision-free SKU **and** slug **and** product number (the original code only checked SKU/slug — copying `product_number` unchanged would have violated `products.product_number`'s `unique` constraint on every single duplicate attempt). Copied images point at the same `image_url` but get `storage_path: null` — deliberately, so deleting the copy later can never delete the original's underlying file (see `deleteProduct` above).
- `updateInventory(id, size, stock)` — `upsert` on `(product_id, size)`, so it works whether a variant row already exists for that size or not.
- `friendlyWriteError()` turns a Postgres `23505` unique-violation into a message naming the field (slug / product number / SKU) instead of a raw Postgres error string.

### 2. `syncVariants()` — new, internal
Diffs a product's desired `sizes[]` against its current `product_variants` rows: deletes rows for sizes no longer selected, upserts one row per remaining size. Used by both `createProduct` and `updateProduct` (and by `duplicateProduct` for the copy), so there is exactly one place that reconciles sizes↔stock rows.

### 3. `syncProductImages()` — new, internal
Reconciles the six fixed image slots (`main`/`front`/`back`/`model`/`detail`/`fabric`) against Supabase Storage + `product_images` for one product:
- **Removed** (admin clicked "Remove" on a previously-saved slot) → deletes the Storage file (if any) and the `product_images` row.
- **Replaced** (admin chose a new file) → uploads the file via `uploadProductImage`, then either updates the existing row to point at the new file (deleting the old Storage file if it differs) or inserts a new row if the slot never had one.
- **Unchanged but present** → still re-syncs alt text and slot order, so an alt-text-only edit is never silently dropped.
- **Empty** → skipped.

### 4. `src/services/productImages.js` — three new functions
`updateProductImageRecord(imageId, fields)`, `deleteProductImageRecord(imageId)`, `deleteProductImageFiles(storagePaths)` — the brief's exact "use the existing productImages service where possible" list is now complete (`uploadProductImage`, `saveProductImageRecord` already existed from Part 08A/08B-2A). Stale comments about admin auth "not existing yet" were removed — it exists as of Part 08B-2A, and these functions are called for real now.

### 5. `src/lib/mapSupabaseProduct.js`
Each image slot object now also carries `id`, `storagePath`, and `sortOrder` from the underlying `product_images` row (previously only `src`/`alt`). The storefront still only reads `src`/`alt` and is unaffected; the admin form needs the rest to know which row to update/delete.

### 6. `src/admin/components/ImageSlotManager.jsx`
Each slot's local state now tracks `id` (existing row, if any), `storagePath`, `pendingFile` (a chosen-but-not-yet-uploaded `File`), and `removed` (marked for deletion) — nothing is sent to Supabase until the product form is submitted, so a new product (no id yet) and an existing one are handled identically. Added an alt-text input per slot (shown once a slot has an image). "Set as main" still works exactly as before — it swaps the two slot objects wholesale, including the new fields.

### 7. `src/admin/components/ProductForm.jsx`
`emptyImages()` and `productToFormState()` now populate the new per-slot fields (`id`, `storagePath`, `pendingFile: null`, `removed: false`) so a loaded product's existing images round-trip correctly through the form; `formStateToProduct()` already passed `images` straight through, so no change was needed there. Updated the images-section help text (previously said uploads were "local previews only" pending Part 08B).

### 8. Error/loading handling
`AdminProducts.jsx`, `AdminInventory.jsx`, `AdminProductEdit.jsx` now catch rejected promises from the (now-real, now-fallible) `adminProducts.js` calls and display the message instead of hanging on "Loading…" forever or throwing an unhandled rejection. `AdminProductNew.jsx`'s helper text was updated to stop mentioning "the local catalog".

### 9. `src/admin/Admin.css`
One small addition: `.admin-image-slot__alt` styling for the new alt-text input.

## Files touched in Part 08B-2B-1

```
REWRITTEN  src/services/adminProducts.js       (real Supabase CRUD, no local fallback)
CHANGED    src/services/productImages.js       (+ updateProductImageRecord, deleteProductImageRecord, deleteProductImageFiles)
CHANGED    src/lib/mapSupabaseProduct.js       (image slots carry id/storagePath/sortOrder)
CHANGED    src/admin/components/ImageSlotManager.jsx  (real slot state + alt-text editing)
CHANGED    src/admin/components/ProductForm.jsx        (image state carries new fields)
CHANGED    src/admin/Admin.css                 (+ .admin-image-slot__alt)
CHANGED    src/admin/pages/AdminProducts.jsx   (error handling/display)
CHANGED    src/admin/pages/AdminInventory.jsx  (error handling/display)
CHANGED    src/admin/pages/AdminProductEdit.jsx (error handling/display)
CHANGED    src/admin/pages/AdminProductNew.jsx (helper text)
CHANGED    BUILD_STATUS.md
```

No file from Parts 01–08B-2A was rewritten or redesigned beyond what's listed above. `src/data/products.js`'s local-catalog CRUD helpers (`addProductRecord`, `updateProductRecord`, `deleteProductRecord`, `updateVariantStockRecord`, `generateProductId`) are no longer imported by `adminProducts.js` but were left in place (unused-but-present) rather than deleted, since other pure helpers in the same file (`getAvailability`, `getSizeAvailability`, `getCategories`, etc.) are still used throughout the admin UI and storefront and share that file. `src/services/products.js` (storefront-facing) was not touched — it was already real Supabase with a local-catalog fallback from Part 08A, which is out of scope for this part and not an "admin write", so it's left exactly as-is.

## What remains for Part 08B-2B-2

- `AdminCustomers` — still an empty-state placeholder; a real admin-facing customer list against `profiles` (RLS already supports admin `SELECT` from Part 08B-2A)
- `AdminOrders` — still an empty-state placeholder; no order data exists to manage yet (Part 09 territory for the write path, but a read-only admin order list could reasonably land in 08B-2B-2 once there's something to show)
- `AdminSettings` — not reviewed as part of this pass; confirm it doesn't have its own local-only write path that should be flagged
- End-to-end testing against a real, seeded Supabase project (create → appears on `/shop`; edit stock → storefront reflects it; delete → no orphaned Storage files; duplicate → no unique-constraint collisions) — this sandbox has no live Supabase project or network access to test against, so everything above was verified by code review + module-graph bundling, not by exercising the actual admin UI in a browser against a real database
- A real `npm install && npm run build && npm run lint` run in an environment with network access — this sandbox could not reach the npm registry (see "Build verification" above)
- Payments, shipping, order fulfillment (Part 09, unchanged scope)

## Important technical decisions (Part 08B-2B-1)

- **Deferred image processing, not immediate upload-on-choose** — a chosen file is only uploaded when the whole product form is submitted, not the moment the admin picks it. This is what makes "new product" (no id yet) and "edit existing product" use the exact same `ImageSlotManager`/`syncProductImages` code path, and it means clicking through file choices costs nothing until "Save" is pressed.
- **Duplicate images by reference, not re-upload** — a duplicated product's `product_images` rows point at the original's `image_url` but intentionally carry `storage_path: null`. The alternative (copying `storage_path` too) would mean deleting either copy deletes the shared file out from under the other — a data-consistency bug the brief explicitly warns against ("Product deletion does not leave broken image references").
- **Explicit Storage cleanup on delete, not reliance on cascade** — Postgres `on delete cascade` handles the `product_variants`/`product_images` rows, but Supabase Storage objects live outside Postgres entirely and are never touched by a SQL cascade. `deleteProduct()` queries the image rows for their `storage_path`s first and removes those files before deleting the product row.
- **One inventory system, still** — `updateInventory()` and `syncVariants()` both write to the same `product_variants` table the storefront reads from (via `services/products.js`, untouched); there is no separate "admin stock" table that could drift out of sync.
- **No local-fallback path for any admin write** — every function in `adminProducts.js` throws (via `requireSupabase()`) if Supabase isn't configured, rather than quietly writing to the in-memory catalog. This matches the brief's explicit instruction and is a deliberate change from every admin service function's behavior in Parts 01–08B-2A.

---

## Part 08B-2A — what changed

### 1. `is_admin()` database function
**New, in** `supabase/part-08b2a-admin-security.sql`. `SECURITY DEFINER`, `stable`, `set search_path = public`. Reads only `auth.uid()` — never accepts a user id from the client, so there is no way to ask "is someone else an admin". Runs with the function owner's privileges specifically so it can read `profiles` without re-triggering `profiles`'s own RLS policies (which is what would cause recursive-RLS errors if a normal, non-`SECURITY DEFINER` query tried to call it from inside a `profiles` policy). Granted to both `anon` and `authenticated` — the function itself is the security boundary, not who can call it.

### 2. Role-escalation protection
**New:** `enforce_profile_role_immutable()` + `trg_profiles_role_immutable`, a `BEFORE UPDATE` trigger on `profiles`. Closes the exact gap called out in `part-08b1-auth.sql`'s comments: a signed-in customer's own `"Users can update own profile"` policy (unchanged, still theirs) let them send `role: 'admin'` in an update payload. The trigger now silently resets `role` back to its previous value whenever the caller isn't already an admin — every *other* field in the same update still goes through, so a legitimate name/phone change is never blocked just because a client happened to echo the existing role back.

### 3. `AdminRoute`
**New:** `src/admin/AdminRoute.jsx`. Same shape as `ProtectedRoute`, plus a role check: loading (session *or* profile fetch in flight) → minimal loading state; logged out → redirect to `/login` with `state={{ from: location }}` (so `Login.jsx`'s existing `location.state?.from?.pathname` logic sends them back here — but only if they're actually an admin, since this component re-checks after redirect); logged in but not an admin → redirect to `/account`, deliberately not `/login`, since they *are* authenticated, just not authorized here; logged in and admin → render. Wraps the whole `/admin` route tree in `App.jsx` (previously **unguarded** — every admin route was reachable by anyone).

### 4. `AuthContext` extended for admin
**Changed:** `src/context/AuthContext.jsx`. Adds `profile` (the signed-in user's own `profiles` row), `profileLoading`, and `isAdmin` (`profile?.role === 'admin'`, always derived, never set directly). A new effect fetches the profile via the existing `getMyProfile()` (from `src/services/profiles.js`, unchanged) whenever `user?.id` changes, and clears it on sign-out. `isAdmin` is never read from `localStorage`, a JWT claim, or anything else client-controlled — it's a live database read, gated by the same RLS this migration adds.

### 5. Admin-scoped RLS
**New, in** `supabase/part-08b2a-admin-security.sql`, additive on top of the existing policies from `schema.sql` / `part-08b1-auth.sql` (nothing dropped-and-not-replaced, nothing rebuilt):
- **products / product_variants / product_images:** admins get full `SELECT/INSERT/UPDATE/DELETE` via `is_admin()`; the existing "public can read published X" policies are untouched, so admins can additionally see drafts.
- **profiles:** admins get `SELECT`/`UPDATE` on all rows; the existing self-only policies are untouched.
- **orders / order_items / payments / shipping:** previously zero policies (RLS enabled, deny-by-default). Now customers get read-only access to rows that are theirs (via `orders.customer_id = auth.uid()`, or a join through `orders` for the child tables), and admins get full access. No customer-facing `INSERT`/`UPDATE` policy was added — there's no checkout write path yet to support (Part 09).
- No `using (true)` or other broad policy was used anywhere.

### 6. Storage RLS
**New, in the same migration.** `storage.objects`, scoped to `bucket_id = 'product-images'`: public `SELECT` (defense-in-depth on top of the bucket's own "Public" setting), admin-only `INSERT`/`UPDATE`/`DELETE` via `is_admin()`. No anonymous or customer upload path exists.

### 7. AdminLayout logout — now real
**Changed:** `src/admin/AdminLayout.jsx`. The Part 07 placeholder (`navigate('/')` with a comment that there was no session to end) now calls the real `signOut()` from `useAuth()` before navigating — same sign-out path the customer-facing Navbar/Account use.

### 8. Documentation
**Changed:** `supabase/SETUP.md` — new §6d (run the migration), §11 (first-admin promotion via the dashboard/SQL editor, no UI path), and updated reminders. **Changed:** this file.

## Files touched in Part 08B-2A

```
NEW      src/admin/AdminRoute.jsx
NEW      supabase/part-08b2a-admin-security.sql
CHANGED  src/context/AuthContext.jsx     (+ profile, profileLoading, isAdmin)
CHANGED  src/App.jsx                    (wrap /admin in <AdminRoute>)
CHANGED  src/admin/AdminLayout.jsx      (real signOut() on logout)
CHANGED  supabase/SETUP.md              (§6d, §11, reminders)
CHANGED  BUILD_STATUS.md
```

No file from Parts 01–08B-1 was rebuilt or redesigned; `src/services/adminProducts.js`, `src/services/productImages.js`, and every admin page component are untouched — they still read/write the local in-memory catalog, exactly as before.

## Complete route list (Part 08B-2A)

```
/                          existing — unchanged
/shop                      existing — unchanged
/product/:slug             existing — unchanged
/cart                      existing — unchanged
/checkout                  existing — unchanged
/login                     existing — unchanged
/signup                    existing — unchanged
/forgot-password           existing — unchanged
/reset-password            existing — unchanged
/account                   existing — unchanged, behind ProtectedRoute
* (catch-all → NotFound)   existing — unchanged
/admin                     NOW behind AdminRoute (was unguarded)
/admin/dashboard           NOW behind AdminRoute
/admin/products            NOW behind AdminRoute
/admin/products/new        NOW behind AdminRoute
/admin/products/:id/edit   NOW behind AdminRoute
/admin/inventory           NOW behind AdminRoute
/admin/orders              NOW behind AdminRoute
/admin/customers           NOW behind AdminRoute
/admin/settings            NOW behind AdminRoute
```

## What remains for Part 08B-2B

- Switching `src/services/adminProducts.js` over to real Supabase writes against `products`/`product_variants`/`product_images` — RLS now correctly allows an authenticated admin to do this, but the service still targets the local in-memory catalog
- Wiring `src/services/productImages.js`'s `uploadProductImage()` to actually call Supabase Storage — the bucket policy now allows it, but nothing in the admin UI calls that path yet
- Real admin-facing customer list (`AdminCustomers`), replacing its current empty state, now that admin-scoped `profiles` SELECT exists
- Real order creation/reading against `orders`/`order_items`, replacing both `AdminOrders`' empty state and `Account.jsx`'s order-history placeholder
- An admin-facing role-management UI (promote/demote), replacing the dashboard/SQL-only process in `SETUP.md` §11 — the "Admins can update all profiles" policy already supports this, there's just no screen for it yet
- Payment gateway and shipping provider integration (Part 09), using the `payments`/`shipping` tables and their new RLS policies

## Testing performed (Part 08B-2A)

Same sandbox limitation as every prior part: no live Supabase project to test against here, so the SQL migration itself was hand-reviewed (not executed against a real Postgres instance) against `schema.sql`'s existing table shapes and `part-08b1-auth.sql`'s existing policies/trigger, checking specifically for: policy name collisions (none — all new policy names are distinct from existing ones), accidental drops of existing policies (none — every `drop policy if exists` in the new migration targets a policy name this migration itself is about to recreate), and the `is_admin()` recursive-RLS trap (avoided via `SECURITY DEFINER` + table-owner RLS bypass, per the comments in the migration file).

On the frontend, with `isSupabaseConfigured` false in this sandbox (no `.env`, same as Part 08B-1): `AdminRoute` was verified via `npm run build` + manual route-tree reasoning to redirect to `/login` when `user` is null (the only reachable state without a real backend) — the `isAdmin`-true and "logged in but not admin" branches were reviewed against `AuthContext`'s new `profile`/`isAdmin` logic but could not be exercised end-to-end without a real Supabase project and a seeded admin row. **Before relying on this in production**, follow `supabase/SETUP.md` §6d, then §11, then manually verify: a logged-out visit to `/admin/dashboard` redirects to `/login`; a signed-in customer visiting the same redirects to `/account`; a signed-in admin reaches the dashboard; a customer's attempt to `update profiles set role = 'admin'` (e.g. via the browser console using the anon client) has no effect; a customer cannot `insert`/`update`/`delete` on `products`; a customer cannot read another customer's row in `orders`; and an unauthenticated `storage.objects` upload to `product-images` is rejected.

## Important technical decisions (Part 08B-2A)

- **Two independent enforcement layers, not one** — `AdminRoute` makes the UI behave correctly, but every policy in `part-08b2a-admin-security.sql` is written to hold even if `AdminRoute` were deleted, bypassed, or the frontend were replaced entirely. Neither layer trusts the other.
- **Role immutability via trigger, not a column-level RLS policy** — Postgres RLS's `WITH CHECK` only sees the proposed new row, not the old one, so it can't itself express "this column may not change unless X". A `BEFORE UPDATE` trigger can see both `OLD` and `NEW`, so that's where the invariant lives; the existing `"Users can update own profile"` policy from Part 08B-1 was left exactly as-is rather than replaced with something that would also need to reason about `OLD`.
- **Silently reset the disallowed field, don't hard-fail the request** — when a non-admin's update touches `role`, the trigger resets just that column rather than raising an exception that would reject the whole update (including any legitimate `full_name`/`phone` change bundled in the same call).
- **`is_admin()` as the single reusable check, not `role = 'admin'` copy-pasted into every policy** — every admin policy in the migration calls the same function, so the admin definition lives in exactly one place; changing it later (e.g. adding a `super_admin` tier) is a one-function edit, not a find-and-replace across a dozen `create policy` statements.
- **No customer-facing write policy on orders/order_items/payments/shipping yet** — adding one now, before the checkout flow that would use it exists, would be exactly the kind of premature broad policy the brief asks to avoid. Read-only for customers, full access for admins, nothing else, until Part 09 defines what a real order-write actually needs.
- **AdminLayout's logout fix was in-scope, not scope creep** — it was a one-line placeholder (`navigate('/')` with a comment saying there was no real session to end) that became actively wrong the moment `AdminRoute` started gating on a real session; leaving it faking a logout while the rest of the admin panel became real auth would have been a regression, not preservation.

---

## Part 08B-1 — what changed

### 1. Auth service
**New:** `src/services/auth.js`. Thin, well-documented wrapper around `supabase.auth.*`: `signUp`, `signIn`, `signOut`, `getCurrentUser`, `getSession`, `resetPassword`, `updatePassword`, `onAuthStateChange`. Unlike `src/services/products.js`, there is **no local fallback** — authentication without a real backend is meaningless, so every function throws (or, for the read-only helpers, resolves `null`) with a clear message when Supabase isn't configured, instead of silently pretending someone is signed in. Uses the existing `src/lib/supabase.js` client — no second client was created, and the service-role key is never referenced.

### 2. Auth context
**New:** `src/context/AuthContext.jsx`. `AuthProvider` + `useAuth()`, following the exact same shape as `CartContext.jsx`: a single provider wraps the app in `main.jsx`, everything else reads through the hook. Exposes `user`, `session`, `loading`, `isAuthenticated`, `isSupabaseConfigured`, `signIn`, `signUp`, `signOut`, `resetPassword`, `updatePassword`. `loading` starts `true` and only flips to `false` once the initial session-restore check resolves, so `ProtectedRoute` never bounces a signed-in user to `/login` just because the session hadn't finished restoring on page load. A single `onAuthStateChange` subscription keeps `user`/`session` current on sign-in, sign-out, token refresh, and password-recovery events — no polling, no manual "refresh after login" calls anywhere in the app.

### 3. Signup
**New:** `src/pages/Signup.jsx` at `/signup`. Full name, email, password, confirm password, with the same touched/blur/submit-attempted validation pattern as `Checkout.jsx`'s `Field` component. Signup is **always** a customer — there is no role selector on this form, no role field sent to Supabase, and no code path that could set one (see §7 below). Detects whether Supabase email confirmation is enabled from the shape of `signUp()`'s response (`user` present, `session` null) and shows a "check your email" state instead of ever claiming the person is signed in before they actually are.

### 4. Login
**New:** `src/pages/Login.jsx` at `/login`. Email + password, disabled/relabeled submit button while a request is in flight (prevents double-submit), and specific, friendly error copy for invalid credentials, an unconfirmed email, and network failures (falling back to a generic message for anything else — never a raw Supabase error string). After a successful sign-in, returns to `location.state.from` when `ProtectedRoute` redirected the user here with an intended destination, otherwise goes to `/account`.

### 5. Forgot password
**New:** `src/pages/ForgotPassword.jsx` at `/forgot-password`. Takes an email, calls `resetPasswordForEmail()`. Shows the **same** success message whether or not an account exists for that email — Supabase's API doesn't distinguish the two, and neither does this UI, so the page never confirms or denies whether a given email is registered.

### 6. Password reset
**New:** `src/pages/ResetPassword.jsx` at `/reset-password`. Lands here from the emailed recovery link; Supabase's client detects the recovery token in the URL and establishes a temporary session automatically (no manual token parsing in this codebase). If no recovery session is present — direct navigation, or an expired link — the password form is not shown; the person is pointed back to `/forgot-password` instead. On success, offers a direct link into `/account`.

### 7. Customer profile — auto-created safely
Reuses the existing `profiles` table from Part 08A rather than duplicating it. **New:** `supabase/part-08b1-auth.sql` — adds a `SECURITY DEFINER` trigger (`handle_new_auth_user`, fired `after insert on auth.users`) that creates the matching `profiles` row with `role` hard-coded to `'customer'` in the function body. The frontend's `signUp()` call never sends a role, `Signup.jsx` has no role field, and there is no "make admin" functionality anywhere in the UI — the only way a row could ever get `role = 'admin'` is a human editing it directly in the Supabase dashboard/SQL editor. No existing table was dropped, recreated, or had data wiped; the migration only adds a function, a trigger, and two policies.

### 8. Profile service
**New:** `src/services/profiles.js` — `getMyProfile()` / `updateMyProfile({ fullName, phone })`. Neither function accepts a user ID; both derive the target row from `supabase.auth.getUser()` and are backed server-side by the RLS policies added in §7's migration, so there is no code path — accidental or otherwise — for a customer to read or write another user's profile. `updateMyProfile()` deliberately does not accept a `role` parameter.

### 9. Customer account
**New:** `src/pages/Account.jsx` at `/account`. Shows name (from the profile, falling back to Supabase Auth's `user_metadata.full_name`), email, and account type (`customer`/`admin`, whichever the profile row actually has), plus a logout button. Includes an order-history section that is an intentional placeholder empty state — real order data is Part 08B-2+/09 work, once anything in the app actually writes to `orders`.

### 10. Protected route
**New:** `src/components/ProtectedRoute.jsx`. Three states exactly per the brief: loading → minimal loading UI; no user → `<Navigate to="/login" state={{ from: location }} replace />`; authenticated → render children. Wraps only `/account` in this part. Does **not** check `profiles.role` — that's `AdminRoute`'s job, arriving in Part 08B-2; this component would happily render for an admin user too, since role has nothing to do with what it gates.

### 11. Admin routes — untouched
Every existing `/admin/*` route and page continues to render exactly as it did after Part 08A — none of them were wrapped in `ProtectedRoute` or any other new gate. No `AdminRoute`, no `is_admin()`, no admin-scoped RLS policy was added anywhere in this part's migration; `products`/`product_images`/`product_variants` still have exactly the one public-read-published policy each from `schema.sql`, unchanged.

### 12. Navbar
`src/components/Navbar.jsx` updated, not redesigned: the existing account icon/link now points at `/account` when signed in and `/login` when signed out (previously it always pointed at `/account`, which didn't exist before this part). The mobile menu's "Account" link does the same, and gains a "Log out" action (styled as a reset `<button>` matching the existing mobile-link typography) that appears only when signed in. No new icons, no layout changes, no other links touched.

### 13. Logout
Real `supabase.auth.signOut()` via `AuthContext`'s `signOut()`, exposed from both the Navbar (redirects to `/`) and the Account page (redirects to `/`). Because `AuthContext` is driven by `onAuthStateChange`, the Navbar's account link and `ProtectedRoute`'s gate both update immediately on sign-out with no manual "clear state" calls needed beyond what `signOut()` itself does.

### 14. Session persistence
Handled entirely by the Supabase JS client's own storage (no custom tokens, no manually-managed localStorage entries, no stored passwords) — `AuthContext` calls `getSession()` once on mount to restore whatever the client already persisted, then hands off to `onAuthStateChange` for everything after that.

### 15. Security
No `service_role` key, database password, or `sb_secret_*` value exists anywhere in this codebase — confirmed by re-reading `src/lib/supabase.js` (unchanged from Part 08A) and every new file added in this part. `VITE_SUPABASE_ANON_KEY` usage is unchanged and still the only key referenced. The Navbar/route changes in §10–12 are UI-layer conveniences, not security boundaries — the actual guarantee that a customer can only touch their own profile row comes from the RLS policies in `part-08b1-auth.sql` (§7 above), not from anything in `ProtectedRoute.jsx` or the Navbar.

### 16. Error handling
Every auth screen has a loading state, a disabled/relabeled submit button while a request is in flight, field-level errors matching the `Checkout.jsx` `Field` pattern, and a mapped, non-technical error message for the handful of Supabase Auth error strings a customer could realistically hit (invalid credentials, unconfirmed email, already-registered email, network failure) — anything else falls back to one generic, calm message rather than a raw error dump.

### 17. Routing
Added `/login`, `/signup`, `/forgot-password`, `/reset-password`, and `/account` (the last wrapped in `ProtectedRoute`) to `src/App.jsx`. All 13 previously-existing routes — `/`, `/shop`, `/product/:slug`, `/cart`, `/checkout`, the catch-all, and 7 `/admin/*` routes — remain exactly as they were, unmoved and unmodified.

### 18. Design — untouched
No global CSS, fonts, homepage, Shop, Product, Cart, or Checkout changes. The five new auth pages and the Account page use a new `src/pages/Auth.css` that deliberately reuses the *existing* design tokens and the *existing* field/error visual language from `Checkout.css` (`.input`, `.btn`, `.text-label`, `--color-signal` for errors, sharp-corner `--radius: 0`, hairline borders) rather than inventing a second visual system. `Navbar.css` gained one small button-reset rule (`.navbar__mobile-link--button`) so the new "Log out" action matches the existing mobile link typography exactly.

## Files touched in Part 08B-1

```
supabase/
  part-08b1-auth.sql   NEW — SECURITY DEFINER trigger auto-creating a
                       role:'customer' profiles row on signup; RLS
                       policies letting a user read/update only their
                       own profile row
  SETUP.md              + steps 6b/6c (run the migration, configure email
                       confirmation + redirect URLs) and step 10
                       (verify authentication), reminders section updated
src/
  services/
    auth.js             NEW — signUp/signIn/signOut/getCurrentUser/
                        getSession/resetPassword/updatePassword/
                        onAuthStateChange, no local fallback by design
    profiles.js          NEW — getMyProfile/updateMyProfile, scoped to
                        the current user only, never accepts a role
  context/
    AuthContext.jsx       NEW — AuthProvider + useAuth(), same shape as
                        CartContext.jsx
  components/
    ProtectedRoute.jsx    NEW — loading / redirect-to-login / render
    Navbar.jsx             account link now auth-aware; mobile "Log out"
                        action added; no other changes
    Navbar.css             + one button-reset rule for the new "Log out"
                        mobile action
  lib/
    authValidation.js     NEW — pure validators (email/name/password/
                        confirm), same pattern as checkoutValidation.js
  pages/
    Login.jsx             NEW — /login
    Signup.jsx             NEW — /signup
    ForgotPassword.jsx      NEW — /forgot-password
    ResetPassword.jsx       NEW — /reset-password
    Account.jsx             NEW — /account (wrapped in ProtectedRoute)
    Auth.css                NEW — shared styling for the five pages above
  App.jsx                 + 5 new routes; every existing route unchanged
  main.jsx                 + AuthProvider wraps CartProvider wraps App
```

Nothing from Parts 01–08A was deleted or had its public shape changed. `Home.jsx`, `Shop.jsx`, `Product.jsx`, `Cart.jsx`, `Checkout.jsx`, `CartContext.jsx`, every admin page/component, `src/services/products.js`, `src/services/adminProducts.js`, `src/lib/supabase.js`, `supabase/schema.sql`, `supabase/seed.sql`, and every CSS file other than `Navbar.css` were **not modified**.

## Complete route list (verified, all HTTP 200 via `vite dev`)

```
/                          existing — unchanged
/shop                      existing — unchanged
/product/:slug             existing — unchanged
/cart                      existing — unchanged
/checkout                  existing — unchanged
/login                     NEW
/signup                    NEW
/forgot-password           NEW
/reset-password            NEW
/account                   NEW — behind ProtectedRoute
* (catch-all → NotFound)   existing — unchanged
/admin                     existing — unchanged, not gated in this part
/admin/dashboard           existing — unchanged
/admin/products            existing — unchanged
/admin/products/new        existing — unchanged
/admin/products/:id/edit   existing — unchanged
/admin/inventory           existing — unchanged
/admin/orders              existing — unchanged
/admin/customers           existing — unchanged
/admin/settings            existing — unchanged
```

## What remains for Part 08B-2

- Admin role authorization: an `AdminRoute` component wrapping `AdminLayout`'s `<Outlet />`, checking `profiles.role = 'admin'` (via `useAuth()` + a profile lookup) rather than just "is signed in"
- A Postgres `is_admin()` helper and matching authenticated-admin RLS policies for `INSERT`/`UPDATE`/`DELETE` on `products`/`product_images`/`product_variants`
- Closing the `profiles` self-update role-escalation gap noted in `part-08b1-auth.sql`'s comments (pin `role` to its previous value on self-service updates, e.g. via a trigger or column-level policy)
- Switching `src/services/adminProducts.js` over to the now-secure Supabase writes (the function shapes already match 1:1, per Part 08A)
- A Storage policy scoped to authenticated admins so `src/services/productImages.js`'s `uploadProductImage()` can actually succeed
- Real admin-facing customer list (`AdminCustomers`), replacing its current empty state, once admin-scoped profile access exists
- Real order creation/reading against `orders`/`order_items`, replacing both `AdminOrders`' empty state and `Account.jsx`'s order-history placeholder
- Payment gateway integration and shipping provider integration (Part 08B-2/09), using the `payments`/`shipping` tables already created in Part 08A

## Testing limitations

Same limitation as Part 08A: this sandbox has no live Supabase project to test against. `npm run build` and `npm run lint` were run for real and pass as stated above, and all 18 routes were checked over `vite dev` and returned HTTP 200 — but `isSupabaseConfigured` is `false` in this sandbox (no `.env`), so every `useAuth()` action (`signIn`/`signUp`/etc.) resolves through the "not configured" error path rather than a real Supabase Auth call, and the Login/Signup/ForgotPassword/ResetPassword pages were verified to render, validate, and surface that "not connected to Supabase" message correctly — not to actually authenticate anyone. `services/auth.js`, `services/profiles.js`, and `part-08b1-auth.sql` were hand-reviewed against the Supabase JS SDK's documented `auth.*` method signatures and against `schema.sql`'s existing `profiles` table shape, but have not been executed against a real Postgres/Auth instance. Please follow `supabase/SETUP.md` §§1–6c and verify signup/login/logout/reset against a real project before relying on this in production.

## Lint warnings (4, all pre-existing-pattern, zero errors)

- `react(only-export-components)` on `AuthContext.jsx`'s `useAuth` and `CartContext.jsx`'s `useCart` — both files export one hook alongside their provider component, which is the standard React context pattern and exactly the same shape oxlint has flagged (and this project has accepted) for `CartContext.jsx` since Part 04.
- `react(set-state-in-effect)` on `AuthContext.jsx` (setting `loading` to `false` when Supabase isn't configured) and `ResetPassword.jsx` (adopting an already-present recovery session) — both are effects synchronizing local state with an external system (the Supabase Auth client's session state), which is the documented legitimate use case for `useEffect` per the lint rule's own help text; there is no way to derive either value purely at render time since both depend on an async/external check.

## Important technical decisions (Part 08B-1)

- **No local fallback for auth, unlike products** — `services/products.js` degrades gracefully to a local catalog when Supabase is unreachable, because a storefront with no products is a hard failure a customer would notice immediately. Authentication is different: there is no meaningful "local fallback" for signing someone in, so `services/auth.js` throws a clear, user-facing error instead of ever pretending a sign-in succeeded.
- **Profile creation lives in one trigger, not scattered client-side inserts** — every signup path (this app's form, the Supabase dashboard, a future mobile client, direct API usage) creates a matching `profiles` row the same way, with the same hard-coded `role: 'customer'`, because the logic lives in a single `SECURITY DEFINER` Postgres function rather than being re-implemented (and potentially re-broken, or given a role parameter) in every client.
- **RLS backs up the UI's "customers can't self-promote" behavior, not the other way around** — `Signup.jsx` having no role field and `updateMyProfile()` having no role parameter are both real, but the actual enforcement is server-side: the trigger hard-codes `'customer'` and no INSERT policy exists that a client could use to originate a row with a different role. The one honestly-documented gap (self-update not yet pinning `role` against escalation) is called out explicitly in `part-08b1-auth.sql` and above, rather than silently left for someone to discover later.
- **`ProtectedRoute` checks authentication, not authorization** — it deliberately has zero awareness of `profiles.role`, because conflating "signed in" with "has admin rights" is exactly the kind of shortcut the brief's Part 08B-2 split is designed to prevent. An `AdminRoute` that actually checks role arrives in Part 08B-2, built on top of this component's pattern rather than by teaching this one two jobs.
- **`ForgotPassword` never reveals account existence** — same success message regardless of whether the email is registered, matching Supabase's own API behavior rather than adding client-side logic that would leak the distinction Supabase itself avoids exposing.
- **One shared `Auth.css`, not five near-duplicate stylesheets** — Login, Signup, ForgotPassword, ResetPassword, and Account all share one small stylesheet built from the *existing* design tokens and `Checkout.css`'s field/error conventions, so a future visual pass only has one file to touch for this whole feature area, and the auth pages don't visually diverge from Checkout's already-established form language.

---


## Part 08A — what changed

### 1. Supabase client
**New:** `src/lib/supabase.js`. Reads `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `import.meta.env`, exports `supabase` (the client, or `null` if unconfigured) and `isSupabaseConfigured` so every other file can branch cleanly instead of crashing on missing env vars. Also exports `PRODUCT_IMAGES_BUCKET` and `getProductImagePublicUrl()`. **Only the anon key is ever read here** — the service-role key is never referenced anywhere in this codebase, per the brief's explicit security requirement. `.env.example` added with both variable names, both empty.

### 2–7. Database schema
**New:** `supabase/schema.sql`. Creates `profiles`, `products`, `product_images`, `product_variants`, `orders`, `order_items`, `payments`, `shipping`, all with `gen_random_uuid()` primary keys, `updated_at` triggers, and the indexes the brief asked for (`products.slug`, `products.status`, `products.category`, `product_images.product_id`, `product_variants.product_id`). `products.slug`/`sku`/`product_number` are unique; `status` is constrained to `draft`/`published`; `product_variants.stock` is constrained `>= 0` and `(product_id, size)` is unique (no duplicate size rows per product); `product_variants.size` is a plain `text` column (not an enum), so new sizes can be added without a migration. `product_images.image_type` covers the brief's list (`front`/`back`/`detail`/`fabric`/`design`/`lifestyle`/`other`) plus `main`/`model` to match the six named slots the existing admin `ImageSlotManager` UI already uses — extending the check constraint's list, not replacing it. `orders`/`order_items`/`payments`/`shipping` are created as foundational tables only (Part 08B/09) — no query in this codebase reads or writes them yet. `profiles` is likewise foundational, ready for Part 08B's real admin/customer roles.

### 8. Row Level Security
RLS is enabled on every table. `products`/`product_images`/`product_variants` each get exactly one `SELECT` policy: public/anon can read rows that belong to a **published** product (never drafts). **No** `INSERT`/`UPDATE`/`DELETE` policy exists for any table, and no policy at all exists yet for `profiles`/`orders`/`order_items`/`payments`/`shipping` — with RLS on and no matching policy, Postgres/PostgREST denies the operation by default. This is a deliberate choice: the brief explicitly forbids "allow everything to everyone" policies, and building a temporary permissive write policy just to make today's unauthenticated admin buttons appear to work would be exactly that. See "Admin data connection" below for how the admin panel behaves given this.

### 9. Supabase Storage
`product-images` bucket is documented (not scripted — bucket creation is a Storage-service action, not a SQL statement) in `supabase/SETUP.md` §7, with the exact dashboard steps. **New:** `src/services/productImages.js` — `uploadProductImage()` (uploads a File to a per-product path, returns `{ storagePath, publicUrl }`) and `saveProductImageRecord()` (inserts the matching `product_images` row). Both are real, working Supabase calls, correctly implemented against the bucket — but a fresh Storage bucket also denies anonymous uploads by default, so (consistent with §8 above) they will only succeed once Part 08B adds real admin sign-in and a matching Storage policy. `ImageSlotManager.jsx` therefore continues to use its existing Part 07 `URL.createObjectURL` local-preview behavior rather than calling these — unchanged behavior today, real Supabase upload code ready and waiting for Part 08B.

### 10. Product service → Supabase
`src/services/products.js` was rewritten. Every exported function (`getAllProducts`, `getProductBySlug`, `getFeaturedProducts`, `getRelatedProducts`, `getCategories`, `getAllSizes`) keeps its exact Part 07 signature and return shape. When `isSupabaseConfigured`, each queries Supabase first (`products` joined with `product_images(*)` and `product_variants(*)`, filtered to `status = 'published'`); on any error, or when Supabase isn't configured at all, it falls back to the equivalent function in `src/data/products.js`. **New:** `src/lib/mapSupabaseProduct.js` — maps a Supabase row (with its joined images/variants) onto the exact `Product` shape `ProductCard`, `Shop`, and `Product.jsx` already expect, so none of those components needed to change at all.

### 11. Local data retained as seed source + fallback
`src/data/products.js` is unchanged in its product data and every existing export (`getPublishedProducts`, `getAvailability`, `getSizeAvailability`, `getVariantStock`, the admin `*Raw` functions, etc.) — only its top-of-file documentation comment was updated to explain its new role: seed source for `supabase/seed.sql`, and the fallback the storefront service layer, the admin panel, and the cart's stock checks (`CartContext.jsx`, unchanged) still run on directly. There is no risk of "two competing sources of truth" being read simultaneously for the same page load — a given request either fully succeeds against Supabase or fully falls back to local data, never a mix.

### 12. Seed data
**New:** `supabase/seed.sql` — the exact six LAGAMLESS products from `src/data/products.js`/Part 07 (same product numbers, SKUs, names, prices, descriptions, stories, fabric, GSM, fit, measurements, sizes, stock levels, categories, tags, featured/new-arrival flags, and published status), each followed by its `product_variants` and six `product_images` slot rows (with `image_url`/`storage_path` left `NULL`, matching the local catalog's `src: null` placeholders). Written to be pasted directly into the Supabase SQL Editor after `schema.sql`.

### 13. Admin data connection
Deliberately **not** switched over to Supabase writes in this part. Reasoning, stated plainly: the brief requires (a) no "anyone can write" RLS policies, and (b) no admin authentication yet — those two constraints together mean there is no secure way for an unauthenticated admin panel to actually persist a create/update/delete/inventory-edit against Supabase right now. Rather than adding an insecure temporary policy to make the existing buttons "work," `src/services/adminProducts.js` and `src/admin/*` continue to operate on the same local in-memory catalog they did in Part 07 (doc comments updated to point at Part 08B instead of Part 08 as the real integration point). This is the honest version of §12's "do not pretend the admin is secure" instruction — the panel is fully usable for demoing the workflow, and every function is already shaped 1:1 against the `products`/`product_variants`/`product_images` tables, ready for Part 08B to swap the bodies over once real admin sign-in + role-scoped RLS policies exist.

### 14. Loading + error states
`getAllProducts`/`getProductBySlug`/etc. never reject — a Supabase failure is caught internally and the function resolves with the local-fallback result instead, logged to the console for debugging. This means `Shop.jsx`/`Product.jsx`'s existing loading-skeleton → data → (empty state | 404) flow from Part 03/04 continues to work unchanged: the UI is never stuck loading forever because of a Supabase outage, and never shows a raw error screen — it quietly serves the local catalog and keeps functioning.

### 15. Environment configuration
**New:** `supabase/SETUP.md` — the exact 9 steps from the brief (create project → find URL → find anon key → `.env` → `schema.sql` → `seed.sql` → Storage bucket → `npm run dev` → verify) plus an explicit, repeated warning never to use the `service_role` key in this frontend project.

### 16–17. Scope discipline / preservation
No payment gateway, shipping integration, or customer/admin authentication code was added anywhere. Every customer-facing page, the cart, checkout, and every admin screen from Parts 01–07 were re-read and confirmed unmodified in behavior — the only functional change in this part is *where product data comes from* underneath `src/services/products.js`.

## Files touched in Part 08A

```
supabase/
  schema.sql          NEW — full schema: profiles, products, product_images,
                       product_variants, orders, order_items, payments,
                       shipping + indexes + RLS (public read-published-only,
                       no public writes anywhere)
  seed.sql            NEW — the 6 LAGAMLESS products, variants, and image
                       slot rows, matching src/data/products.js exactly
  SETUP.md            NEW — step-by-step Supabase project setup
.env.example           NEW — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
package.json            + @supabase/supabase-js dependency
src/
  lib/
    supabase.js         NEW — Supabase client, isSupabaseConfigured,
                        storage bucket name + public-URL helper
    mapSupabaseProduct.js  NEW — Supabase row → app Product shape mapper
  services/
    products.js         REWRITTEN — Supabase-backed with local fallback,
                        same exported function signatures as Part 07
    productImages.js     NEW — uploadProductImage() / saveProductImageRecord(),
                        ready for Part 08B admin-authenticated uploads
    adminProducts.js      doc comments updated (Part 08 → Part 08B); logic
                        unchanged — still local in-memory, see §13 above
  data/
    products.js           doc comment updated to describe its new role
                        (seed source + fallback); all data/exports unchanged
  admin/
    AdminLayout.jsx, AdminDashboard.jsx, AdminSettings.jsx,
    pages/AdminProductNew.jsx, pages/AdminCustomers.jsx, pages/AdminOrders.jsx,
    components/ProductForm.jsx, components/ImageSlotManager.jsx
                          doc/copy references updated from "Part 08" to the
                        correct "Part 08B" (auth) or "Part 08B/09" (orders)
```

Nothing from Parts 01–07 was deleted or had its public shape changed. `ProductCard.jsx`, `Shop.jsx`, `Product.jsx`, `Home.jsx`, `Cart.jsx`, `Checkout.jsx`, `CartContext.jsx`, the admin CRUD logic, and every CSS file were **not modified**.

## What remains for Part 08B

- Real admin authentication (Supabase Auth), a role check (`profiles.role = 'admin'`) wrapped around `AdminLayout`'s `<Outlet />`, and matching authenticated-admin RLS policies for `INSERT`/`UPDATE`/`DELETE` on `products`/`product_images`/`product_variants`
- Switch `src/services/adminProducts.js` over to those now-secure Supabase writes (the function shapes already match 1:1)
- A Storage policy scoped to authenticated admins, so `src/services/productImages.js`'s `uploadProductImage()` can actually succeed, and wiring `ImageSlotManager.jsx`'s "Replace" button to call it instead of `URL.createObjectURL`
- Real customer accounts (Supabase Auth), replacing `AdminCustomers`' empty state
- Real order creation writing to the `orders`/`order_items` tables already created in this part, replacing `AdminOrders`' empty state
- Payment gateway integration (Razorpay/Cashfree/Stripe) and shipping provider integration (Shiprocket/Delhivery/India Post) — Part 08B/09, using the `payments`/`shipping` tables already created here
- Replace placeholder photography with real shots, once uploads work

## Testing limitations

This sandbox has network access to `registry.npmjs.org` (so `npm install` for `@supabase/supabase-js` succeeded) but **no live Supabase project exists to test against** — there is no way to spin one up from here. `npm run build` and `npm run lint` were run for real and pass cleanly (see verification line above), and all 14 routes were checked over `vite dev` and returned HTTP 200 — but that run exercised the **local-fallback path** only (no `.env` configured in this sandbox), since `isSupabaseConfigured` is `false` without real project credentials. The Supabase-backed code path (`services/products.js`'s `if (isSupabaseConfigured)` branches, `mapSupabaseProduct.js`, `schema.sql`, `seed.sql`) was hand-reviewed for correctness — column names, join shapes, and RLS predicates were all double-checked against each other — but has not been executed against a real Postgres instance. Please follow `supabase/SETUP.md` and verify against a real project before relying on it in production.

## Important technical decisions (Part 08A)

- **The storefront never goes fully dark on a Supabase problem** — `getAllProducts()` and friends catch every Supabase error internally and resolve with the local catalog instead of rejecting, so a misconfigured `.env`, a paused project, or a network blip degrades gracefully to "site works off local data" rather than a blank page or an unhandled promise rejection.
- **No insecure RLS policy was added to make admin writes "work" today** — the brief explicitly forbids "anyone can write" policies and explicitly says not to implement admin auth in this part; those two constraints together mean the only honest option was to leave admin writes running against the local catalog (as they did in Part 07) until Part 08B's real auth + policies exist, rather than papering over the gap.
- **One mapping function, not scattered `row.foo` access** — `mapSupabaseProduct()` is the single place a Supabase row shape gets translated into the app's `Product` shape, so a future column rename only requires editing one function, and every UI component keeps working off the exact same shape regardless of which data source served it.
- **`product_images.image_type` extends the brief's list rather than replacing it** — `main` and `model` were added alongside `front`/`back`/`detail`/`fabric`/`design`/`lifestyle`/`other` specifically so the existing six-slot `ImageSlotManager` admin UI didn't need to be redesigned, per the brief's own "do not completely redesign the component" instruction in that same section.
- **Real, working Storage-upload code exists even though it can't succeed yet** — `productImages.js` is not a stub; it correctly calls the Supabase Storage API and would work today against a bucket with a permissive policy. It's deliberately not wired into the UI yet, because wiring it in would either require that permissive policy (disallowed) or would silently fail on every use — neither is better than leaving the current, working local-preview UX in place until Part 08B.

---


## Part 07 — what changed

### 1. Admin layout
`src/admin/AdminLayout.jsx` was rewritten. Desktop keeps the existing dark sidebar (now with every required link); under 768px it collapses into a sticky top bar with a hamburger button that opens a full-height slide-in drawer — a real off-canvas menu, not a horizontally-scrolling strip. The drawer closes on link click, backdrop click, or (via the shared `ConfirmDialog`'s own handling) `Escape`. The customer `Navbar`/`Footer` never render inside `/admin/*` — the admin route tree still mounts its own layout, not `SiteLayout`.

### 2. Admin sidebar
Full nav: **Dashboard, Products, Add product, Inventory, Orders, Customers, Settings**, plus a **View store** link (→ `/`) and a **Log out** button pinned to the bottom of the sidebar/drawer. Log out opens a confirm dialog explaining that real session handling arrives with Supabase Auth in Part 08, then navigates to `/` — there is no session to actually end yet, so nothing pretends otherwise.

### 3. Admin dashboard
`src/admin/AdminDashboard.jsx` was rewritten to show **real** numbers computed from the local catalog: total products, published products, low-stock products, out-of-stock products (all via the existing `getAvailability()` helper from Part 03/04 — no second stock-bucketing system). Total orders, pending orders, and revenue are shown as explicit "Not available yet" cards rather than invented numbers or a bare `—`, per the brief's "clearly distinguish unavailable future metrics."

### 4–9. Product management (`/admin/products`, `/new`, `/:id/edit`)
- **New:** `src/services/adminProducts.js` — `getProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`, `duplicateProduct`, `updateInventory`. All async, all returning the same shapes a Supabase-backed version would, matching the seam already established by `services/products.js`.
- **New:** admin-only mutation functions added to `src/data/products.js` (`getAllProductsRaw`, `getProductByIdRaw`, `addProductRecord`, `updateProductRecord`, `deleteProductRecord`, `updateVariantStockRecord`, plus `generateProductId`/`skuExistsRaw`/`slugExistsRaw`) that read and write the **same** `PRODUCTS` array the storefront already reads from — there is still exactly one product catalog, not a second admin-only copy (brief §12/§21). Nothing is persisted beyond the page session; a reload resets to the seed data, as instructed ("do not fake a real database connection").
- **New:** `src/admin/pages/AdminProducts.jsx` — a management table with product image, product number + SKU, price, published/draft badge, stock-availability badge, total units, and row actions (**Edit**, **View** — opens the live storefront page in a new tab, **Duplicate**, **Delete**). Search (name/product number/SKU) and seven filter chips (All/Published/Draft/Featured/New arrival/Low stock/Out of stock) compose together. Under narrow viewports the table scrolls horizontally inside a bounded wrapper rather than blowing out page width.
- **New:** `src/admin/components/ProductForm.jsx` — the **one** reusable form used by both Add and Edit, exactly as instructed ("do not create separate duplicated forms"). Sections: Basic information (name, product number, SKU, slug, category with a datalist of existing categories, tags), Pricing (price, compare-at price), Product content (description, story), Product details (fabric, GSM, fit, care, construction, design note, styling note), Sizes/measurements/inventory (toggle sizes on/off from a fixed S–XXL list; toggling a size on adds a stock + chest/length/shoulder row, toggling it off removes it), Images (see §10), and Publishing (draft/published radio, featured/new-arrival checkboxes).
- `src/admin/pages/AdminProductNew.jsx` and `AdminProductEdit.jsx` are thin route wrappers: `AdminProductEdit` loads the product by id (handles "loading" and "not found" states) and passes it to `ProductForm` as `initialProduct`; `AdminProductNew` passes none. Both hand the assembled product to the matching service function and route back to `/admin/products` on success.

### 7. Product validation
**New:** `src/admin/lib/productFormValidation.js` — pure, framework-agnostic, same pattern as `lib/checkoutValidation.js`. Requires name, product number, SKU, category, description, a positive price, and at least one selected size; validates that a compare-at price (if present) is actually higher than price and that every size's stock is a non-negative number. Errors show inline per field (reusing the `Field` wrapper's `role="alert"`/`aria-describedby` pattern from Checkout) and only become visible once a field is blurred or submission has been attempted — same progressive-disclosure UX as Part 06's checkout form. `createProduct`/`updateProduct` additionally reject a duplicate SKU or slug against the rest of the catalog and surface that as a form-level error.

### 8. Product delete
Delete is never a single click: `AdminProducts` opens the shared `src/admin/components/ConfirmDialog.jsx` ("Delete product? This will permanently remove '{name}' from the catalog. This action cannot be easily undone.") and only calls `deleteProduct()` after explicit confirmation. The dialog is a labeled `role="alertdialog"`, traps `Escape` to cancel, and focuses its confirm button on open.

### 9. Product duplication
`duplicateProduct(id)` always mints a **new** id, and appends `-COPY` (then `-COPY-2`, `-COPY-3`, …) to both the SKU and slug until it finds one that doesn't collide with any existing product — so a duplicate can never silently share another product's SKU. The copy is saved as a `draft` and never featured, so it can't accidentally go live before the admin reviews it.

### 10. Image management UI
**New:** `src/admin/components/ImageSlotManager.jsx`. All six named slots (Main/Front/Back/Model/Detail/Fabric) are shown with a live preview (or a "No image" placeholder), a **Replace** button (file picker → local `URL.createObjectURL` preview only — nothing is uploaded anywhere), a **Remove** button, and — for any non-main slot with an image — a **Set as main** button that swaps that slot's image with the current main image (this is the "image ordering / main image designation" the brief asked for, expressed as promotion between the six fixed slots rather than a free-form reorder, since the slots are semantically named). The component only ever deals in a `{ src, alt }` shape per slot, so Part 08 can replace the "Replace" handler with a real Supabase Storage upload without touching this component's props.

### 11–12. Inventory management
**New:** `src/admin/pages/AdminInventory.jsx` — one row per product **size** (not per product), showing product, SKU, size, a `StatusBadge` (In stock/Low stock/Out of stock, via the existing `getSizeAvailability()` from Part 04), and an editable quantity input that commits `onBlur`. Edits call `updateInventory()`, which writes straight into the same `product.variants[]` array the cart/product pages already read live stock from (Part 05's `getVariantStock()`), so there is one inventory system end to end, not a second one for the admin panel. A tiny "Saved" confirmation appears next to the row for 1.5s after a successful edit. Search (name/SKU) + status filter chips (All/In stock/Low stock/Out of stock) compose together.

### 13. Order management UI
**New:** `src/admin/pages/AdminOrders.jsx`. Since there is no real order backend yet, this deliberately does **not** invent fake orders to fill the screen — it shows the full intended table header (Order #, Customer, Date, Items, Total, Payment, Shipping, Status), an empty `<tbody>`, status filter chips for the six statuses named in the brief (Pending/Confirmed/Processing/Shipped/Delivered/Cancelled), and an honest empty state explaining orders arrive once payment + order creation are connected.

### 14. Customer management UI
**New:** `src/admin/pages/AdminCustomers.jsx`. Same honest-empty-state approach: a prepared column header (Name, Email, Phone, Orders, Total spent, Joined), a search box, and a message that real accounts appear once Supabase Auth is connected. No customer records were fabricated.

### 15. Admin settings
**New:** `src/admin/pages/AdminSettings.jsx`. Store information (name/email/phone/address), Store settings (currency — INR only for now, default country — India only for now, low-stock threshold), and Shipping/Payments sections that are explicitly placeholder text — no shipping or payment configuration UI, and critically **no API key or credential input field exists anywhere on this page**, per the brief's explicit instruction. Settings are held in local component state only ("Saved for this session only" notice on submit) — nothing is written to a real backend yet.

### 16–17. Admin search & filters
Every list screen (Products, Inventory, Orders, Customers) has its own lightweight, client-side search — no shared search index, no debounce needed since the catalog is small and entirely in memory. Filters are implemented as toggle-able chip rows (`aria-pressed` on each) rather than a multi-select dropdown, matching the brief's "keep search lightweight" instruction and reusing the same interaction pattern across all four screens instead of inventing one per page.

### 18. Responsive admin
Verified at mobile/tablet/laptop/desktop widths conceptually via the same breakpoints the rest of the site uses (768px sidebar/drawer split; tables live inside `.admin-table-wrap` which scrolls horizontally instead of forcing the page wider; the product form's field grid is `repeat(auto-fit, minmax(220px, 1fr))` so it reflows to one column on narrow screens without any per-breakpoint overrides). No new `overflow-x` sources were introduced — `.admin` also now sets `overflow-x: hidden` explicitly to match the rest of the site's global rule.

### 19. Admin security architecture
Unchanged from Part 01's original caution, restated explicitly here: **`/admin/*` is not protected in this part.** Hiding the route is not security. `AdminLayout` has a comment calling this out directly above where Part 08 will add the real check. The architecture is ready for that: `AdminLayout` already isolates all admin routes behind one layout component, so Part 08 can wrap `<Outlet />` in an auth/session check (redirecting to a login screen, verifying a Supabase session, checking an admin role) in exactly one place without touching any individual admin page. The Log out button is already wired to a confirm-then-navigate flow; Part 08 only needs to add a real `supabase.auth.signOut()` call where the comment marks it.

### 20. Customer site protection
Customer routes are unchanged: `/`, `/shop`, `/product/:slug`, `/cart`, `/checkout`. No admin component, admin nav, or admin styling was imported into `SiteLayout.jsx` or any customer page — verified by re-reading `App.jsx`'s route tree, which still nests customer routes under `<SiteLayout />` and admin routes under a completely separate `<AdminLayout />` subtree.

### 21. Data architecture
All admin product mutations go through `src/services/adminProducts.js` — no admin page reaches into `src/data/products.js` directly, and no mutation logic lives inline in JSX. `getProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`, `updateInventory` are the exact function names the brief asked for (plus `duplicateProduct`, needed for §9). Part 08 replaces every function body in this one file with real Supabase queries; no admin component needs to change.

### 22. Design
The admin panel deliberately looks like an internal tool, not the customer site: dense tables, chip filters, plain form fieldsets — reusing the same underlying tokens (`--color-*`, `--space-*`, `.btn`/`.input`/`.card` primitives, sharp `--radius: 0` corners) so it's visually part of the same product without borrowing the customer site's editorial photography-driven layout. No new colors were introduced; status badges use a small, existing-palette-only set (`--color-signal` for negative, plus two new but consistent muted green/amber tones for positive/warning) and always pair color with an explicit text label.

### 23. Accessibility
Every form field goes through the shared `src/admin/components/Field.jsx` wrapper, which wires `<label htmlFor>`, `aria-invalid`, `aria-describedby`, and `role="alert"` on errors — the same pattern Part 06 established for Checkout. Size toggles, filter chips, and status filters use `role="group"`/`aria-pressed` where appropriate. `ConfirmDialog` is a labeled, focus-trapping `role="alertdialog"` that responds to `Escape`. Status badges (`StatusBadge`) always render a text label — Published/Draft, In stock/Low stock/Out of stock, and every order status — never color alone.

## Files touched in Part 07

```
src/
  data/
    products.js              extended — admin-only raw/mutating functions
                              (getAllProductsRaw, getProductByIdRaw,
                              addProductRecord, updateProductRecord,
                              deleteProductRecord, updateVariantStockRecord,
                              generateProductId, skuExistsRaw, slugExistsRaw)
                              added alongside the unchanged customer-facing
                              exports (getPublishedProducts, getAvailability,
                              getSizeAvailability, etc. — untouched)
  services/
    adminProducts.js         NEW — admin CRUD service (createProduct,
                              updateProduct, deleteProduct, duplicateProduct,
                              updateInventory, getProducts, getProduct)
  admin/
    AdminLayout.jsx           REWRITTEN — full sidebar, mobile drawer,
                              View store, Log out (confirm dialog)
    AdminDashboard.jsx         REWRITTEN — real catalog metrics +
                              explicit "not available yet" order/revenue cards
    Admin.css                  extended — drawer, tables, forms, badges,
                              dialog, toolbar/filter-chip, image-slot styles
    lib/
      productFormValidation.js NEW — pure product form validators
    components/
      Field.jsx                NEW — shared labeled-field wrapper
      ConfirmDialog.jsx         NEW — accessible confirm/cancel dialog
      StatusBadge.jsx           NEW — text+color status badge
      ImageSlotManager.jsx      NEW — six-slot image preview/replace/remove/
                                promote-to-main UI
      ProductForm.jsx            NEW — the one reusable Add/Edit product form
    pages/
      AdminProducts.jsx          NEW — product list, search, filters, actions
      AdminProductNew.jsx        NEW — Add Product route wrapper
      AdminProductEdit.jsx       NEW — Edit Product route wrapper
      AdminInventory.jsx         NEW — per-size stock editing
      AdminOrders.jsx            NEW — empty-state order management UI
      AdminCustomers.jsx         NEW — empty-state customer management UI
      AdminSettings.jsx          NEW — store/settings/shipping/payments UI
  App.jsx                       extended — 8 new /admin/* routes registered
```

Nothing from Part 01–06 was deleted or had its public shape changed. `CartContext.jsx`, `Cart.jsx`, `Checkout.jsx`, `Product.jsx`, `Navbar.jsx`, `services/products.js` (the customer-facing one), `ProductCard.jsx`, `Shop.jsx`, the homepage, and `SiteLayout.jsx` were **not modified**.

## What remains for Part 08

- Connect Supabase (Postgres, Storage, Auth) — replace the bodies of `services/products.js` and `services/adminProducts.js` with real queries against `products`/`product_variants`/`product_images` tables; the shapes already match
- Real admin authentication (Supabase Auth), an authorization/role check wrapped around `AdminLayout`'s `<Outlet />`, protected routes, real session handling, and a real "Log out" that calls `supabase.auth.signOut()`
- Real customer accounts/database, replacing `AdminCustomers`' empty state
- Real order creation + the order backend `AdminOrders`' empty state is prepared for
- Wire `ImageSlotManager`'s "Replace" action to Supabase Storage uploads instead of a local object-URL preview
- Payment gateway + shipping provider integration (Checkout's "Continue to payment" handoff point, and Settings' Shipping/Payments placeholder sections)
- Replace placeholder photography with real shots
- Wire the navbar's search icon to `searchProducts()` (still decorative)

## Important technical decisions (Part 07)

- **The admin panel and the storefront share one catalog, not two** — every admin mutation function in `data/products.js` reads and writes the exact same `PRODUCTS` array `getPublishedProducts()` filters from, so a stock edit in `/admin/inventory` is immediately visible to a customer's next `/product/:slug` load in the same session, with no separate admin-only data store to keep in sync.
- **Nothing is persisted beyond the in-memory session, and nothing pretends otherwise** — every admin page's copy is explicit that this is local dev data reset on reload; no localStorage/sessionStorage shim was added to fake durability that isn't real yet, since that would be harder to unwind cleanly in Part 08 than starting from a clean seam.
- **One `ProductForm`, not two** — Add and Edit are both thin route wrappers around the same component, differing only in whether `initialProduct` is passed and which service function `onSubmit` calls, exactly matching the brief's explicit instruction not to duplicate the form.
- **Image uploads are honestly temporary** — `ImageSlotManager` uses `URL.createObjectURL` for an immediate, real-looking preview without writing any file anywhere, which is both truthful about the current capability and gives Part 08 a component that already speaks in plain `src` strings, ready for a real upload handler.
- **Duplicate-safety is enforced at the service layer, not just the form** — `createProduct`/`updateProduct`/`duplicateProduct` all re-check SKU/slug uniqueness against the live catalog before writing, so a duplicate can't be created even by calling the service directly, not just by clicking through the UI.
- **Empty states are honest, not decorative** — Orders and Customers show the real intended table structure and an explicit "not yet connected" message rather than sample/fake rows, per the brief's explicit instruction not to invent data that doesn't exist.

---


**Same environment note as Part 05:** this sandbox still has no network access (`npm` registry requests return `403 host_not_allowed`), so `npm install`/`npm run build`/`npm run lint` could not actually be executed here. Every change below was hand-reviewed instead — brace/paren balance, hook-ordering against the project's `react/rules-of-hooks` oxlint rule, import paths, and prop shapes — but please run the real build/lint yourself before building on top of this. No new dependencies were added, and no existing file's public shape changed, so any issues that do surface should be small.

---

## Part 06 — what changed

### 1. Checkout page
`src/pages/Checkout.jsx` was rebuilt from the Part 01 `PagePlaceholder` stand-in into a full page: customer information, delivery address, a Delivery placeholder section, a Payment placeholder section, and a "Continue to payment" CTA on the left; a live order summary pulled from `useCart()` on the right (two columns from 900px up, stacked below that, matching the Cart page's existing breakpoint). No new visual language — same fieldset/label/input tokens as the rest of the site.

### 2. Cart validation (empty checkout)
If `lines.length === 0`, `/checkout` renders the same "Your bag is empty." + "Continue shopping → /shop" treatment used on the Cart page, instead of any form — checked before any hook-conditional rendering, so the empty state can never flash a broken form first.

### 3. Customer information
Collects first name, last name, email (`type="email"`), and phone (`type="tel"`) with `given-name`/`family-name`/`email`/`tel` autocomplete. Phone placeholder shows the expected Indian mobile shape (`98765 43210`).

### 4. Shipping address
Collects address line 1, address line 2 (optional), city, state, PIN code, and country. Country defaults to **India** via a `<select>` sourced from a `COUNTRIES` array (currently `['India']`) rather than a hardcoded string, so adding a second country later is a one-line data change, not a form rewrite.

### 5. Form validation
**New:** `src/lib/checkoutValidation.js` — pure, framework-agnostic validators (same pattern as `lib/productQuery.js`), independent of any UI:
- `validateEmail`, `validateIndianPhone`, `validateIndianPinCode`, and `validateCheckoutForm(form)` (runs all field rules and returns `{ valid, errors }`).
- Validation runs client-side on every keystroke (via `useMemo`), but an error only *displays* once a field has been blurred or a submit was attempted — so the customer isn't shown "required" errors before they've had a chance to type anything, while `handleSubmit` still blocks submission whenever the form is invalid, regardless of what's been touched yet.
- Errors render inline under each field (`role="alert"`, tied to the input via `aria-describedby`/`aria-invalid`), plus a single summary line if submission was attempted while still invalid.

### 6. Indian PIN code
`validateIndianPinCode` enforces a strict 6-digit format that can't start with `0` (`/^[1-9]\d{5}$/`) — `700001` passes, `012345` or `12345` do not.

### 7. Phone validation
`validateIndianPhone` accepts a 10-digit Indian mobile number starting `6`–`9`, with or without a `+91`/`91` prefix and common human spacing/hyphens (`9876543210`, `+91 98765 43210`, `091-98765-43210` all pass) — practical rather than overly strict, per the brief.

### 8. Checkout order summary
The right-hand `OrderSummary` reads directly from `useCart()`: image, name, product number, size, quantity (as a badge on the thumbnail), unit × quantity line total, then **Subtotal** (computed), **Shipping — "To be calculated"**, and **Total — "To be calculated"**. No shipping number is invented or hardcoded to `0` and presented as a real total — per §8 and §16 of the brief, "to be calculated" is shown honestly instead.

### 9. Quantity / cart editing
An "Edit bag" link in the summary header routes to `/cart` — checkout does not duplicate any add/remove/quantity controls; all editing still happens on the one Cart page.

### 10. Shipping section
A plain "Delivery" fieldset states: *"Shipping charges will be calculated after the delivery address is confirmed. Real-time courier rates will connect here in a later part."* No shipping provider or calculation logic is implemented.

### 11. Payment section
A "Payment" fieldset explains payment will be processed securely once a provider is connected, names the planned methods (UPI / Card / Net banking, shown as inert tags — not selectable, since none of them do anything yet), and explicitly states no payment details are collected on this screen. No gateway SDK, card form, or CVV/card-number field exists anywhere in the codebase.

### 12. Place order / continue to payment
The CTA reads **"Continue to payment"**. Submitting the form always calls `setSubmitAttempted(true)` first (so validation errors become visible); it only proceeds past that when `valid && lines.length > 0`. "Proceeding" here means transitioning to a local `ReviewPanel` step — a calm confirmation that the entered details are ready and payment will be added later — never a fake "Order placed!" success state. The cart is **not** cleared and no order is created.

### 13. Checkout data model
**New:** `buildCheckoutPayload(form, lines, totals)` in `checkoutValidation.js` assembles exactly the shape described in the brief — `customer` / `shippingAddress` / `items[]` (`productId`, `productNumber`, `sku`, `name`, `size`, `quantity`, `unitPrice`, `lineTotal`) / `totals` (`subtotal`, `shipping: null`, `discount: 0`, `total: null`). It's built in-memory when the form is submitted and handed to `ReviewPanel` as a prop — never sent anywhere, matching "do not send this to Supabase yet."

### 14. Checkout state
Checkout form values persist to `sessionStorage` (`lagamless.checkout.form.v1`) on every change, separately from the cart's own `localStorage` key — refreshing `/checkout` restores what was typed without touching cart contents at all, since the two live in entirely separate storage keys and React contexts. Nothing payment-related is ever written to storage (there's nothing payment-related to write yet).

### 15. Order summary calculations
Line total = unit price × quantity; subtotal = sum of line totals — both computed by the existing `useCart()` (`subtotal` was already a `useMemo` from Part 05, unchanged here). Total is intentionally left as "To be calculated" rather than `subtotal + 0`, so the UI never implies a shipping cost that hasn't actually been determined.

### 16. Security / privacy
No card number, CVV, or payment-password field exists anywhere in this part. No secret API key is referenced (there is no payment SDK yet to hold one). The only thing persisted is the customer/address form the customer explicitly typed, in `sessionStorage` — nothing payment-shaped.

### 17–18. Responsive design & accessibility
Two-column above 900px (form left, sticky order summary right, matching the Cart page's own breakpoint and `position: sticky` pattern), single column below it. Every input has an explicit `<label htmlFor>`, the expected `autoComplete` values from the brief's list (`given-name`, `family-name`, `email`, `tel`, `address-line1`, `address-line2`, `address-level2`, `address-level1`, `postal-code`, `country-name`), `aria-invalid`/`aria-describedby`/`role="alert"` on error text, and `inputMode="numeric"`/`"tel"` for PIN and phone so mobile keyboards show the right keypad. `fieldset`/`legend` groups the three sections semantically for screen readers. Explicit `min-width: 0` was added on the fieldset and form column to prevent the classic fieldset/grid overflow bug from introducing horizontal scroll on narrow viewports.

### 19. Design
Reuses the exact type scale, `.input`/`.btn`/`.tag` primitives, spacing tokens, and hairline borders already in `global.css` — no new colors, radii, or components introduced. The page intentionally has less visual noise than the homepage or Product page (no imagery beyond small order-summary thumbnails), per the brief's "checkout should feel calmer" instruction.

### 20. Error / edge cases
- **Empty cart** → dedicated empty state, no form rendered.
- **Invalid/missing product data in cart** → already handled upstream by Part 05's `reconcileWithCatalog()`, so `lines` reaching Checkout are always valid; nothing extra was needed here.
- **Invalid email/phone/PIN, missing required fields** → inline errors, submission blocked.
- Address line 2 is the only address field marked optional throughout (form, validation, and the review panel's conditional render).

### 21. Cart compatibility
Traced `Product → Add to Bag → Cart → Checkout` by re-reading (not modifying) `Product.jsx`, `ProductGallery`, the size selector, `Cart.jsx`, `CartDrawer.jsx`, and the Navbar's cart badge — none of Part 05's cart code was touched in this part.

## Files touched in Part 06

```
src/
  pages/
    Checkout.jsx / .css    REWRITTEN — full checkout form, order summary,
                            empty-bag state, review/"payment coming soon" step
  lib/
    checkoutValidation.js  NEW — email/phone/PIN validators,
                            validateCheckoutForm(), buildCheckoutPayload()
```

Nothing from Part 01–05 was deleted or had its public shape changed. `CartContext.jsx`, `Cart.jsx`, `CartDrawer.jsx`, `Product.jsx`, `Navbar.jsx`, `services/products.js`, `ProductCard.jsx`, `Shop.jsx`, the homepage, and the admin shell were **not modified**.

## What remains for Part 07

- Real payment gateway integration (the "Continue to payment" review step is the exact handoff point — `buildCheckoutPayload()` already has the shape a payment step would need)
- Connect Supabase (Postgres, Storage, Auth) — checkout's `customer`/`shippingAddress` shape maps directly onto future `customers`/`addresses` tables, and `items[]` onto `order_items`
- Real shipping-rate calculation, replacing the "To be calculated" placeholder text in both the Delivery section and the order summary
- Order creation + confirmation screen, once payment exists
- `/admin/products`, `/admin/orders`, `/admin/customers` — CRUD screens
- Replace placeholder photography with real shots
- Wire the navbar's search icon to `searchProducts()` (still decorative)
- **Run `npm install && npm run build && npm run lint` first** — still not executed in this sandbox (see note at the top of this file); this should be step one of Part 07.

## Important technical decisions (Part 06)

- **Validation logic lives outside the component, like `productQuery.js`** — `checkoutValidation.js` has no React or DOM dependency, so it's independently testable and the same rules could back a future account/address-book form without duplicating them.
- **Errors reveal progressively, not all at once** — a field's error only shows after it's been blurred or a submit was attempted, so an empty form doesn't greet the customer with eight red messages before they've typed a single character, while submission itself is still always gated on full validity.
- **"Continue to payment" transitions state, it doesn't fake success** — per the brief's explicit instruction not to pretend an order was placed, submitting a valid form moves to a local `ReviewPanel` ("payment is coming soon") rather than any kind of order-confirmation or thank-you screen, and the cart is left completely untouched so the customer could still go back and change anything.
- **Checkout state and cart state are deliberately kept in separate storage** — `sessionStorage` for the form (cleared when the tab closes, appropriate for information that isn't final yet) vs. `localStorage` for the cart (meant to survive across sessions) — so a future "save my address for next time" feature could switch just the checkout side to `localStorage` (or a real account) without touching the cart's persistence at all.
- **Shipping and total are `null` until they're real, never `0`** — displaying "To be calculated" instead of computing `subtotal + 0` avoids quietly implying free shipping before any shipping logic exists.

---


## Part 05 — what changed

### 1. Cart state management
`src/context/CartContext.jsx` (already scaffolded minimally in Part 04) was extended into the real cart engine:
- **Stock-aware `addItem(product, size, quantity)`** — checks *live* per-size stock from `data/products.js` on every call (never a number frozen on the cart line), caps the quantity actually added, and returns `{ status, quantityAdded, message }` so the caller (Product page, sticky buy bar) can show a friendly message when a request was capped or the size just sold out, instead of silently over-adding.
- **`updateQuantity(lineId, quantity)`** clamps to `[0, currentStock]` — dropping to 0 removes the line (the only path to zero, matching the brief's "prevent 0 through normal increment/decrement unless removal is intended").
- **`getLineStock(line)`** — live stock lookup the Cart page uses to disable the `+` button exactly at the limit.
- **`clearCart()`** — exposed on the context, not auto-invoked anywhere (per §16 of the brief — no auto-clearing during normal browsing).
- **Drawer state** (`drawerOpen`, `openDrawer`, `closeDrawer`, `lastAddedLineId`) lives here too, since the drawer needs to react to the same `addItem` calls the Navbar/Cart page do.
- Context is still consumed via the existing `useCart()` hook — no signature changes for the parts of the API Part 04 already used (`lines`, `removeItem`, `totalItems`, `subtotal`), so nothing calling those needed to change.

### 2. Cart item structure
Each line now carries: `lineId`, `productId`, `productNumber`, **`sku`** (new), `name`, `slug`, `image`, `size`, `price`, `quantity` — matching the brief's minimum field list and still mapping cleanly onto a future `cart_items` table (`product_id`, `sku`, `size`, `unit_price`, `quantity`).

### 3. Add to cart
Unchanged in shape from Part 04 (same product + size increases quantity; a different size creates a new line, keyed by `${productId}__${size}`), now routed through the stock cap above. Verified against the sample catalog's mixed stock levels (e.g. LAGAMLESS 001 size XL at 0 stock, LAGAMLESS 003 size M at 0 stock).

### 4. Stock protection
- `addItem` never lets a line exceed the size's live stock — if the customer already has the max in their bag, a customer-friendly message is returned instead of a silent no-op ("You already have the most we have in stock for size {size} in your bag.").
- If a request is partially fulfillable (e.g. 1 left, customer effectively tries for more via repeated adds), the message reads "Only {stock} left in size {size} — added what's available." No raw internal inventory numbers are exposed beyond the count already surfacing in that specific message (consistent with the existing `getSizeAvailability()` low-stock hint pattern from Part 04, which also names the size but not a running total elsewhere).
- The Cart page's `+` stepper button disables itself once a line's quantity reaches current stock, with a "Max available quantity in your bag" note.

### 5–6. Cart page + quantity controls
`src/pages/Cart.jsx` was extended, not rebuilt: added SKU to the meta line, wired the stepper's `+` button to `getLineStock()` so it can't exceed stock, added the stock-limit note, gave the remove button an explicit `aria-label`, and added a "Clear bag" action (uses the new `clearCart()`, only ever user-triggered). "Checkout" button copy changed to "Proceed to checkout" per the brief's exact wording. Empty-cart and cart-summary layout are unchanged from Part 04's premium empty state and sticky summary panel.

### 7. Subtotal
Unchanged calculation (`sum of unit price × quantity` per line, via `useMemo` in the context) — still formatted with the existing `formatPrice()` helper (`Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`), e.g. `₹1,999`.

### 8. Cart count
Unchanged from Part 04 — the Navbar badge reads `totalItems` from context and re-renders immediately on any mutation; no page refresh required. Now also correctly reflects stock-capped additions (it shows what was actually added, not what was requested).

### 9. Cart drawer / mini cart
**New:** `src/components/cart/CartDrawer.jsx` + `.css`. A right-side slide-in panel that opens automatically whenever `addItem` succeeds (from the Product page's main "Add to bag" button or the sticky buy bar), without navigating away from the product. Shows every current line (image, name, size, quantity, line total, remove), highlights the just-added line, a subtotal, and "Checkout" / "View bag" actions. Dismissible via the backdrop, an explicit close button, or Escape; traps background scroll while open and moves focus to its close button for keyboard/screen-reader users. Mounted once in `SiteLayout.jsx` so it's available across every customer-facing route without each page needing to know about it. The full `/cart` page was not compromised or simplified to make room for this, per the brief.

### 10. Empty cart
Unchanged from Part 04's premium empty state ("Your bag is empty." + "Continue shopping"); the drawer also has its own lightweight empty state for the (rare) case it's opened with nothing in the bag.

### 11. Persistence
Unchanged mechanism (`localStorage`, key `lagamless.cart.v1`) — refreshing, navigating, and closing/reopening the browser all retain the cart. The read/write path is still isolated inside `CartContext.jsx` so swapping it for a server-backed cart later touches one file.

### 12. Cart validation
**New — this was the main gap Part 04 left for Part 05:** a `reconcileWithCatalog()` step now runs (a) once on load, reading from `localStorage`, and (b) again on every tab `visibilitychange` (cheap, catches a long-lived tab whose cart has gone stale). It:
- shape-checks every persisted line before trusting it at all (`isPlausibleLine`) — malformed JSON, a non-array payload, or a line missing required fields is dropped instead of crashing the app (the existing `try/catch` around `JSON.parse` from Part 04 is kept as the outermost safety net);
- drops any line whose product no longer exists in the catalog;
- drops any line whose size no longer exists on the product, or whose stock has since hit zero;
- clamps quantity down if stock dropped below what was in the bag;
- refreshes name/image/price/SKU/product number from the live product, so a cart line can never show stale info if the catalog changed underneath it.

### 13. Product page compatibility
Verified by re-reading (not rewriting) `Product.jsx`'s gallery, size selector, stock-state logic, Buy Before Experience, related products, and sticky buy bar — none of that changed. `handleAddToBag()` was extended (not replaced) to read `addItem()`'s result and surface a message (`role="status"`) below the Add to Bag button when a request was capped or the size just sold out; the existing 2-second "Added ✓" success feedback is unchanged for the normal path. The sticky buy bar calls the same `handleAddToBag`, so it inherits this for free.

### 14. Shop / homepage compatibility
Not touched — `ProductCard`, `Shop.jsx`, and the homepage don't call into the cart at all, so nothing here was at risk and nothing changed.

### 15. Checkout preparation
`/cart`'s "Proceed to checkout" still links to `/checkout` (still `PagePlaceholder`, untouched — payment/shipping is explicitly out of scope for this part). The cart shape (line items, quantities, subtotal — all exposed off `useCart()`) is ready for `Checkout.jsx` to consume directly in Part 06.

### 16. Clear cart
`clearCart()` is exposed on the context and wired to a "Clear bag" link on the Cart page — nothing calls it automatically.

### 17. Responsive design
The Cart page's existing responsive grid (single column under 900px, two-column with a sticky summary above that) was not changed. The new drawer is full-viewport-width under 480px and a fixed 420px panel above that; its line list scrolls independently of the header/footer so it never pushes the checkout button off-screen on short viewports.

### 18–19. Design & accessibility
The drawer reuses the same tokens as the rest of the site (`--color-*`, `--space-*`, `.btn` primitives, sharp corners, hairline borders) — no new colors or radii introduced. All interactive controls have explicit `aria-label`s (`Increase/Decrease quantity of {name}, size {size}`, `Remove {name}, size {size} from bag`, `Close bag preview`), the drawer is a labeled `role="dialog"` with `aria-modal`, traps Escape, and moves focus to its close button on open.

### 20. Performance
No new dependencies. `getLineStock`/`getVariantStock`/`getProductById` are simple array lookups against the already-in-memory `PRODUCTS` array — no re-fetching. Cart totals stay in `useMemo`, unchanged from Part 04.

## Files touched in Part 05

```
src/
  context/
    CartContext.jsx        REWRITTEN — stock-capped add/update, catalog
                            reconciliation on load + visibilitychange,
                            drawer state, getLineStock, clearCart exposed
  components/
    cart/                   NEW folder
      CartDrawer.jsx/.css       mini-cart drawer, opens on successful add
    SiteLayout.jsx          mounts <CartDrawer /> once, site-wide
  pages/
    Cart.jsx / .css         extended — SKU shown, stock-capped stepper,
                            stock-limit note, Clear bag action
    Product.jsx / .css      extended — handleAddToBag surfaces
                            addItem()'s capped/unavailable message
  data/
    products.js             added getProductById(), getVariantStock() —
                            pure lookups the cart layer needs, no change
                            to existing exports
```

Nothing from Part 01–04 was deleted or had its public shape changed. `services/products.js`, `ProductCard.jsx`, `Shop.jsx`, the homepage, `ProductGallery`/`BuyBeforeExperience`/`StickyBuyBar`, and the admin shell were **not modified**.

## What Part 05 left for Part 06 (historical — see "What remains for Part 07" above for what's current)

- Full checkout flow (shipping details, order summary, payment) on `/checkout`
- Connect Supabase (Postgres, Storage, Auth) — the cart line shape here maps directly onto a future `cart_items` table if server-side cart persistence is wanted, though client-side `localStorage` may remain sufficient pre-auth
- Payments + shipping provider integration
- `/admin/products`, `/admin/orders`, `/admin/customers` — CRUD screens
- Replace placeholder photography with real shots
- Wire the navbar's search icon to `searchProducts()` (still decorative)
- Order confirmation / account order history, once auth exists
- **Run `npm install && npm run build && npm run lint` first** — could not be executed in this sandbox (see note at the top of this file) and should be the first verification step of Part 06 before adding anything new.

## Important technical decisions (Part 05)

- **Stock is re-checked live on every cart mutation, never trusted from a stored line** — `addItem`/`updateQuantity`/`getLineStock` all call `getVariantStock()` against the current `PRODUCTS` data, so a persisted cart can't hold more than what's actually in stock even after a page reload days later (in this demo, "days later" would only matter once stock is server-driven, but the seam is in place now).
- **Cart validation runs on load and on tab-focus, not just once** — a `visibilitychange` listener re-reconciles the cart against the catalog, which is the cheapest hook available for "did anything about this cart go stale while the tab was in the background" without polling or a websocket.
- **The mini-cart drawer is additive, not a replacement for `/cart`** — it mounts once in `SiteLayout`, shares the same `useCart()` state, and duplicates none of the Cart page's logic; removing it would be a one-line change (delete the `<CartDrawer />` mount) with zero impact on the full cart page.
- **`addItem` returns a result object instead of nothing** — this is what lets the Product page distinguish "added successfully" from "capped by stock" from "just sold out" and show the right micro-copy, without the cart context needing to know anything about how the Product page displays feedback.

---

## Part 04 — what changed

### 1–2. Product routing & gallery
- `/product/:slug` is still the single, only Product route — no per-product JSX files were added or are planned. `src/components/product/ProductGallery.jsx` (new) replaced the inline thumbnail block that lived in `Product.jsx`: large primary image, thumbnail strip across all six image slots (`main/front/back/model/detail/fabric`), previous/next arrow controls, dot indicators, touch-swipe support (`touchstart`/`touchend` delta), and arrow-key navigation. It reads the same `images` shape from `data/products.js` — no hardcoded product, no hardcoded image count assumptions beyond the six named slots.

### 3–5. Product information, size selector, stock states
- Info column now shows LAGAMLESS + category eyebrow, product number, SKU, price with compare-at price and a Sale tag, an overall stock-status line (`In stock` / `Low stock — almost gone` / `Sold out`), and the description.
- Size selector only renders `product.sizes` (never a fixed S–XXL list), disables sizes with a new `getSizeAvailability()` per-size bucket (`in-stock`/`low-stock`/`sold-out`/`unavailable`, added to `src/data/products.js`), and shows a "Only a few left in {size}" hint when the *selected* size is low — no raw stock numbers are ever rendered to the customer, per the brief.

### 6 & 18. Add to Bag + cart compatibility
- **New:** `src/context/CartContext.jsx` — a small, localStorage-persisted cart store (`addItem`, `removeItem`, `updateQuantity`, `clearCart`, `totalItems`, `subtotal`). This is intentionally minimal: no checkout, shipping, or payment logic lives here, but every cart line already carries the exact shape the brief asked for (Product ID, product number, product name, product image, selected size, quantity, price), so Part 05 can build the full cart/checkout system directly on top of it instead of re-deriving the shape.
- `Product.jsx`'s Add to Bag button now requires a size, calls `addItem(product, selectedSize, 1)`, shows "Added ✓" feedback for 2 seconds, and is disabled whenever no size is selected, the selected size is sold out, or the product overall is sold out — never allows adding an invalid combination.
- `Navbar.jsx` now shows a live item-count badge on the cart icon, wired to the same context.
- `Cart.jsx` was upgraded from a static placeholder to an actual (still checkout-free) bag view: line items with image, size, quantity stepper, remove, and a subtotal summary — this exercises the cart state end-to-end without building shipping/payment, which stays out of scope per the brief.

### 7. Product details (expandable sections)
- Seven independent `<details>` accordions: **Description, Product Story, Fabric, GSM, Fit, Care, Measurements.** Each has a graceful fallback string if the underlying data field is empty (e.g. a product with `gsm: 0` shows "GSM is not applicable for this fabric construction" instead of "0 GSM" or a blank row).
- `data/products.js` gained three new optional fields per product — `construction`, `design`, `care` — plus `stylingNote`, populated for all six sample products. These are additive only; nothing that existed in Part 03's data shape was renamed or removed, so no other component needed to change.

### 8–9. Measurements & fit experience
- Measurements table now adapts its columns by category: `Bottoms` products show **Waist / Length** (hiding the not-applicable Shoulder column), everything else shows **Chest / Length / Shoulder** — avoids the earlier em-dash-in-every-row look for pants. Wrapped in a horizontally scrollable container so it never breaks mobile width.
- **New:** a dedicated Fit Experience section (`FIT_COPY` map in `Product.jsx`, keyed by the product's `fit` value: Oversized/Boxy/Relaxed/Tapered, with a generic fallback for any future fit value). Copy explicitly frames the silhouette as an intentional design choice and gives sizing guidance ("take your usual size" / "size down one") — never framed around body type, per the brief.

### 10. Buy Before Experience (signature section)
- **New:** `src/components/product/BuyBeforeExperience.jsx` + `.css` — the eight-step editorial walk (`01 SEE IT` → `08 BUY`), each step showing a large display-type numeral, a label, and one line of product-specific copy (pulled from the product's own fabric/fit/design/styling data where possible, so it isn't generic boilerplate). Every step is a link that smooth-scrolls to the matching part of the page (gallery, accordions, fit section, measurements, design story, styling section, or the buy box) — it's a functional guide through the page, not just decorative numbering. Built with `Reveal` for staggered scroll-in, not a plain `<ol>`.

### 11. Product DNA
- **New:** a DNA spec grid (`ProductDNA` component inside `Product.jsx`) showing Product Number, Fabric, GSM, Fit, Construction, Design, and Care in a clean two-column definition list, each with the same fallback-string handling as the accordions.

### 12. Design story
- Uses the existing `story` field, rendered as large display-type editorial copy (not a bullet list, not generic ecommerce boilerplate).

### 13. Styling section
- **New:** a two-column section pairing a photography slot (falls back to the shared diagonal-stripe placeholder when `images.model.src` is null, exactly like the gallery) with `product.stylingNote` and a note that campaign photography is coming later. Architecture is ready to swap in real photography with zero JSX changes, same pattern as the gallery and homepage.

### 14. Related products
- Unchanged in behavior from Part 03 (`getRelatedProducts`, same category, excludes self) — still renders through `ProductCard` and the shared `.shop-grid`, still links to `/product/:slug`.

### 15. Sticky purchase area
- **New:** `src/components/product/StickyBuyBar.jsx` + `.css` — a fixed bottom bar that slides in once the main buy box (price + size selector + Add to Bag) scrolls out of view, via an `IntersectionObserver` on the buy box. Shows product name/price (desktop), a "Size X" / "Select size" pill that scrolls back up to the size row when tapped, and an Add to Bag button that mirrors the main button's disabled/sold-out/"Added ✓" states. Hidden entirely (via `translateY` + `pointer-events: none`) until needed, so it never intrudes early.

### 16–17. Responsive design & animation
- Gallery: touch-swipe on mobile, arrow buttons + dot indicators on larger screens, six-column thumbnail strip that stays legible at small widths.
- Buy-before numerals, DNA grid, and styling section all collapse to single-column layouts under their respective breakpoints; measurements table scrolls horizontally instead of breaking layout.
- Gallery image swap uses a short fade animation; `BuyBeforeExperience` and the Fit/DNA/Styling sections use the existing `Reveal` scroll-in pattern. All of it — plus the gallery's own fade keyframe — respects `prefers-reduced-motion` (global rule from Part 02 zeroes out durations; the gallery CSS also explicitly disables its fade under the same media query).
- No new horizontal-overflow sources were introduced; verified via `vite preview` on `/`, `/shop`, `/product/lagamless-001`, `/product/lagamless-002`, `/product/lagamless-006` (fully sold-out product), `/product/bad-slug`, and `/cart`.

### 19. Error states
- Invalid slug → dedicated premium 404 block (not the generic `PagePlaceholder`) with "Back to shop" and "Go home" actions.
- Missing images → shared diagonal-stripe placeholder, used consistently in the gallery, thumbnails, and styling section.
- Missing product info (story/fabric/care/etc.) → fallback copy per field, never a blank or broken row.
- Sold-out product → stock status reads "Sold out", Add to Bag (both the main button and the sticky bar) is disabled and labeled "Sold out".
- Unavailable size → strikethrough, disabled size button; selecting a sold-out size is not possible since the button is disabled.

### 20. Design consistency
- No new colors, fonts, radii, or spacing values were introduced — every new component (`ProductGallery`, `BuyBeforeExperience`, `StickyBuyBar`, `ProductDNA`, fit/design/styling sections) reuses the existing `--color-*`/`--space-*`/`--font-*` tokens, the existing `text-h1`/`text-h2`/`text-h3`/`text-lead`/`text-label`/`text-small` type classes, and the existing `.btn`/`.tag`/`.container`/`.section` primitives from `global.css`.

## Files touched in Part 04

```
src/
  context/
    CartContext.jsx          NEW — cart state (add/remove/update qty, persisted)
  components/
    Navbar.jsx / .css        cart item-count badge wired to CartContext
    product/                  NEW folder
      ProductGallery.jsx/.css     gallery: swipe, arrows, dots, thumbnails
      BuyBeforeExperience.jsx/.css  the 8-step signature section
      StickyBuyBar.jsx/.css       sticky bottom purchase bar
  pages/
    Product.jsx / .css       REBUILT — full Buy Before Experience page
    Cart.jsx / .css (new)    REBUILT — real cart line items, no checkout logic
  data/
    products.js               extended: construction/design/care/stylingNote
                               fields per product; new getSizeAvailability()
  main.jsx                   wraps <App /> in <CartProvider>
```

Nothing from Part 01, 02, or 03 was deleted. `services/products.js`, `lib/productQuery.js`, `Shop.jsx`, `ProductCard.jsx`, the homepage, and the admin shell were **not modified** — Part 04 only touched the Product page and the new cart layer it needed.

## Testing performed

- `npm run build` — zero errors
- `npm run lint` (oxlint) — zero errors, one pre-existing-pattern warning (`react(only-export-components)` on `CartContext.jsx`, because the file exports both the provider component and the `useCart` hook — a standard, intentional pattern for context files, not a defect)
- `vite preview`, checked via HTTP: `/`, `/shop`, `/product/lagamless-001`, `/product/lagamless-002`, `/product/lagamless-006`, `/product/bad-slug`, `/cart` — all reachable
- Manually traced: product data changes per slug, gallery thumbnail switching, size selection (including the fully-sold-out `lagamless-006` and the partially-sold-out `lagamless-003`), Add to Bag disabled/enabled states, related products rendering, 404 state for an unknown slug

## What remains for Part 05

- Full checkout flow (shipping details, order summary, payment)
- Connect Supabase (Postgres, Storage, Auth) behind `services/products.js` and a new cart/order persistence layer — the cart shape defined in `CartContext.jsx` maps directly onto a future `cart_items`/`orders`/`order_items` schema
- Payments + shipping provider integration
- `/admin/products`, `/admin/orders`, `/admin/customers` — CRUD screens
- Replace placeholder photography in `data/products.js` and `data/homeImages.js` with real shots
- Wire the navbar's search icon to `searchProducts()` (still decorative, unchanged from Part 03)
- Order confirmation / account order history, once auth exists

## Important technical decisions (Part 04)

- **Cart state was introduced now, not deferred again** — the brief asked for Add to Bag to "add the correct product + selected size to cart state," so a real (if intentionally minimal) `CartContext` was built rather than continuing with local-only UI feedback. It is scoped tightly: add/update/remove/persist, nothing about checkout.
- **Buy Before Experience links to real page anchors, not just numbered text** — each of the 8 steps scrolls to the section that actually satisfies it, so the signature section functions as in-page navigation as well as editorial copy.
- **Fit copy is keyed by the `fit` field, not hardcoded per product** — adding a 7th product with an existing fit value (Oversized/Boxy/Relaxed/Tapered) needs zero Product.jsx changes; an unrecognized fit value falls back to generic copy instead of breaking.
- **Per-size availability never leaks raw stock counts** — `getSizeAvailability()` returns a bucket, matching the same "don't expose internal inventory numbers" rule already applied to `getAvailability()` in Part 03.
- **Sticky buy bar is IntersectionObserver-driven, not a scroll-position hack** — ties directly to whether the real buy box is visible, so it stays correct regardless of page length changes as more sections get added later.

---

## Technology stack

- React 19 + Vite 8 (JavaScript/JSX, no TypeScript)
- React Router DOM 7 (client-side routing, one single-page app)
- Plain CSS with a custom design-system token layer (no Tailwind/UI kit)
- oxlint for linting
- Fonts: Bricolage Grotesque (display) + Inter (body), loaded via Google Fonts in `src/styles/global.css`

This is still **one single React application**. The customer site and the
admin panel are both rendered by the same app under different route trees
and layouts — there are no separate projects. This did not change in Part 03.

---

## Folder structure (updated)

```
src/
  admin/                       Admin panel — unchanged from Part 01
  components/
    SiteLayout.jsx, Navbar.jsx/.css, Footer.jsx/.css     — unchanged
    Container.jsx, Section.jsx, Button.jsx               — unchanged
    ProductCard.jsx / .css     — REWRITTEN for the new Product shape:
                                 main/secondary image cross-fade on hover,
                                 New/Sale/Sold out/Low stock badges, SKU +
                                 product number, price with strikethrough
                                 compare-at price, per-size availability
                                 chips. Still takes an optional `index` for
                                 the homepage's serial-number display.
    PagePlaceholder.jsx        — unchanged; now only used by Cart, Checkout,
                                 NotFound, and the Product page's not-found
                                 state
    EditorialImage.jsx / .css  — unchanged (homepage-only image slot renderer)
    Reveal.jsx                 — unchanged, reused on Shop and Product pages
    home/                       — unchanged, all 8 homepage sections
    shop/                       — NEW: Shop-page-specific components
      ShopToolbar.jsx / .css    — search input, sort select, and a filter
                                  panel (category / size / price range /
                                  in-stock / new-arrivals) that collapses
                                  behind a "Filters" toggle under 1024px and
                                  displays inline above that
      EmptyState.jsx / .css     — shared premium empty state (no catalog,
                                  no search/filter results) with an optional
                                  "Clear filters" action
      ProductGridSkeleton.jsx / .css — pulsing placeholder cards shown while
                                  the (currently near-instant, future-async)
                                  product fetch resolves
  pages/
    Home.jsx                   — unchanged
    Shop.jsx / .css            — REBUILT from the Part 01/02 placeholder:
                                  editorial heading + intro, ShopToolbar,
                                  live-filtered/sorted/searched product grid,
                                  loading skeleton, and both empty states
    Product.jsx / .css         — REBUILT from the Part 01/02 placeholder:
                                  image gallery with thumbnail strip, size
                                  selector, price (with sale price), stock
                                  badges, details/measurements accordions,
                                  and a "You may also like" related-products
                                  row. Not-found slugs render the existing
                                  PagePlaceholder 404 treatment.
    Cart.jsx, Checkout.jsx, NotFound.jsx — unchanged
  data/
    products.js    — REWRITTEN: full Product data model (see below), 6
                     sample LAGAMLESS products, plus getPublishedProducts,
                     getTotalStock, getAvailability, getFeaturedProducts,
                     getCategories, getAllSizes helpers
    homeImages.js  — unchanged
  lib/
    formatPrice.js, slugify.js  — unchanged
    productQuery.js — NEW: pure, framework-agnostic filter/sort/search
                      helpers (filterProducts, sortProducts, searchProducts,
                      getDefaultFilters, hasActiveFilters, SORT_OPTIONS,
                      PRICE_RANGES) used by Shop.jsx. Kept separate from
                      services/ and components/ so it has no React or data-
                      source dependency and is trivially unit-testable.
  services/
    products.js    — extended: getAllProducts/getProductBySlug/
                      getFeaturedProducts kept with the same signatures;
                      added getRelatedProducts, getCategories, getAllSizes.
                      Every function is still async and still the only
                      thing pages import from — components never reach into
                      data/products.js directly except for the small
                      presentational helpers (getAvailability, getTotalStock)
                      that ProductCard/Product use for badges.
  styles/
    global.css     — extended: added the shared `.shop-grid` / `.product-grid`
                      responsive grid rules (2 cols mobile → 3 at 768px →
                      4 at 1200px for `.shop-grid`; 2 → 4 at 768px for
                      `.product-grid`, matching the existing homepage grid)
                      so Shop and the Product page's related-products strip
                      share one definition instead of duplicating it.
  App.jsx, main.jsx — unchanged
public/
  favicon.svg      — unchanged
```

No files from Part 01 or Part 02 were deleted. `Shop.jsx`, `Product.jsx`,
and `data/products.js`/`services/products.js` were rewritten in place (they
were still Part 01 placeholders / minimal stand-ins going into this part);
`ProductCard.jsx`/`.css` were rewritten to match the new Product shape
while keeping the same public API (`product`, optional `index`) so
`FeaturedProducts.jsx` on the homepage needed zero changes.

---

## 1–2. Shop page & product grid

`/shop` now has:

- An eyebrow label, editorial `<h1>`, and a short lead paragraph
- A toolbar (`ShopToolbar`) with search, sort, and filters
- A live result count ("N products")
- A responsive grid of `ProductCard`s (2 cols mobile → 3 tablet → 4 desktop)
- A loading skeleton, and two distinct empty states (see §11)

`ProductCard` was extended, not replaced, so its shape stays presentational
and reusable on both the homepage and Shop:

- Main image with a hover cross-fade to a secondary (model/back) image —
  currently invisible since all image slots are still placeholders, but the
  transition and DOM structure are in place for when real photography is
  dropped in
- New / Sale / Sold out / Low stock badges, computed from the product data
  (`isNewArrival`, `compareAtPrice`, `getAvailability()`), not hardcoded
- Product name, product number (LAGAMLESS 00X), price, and a struck-through
  compare-at price when on sale
- A row of size chips, each struck through if that size's variant is at 0
  stock — so availability is visible without opening the product page

## 3. Product data structure

`src/data/products.js` now exports a `Product` shaped as:

```
id, productNumber, sku, name, slug, price, compareAtPrice,
description, story, fabric, gsm, fit,
measurements: { [size]: { chest, length, shoulder } },
sizes: string[], variants: [{ size, stock }],
images: { main, front, back, model, detail, fabric },
category, tags: string[],
isFeatured, isNewArrival, status: 'published' | 'draft',
createdAt
```

This maps cleanly onto a future Supabase schema: `products` (scalar
fields), `product_variants` (one row per `{product_id, size, stock}`), and
`product_images` (one row per `{product_id, slot, src, alt}`). Nothing in
the UI reads `PRODUCTS` directly except `services/products.js` — every page
and component goes through the service layer, which is the seam described
in Part 02's own notes for exactly this reason.

`status: 'draft'` products are filtered out by `getPublishedProducts()`
before anything reaches the storefront, so a future `/admin/products` CRUD
screen can create draft products without them leaking onto `/shop`.

## 4. Sample products

Six products, all under the LAGAMLESS name, no external brand references:

| Product number | Name | Category | Price | Notes |
|---|---|---|---|---|
| LAGAMLESS 001 | Oversized Tee — Ink | Tees | ₹1,799 | Featured, new arrival |
| LAGAMLESS 002 | Boxy Hoodie — Charcoal | Hoodies | ₹3,499 | Featured, new arrival, on sale |
| LAGAMLESS 003 | Drop-Shoulder Shirt — Bone | Shirts | ₹2,299 | One size (M) sold out |
| LAGAMLESS 004 | Cargo Pant — Stone | Bottoms | ₹2,999 | Featured |
| LAGAMLESS 005 | Boxy Tee — Black | Tees | ₹1,699 | New arrival, fully stocked |
| LAGAMLESS 006 | Coach Jacket — Olive | Outerwear | ₹3,999 | On sale, fully sold out (all sizes) |

This spread deliberately exercises every state the UI needs to handle: in
stock, low stock, partially sold out (some sizes), fully sold out, on sale,
and not on sale.

## 5. Product images

Every product has an `images` object with the same six named slots the
Part 03 brief asked for: `main`, `front`, `back`, `model`, `detail`,
`fabric`. Each slot is `{ src: null, alt: '...' }` — same pattern as
`homeImages.js` from Part 02 — so:

- No component contains a hardcoded image URL
- `ProductCard` and the Product page gallery render the shared diagonal-
  stripe placeholder (matching `EditorialImage`'s visual language) whenever
  `src` is `null`
- Dropping in real photography later is a matter of setting `src` (and
  `alt` if needed) on each slot in `data/products.js` — no JSX changes

## 6. Filtering

Implemented in `src/lib/productQuery.js` → `filterProducts()`:

- **Category** — single-select, options generated from the catalog
- **Size** — single-select, options generated from sizes present in the catalog
- **Price range** — Under ₹2,000 / ₹2,000–₹3,000 / Over ₹3,000 (simple
  fixed buckets rather than a slider, per the brief's "don't overcomplicate
  mobile" instruction)
- **Availability** — "In stock only" checkbox, excludes sold-out products
- **New arrivals** — checkbox, filters to `isNewArrival`

All filters compose (AND logic) and combine with search and sort. On
mobile the filter controls collapse behind a "Filters" toggle button
(with a dot indicator when any filter is active); from 1024px up they're
shown inline in a single row alongside search and sort.

## 7. Sorting

`sortProducts()` supports Featured (default — featured products first),
Newest (by `createdAt`), Price: Low to High, and Price: High to Low, via a
plain `<select>` in the toolbar.

## 8. Search

`searchProducts()` matches (case-insensitive, substring) against product
name, product number, SKU, and tags. It runs before filtering and sorting
so all three compose predictably.

## 9. Product routing

Every `ProductCard` links to `/product/:slug` (e.g. `/product/lagamless-001`).
There is still exactly one `Product.jsx` page component — no per-product
JSX files exist or are planned. The homepage's `FeaturedProducts` section
and the Shop grid both render the same `ProductCard`, which both route
through the same dynamic path.

## 10. Responsiveness

- Shop grid: 2 columns (<768px) → 3 columns (768–1199px) → 4 columns (≥1200px)
- Toolbar: search + sort + filter-toggle in one row on mobile, filters
  collapse into a full-width panel below; from 1024px up, category/size/
  price/checkboxes/clear sit in one row with search and sort
- Product page: single column (image above info) under 900px, two-column
  (sticky gallery + info) from 900px up
- Verified via `vite preview`: `/`, `/shop`, `/product/lagamless-001`,
  `/product/<invalid-slug>`, and `/admin` all return HTTP 200
- No horizontal scroll introduced — global `overflow-x: hidden` from
  Part 02 still applies, and no new element exceeds `100%` width

## 11. Empty states

`components/shop/EmptyState.jsx` is used for two distinct situations,
matching the design language of the rest of the site (LAGAMLESS wordmark
mark, hairline top border, editorial type) instead of a blank screen:

- **No products in the catalog at all** — "No products yet." (no action;
  this is a data-availability message, not a user-caused state)
- **No search/filter results** — "No products match your search." with a
  **Clear filters** button that resets both the search box and every
  filter back to defaults in one click

## 12. Loading / future data

`Shop.jsx` and `Product.jsx` both start in a `loading` state and only
render content once their `services/products.js` calls resolve — even
though those calls are synchronous-fast today, this is what lets a future
real (async, network-latency) Supabase call slot in with zero component
changes. `ProductGridSkeleton` (Shop) and an inline skeleton block
(Product) are shown during that window instead of a blank page.

## 13. Navigation

- Navbar → Shop (`/shop`) — unchanged link, now hits a real page
- Shop product cards → `/product/:slug` — works
- Homepage `FeaturedProducts` cards → `/product/:slug` — works (same
  `ProductCard` component, same route)
- Product page → related products (`getRelatedProducts`, same category) →
  `/product/:slug` — works
- The homepage was not modified and continues to work exactly as it did
  at the end of Part 02

## 14. Performance

- `productQuery.js` is pure and has no React dependency, so filtering/
  sorting/search can run in a `useMemo` without re-fetching or re-deriving
  category/size lists on every keystroke
- `Shop.jsx` fetches products, categories, and sizes once per mount, not
  per filter change
- No new dependencies were installed — filtering/sorting/search are ~120
  lines of plain JS, no library needed

## 15. Design consistency

No new visual language was introduced. Shop and Product reuse: the
existing type scale (`text-h1`/`text-h2`/`text-h3`/`text-lead`/`text-label`/
`text-small`), the existing `.btn`/`.tag`/`.input`/`.divider` primitives,
the same black/white/paper/graphite/silver/signal palette, the same sharp
corners (`--radius: 0`), and the same `Reveal` scroll-in pattern used
throughout the homepage.

## What was completed in Part 03

- `/shop`: editorial header, `ShopToolbar` (search/sort/filter), live
  grid, skeleton loading state, two empty states
- Product data model rewritten to the full shape requested (variants,
  measurements, images, tags, featured/new/status, etc.), with 6 sample
  LAGAMLESS products covering every stock/sale state
- `services/products.js` extended with `getRelatedProducts`,
  `getCategories`, `getAllSizes`, keeping `getAllProducts`/
  `getProductBySlug`/`getFeaturedProducts` signature-compatible
- `src/lib/productQuery.js`: new pure filter/sort/search module
- `ProductCard` rewritten for the new data shape (badges, sale price,
  size chips, hover image cross-fade) without changing its public API
- `/product/:slug` rebuilt: gallery + thumbnails, size selector, sale
  price, stock badges, details/measurements accordions, related products,
  and a proper 404 state for unknown slugs
- Shared `.shop-grid`/`.product-grid` rules centralized in `global.css`
- Verified zero build errors, zero lint warnings, all routes reachable,
  no console-breaking changes

## Remaining placeholder content

- All product photography is still `src: null` placeholders — see §5
  above for how to swap it in
- Homepage photography (`data/homeImages.js`) is still unchanged from
  Part 02 — out of scope for Part 03
- Cart, Checkout, and Admin pages are still Part 01 placeholders —
  intentionally out of scope for Part 03 per the brief
- "Add to bag" on the Product page shows local, non-persistent "Added ✓"
  feedback only (2-second reset) — there is still no cart/session state,
  as instructed; it does not add anything to a real cart

## What remains for Part 04

- Cart/session state management (a cart context, actually wiring "Add to
  bag" and the navbar cart icon to real state)
- Full Checkout flow
- Connect Supabase (Postgres, Storage, Auth) behind `services/products.js`
  — `getAllProducts`, `getProductBySlug`, `getFeaturedProducts`,
  `getRelatedProducts`, `getCategories`, and `getAllSizes` are the six
  functions to re-implement against Supabase without touching Shop,
  Product, or ProductCard
- `/admin/products`, `/admin/orders`, `/admin/customers` routes + pages,
  including product CRUD that would write to the same `products`/
  `product_variants`/`product_images` shape this part's data model mirrors
- Payments + shipping provider integration
- Replace placeholder photography in `data/products.js` and
  `data/homeImages.js` with real shots once available
- Wire the existing navbar search icon to the same `searchProducts()`
  helper (currently decorative — Part 03 scope was the Shop page's own
  search box, not global site search)

## Important technical decisions

- **Product data stays in one file, behind one service layer** — same
  Part 01/02 principle, now proven out with a materially richer shape
  (variants, measurements, images, tags) without touching any component
  signature.
- **Filter/sort/search logic is pure and framework-agnostic**
  (`lib/productQuery.js`), not baked into `Shop.jsx` — kept independently
  testable and reusable if a second listing page (e.g. a category landing
  page) is added later.
- **`ProductCard` gained fields, not a new API** — `FeaturedProducts.jsx`
  on the homepage required zero changes despite the data model getting
  significantly richer.
- **Availability is derived, not stored** — `getAvailability()` computes
  in-stock/low-stock/sold-out from variant stock on the fly, so there is
  a single source of truth (`variants[].stock`) instead of a separate
  status flag that could drift out of sync.
- **No cart state introduced in this part** — "Add to bag" gives local UI
  feedback only, deliberately not persisted, so Part 04's real cart
  context is the first and only place cart state will live.
- **Shared grid rules moved to `global.css`** — `.shop-grid`/
  `.product-grid` are used by three different pages/sections (Shop,
  Product's related row, and the homepage's `FeaturedProducts`), so the
  breakpoints are defined once instead of copy-pasted per page.
- **oxlint** remains the configured linter — `npm run lint` reports 0
  warnings, 0 errors after this part.

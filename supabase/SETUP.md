# Supabase setup — LAGAMLESS (Part 08B-1)

This project can run two ways:

- **Unconfigured (default, zero setup):** no `.env` file / no Supabase env
  vars set → the app automatically falls back to the local in-memory
  catalog from `src/data/products.js`, exactly like Parts 01–07. Nothing
  breaks if you skip this whole document for now.
- **Configured:** follow the steps below and the storefront + admin panel
  read/write real Supabase data instead.

## 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), sign in, and create a new
project. Pick any name/region/database password (save the DB password
somewhere safe — you won't need it for this app, but you might for direct
DB access later).

## 2. Find your Project URL

In the Supabase dashboard: **Project Settings → API → Project URL**.
It looks like `https://xxxxxxxxxxxx.supabase.co`.

## 3. Find your public/anon key

Same page: **Project Settings → API → Project API keys → `anon` `public`**.

> ⚠️ **Never copy the `service_role` key into this project.** The
> `service_role` key bypasses Row Level Security entirely. This is a
> frontend React app — anything placed in a `VITE_`-prefixed environment
> variable is bundled into the JavaScript that ships to every visitor's
> browser. Only the `anon` key belongs here.

## 4. Put them in `.env`

Copy the example file and fill it in:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

Restart `npm run dev` after editing `.env` (Vite only reads env files on
startup).

## 5. Run `schema.sql`

Open **SQL Editor** in the Supabase dashboard → **New query** → paste the
entire contents of `supabase/schema.sql` → **Run**.

This creates `profiles`, `products`, `product_images`, `product_variants`,
`orders`, `order_items`, `payments`, `shipping`, plus indexes and Row Level
Security policies. Only `products` / `product_images` / `product_variants`
are used by the app in this part; the rest are empty foundational tables
for Part 08B/09.

## 6. Run `seed.sql`

Same SQL Editor → **New query** → paste the entire contents of
`supabase/seed.sql` → **Run**.

This inserts the same six LAGAMLESS sample products (and their variants +
image-slot rows) that shipped in the local catalog in Parts 03–07, so the
storefront looks identical once you switch it over to Supabase.

## 6b. Run `part-08b1-auth.sql` — authentication foundation

Same SQL Editor → **New query** → paste the entire contents of
`supabase/part-08b1-auth.sql` → **Run**.

This adds:

- A trigger that automatically creates a `profiles` row (always
  `role: 'customer'`) whenever a new user signs up — through this app's
  `/signup` form or otherwise. You never need to (and the frontend never
  does) insert into `profiles` directly.
- Row Level Security policies letting a signed-in user read and update
  **their own** `profiles` row only — no one can read or write another
  user's profile.

Safe to run before or after any customers have already signed up against
this project; it only adds a trigger and two policies, it doesn't touch
existing rows.

## 6c. Configure Supabase Auth settings

In the Supabase dashboard, go to **Authentication → Providers → Email**
and decide whether **Confirm email** is on:

- **On (default, recommended for production):** after `/signup`, the
  user gets a confirmation email and is *not* signed in until they click
  it. The Signup page already handles this — it shows a "check your
  email" message instead of pretending the person is logged in.
- **Off (convenient for local testing):** `/signup` signs the user in
  immediately with no confirmation step.

Also check **Authentication → URL Configuration → Redirect URLs** and
make sure your dev/prod origin (e.g. `http://localhost:5173`, or your
deployed domain) is on the allow list — `resetPasswordForEmail()` in
`src/services/auth.js` sends the user back to `/reset-password` on
whichever origin the app is running on, and Supabase will reject a
redirect to an origin that isn't allow-listed.

## 6d. Run `part-08b2a-admin-security.sql` — admin security + RLS foundation

Same SQL Editor → **New query** → paste the entire contents of
`supabase/part-08b2a-admin-security.sql` → **Run**.

This adds:

- `is_admin()` — a database function every admin-scoped policy below reuses
  to check `profiles.role = 'admin'` for the current user.
- A trigger that stops a signed-in user from ever changing their own
  `role` (closes the gap called out in `part-08b1-auth.sql` §2).
- Admin-scoped Row Level Security on `products`, `product_variants`,
  `product_images`, `profiles`, `orders`, `order_items`, `payments`, and
  `shipping` — admins get full access, customers keep read-only access to
  their own data only, and the public-read policies from `schema.sql` are
  untouched.
- Row Level Security on `storage.objects` for the `product-images` bucket:
  anyone can read, only admins can upload/update/delete.

Safe to run before or after customers/products already exist — it only
adds functions, a trigger, and policies, and never drops or recreates a
table.

## 7. Create the `product-images` Storage bucket

This step is manual — bucket creation is not scripted through `schema.sql`
because it's a Storage-service action, not a plain SQL statement.

1. In the Supabase dashboard, go to **Storage**.
2. Click **New bucket**.
3. Name it exactly: `product-images`
4. Set it to **Public** (so `getPublicUrl()` returns a directly-usable
   image URL for the storefront — there's no sensitive data in product
   photography).
5. Click **Create bucket**.

No further setup is required for public read access on a Public bucket.
Uploads/updates/deletes are governed entirely by the storage policies
added in step 6d above (`part-08b2a-admin-security.sql`): only a
signed-in user whose `profiles.role = 'admin'` can write to this bucket,
and there is still no image-upload *UI* wired up yet — that arrives in
Part 08B-2B.

## 8. Start the local project

```bash
npm install
npm run dev
```

## 9. Verify products load from Supabase

Open the app and check:

- `/shop` shows the 6 LAGAMLESS products.
- `/product/lagamless-001` (etc.) loads product detail, sizes, and stock
  states.
- Open your browser's Network tab — requests to
  `https://xxxxxxxxxxxx.supabase.co/rest/v1/products...` should appear.

If you see the local placeholder catalog instead (products load, but no
Supabase network requests happen), double check `.env` is filled in and
that you restarted `npm run dev` after editing it.

## 10. Verify authentication

- `/signup` — create an account. If email confirmation is on, check your
  inbox and click the link before trying to sign in.
- `/login` — sign in with that account.
- Refresh the page — you should stay signed in (session persistence).
- `/account` — should show your name, email, and account type (`customer`).
- Log out from `/account` or the navbar — `/account` should then redirect
  you to `/login` if you try to visit it again.
- `/forgot-password` — request a reset link, then follow it to
  `/reset-password` and set a new password.
- In the Supabase dashboard, check **Table Editor → profiles** — a row
  should exist for your new user with `role = customer`.

## 11. First admin setup

There is no public/UI way to become an admin in this app — no signup
checkbox, no hidden query param, nothing. `handle_new_auth_user()`
(`part-08b1-auth.sql`) always creates new profiles with `role = 'customer'`,
and `enforce_profile_role_immutable()` (`part-08b2a-admin-security.sql`)
stops a signed-in user from changing their own role. The **only**
supported way to create the first admin is directly in the Supabase
dashboard, by someone who already has dashboard access to this project:

1. Sign up for a normal account through `/signup` on the running app, the
   same way any customer would. Confirm the email if confirmation is on.
2. In the Supabase dashboard, go to **Table Editor → profiles**.
3. Find the row whose `id` matches that user (cross-check against
   **Authentication → Users** if you're not sure which row is theirs).
4. Edit that row's `role` column from `customer` to `admin`, and save.
5. Sign that user out and back in on the app (or just refresh — the next
   profile fetch picks up the new role). They can now reach `/admin/*`.

Alternatively, in **SQL Editor**, run (replacing the email):

```sql
update profiles
set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```

To promote additional admins later, an already-signed-in admin can update
another user's `role` themselves — the "Admins can update all profiles"
policy allows it — but there is still no admin-facing UI for this in Part
08B-2A; it's a direct Table Editor/SQL edit only, same as the first admin,
until Part 08B-2B (or later) adds a real customer/role-management screen.

## Reminders

- **Never** put a `service_role` key in `.env`, in any `VITE_*` variable,
  or anywhere else in this frontend project.
- Payment gateways and shipping providers are still **not** implemented —
  see `BUILD_STATUS.md` for what's planned in Part 09.
- As of Part 08B-2A, admin authentication/authorization **is** real:
  `AdminRoute` gates every `/admin/*` page on `profiles.role = 'admin'`,
  and the same check is enforced independently at the database level via
  `is_admin()` and the RLS policies in `part-08b2a-admin-security.sql` —
  so even a modified/malicious frontend can't read or write admin-only
  data without a real admin session.
- Admin create/update/delete/inventory actions in the UI (`ProductForm`,
  `AdminInventory`, etc.) still write to the local in-memory catalog only
  — real Supabase-backed product CRUD is Part 08B-2B, not this part. RLS
  would now correctly *allow* an authenticated admin to write to
  `products`/`product_variants`/`product_images`, but nothing in the admin
  UI calls that path yet.
- The `role` column on `profiles` is now protected: a signed-in customer
  cannot change their own `role` via any client-side call (see
  `enforce_profile_role_immutable()` in `part-08b2a-admin-security.sql`),
  closing the gap called out in `part-08b1-auth.sql`.

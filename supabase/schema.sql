-- ============================================================================
-- LAGAMLESS — Supabase schema (Part 08A)
--
-- Scope of this part: products, product_images, product_variants are fully
-- functional. orders, order_items, payments, shipping, profiles are created
-- as foundational tables for Part 08B/09 but have no application logic yet
-- (no payment/shipping/auth features are implemented against them).
--
-- Run this once in the Supabase SQL Editor on a fresh project, then run
-- seed.sql. Safe to re-run: every statement is guarded with IF NOT EXISTS /
-- DROP ... IF EXISTS where practical.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Helper: keep updated_at current on any UPDATE
-- ----------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- profiles
-- Foundational only in this part. Will back admin/customer roles once
-- Supabase Auth is added in Part 08B (one row per auth.users id).
-- ============================================================================
create table if not exists profiles (
  id uuid primary key,
  full_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on profiles;
create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ============================================================================
-- products
-- ============================================================================
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  product_number text not null unique,        -- e.g. "LAGAMLESS 001"
  sku text not null unique,
  name text not null,
  slug text not null unique,
  price numeric(10, 2) not null check (price >= 0),
  compare_at_price numeric(10, 2) check (compare_at_price is null or compare_at_price >= 0),
  description text not null default '',
  story text not null default '',
  fabric text not null default '',
  gsm integer not null default 0 check (gsm >= 0),
  fit text not null default '',
  construction text not null default '',       -- build/stitching notes (Product DNA)
  design text not null default '',             -- design-intent note
  care text not null default '',               -- care instructions
  styling_note text not null default '',       -- "how to wear it" copy
  measurements jsonb not null default '{}'::jsonb, -- { [size]: { chest, length, shoulder } }
  category text not null default '',
  tags text[] not null default '{}',
  collections text[] not null default '{}',   -- store placement: homepage/shop category slugs (see part-11)
  is_featured boolean not null default false,
  is_new_arrival boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_products_updated_at on products;
create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

create index if not exists idx_products_slug on products (slug);
create index if not exists idx_products_status on products (status);
create index if not exists idx_products_category on products (category);

-- ============================================================================
-- product_images
-- ============================================================================
create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  image_url text,               -- public/displayable URL (Supabase Storage or external)
  storage_path text,            -- path within the product-images bucket, if uploaded there
  image_type text not null default 'other'
    check (image_type in ('main', 'front', 'back', 'model', 'detail', 'fabric', 'design', 'lifestyle', 'other')),
  alt_text text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_images_product_id on product_images (product_id);

-- ============================================================================
-- product_variants (per-size inventory)
-- ============================================================================
create table if not exists product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  size text not null,             -- not a fixed enum: S/M/L/XL today, extensible later
  sku text unique,                -- optional per-variant SKU, distinct from products.sku
  stock integer not null default 0 check (stock >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, size)
);

drop trigger if exists trg_product_variants_updated_at on product_variants;
create trigger trg_product_variants_updated_at
  before update on product_variants
  for each row execute function set_updated_at();

create index if not exists idx_product_variants_product_id on product_variants (product_id);

-- ============================================================================
-- orders / order_items / payments / shipping
-- Foundational tables for Part 08B/09. No app logic reads/writes these yet.
-- ============================================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles (id),
  customer_email text,
  customer_name text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  subtotal numeric(10, 2) not null default 0,
  shipping_total numeric(10, 2),
  discount_total numeric(10, 2) not null default 0,
  total numeric(10, 2),
  shipping_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_orders_updated_at on orders;
create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

create index if not exists idx_orders_customer_id on orders (customer_id);
create index if not exists idx_orders_status on orders (status);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  product_id uuid references products (id),
  variant_id uuid references product_variants (id),
  product_name text not null,
  sku text,
  size text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10, 2) not null,
  line_total numeric(10, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_items_order_id on order_items (order_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  provider text,                 -- e.g. 'razorpay', 'cashfree', 'stripe' (Part 08B/09)
  provider_reference text,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'paid', 'failed', 'refunded')),
  amount numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_payments_updated_at on payments;
create trigger trg_payments_updated_at
  before update on payments
  for each row execute function set_updated_at();

create index if not exists idx_payments_order_id on payments (order_id);

create table if not exists shipping (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  provider text,                 -- e.g. 'shiprocket', 'delhivery', 'indiapost' (Part 09)
  tracking_number text,
  status text not null default 'pending'
    check (status in ('pending', 'label_created', 'in_transit', 'delivered', 'returned')),
  estimated_delivery date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_shipping_updated_at on shipping;
create trigger trg_shipping_updated_at
  before update on shipping
  for each row execute function set_updated_at();

create index if not exists idx_shipping_order_id on shipping (order_id);

-- ============================================================================
-- Row Level Security
--
-- Foundation only: public read of PUBLISHED product data, no public writes
-- anywhere. Real admin write access (via authenticated + role='admin')
-- arrives in Part 08B — until then, the admin panel's write attempts are
-- expected to be rejected by RLS and the app falls back to local-only
-- editing (see BUILD_STATUS.md). This is intentional: we do not create a
-- permissive "anyone can write" policy just to make the current UI's
-- write buttons appear to work.
-- ============================================================================

alter table profiles enable row level security;
alter table products enable row level security;
alter table product_images enable row level security;
alter table product_variants enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table shipping enable row level security;

-- products: public can read published products only
drop policy if exists "Public can read published products" on products;
create policy "Public can read published products"
  on products for select
  using (status = 'published');

-- product_images: public can read images that belong to a published product
drop policy if exists "Public can read images of published products" on product_images;
create policy "Public can read images of published products"
  on product_images for select
  using (
    exists (
      select 1 from products
      where products.id = product_images.product_id
        and products.status = 'published'
    )
  );

-- product_variants: public can read variants that belong to a published
-- product (needed for size availability / stock display — no separate
-- "hide stock numbers" policy exists at the DB layer; that redaction is a
-- UI-layer concern in this app, same as it was with the local data).
drop policy if exists "Public can read variants of published products" on product_variants;
create policy "Public can read variants of published products"
  on product_variants for select
  using (
    exists (
      select 1 from products
      where products.id = product_variants.product_id
        and products.status = 'published'
    )
  );

-- No insert/update/delete policies are defined for products, product_images,
-- or product_variants, and no policies at all are defined for profiles,
-- orders, order_items, payments, or shipping. With RLS enabled and no
-- matching policy, PostgREST/Supabase denies the operation by default —
-- this is the "safest sensible foundation" the brief asks for. Part 08B
-- adds authenticated-admin policies (e.g. `auth.uid() in (select id from
-- profiles where role = 'admin')`) in exactly these gaps.

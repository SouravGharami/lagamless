-- ============================================================================
-- LAGAMLESS — Seed data (Part 08A)
--
-- The exact six sample products from Part 03–07's local catalog
-- (src/data/products.js), reproduced here so Supabase becomes a drop-in
-- replacement rather than a different catalog. Image URLs are left NULL
-- (placeholder) since no real photography exists yet — same behavior as
-- the local data's `src: null` image slots.
--
-- Run this AFTER schema.sql, in the Supabase SQL Editor. Safe to re-run
-- against an empty catalog; re-running against a non-empty one will fail
-- on the unique constraints (product_number/sku/slug) rather than
-- duplicating rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- LAGAMLESS 001 — Oversized Tee — Ink
-- ----------------------------------------------------------------------------
with p1 as (
  insert into products (
    product_number, sku, name, slug, price, compare_at_price, description, story,
    fabric, gsm, fit, construction, design, care, styling_note, measurements,
    category, tags, is_featured, is_new_arrival, status, created_at
  ) values (
    'LAGAMLESS 001', 'LGML-001-INK', 'Oversized Tee — Ink', 'lagamless-001',
    1799, null,
    'A heavyweight oversized tee cut for drape, not shrink.',
    'Built around a dropped shoulder and a boxier body than a standard tee, this is the piece the rest of the line is measured against. Garment-washed once for a lived-in hand-feel from the first wear.',
    '240 GSM combed cotton, garment-dyed', 240, 'Oversized',
    'Single jersey knit, tubular body, double-stitched hems throughout.',
    'Zero branding on the face — the dropped shoulder line is the only signature.',
    'Machine wash cold, inside out. Do not bleach. Tumble dry low. Warm iron if needed.',
    'Worn oversized on purpose — let it sit past the hip and cuff the sleeve once.',
    '{"S":{"chest":44,"length":27,"shoulder":21},"M":{"chest":46,"length":28,"shoulder":22},"L":{"chest":48,"length":29,"shoulder":23},"XL":{"chest":50,"length":30,"shoulder":24}}'::jsonb,
    'Tees', array['tee','oversized','cotton','essentials'], true, true, 'published', '2026-08-20'
  ) returning id
)
insert into product_variants (product_id, size, stock)
select id, size, stock from p1, (values ('S', 6), ('M', 12), ('L', 9), ('XL', 0)) as v(size, stock);

insert into product_images (product_id, image_url, storage_path, image_type, alt_text, sort_order)
select id, null, null, slot, alt, ord
from (select id from products where slug = 'lagamless-001') p,
(values
  ('main', 'LAGAMLESS 001 Oversized Tee in Ink, front view', 0),
  ('front', 'LAGAMLESS 001 Oversized Tee, full front', 1),
  ('back', 'LAGAMLESS 001 Oversized Tee, full back', 2),
  ('model', 'Model wearing LAGAMLESS 001 Oversized Tee', 3),
  ('detail', 'LAGAMLESS 001 neckline and stitch detail', 4),
  ('fabric', 'LAGAMLESS 001 fabric close-up', 5)
) as s(slot, alt, ord);

-- ----------------------------------------------------------------------------
-- LAGAMLESS 002 — Boxy Hoodie — Charcoal
-- ----------------------------------------------------------------------------
with p2 as (
  insert into products (
    product_number, sku, name, slug, price, compare_at_price, description, story,
    fabric, gsm, fit, construction, design, care, styling_note, measurements,
    category, tags, is_featured, is_new_arrival, status, created_at
  ) values (
    'LAGAMLESS 002', 'LGML-002-CHR', 'Boxy Hoodie — Charcoal', 'lagamless-002',
    3499, 3999,
    'A dropped, boxy hoodie in brushed fleece with a heavy hand.',
    'Cut wide across the body and short in the sleeve-to-hem ratio on purpose, this hoodie is built to layer. The hood is unlined for a cleaner silhouette when it is down.',
    '380 GSM brushed-back fleece, cotton-poly', 380, 'Boxy',
    'Loopback fleece body, flat-seamed set-in sleeve, unlined hood.',
    'A dropped, boxy block built to layer without adding bulk.',
    'Machine wash cold with like colors. Do not bleach. Tumble dry low. Do not iron print areas.',
    'Layer over a boxy tee and let the hood sit flat and unstructured.',
    '{"S":{"chest":46,"length":25,"shoulder":23},"M":{"chest":48,"length":26,"shoulder":24},"L":{"chest":50,"length":27,"shoulder":25},"XL":{"chest":52,"length":28,"shoulder":26}}'::jsonb,
    'Hoodies', array['hoodie','boxy','fleece','new'], true, true, 'published', '2026-08-25'
  ) returning id
)
insert into product_variants (product_id, size, stock)
select id, size, stock from p2, (values ('S', 3), ('M', 5), ('L', 4), ('XL', 2)) as v(size, stock);

insert into product_images (product_id, image_url, storage_path, image_type, alt_text, sort_order)
select id, null, null, slot, alt, ord
from (select id from products where slug = 'lagamless-002') p,
(values
  ('main', 'LAGAMLESS 002 Boxy Hoodie in Charcoal, front view', 0),
  ('front', 'LAGAMLESS 002 Boxy Hoodie, full front', 1),
  ('back', 'LAGAMLESS 002 Boxy Hoodie, full back', 2),
  ('model', 'Model wearing LAGAMLESS 002 Boxy Hoodie', 3),
  ('detail', 'LAGAMLESS 002 drawcord and pocket detail', 4),
  ('fabric', 'LAGAMLESS 002 fleece close-up', 5)
) as s(slot, alt, ord);

-- ----------------------------------------------------------------------------
-- LAGAMLESS 003 — Drop-Shoulder Shirt — Bone
-- ----------------------------------------------------------------------------
with p3 as (
  insert into products (
    product_number, sku, name, slug, price, compare_at_price, description, story,
    fabric, gsm, fit, construction, design, care, styling_note, measurements,
    category, tags, is_featured, is_new_arrival, status, created_at
  ) values (
    'LAGAMLESS 003', 'LGML-003-BNE', 'Drop-Shoulder Shirt — Bone', 'lagamless-003',
    2299, null,
    'A relaxed woven shirt with a dropped shoulder seam.',
    'Midweight cotton poplin with enough structure to hold its shape open or buttoned to the top. The dropped shoulder seam is the only detail doing the work here.',
    '150 GSM cotton poplin', 150, 'Relaxed',
    'Single-needle stitched yoke, dropped shoulder seam, corozo-style buttons.',
    'One deliberate detail — the dropped shoulder seam — carries the whole shirt.',
    'Machine wash cold. Do not bleach. Hang dry. Warm iron if needed.',
    'Wear it open over a plain tee, or buttoned to the top and untucked.',
    '{"S":{"chest":45,"length":28,"shoulder":22},"M":{"chest":47,"length":29,"shoulder":23},"L":{"chest":49,"length":30,"shoulder":24}}'::jsonb,
    'Shirts', array['shirt','woven','relaxed'], false, false, 'published', '2026-06-10'
  ) returning id
)
insert into product_variants (product_id, size, stock)
select id, size, stock from p3, (values ('S', 4), ('M', 0), ('L', 3)) as v(size, stock);

insert into product_images (product_id, image_url, storage_path, image_type, alt_text, sort_order)
select id, null, null, slot, alt, ord
from (select id from products where slug = 'lagamless-003') p,
(values
  ('main', 'LAGAMLESS 003 Drop-Shoulder Shirt in Bone, front view', 0),
  ('front', 'LAGAMLESS 003 shirt, full front', 1),
  ('back', 'LAGAMLESS 003 shirt, full back', 2),
  ('model', 'Model wearing LAGAMLESS 003 shirt', 3),
  ('detail', 'LAGAMLESS 003 collar and button detail', 4),
  ('fabric', 'LAGAMLESS 003 poplin close-up', 5)
) as s(slot, alt, ord);

-- ----------------------------------------------------------------------------
-- LAGAMLESS 004 — Cargo Pant — Stone
-- ----------------------------------------------------------------------------
with p4 as (
  insert into products (
    product_number, sku, name, slug, price, compare_at_price, description, story,
    fabric, gsm, fit, construction, design, care, styling_note, measurements,
    category, tags, is_featured, is_new_arrival, status, created_at
  ) values (
    'LAGAMLESS 004', 'LGML-004-STN', 'Cargo Pant — Stone', 'lagamless-004',
    2999, null,
    'A tapered cargo pant with utility pockets and a clean leg line.',
    'Six-pocket construction on a tapered leg, so the utility detailing does not fight the silhouette. Finished with an adjustable internal waist tab.',
    '260 GSM cotton twill', 260, 'Tapered',
    'Six-pocket cargo build, bar-tacked stress points, adjustable internal waist tab.',
    'Utility pocketing kept low-profile so it never fights the tapered leg line.',
    'Machine wash cold, inside out. Do not bleach. Tumble dry low.',
    'Break the leg with a chunky boot and keep the top half boxy and simple.',
    '{"S":{"chest":32,"length":40,"shoulder":0},"M":{"chest":34,"length":41,"shoulder":0},"L":{"chest":36,"length":42,"shoulder":0},"XL":{"chest":38,"length":43,"shoulder":0}}'::jsonb,
    'Bottoms', array['pants','cargo','twill'], true, false, 'published', '2026-05-02'
  ) returning id
)
insert into product_variants (product_id, size, stock)
select id, size, stock from p4, (values ('S', 5), ('M', 7), ('L', 6), ('XL', 1)) as v(size, stock);

insert into product_images (product_id, image_url, storage_path, image_type, alt_text, sort_order)
select id, null, null, slot, alt, ord
from (select id from products where slug = 'lagamless-004') p,
(values
  ('main', 'LAGAMLESS 004 Cargo Pant in Stone, front view', 0),
  ('front', 'LAGAMLESS 004 cargo pant, full front', 1),
  ('back', 'LAGAMLESS 004 cargo pant, full back', 2),
  ('model', 'Model wearing LAGAMLESS 004 cargo pant', 3),
  ('detail', 'LAGAMLESS 004 pocket and hardware detail', 4),
  ('fabric', 'LAGAMLESS 004 twill close-up', 5)
) as s(slot, alt, ord);

-- ----------------------------------------------------------------------------
-- LAGAMLESS 005 — Boxy Tee — Black
-- ----------------------------------------------------------------------------
with p5 as (
  insert into products (
    product_number, sku, name, slug, price, compare_at_price, description, story,
    fabric, gsm, fit, construction, design, care, styling_note, measurements,
    category, tags, is_featured, is_new_arrival, status, created_at
  ) values (
    'LAGAMLESS 005', 'LGML-005-BLK', 'Boxy Tee — Black', 'lagamless-005',
    1699, null,
    'The everyday boxy tee. Squared hem, dropped shoulder.',
    'A tighter, everyday cousin of LAGAMLESS 001 — same dropped shoulder logic, slightly less volume, built to be the base layer under a hoodie or shirt.',
    '220 GSM combed cotton', 220, 'Boxy',
    'Single jersey knit, tubular body, taped neck seam.',
    'A tighter, everyday cut of the same dropped-shoulder logic as LAGAMLESS 001.',
    'Machine wash cold, inside out. Do not bleach. Tumble dry low.',
    'Built as a base layer — tuck it under a hoodie or an open shirt.',
    '{"S":{"chest":42,"length":26,"shoulder":20},"M":{"chest":44,"length":27,"shoulder":21},"L":{"chest":46,"length":28,"shoulder":22},"XL":{"chest":48,"length":29,"shoulder":23}}'::jsonb,
    'Tees', array['tee','boxy','cotton','essentials'], false, true, 'published', '2026-08-30'
  ) returning id
)
insert into product_variants (product_id, size, stock)
select id, size, stock from p5, (values ('S', 10), ('M', 14), ('L', 11), ('XL', 8)) as v(size, stock);

insert into product_images (product_id, image_url, storage_path, image_type, alt_text, sort_order)
select id, null, null, slot, alt, ord
from (select id from products where slug = 'lagamless-005') p,
(values
  ('main', 'LAGAMLESS 005 Boxy Tee in Black, front view', 0),
  ('front', 'LAGAMLESS 005 tee, full front', 1),
  ('back', 'LAGAMLESS 005 tee, full back', 2),
  ('model', 'Model wearing LAGAMLESS 005 tee', 3),
  ('detail', 'LAGAMLESS 005 hem and seam detail', 4),
  ('fabric', 'LAGAMLESS 005 fabric close-up', 5)
) as s(slot, alt, ord);

-- ----------------------------------------------------------------------------
-- LAGAMLESS 006 — Coach Jacket — Olive (fully sold out, on sale)
-- ----------------------------------------------------------------------------
with p6 as (
  insert into products (
    product_number, sku, name, slug, price, compare_at_price, description, story,
    fabric, gsm, fit, construction, design, care, styling_note, measurements,
    category, tags, is_featured, is_new_arrival, status, created_at
  ) values (
    'LAGAMLESS 006', 'LGML-006-OLV', 'Coach Jacket — Olive', 'lagamless-006',
    3999, 4599,
    'A lightweight coach jacket with a snap placket and drawcord hem.',
    'Shell-weight nylon over a mesh lining, cut a size roomier through the body so it layers over a hoodie without fighting for space through the shoulder.',
    'Nylon shell, mesh lining', 0, 'Relaxed',
    'Bonded-seam shell over mesh lining, snap placket, drawcord hem with cord locks.',
    'Cut a size roomier through the body so it layers cleanly over a hoodie.',
    'Machine wash cold on a gentle cycle. Do not bleach. Hang dry. Do not iron.',
    'Snap it up over a boxy hoodie and leave the drawcord loose.',
    '{"M":{"chest":50,"length":28,"shoulder":24},"L":{"chest":52,"length":29,"shoulder":25},"XL":{"chest":54,"length":30,"shoulder":26}}'::jsonb,
    'Outerwear', array['jacket','outerwear','nylon'], false, false, 'published', '2026-03-15'
  ) returning id
)
insert into product_variants (product_id, size, stock)
select id, size, stock from p6, (values ('M', 0), ('L', 0), ('XL', 0)) as v(size, stock);

insert into product_images (product_id, image_url, storage_path, image_type, alt_text, sort_order)
select id, null, null, slot, alt, ord
from (select id from products where slug = 'lagamless-006') p,
(values
  ('main', 'LAGAMLESS 006 Coach Jacket in Olive, front view', 0),
  ('front', 'LAGAMLESS 006 jacket, full front', 1),
  ('back', 'LAGAMLESS 006 jacket, full back', 2),
  ('model', 'Model wearing LAGAMLESS 006 jacket', 3),
  ('detail', 'LAGAMLESS 006 snap placket detail', 4),
  ('fabric', 'LAGAMLESS 006 shell fabric close-up', 5)
) as s(slot, alt, ord);

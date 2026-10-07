-- ============================================================================
-- Part 34 — make sure EVERY product image slot can be saved
--
-- SYMPTOM: upload photos in all 8 slots of Add/Edit Product -> only the first
-- three (Main, Front, 3/4 Front) were kept; Side, Back, 3/4 Back, Detail and
-- Fabric vanished.
--
-- ROOT CAUSE: `product_images.image_type` has a CHECK constraint. The original
-- schema only allowed main/front/back/model/detail/fabric, and the "side" and
-- "three_quarter_back" values only exist if part-29 was run. Slots are saved in
-- order (Main, Front, 3/4 Front, Side, ...), so the 4th slot ("side") was
-- rejected by the database, and the old save loop stopped right there — the
-- remaining slots were never even attempted.
--
-- This script is idempotent: it simply (re)installs the full list of allowed
-- slot names. Run it once in Supabase -> SQL Editor. No data is changed.
-- ============================================================================

alter table product_images drop constraint if exists product_images_image_type_check;

alter table product_images add constraint product_images_image_type_check
  check (image_type in (
    'main', 'front', 'model', 'side', 'back', 'three_quarter_back',
    'detail', 'fabric',
    'design', 'lifestyle', 'other'
  ));

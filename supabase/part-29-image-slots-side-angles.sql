-- ============================================================================
-- Part 29 — image slots for the Side and 3/4 Back mockup angles
--
-- ROOT CAUSE: Mockup Studio has always had six angle tabs (front, 3/4
-- front, side, back, 3/4 back, detail), but `ANGLES` in
-- src/admin/lib/mockupTemplates.js only assigned a `slot` to four of
-- them — "side" and "three-quarter-back" had `slot: null`. That meant
-- generateMockupFiles() silently never produced files for those two
-- angles at all, so they had nothing to fail on — not a save bug, a
-- "this file was never generated" bug. That's fixed in code (mockupTemplates.js
-- now assigns slot: 'side' and slot: 'three_quarter_back'), but those two
-- values also need to be allowed by this table's check constraint, or the
-- very first save attempt for them throws at the database.
--
-- Purely additive: no existing row's image_type is touched, no data is
-- migrated or backfilled. Safe to re-run.
-- ============================================================================

alter table product_images drop constraint if exists product_images_image_type_check;

alter table product_images add constraint product_images_image_type_check
  check (image_type in (
    'main', 'front', 'back', 'model', 'detail', 'fabric',
    'side', 'three_quarter_back',
    'design', 'lifestyle', 'other'
  ));

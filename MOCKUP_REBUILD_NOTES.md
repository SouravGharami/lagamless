# Mockup Studio rebuild — what changed and what you still need to do

## What was wrong
The old studio (`mockupSvg.js` + `mockupTemplates.js`) drew the garment as a
hand-authored SVG silhouette and pasted the DTF artwork on top as a flat
rectangle. That's the "cartoon T-shirt / sticker" look you flagged — it was
never going to read as a real product photo, no matter how it was tuned.

## What changed
The garment is no longer drawn. It's replaced end-to-end with a
photo-compositing pipeline:

- **`src/admin/lib/templatePhotoStore.js`** (new) — where real garment
  photographs live, one per angle and colorway. Solid colors reuse a single
  neutral photo (see recoloring below); special finishes (acid wash,
  tie‑dye, marble, washed, mixed) each need their **own real photo per
  colorway**, because those patterns can't be faked from a hex code.
- **`src/admin/lib/photoCompositor.js`** (new) — the actual rendering
  engine. For every print it:
  1. Perspective-warps the artwork onto a 4-corner quad using real
     projective texture mapping (two affine-mapped triangles — a standard
     corner-pin technique), not a flat rectangle.
  2. Multiplies the warped artwork against a contrast-boosted grayscale
     "light map" pulled straight from the real photo, so the fabric's own
     wrinkles, shadows and highlights show back through the ink.
  3. Composites that shaded layer onto the untouched photo with a hint of
     blur so the edge reads as ink in the weave, not a decal edge.
  - Recoloring a *solid* garment photo to a new hex is a lightness‑preserving
    hue remap of that same real photo (folds/shadows survive) — never a
    flat fill, and never used for any special finish.
- **`src/admin/lib/mockupTemplates.js`** (rewritten) — print zones are now
  4-corner quads normalized to 0–1 of whatever the real photo's own
  resolution is, instead of fixed coordinates in an imaginary 800×1000
  vector canvas. Six angles are defined: front, 3/4 front, side, back, 3/4
  back, detail/sleeve.
- **`src/admin/components/mockup/MockupCanvas.jsx`** (rewritten) — renders
  the real `<canvas>` output of the compositor instead of an SVG. The
  existing move/resize/rotate handles still work; **new small square
  handles on each of a print's 4 corners** let you drag a single corner
  independently for a genuine perspective adjustment (e.g. following a
  sleeve's taper), on top of AI's suggested placement.
- **`src/admin/lib/mockupExport.js`** (rewritten) — renders every angle from
  the real photos at 1.5× native resolution for the final PNGs, plus a
  pixel-consistent detail crop and a print-free fabric swatch.
- `mockupSvg.js` was deleted — nothing imports it anymore.

## What I could not do for you
I can't generate real fashion photography — that's the one thing this brief
correctly insists on *not* faking with AI. The engine above is fully wired
and builds cleanly, but until you upload actual photos it'll show an
"upload template photo" prompt per angle instead of a garment.

**To get it fully live:**
1. Shoot (or license) real photos of the oversized tee for each of the six
   angles, in whatever your base "solid" colorway is.
2. Open the Mockup Studio, switch to each angle tab, and use "Upload
   template photo" — this is a one-time setup per angle.
3. For every special finish (acid wash, tie-dye, etc.), shoot that
   colorway specifically and upload it under that fabric + color combo.
4. The print-zone quads in `mockupTemplates.js` are reasonable defaults for
   a straight-on studio shot — once your real photos are in, use the
   corner-perspective handles to nudge a zone until it visually matches
   that exact photo's fabric geometry.

## A known limitation worth knowing about
`templatePhotoStore.js` currently keeps photos in the browser's
`localStorage` as data URLs, so this works today with zero backend changes
but is per-browser and has a storage ceiling (a handful of MB). Before
relying on this in production, move it to real object storage (e.g. a
Supabase Storage bucket) — every call in the studio goes through that one
module's `get/set/list` functions, so that's a small, contained swap.

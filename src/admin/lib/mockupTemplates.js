/**
 * Mockup Studio — garment template registry (photographic).
 *
 * This registry no longer draws the garment — it describes where real
 * photography goes. Every angle needs an actual studio photo of the
 * garment (uploaded once via templatePhotoStore.js and reused for every
 * product), and every print zone is a quad — 4 corner points, normalized
 * to 0..1 of that photo's own width/height — so it works at whatever
 * resolution the real photo actually is, and so a placement can be
 * perspective-correct (following a sleeve's taper, a chest's curve)
 * rather than a flat rectangle.
 *
 * The zone quads below are sane *starting points* for a photo shot
 * straight-on in the usual product-photography pose. They will not be
 * pixel-perfect for a specific real photo the moment it's uploaded — the
 * whole point of the studio's per-corner perspective handles is that the
 * admin nudges a placement's corners to actually match that photo once,
 * for reference, and the "position" dropdown re-centers new prints from
 * these defaults from then on.
 */

/** The six shots the studio produces. Every one needs its own real template photo per garment. */
export const ANGLES = [
  { id: 'front', label: 'Front', slot: 'front' },
  { id: 'three-quarter-front', label: '3/4 Front', slot: 'model' },
  { id: 'side', label: 'Side', slot: 'side' },
  { id: 'back', label: 'Back', slot: 'back' },
  { id: 'three-quarter-back', label: '3/4 Back', slot: 'three_quarter_back' },
  { id: 'detail', label: 'Detail / Sleeve', slot: 'detail' },
]

/**
 * The angles that fill one of the product form's named image slots and
 * need their OWN uploaded template photo to generate: front, back,
 * three-quarter-front ("model"), side, three-quarter-back. `detail` is
 * deliberately excluded even though it also has a `slot` — it is never
 * rendered from its own template photo. It's always synthesized as a
 * crop of the already-rendered front mockup (see generateMockupFiles in
 * mockupExport.js). Including it here previously made Generate Mockups
 * require a template photo for an angle that was never actually used,
 * so a studio with only front/back (and three-quarter-front) photos
 * uploaded would fail 100% of the time with a confusing "no photo for
 * detail" error.
 */
export const MOCKUP_VIEWS = ANGLES.filter((a) => a.slot && a.id !== 'detail').map((a) => ({ angle: a.id, slot: a.slot, label: a.label }))

/**
 * Fabric finishes. `usesHex: true` means the studio can render any
 * colorway from ONE neutral real photo via a lightness-preserving hue
 * remap (see photoCompositor.recolorGarment) — genuinely fine for a
 * plain-dyed cotton. Every other finish is `usesHex: false`: it is never
 * approximated from a hex value, and instead needs its OWN real
 * photograph per colorway (an acid-wash "Storm Grey" and an acid-wash
 * "Rust" are different photos, not the same photo tinted differently).
 */
export const FABRIC_TYPES = [
  { id: 'solid', label: 'Solid', usesHex: true },
  { id: 'acid-wash', label: 'Acid wash', usesHex: false },
  { id: 'washed', label: 'Washed', usesHex: false },
  { id: 'tie-dye', label: 'Tie-dye', usesHex: false },
  { id: 'marble', label: 'Marble', usesHex: false },
  { id: 'mixed', label: 'Mixed colours', usesHex: false },
]

/**
 * Named print areas an artwork can be assigned to, per angle. `quad` is
 * 4 [x, y] points (top-left, top-right, bottom-right, bottom-left),
 * normalized 0..1 against the template photo's own width/height.
 * `bounds` (also normalized) is the safe rectangle a drag/resize is
 * clamped to.
 */
export const PRINT_ZONES = {
  front: [
    { id: 'center-chest', label: 'Center chest',
      quad: [[0.36, 0.28], [0.64, 0.28], [0.64, 0.50], [0.36, 0.50]],
      bounds: { minX: 0.28, maxX: 0.72, minY: 0.22, maxY: 0.55 } },
    { id: 'left-chest', label: 'Left chest',
      quad: [[0.38, 0.24], [0.50, 0.24], [0.50, 0.35], [0.38, 0.35]],
      bounds: { minX: 0.32, maxX: 0.52, minY: 0.20, maxY: 0.40 } },
    { id: 'full-front', label: 'Full front',
      quad: [[0.24, 0.28], [0.76, 0.28], [0.76, 0.82], [0.24, 0.82]],
      bounds: { minX: 0.16, maxX: 0.84, minY: 0.24, maxY: 0.90 } },
    { id: 'left-sleeve', label: 'Left sleeve',
      quad: [[0.08, 0.38], [0.20, 0.36], [0.21, 0.50], [0.09, 0.52]],
      bounds: { minX: 0.04, maxX: 0.24, minY: 0.32, maxY: 0.56 } },
    { id: 'right-sleeve', label: 'Right sleeve',
      quad: [[0.80, 0.36], [0.92, 0.38], [0.91, 0.52], [0.79, 0.50]],
      bounds: { minX: 0.76, maxX: 0.96, minY: 0.32, maxY: 0.56 } },
  ],
  back: [
    { id: 'back-center', label: 'Back center',
      quad: [[0.36, 0.26], [0.64, 0.26], [0.64, 0.48], [0.36, 0.48]],
      bounds: { minX: 0.28, maxX: 0.72, minY: 0.20, maxY: 0.52 } },
    { id: 'back-full', label: 'Full back',
      quad: [[0.24, 0.28], [0.76, 0.28], [0.76, 0.82], [0.24, 0.82]],
      bounds: { minX: 0.16, maxX: 0.84, minY: 0.24, maxY: 0.90 } },
    { id: 'back-yoke', label: 'Upper back / nape',
      quad: [[0.40, 0.16], [0.60, 0.16], [0.60, 0.26], [0.40, 0.26]],
      bounds: { minX: 0.34, maxX: 0.66, minY: 0.12, maxY: 0.30 } },
  ],
  'three-quarter-front': [
    { id: 'center-chest', label: 'Center chest',
      quad: [[0.34, 0.28], [0.60, 0.26], [0.62, 0.50], [0.36, 0.52]],
      bounds: { minX: 0.24, maxX: 0.70, minY: 0.22, maxY: 0.56 } },
  ],
  'three-quarter-back': [
    { id: 'back-center', label: 'Back center',
      quad: [[0.38, 0.26], [0.64, 0.24], [0.66, 0.48], [0.40, 0.50]],
      bounds: { minX: 0.28, maxX: 0.74, minY: 0.20, maxY: 0.52 } },
  ],
  side: [
    { id: 'side-panel', label: 'Side panel',
      quad: [[0.30, 0.30], [0.55, 0.30], [0.55, 0.60], [0.30, 0.60]],
      bounds: { minX: 0.20, maxX: 0.65, minY: 0.24, maxY: 0.68 } },
  ],
  detail: [
    { id: 'detail-crop', label: 'Detail crop',
      quad: [[0.30, 0.30], [0.70, 0.30], [0.70, 0.70], [0.30, 0.70]],
      bounds: { minX: 0.10, maxX: 0.90, minY: 0.10, maxY: 0.90 } },
  ],
}

export function getPrintZones(angle) {
  return PRINT_ZONES[angle] || []
}

export function getZone(angle, zoneId) {
  return getPrintZones(angle).find((z) => z.id === zoneId) || null
}

/** The general torso safe-area (normalized) used to clamp a freehand (non-zone) drag. */
export const TORSO_BOUNDS = { minX: 0.14, maxX: 0.86, minY: 0.14, maxY: 0.92 }

export const GARMENT_TEMPLATES = {
  'oversized-crew': {
    id: 'oversized-crew',
    label: 'Oversized Tee',
  },
}

export function getGarmentTemplate(id = 'oversized-crew') {
  return GARMENT_TEMPLATES[id] || GARMENT_TEMPLATES['oversized-crew']
}

/**
 * Converts a normalized zone quad into pixel-space placement geometry for
 * one specific photo's dimensions: a center x/y, width/height and
 * rotation (the "plain rectangle" a move/resize/rotate handle edits),
 * plus per-corner offsets that reproduce the zone's exact (possibly
 * skewed) quad on top of that rectangle. Leaving the corners untouched
 * reproduces the zone precisely; dragging one further perspective-adjusts
 * it from there.
 */
export function zoneGeometry(zone, photoWidth, photoHeight) {
  const pts = zone.quad.map(([nx, ny]) => ({ x: nx * photoWidth, y: ny * photoHeight }))
  const [tl, tr, , bl] = pts
  const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4
  const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4
  const width = Math.hypot(tr.x - tl.x, tr.y - tl.y)
  const height = Math.hypot(bl.x - tl.x, bl.y - tl.y)
  const rotation = (Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180) / Math.PI

  const rad = (rotation * Math.PI) / 180
  const hw = width / 2
  const hh = height / 2
  const local = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  const base = local.map(([lx, ly]) => ({
    x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
    y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
  }))
  const corners = pts.map((p, i) => ({ dx: p.x - base[i].x, dy: p.y - base[i].y }))

  return { x: cx, y: cy, width, height, rotation, corners }
}

/** Converts a zone's normalized safe-area bounds to one photo's pixel space. */
export function boundsToPixels(bounds, photoWidth, photoHeight) {
  return {
    minX: bounds.minX * photoWidth,
    maxX: bounds.maxX * photoWidth,
    minY: bounds.minY * photoHeight,
    maxY: bounds.maxY * photoHeight,
  }
}

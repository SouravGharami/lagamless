/**
 * Step 5-3A — reusable artwork placement object.
 *
 * All values are in SOURCE PHOTO PIXELS (the photo's own coordinate system, which the masks share), so a placement
 * means the same thing at any preview size. x/y is the top-left of the UNROTATED, UNSCALED box; rotation (degrees) and
 * scale both pivot on the box centre. `deformation` is reserved for future perspective / mesh warping and is null now.
 */
import { DEFAULT_WARP, WARP_MAX, WARP_MIN } from './surfaceWarp.js'

/** Default per-layer fabric integration (0-100) for studio layers. Placement objects built without it default to 0 (flat). */
export const DEFAULT_REALISM = 50

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function createPlacement(partial = {}) {
  return {
    x: num(partial.x, 0),
    y: num(partial.y, 0),
    width: Math.max(0, num(partial.width, 0)),
    height: Math.max(0, num(partial.height, 0)),
    rotation: num(partial.rotation, 0),
    scale: num(partial.scale, 1) > 0 ? num(partial.scale, 1) : 1,
    opacity: Math.min(1, Math.max(0, num(partial.opacity, 1))),
    realism: Math.min(100, Math.max(0, num(partial.realism, 0))),
    // Step 5-3B-3: surface warp strength 0-100 (0 = geometrically flat). Placement objects built without it default to 0.
    warp: Math.min(WARP_MAX, Math.max(WARP_MIN, num(partial.warp, 0))),
    deformation: partial.deformation ?? null,
  }
}

/** Studio artwork layer (geometry in % of the T-shirt photo box) -> placement in photo pixels. */
export function placementFromLayer(layer, photo) {
  return createPlacement({
    x: (layer.x / 100) * photo.width,
    y: (layer.y / 100) * photo.height,
    width: (layer.width / 100) * photo.width,
    height: (layer.height / 100) * photo.height,
    rotation: layer.rotation,
    scale: layer.scale ?? 1,
    opacity: layer.opacity,
    realism: layer.realism ?? DEFAULT_REALISM,
    warp: layer.warp ?? DEFAULT_WARP,
  })
}

/** Placement after applying the scale about its centre; the geometry the renderer actually draws. */
export function effectiveBox(p) {
  const w = p.width * p.scale
  const h = p.height * p.scale
  return { cx: p.x + p.width / 2, cy: p.y + p.height / 2, w, h }
}

/** Placement edit (immutable). Unknown / non-finite fields are ignored. */
export function updatePlacement(p, patch) {
  return createPlacement({ ...p, ...patch })
}

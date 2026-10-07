/**
 * Step 4B — the composition frame and the preview VIEW (zoom / pan / fit mode).
 *
 * Two separate concepts live here and must never be mixed up:
 *   - the COMPOSITION: a fixed portrait frame (COMPOSITION) that holds the
 *     background, T-shirt and artwork. Its geometry is in % of the frame.
 *   - the VIEW: how big / where that frame is shown in the editor. View state
 *     never touches the composition (PREVIEW ZOOM is not T-SHIRT SCALE).
 *
 * Pure functions only — no React, no DOM.
 */

/** One reusable aspect-ratio definition. Change it here and everything follows. */
export const COMPOSITION = { ratioW: 4, ratioH: 5, logicalWidth: 800 }
export const COMPOSITION_ASPECT = COMPOSITION.ratioW / COMPOSITION.ratioH // width / height
export const LOGICAL_WIDTH = COMPOSITION.logicalWidth
export const LOGICAL_HEIGHT = COMPOSITION.logicalWidth / COMPOSITION_ASPECT

/** Safe-area inset for the optional guides, as a fraction of each side. */
export const SAFE_INSET = 0.06

export const VIEW_MODES = [
  { key: 'fit', label: 'Fit', title: 'Show the whole composition inside the preview area' },
  { key: 'fill', label: 'Fill', title: 'Fill the preview area (edges may extend beyond it — pan to inspect)' },
  { key: 'actual', label: '100%', title: 'Actual editor size (1 composition pixel = 1 screen pixel)' },
]

export const ZOOM_LIMITS = { min: 0.25, max: 4, step: 1.25 }
export const DEFAULT_VIEW = { mode: 'fit', zoom: 1, panX: 0, panY: 0, guides: false }

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

export const clampZoom = (z) => (Number.isFinite(z) ? clamp(z, ZOOM_LIMITS.min, ZOOM_LIMITS.max) : 1)

/** Slider position (log2 of zoom) <-> zoom. A log scale keeps zooming even at both ends. */
export const zoomToSlider = (zoom) => Math.log2(clampZoom(zoom))
export const sliderToZoom = (value) => clampZoom(2 ** value)
export const SLIDER_RANGE = { min: Math.log2(ZOOM_LIMITS.min), max: Math.log2(ZOOM_LIMITS.max), step: 0.01 }

/** Base display scale (screen px per composition px) for a mode, before the zoom multiplier. */
export function baseScale(mode, content) {
  if (mode === 'actual') return 1
  const sx = content.w / LOGICAL_WIDTH
  const sy = content.h / LOGICAL_HEIGHT
  const s = mode === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy)
  return s > 0 && Number.isFinite(s) ? s : 0
}

/** Everything the viewport needs to lay out the frame. `content` = viewport minus padding. */
export function frameLayout(view, content) {
  const scale = baseScale(view.mode, content) * clampZoom(view.zoom)
  return { scale, width: LOGICAL_WIDTH * scale, height: LOGICAL_HEIGHT * scale }
}

/** Largest pan (px, each direction) that keeps the frame covering the viewport; 0 when it fits. */
export function panLimits(layout, viewport) {
  return {
    x: Math.max(0, (layout.width - viewport.w) / 2),
    y: Math.max(0, (layout.height - viewport.h) / 2),
  }
}

export function clampPan(pan, layout, viewport) {
  const lim = panLimits(layout, viewport)
  return { x: clamp(pan.x || 0, -lim.x, lim.x), y: clamp(pan.y || 0, -lim.y, lim.y) }
}

export const isPannable = (layout, viewport) => {
  const lim = panLimits(layout, viewport)
  return lim.x > 0.5 || lim.y > 0.5
}

/**
 * New view after zooming by `factor` (or to an absolute `zoom`), keeping the point under
 * `anchor` (px from the viewport centre; {0,0} = centre) where it is.
 */
export function zoomView(view, content, viewport, { factor, zoom }, anchor = { x: 0, y: 0 }) {
  const before = frameLayout(view, content)
  const nextZoom = clampZoom(zoom != null ? zoom : view.zoom * factor)
  if (!before.scale || nextZoom === clampZoom(view.zoom)) return view
  const after = frameLayout({ ...view, zoom: nextZoom }, content)
  const r = after.scale / before.scale
  const pan0 = clampPan({ x: view.panX, y: view.panY }, before, viewport)
  const pan = clampPan({ x: anchor.x - (anchor.x - pan0.x) * r, y: anchor.y - (anchor.y - pan0.y) * r }, after, viewport)
  return { ...view, zoom: nextZoom, panX: pan.x, panY: pan.y }
}

/** T-shirt drop-shadow in composition pixels, scaled so it looks identical at every zoom. */
export const shirtShadow = (scale) => {
  const k = Number.isFinite(scale) && scale > 0 ? scale : 1
  return `drop-shadow(0 ${(10 * k).toFixed(2)}px ${(14 * k).toFixed(2)}px rgba(0, 0, 0, 0.22))`
}

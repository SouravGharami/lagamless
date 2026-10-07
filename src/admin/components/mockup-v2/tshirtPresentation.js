/**
 * Step 4A-2 — T-shirt presentation inside the composition frame.
 *
 * The frame is the portrait composition frame (Step 4B, see compositionFrame.js;
 * it was a square before). The T-shirt box is the photo "contained" in that
 * frame (aspect ratio always the photo's own), multiplied by `scale`. `x`/`y` are the box CENTRE in % of the
 * frame. Artwork geometry stays in % of the T-shirt box, so artwork always
 * travels and scales with the garment. Pure functions only.
 */

import { COMPOSITION_ASPECT } from './compositionFrame.js'

export const SCALE_LIMITS = { min: 0.25, max: 1, step: 0.05 }
export const DEFAULT_PRESENTATION = { x: 50, y: 50, scale: 0.85, shadow: true }

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const round = (n) => Math.round(n * 100) / 100

export const clampScale = (scale) =>
  Number.isFinite(scale) ? round(clamp(scale, SCALE_LIMITS.min, SCALE_LIMITS.max)) : DEFAULT_PRESENTATION.scale

/**
 * Box size in % of the frame's width (w) and height (h). Ratio = the photo's ratio; never
 * stretched. `frameAspect` = frame width / height (the portrait composition by default).
 */
export function shirtSize(tshirt, scale, frameAspect = COMPOSITION_ASPECT) {
  const aspect = tshirt && tshirt.width > 0 && tshirt.height > 0 ? tshirt.width / tshirt.height : 1
  const fitW = aspect >= frameAspect ? 100 : (100 * aspect) / frameAspect
  const fitH = aspect >= frameAspect ? (100 * frameAspect) / aspect : 100
  return { w: fitW * scale, h: fitH * scale }
}

/** Allowed range for the box centre so the whole T-shirt stays inside the frame. */
export function centerRange(tshirt, scale) {
  const { w, h } = shirtSize(tshirt, scale)
  return { minX: w / 2, maxX: 100 - w / 2, minY: h / 2, maxY: 100 - h / 2 }
}

/** Returns a presentation whose scale and position are valid for this T-shirt. */
export function clampPresentation(tshirt, pres) {
  const scale = clampScale(pres.scale)
  const r = centerRange(tshirt, scale)
  return {
    ...pres,
    scale,
    x: round(clamp(Number.isFinite(pres.x) ? pres.x : 50, r.minX, r.maxX)),
    y: round(clamp(Number.isFinite(pres.y) ? pres.y : 50, r.minY, r.maxY)),
  }
}

/** CSS box (percentages of the frame) for the T-shirt element. */
export function shirtBox(tshirt, pres) {
  const p = clampPresentation(tshirt, pres)
  const { w, h } = shirtSize(tshirt, p.scale)
  return { left: `${p.x - w / 2}%`, top: `${p.y - h / 2}%`, width: `${w}%`, height: `${h}%` }
}

export const isDefaultPresentation = (p) =>
  p.x === DEFAULT_PRESENTATION.x && p.y === DEFAULT_PRESENTATION.y &&
  p.scale === DEFAULT_PRESENTATION.scale && p.shadow === DEFAULT_PRESENTATION.shadow

/** Fixed-pixel shadow (legacy); the preview uses shirtShadow(scale) from compositionFrame.js so it scales with zoom. */
export const SHIRT_SHADOW = 'drop-shadow(0 10px 14px rgba(0, 0, 0, 0.22))'

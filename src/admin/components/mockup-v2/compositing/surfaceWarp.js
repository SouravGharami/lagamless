/**
 * Step 5-3B-3 — surface warp. Pure pixel maths (no DOM, no React).
 *
 * The photograph's own folds drive a real geometric displacement of the artwork's pixels. The fold band from the fabric
 * map (fabricIntegration.js, zero-centred, -1..1) is smoothed over the artwork's footprint; its local gradient says which
 * way the cloth surface is tilting there, and each output pixel is resampled from a position shifted along that gradient.
 * Flat cloth (no gradient) leaves the print untouched; a crease bends the print across it.
 *
 * Order (see renderComposite.js): transform -> SURFACE WARP -> fabric integration -> clip to printable region.
 * Warp moves pixels only. Colours are never altered (bilinear sampling is alpha-weighted, so transparent edges gain no halo)
 * and shifts are capped at MAX_SHIFT of the artwork's shorter side, so a small logo stays readable.
 */
import { boxBlur } from './fabricIntegration.js'

export const WARP_MIN = 0
export const WARP_MAX = 100
/** Per-layer default (0 = geometrically flat). */
export const DEFAULT_WARP = 35

const MAX_SHIFT = 0.05 // largest displacement at warp 100, as a fraction of the artwork's shorter side
const GAIN = 2.5 // fold gradients are small in practice; amplified before the cap

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** Largest displacement in px for an artwork of this size (also the padding its layer canvas needs). */
export function maxShiftPx(artSize, strength) {
  return (clamp(strength, WARP_MIN, WARP_MAX) / 100) * MAX_SHIFT * Math.max(0, artSize)
}

/** Extra canvas margin (px) so displaced pixels are not cut off at the layer's edge. */
export function warpPadding(artSize, strength) {
  return strength > 0 ? Math.ceil(maxShiftPx(artSize, strength)) + 1 : 0
}

/**
 * Warps artwork pixels IN PLACE.
 * @param {Uint8ClampedArray} data  RGBA of a sub-rectangle (bw x bh) whose top-left is (ox, oy) in fabric-map coordinates
 * @param {{width,height,fold:Int8Array}} map  fabric map of the photo at the working size
 * @param {number} strength 0..100
 * @param {number} artSize  the artwork's shorter side in map pixels (caps and scales the movement)
 * @returns {boolean} true if any pixel was displaced
 */
export function applyWarp(data, bw, bh, ox, oy, map, strength, artSize) {
  const cap = maxShiftPx(artSize, strength)
  if (!(cap > 0) || !(bw > 1) || !(bh > 1)) return false

  // Fold band over this rectangle (outside the map = flat), smoothed so pixel-scale texture does not jitter the print.
  const sx = map.scaleX ?? 1 // reduced-size maps (very large photos) are sampled at render coordinates
  const sy = map.scaleY ?? 1
  const rw = map.renderWidth ?? map.width
  const rh = map.renderHeight ?? map.height
  const f = new Float32Array(bw * bh)
  for (let y = 0; y < bh; y += 1) {
    const my = oy + y
    if (my < 0 || my >= rh) continue
    const row = Math.min(map.height - 1, Math.floor(my * sy)) * map.width
    for (let x = 0; x < bw; x += 1) {
      const mx = ox + x
      if (mx >= 0 && mx < rw) f[y * bw + x] = map.fold[row + Math.min(map.width - 1, Math.floor(mx * sx))] / 127
    }
  }
  const d = Math.max(1, Math.round(Math.min(bw, bh) * 0.02))
  const s = boxBlur(f, bw, bh, d)

  const src = new Uint8ClampedArray(data) // untouched copy; `data` receives the result
  let moved = false
  for (let y = 0; y < bh; y += 1) {
    const y0 = Math.max(0, y - d)
    const y1 = Math.min(bh - 1, y + d)
    for (let x = 0; x < bw; x += 1) {
      const x0 = Math.max(0, x - d)
      const x1 = Math.min(bw - 1, x + d)
      const gx = (s[y * bw + x1] - s[y * bw + x0]) / 2
      const gy = (s[y1 * bw + x] - s[y0 * bw + x]) / 2
      const dx = clamp(gx * GAIN * cap, -cap, cap)
      const dy = clamp(gy * GAIN * cap, -cap, cap)
      const o = (y * bw + x) * 4
      if (dx === 0 && dy === 0) continue
      // Inverse mapping: this output pixel shows the source at (x + dx, y + dy). Alpha-weighted bilinear.
      const sx = x + dx
      const sy = y + dy
      const ix = Math.floor(sx)
      const iy = Math.floor(sy)
      const fx = sx - ix
      const fy = sy - iy
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let j = 0; j < 2; j += 1) {
        const yy = iy + j
        if (yy < 0 || yy >= bh) continue
        const wy = j ? fy : 1 - fy
        for (let i = 0; i < 2; i += 1) {
          const xx = ix + i
          if (xx < 0 || xx >= bw) continue
          const wgt = (i ? fx : 1 - fx) * wy
          const p = (yy * bw + xx) * 4
          const wa = wgt * src[p + 3]
          r += src[p] * wa
          g += src[p + 1] * wa
          b += src[p + 2] * wa
          a += wa
        }
      }
      if (a > 0) {
        data[o] = r / a
        data[o + 1] = g / a
        data[o + 2] = b / a
        data[o + 3] = a
      } else {
        data[o] = data[o + 1] = data[o + 2] = data[o + 3] = 0
      }
      moved = true
    }
  }
  return moved
}

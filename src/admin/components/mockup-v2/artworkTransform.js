/**
 * Pure geometry for the Mockup Studio canvas gestures. No DOM, no React.
 *
 * Layers are stored as percentages of the T-shirt image box (x/y = top-left,
 * width/height, rotation in degrees about the layer centre). A gesture
 * converts pointer pixels to those percentages using the box's CURRENT pixel
 * size, so the stored composition never depends on screen size.
 */

const DEG = Math.PI / 180

export const MIN_SIZE_PCT = 1
export const MAX_SIZE_PCT = 300

/** Corner handles: sx/sy are the handle's side on the layer's own axes. */
export const RESIZE_HANDLES = [
  { key: 'nw', sx: -1, sy: -1 },
  { key: 'ne', sx: 1, sy: -1 },
  { key: 'se', sx: 1, sy: 1 },
  { key: 'sw', sx: -1, sy: 1 },
]

const ok = (...values) => values.every((v) => Number.isFinite(v))

/** Wraps any angle into [-180, 180). */
export function wrapDegrees(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180
}

/** Move: pointer delta in px -> new x/y in %. */
export function moveGeometry(start, dxPx, dyPx, box) {
  if (!ok(dxPx, dyPx) || !(box.W > 0) || !(box.H > 0)) return null
  return { x: start.x + (dxPx / box.W) * 100, y: start.y + (dyPx / box.H) * 100 }
}

/**
 * Rotate: `center` and points are in the same (client) pixel space.
 * Rotation follows the pointer's angle around the centre; Shift snaps to 15°.
 */
export function rotateGeometry(startRotation, center, startPoint, point, snap = false) {
  const a0 = Math.atan2(startPoint.y - center.y, startPoint.x - center.x)
  const a1 = Math.atan2(point.y - center.y, point.x - center.x)
  if (!ok(a0, a1)) return null
  let rotation = startRotation + (a1 - a0) / DEG
  if (snap) rotation = Math.round(rotation / 15) * 15
  return { rotation: wrapDegrees(rotation) }
}

/**
 * Corner resize. The corner opposite the dragged handle stays fixed on screen
 * (also when the layer is rotated). `pointer` is in px relative to the box's
 * top-left. With `lockRatio` the layer scales uniformly (no distortion).
 */
export function resizeGeometry(start, handle, pointer, box, lockRatio) {
  const { W, H } = box
  if (!(W > 0) || !(H > 0) || !ok(pointer.x, pointer.y)) return null
  const w0 = (start.w / 100) * W
  const h0 = (start.h / 100) * H
  if (!(w0 > 0) || !(h0 > 0)) return null

  const rad = start.rot * DEG
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const rot = (lx, ly) => ({ x: lx * cos - ly * sin, y: lx * sin + ly * cos })

  const c0 = { x: ((start.x + start.w / 2) / 100) * W, y: ((start.y + start.h / 2) / 100) * H }
  const off0 = rot((handle.sx * w0) / 2, (handle.sy * h0) / 2)
  const anchor = { x: c0.x - off0.x, y: c0.y - off0.y }

  // Pointer relative to the anchor, in the layer's own (unrotated) axes.
  const vx = pointer.x - anchor.x
  const vy = pointer.y - anchor.y
  const lx = vx * cos + vy * sin
  const ly = -vx * sin + vy * cos

  const minW = (MIN_SIZE_PCT / 100) * W
  const minH = (MIN_SIZE_PCT / 100) * H
  const maxW = (MAX_SIZE_PCT / 100) * W
  const maxH = (MAX_SIZE_PCT / 100) * H

  let nw = handle.sx * lx
  let nh = handle.sy * ly
  if (lockRatio) {
    let s = (nw * w0 + nh * h0) / (w0 * w0 + h0 * h0)
    const sMin = Math.max(minW / w0, minH / h0)
    const sMax = Math.max(sMin, Math.min(maxW / w0, maxH / h0))
    s = Math.min(Math.max(s, sMin), sMax)
    nw = w0 * s
    nh = h0 * s
  } else {
    nw = Math.min(Math.max(nw, minW), maxW)
    nh = Math.min(Math.max(nh, minH), maxH)
  }

  const off1 = rot((handle.sx * nw) / 2, (handle.sy * nh) / 2)
  const cx = anchor.x + off1.x
  const cy = anchor.y + off1.y
  const out = {
    width: (nw / W) * 100,
    height: (nh / H) * 100,
    x: ((cx - nw / 2) / W) * 100,
    y: ((cy - nh / 2) / H) * 100,
  }
  return ok(out.width, out.height, out.x, out.y) ? out : null
}

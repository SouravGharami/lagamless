/**
 * Small HSV <-> hex helpers for the admin visual color picker. Pure functions, no DOM.
 * Hue is 0-360, saturation and value are 0-1.
 */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/** Normalises '#RGB' / '#RRGGBB' (any case) to lower-case '#rrggbb', or null if invalid. */
export function normalizeHex(hex) {
  if (typeof hex !== 'string') return null
  const clean = hex.trim().replace(/^#/, '').toLowerCase()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return /^[0-9a-f]{6}$/.test(full) ? `#${full}` : null
}

export function hsvToHex(h, s, v) {
  const hh = ((h % 360) + 360) % 360
  const ss = clamp(s, 0, 1)
  const vv = clamp(v, 0, 1)
  const c = vv * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = vv - c
  const [r, g, b] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x]
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** @returns {{ h: number, s: number, v: number }} (falls back to black for invalid input) */
export function hexToHsv(hex) {
  const n = normalizeHex(hex)
  if (!n) return { h: 0, s: 0, v: 0 }
  const r = parseInt(n.slice(1, 3), 16) / 255
  const g = parseInt(n.slice(3, 5), 16) / 255
  const b = parseInt(n.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

/** Readable text/outline colour (black or white) on top of a given background hex. */
export function readableOn(hex) {
  const n = normalizeHex(hex)
  if (!n) return '#000000'
  const lum = (0.299 * parseInt(n.slice(1, 3), 16) + 0.587 * parseInt(n.slice(3, 5), 16) + 0.114 * parseInt(n.slice(5, 7), 16)) / 255
  return lum > 0.6 ? '#000000' : '#ffffff'
}

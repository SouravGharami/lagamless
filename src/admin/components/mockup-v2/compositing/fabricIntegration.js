/**
 * Step 5-3B-2 — fabric integration. Pure pixel maths (no DOM, no React, no dependencies).
 *
 * The photograph is the only source of fabric information. From it we derive two zero-centred "shading" bands:
 *
 *   fold  medium-scale light/dark variation (folds, creases, drape, wash patches):  (blur_small - blur_large) / blur_large
 *   tex   fine-scale variation (weave, grain, fibres):                              (luma - blur_small) / blur_small
 *
 * Both are RELATIVE to the local mean brightness, so a black shirt, an off-white shirt and an acid-wash shirt are
 * handled by the same rule (nothing is colour-specific and the shirt's average colour is never sampled or applied).
 * The photo's low-frequency brightness (the shirt colour itself) is deliberately excluded, so the artwork is never
 * tinted; only local light/shadow/texture is transferred.
 *
 * The bands are applied to the artwork's RGB ONLY, after the artwork's transform has been rasterised (so position,
 * scale and rotation are never affected) and never to its alpha (so edges stay exactly as clean as the source PNG):
 *   shadow (s < 0)     colour x (1 + s)                 - darkens, keeps hue; white becomes a soft grey in a fold, not black
 *   highlight (s > 0)  colour + (255 - colour) x s x k  - lifts toward white; white stays white, nothing clips or glows
 * This is deliberately NOT a blanket multiply: white DTF ink stays white where the fabric is evenly lit.
 */

/** Default and range of the per-layer control (0 = flat 5-3A composite). */
export const FABRIC_MIN = 0
export const FABRIC_MAX = 100

// Internal tuning (hidden behind the single 0-100 control).
// Both bands are soft-saturated (tanh) at build time, so high-contrast outliers in the photo — stains, specks, an
// existing printed graphic, a hard seam — cannot punch through the new print. Ink is opaque; only smooth light/shadow
// and fine weave should reach it. FOLD_RANGE / TEX_RANGE are the maximum relative brightness change each band can carry.
const FLOOR = 64 // denominator floor: stops near-black shirts from amplifying sensor noise into fake folds
const FOLD_RANGE = 0.35
const TEX_RANGE = 0.12
const FOLD_GAIN = 0.85
const TEX_GAIN = 0.6
const MAX_SHADOW = -0.3 // never darken by more than 30 % (at 100)
const MAX_LIFT = 0.18 // highlight amount before the lift factor
const LIFT = 0.5 // white stays white; colours are nudged only slightly toward white, never veiled
const Q = 127 // Int8 quantisation of the bands (keeps a 5 MP map at ~10 MB)

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** Separable box blur with clamped edges (running sum, O(n)). Returns a new Float32Array. */
export function boxBlur(src, w, h, radius) {
  const r = Math.max(0, Math.floor(radius))
  if (r === 0) return Float32Array.from(src)
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const span = 2 * r + 1
  for (let y = 0; y < h; y += 1) {
    const row = y * w
    let sum = 0
    for (let k = -r; k <= r; k += 1) sum += src[row + clamp(k, 0, w - 1)]
    for (let x = 0; x < w; x += 1) {
      tmp[row + x] = sum / span
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x += 1) {
    let sum = 0
    for (let k = -r; k <= r; k += 1) sum += tmp[clamp(k, 0, h - 1) * w + x]
    for (let y = 0; y < h; y += 1) {
      out[y * w + x] = sum / span
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

/** Weighted blur: pixels with weight 0 (background, skin, outside the mask) contribute nothing, so they cannot bleed into the shirt. */
function weightedBlur(values, weights, denom, w, h, radius) {
  const prod = new Float32Array(values.length)
  for (let i = 0; i < prod.length; i += 1) prod[i] = values[i] * weights[i]
  const num = boxBlur(prod, w, h, radius)
  const out = new Float32Array(values.length)
  for (let i = 0; i < out.length; i += 1) out[i] = denom[i] > 0.02 ? num[i] / denom[i] : values[i]
  return out
}

/**
 * Builds the fabric map for one photo at one working size.
 * @param {Uint8ClampedArray} rgba   photo pixels (w*h*4)
 * @param {Uint8ClampedArray|null} allowance  optional printable-region weights 0..255 (w*h); null = whole photo
 * @returns {{ width, height, fold: Int8Array, tex: Int8Array }}  bands as fractions of their range (-127..127 = -1..1)
 */
export function buildFabricMap(rgba, w, h, allowance = null) {
  const n = w * h
  if (!(w > 0 && h > 0) || rgba.length < n * 4) throw new Error('Fabric map: pixel buffer does not match its size.')
  const luma = new Float32Array(n)
  const wt = new Float32Array(n)
  for (let i = 0, j = 0; i < n; i += 1, j += 4) {
    luma[i] = 0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]
    wt[i] = allowance ? allowance[i] / 255 : 1
  }
  const m = Math.min(w, h)
  const rSmall = Math.max(1, Math.round(m * 0.0025))
  const rLarge = Math.max(rSmall + 2, Math.round(m * 0.08))
  const denSmall = boxBlur(wt, w, h, rSmall)
  const denLarge = boxBlur(wt, w, h, rLarge)
  const small = weightedBlur(luma, wt, denSmall, w, h, rSmall)
  const large = weightedBlur(small, wt, denLarge, w, h, rLarge)

  const fold = new Int8Array(n)
  const tex = new Int8Array(n)
  for (let i = 0; i < n; i += 1) {
    // Stored as a fraction of the band's range in [-1, 1] (smoothly saturating).
    fold[i] = Math.round(Math.tanh((small[i] - large[i]) / Math.max(large[i], FLOOR) / FOLD_RANGE) * Q)
    tex[i] = Math.round(Math.tanh((luma[i] - small[i]) / Math.max(small[i], FLOOR) / TEX_RANGE) * Q)
  }
  return { width: w, height: h, fold, tex }
}

/** Shading amount for one pixel: negative = shadow, positive = highlight. realism is 0..1. */
export function shadeAt(map, index, realism) {
  const s = realism * (FOLD_GAIN * FOLD_RANGE * (map.fold[index] / Q) + TEX_GAIN * TEX_RANGE * (map.tex[index] / Q))
  return clamp(s, MAX_SHADOW, MAX_LIFT)
}

/**
 * Applies the fabric bands to artwork pixels IN PLACE. `data` is the RGBA of a sub-rectangle of the render canvas whose
 * top-left is (ox, oy) in map coordinates. Alpha is never modified; fully transparent pixels are skipped.
 * @param {number} realism 0..100
 */
export function applyFabric(data, bw, bh, ox, oy, map, realism) {
  const r = clamp(realism, FABRIC_MIN, FABRIC_MAX) / 100
  if (!(r > 0)) return data
  // Step 5-4: a map analysed at a reduced size (very large photos) carries scaleX/scaleY (map px per render px) and the render size.
  const sx = map.scaleX ?? 1
  const sy = map.scaleY ?? 1
  const rw = map.renderWidth ?? map.width
  const rh = map.renderHeight ?? map.height
  for (let y = 0; y < bh; y += 1) {
    const my = oy + y
    if (my < 0 || my >= rh) continue
    const row = Math.min(map.height - 1, Math.floor(my * sy)) * map.width
    for (let x = 0; x < bw; x += 1) {
      const mx = ox + x
      if (mx < 0 || mx >= rw) continue
      const i = (y * bw + x) * 4
      if (data[i + 3] === 0) continue
      const s = shadeAt(map, row + Math.min(map.width - 1, Math.floor(mx * sx)), r)
      if (s < 0) {
        const k = 1 + s
        data[i] *= k
        data[i + 1] *= k
        data[i + 2] *= k
      } else if (s > 0) {
        const t = s * LIFT
        data[i] += (255 - data[i]) * t
        data[i + 1] += (255 - data[i + 1]) * t
        data[i + 2] += (255 - data[i + 2]) * t
      }
    }
  }
  return data
}

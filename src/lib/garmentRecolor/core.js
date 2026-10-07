/**
 * Mask-based T-shirt recoloring — pure pixel math (no DOM), so it runs in a Web Worker and in Node tests.
 *
 * TWO STAGES
 *
 *  prepareGarment(photo)  — once per photo (the slow part, ~0.2-0.6 s):
 *    1. Runs the existing garment detector (admin garment-detection/detectGarment.js) to get the T-shirt mask, then
 *       upsamples it to the photo's size and grows it by ~1 px so the silhouette edge is not left with an old-color halo.
 *    2. Inside that mask, separates FABRIC from PRINT. The mask deliberately includes prints; here a pixel only counts
 *       as fabric if it still looks like the fabric's own dye under different lighting:
 *         - chromaticity test: in Lab, shading scales a/b by (L+16)/(Lref+16), so the expected a/b at any brightness
 *           is known and a pixel far from it is ink/artwork, not shaded fabric;
 *         - lightness test: pixels far outside the fabric's own shadow..highlight range (a white print on a black
 *           tee) are artwork.
 *       The result is snapped (smoothstep) so fabric noise never leaves speckles of the old color, while real print
 *       pixels, thin lines included, keep weight 0.
 *    3. Stores, per pixel, only two small numbers: a fabric weight (0-255) and the pixel's lightness deviation from
 *       the fabric median (quantized). Everything about folds, texture and lighting lives in that deviation.
 *
 *  renderRecolor(prep, hex)  — per color (~15-40 ms for a 1600 px photo):
 *    Builds a 4096-entry lookup table "lightness deviation -> sRGB" for the target color (median lands exactly on the
 *    target; shadows/highlights keep the photo's own relative contrast, rolled off smoothly instead of clipping; chroma
 *    is clamped to what sRGB can show at that lightness, so shadows and highlights desaturate like real dyed cotton),
 *    then blends table color over the original by the fabric weight. Background, print, alpha: copied untouched.
 */
import { detectGarment, toLab, upsampleMaskRows } from '../../admin/components/mockup-v2/garment-detection/detectGarment.js'

const TABLE_SIZE = 4096
/** Lightness deviation range covered by the lookup table (L* units, +/-). Anything beyond is clamped. */
const DEV_RANGE = 50
const BAND_ROWS = 128
const WHITE_ANCHOR_MAX_L = 95

const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x)
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------- Lab <-> sRGB (D65, same matrices as toLab)

const XN = 0.95047
const ZN = 1.08883
const finv = (t) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27))

/** Unclamped linear sRGB from Lab — used both for output and for gamut testing. */
function labToLinear(L, a, b) {
  const fy = (L + 16) / 116
  const X = XN * finv(fy + a / 500)
  const Y = finv(fy)
  const Z = ZN * finv(fy - b / 200)
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ]
}
const encode = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
function labToSrgbBytes(L, a, b) {
  const lin = labToLinear(L, a, b)
  return lin.map((c) => Math.round(clamp(encode(clamp(c, 0, 1)), 0, 255)))
}
function inGamut(L, a, b) {
  const EPS = 1e-4
  const lin = labToLinear(L, a, b)
  return lin[0] >= -EPS && lin[0] <= 1 + EPS && lin[1] >= -EPS && lin[1] <= 1 + EPS && lin[2] >= -EPS && lin[2] <= 1 + EPS
}
/** Largest chroma sRGB can show at lightness L and hue (radians). */
function maxChroma(L, cosH, sinH) {
  if (L <= 0 || L >= 100) return 0
  let lo = 0
  let hi = 160
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(L, mid * cosH, mid * sinH)) lo = mid
    else hi = mid
  }
  return lo
}

export function hexToRgb(hex) {
  const clean = String(hex).trim().replace(/^#/, '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function hexToLab(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const lab = toLab(new Uint8ClampedArray([rgb[0], rgb[1], rgb[2], 255]), 1)
  return [lab[0], lab[1], lab[2]]
}

// ---------------------------------------------------------------- stage 1: prepare

/** Grows a binary-ish mask by `r` px (separable max filter). */
function dilate(mask, w, h, r) {
  if (r <= 0) return mask
  const tmp = new Uint8Array(mask.length)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let m = 0
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w - 1, x + r)
      for (let k = x0; k <= x1; k++) if (mask[row + k] > m) m = mask[row + k]
      tmp[row + x] = m
    }
  }
  const out = new Uint8Array(mask.length)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 0
      const y0 = Math.max(0, y - r)
      const y1 = Math.min(h - 1, y + r)
      for (let k = y0; k <= y1; k++) if (tmp[k * w + x] > m) m = tmp[k * w + x]
      out[y * w + x] = m
    }
  }
  return out
}

/**
 * Binary erosion by `r` px (square window) using prefix sums, O(n). Pixels within `r` of the photo border are eroded too
 * (outside the photo counts as 0), so "eroded away from the silhouette" also means "near the photo edge".
 * @param {Uint8Array} bin 0 / non-zero
 * @returns {Uint8Array} 0 / 1
 */
function erodeBinary(bin, w, h, r) {
  const tmp = new Uint8Array(bin.length)
  const pre = new Int32Array(Math.max(w, h) + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + (bin[row + x] ? 1 : 0)
    for (let x = 0; x < w; x++) {
      const x0 = x - r
      const x1 = x + r
      tmp[row + x] = x0 >= 0 && x1 < w && pre[x1 + 1] - pre[x0] === 2 * r + 1 ? 1 : 0
    }
  }
  const out = new Uint8Array(bin.length)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + tmp[y * w + x]
    for (let y = 0; y < h; y++) {
      const y0 = y - r
      const y1 = y + r
      out[y * w + x] = y0 >= 0 && y1 < h && pre[y1 + 1] - pre[y0] === 2 * r + 1 ? 1 : 0
    }
  }
  return out
}

/**
 * KEEP ONLY FABRIC THAT BELONGS TO THE SHIRT, not artwork that merely has the fabric's colour.
 *
 * A colour test alone cannot tell a black tee from a near-black / dark-teal / dark-steel part of the print (or black ink
 * on a black tee): they are statistically the same, so the colour switch used to repaint that part of the DESIGN with the
 * new shirt colour. What does tell them apart is geometry: real fabric is one connected surface that reaches the shirt's
 * outer silhouette (sides, sleeve ends, hem, collar), whereas artwork sits INSIDE the shirt, enclosed by other artwork.
 *
 *   1. B       = pixels the colour test is confident are fabric (weight >= ~78%; real fabric scores 100%).
 *   2. core    = B eroded by a few px, so thin necks / anti-aliased bridges between fabric and artwork are cut.
 *   3. seeds   = core pixels in a thin band along the silhouette edge (the mask boundary / photo border).
 *   4. keep    = the part of `core` connected to a seed (4-connected flood fill). Everything else is artwork.
 *   5. zone    = keep grown back by the erosion radius: restores the fabric's own boundary and the soft anti-aliased edge
 *                next to the artwork, but nothing farther.
 * The weight of every pixel outside `zone` becomes 0, so it is copied byte-for-byte from the photo.
 * @returns {number} how many pixels were released back to the artwork
 */
function keepSilhouetteConnectedFabric(weight, mask, data, W, H) {
  const n = W * H
  const short = Math.min(W, H)
  const re = clamp(Math.round(short / 500), 1, 3)
  const band = re + clamp(Math.round(short * 0.01), 3, 14)

  const B = new Uint8Array(n)
  const inside = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    if (weight[p] >= 200) B[p] = 1 // confident fabric only: a 'maybe' pixel must never be the bridge from fabric into artwork
    if (mask[p] >= 128 && data[p * 4 + 3] >= 128) inside[p] = 1
  }
  const core = erodeBinary(B, W, H, re)

  const stack = new Int32Array(n)
  let top = 0

  // Only the OUTER silhouette counts as "the shirt's edge". The mask can have holes (the detector often leaves the
  // artwork out), and the rim of such a hole is the artwork's boundary, not the shirt's - so holes are filled first:
  // whatever the photo border can reach through non-mask pixels is outside; everything else is inside the shirt.
  const outside = new Uint8Array(n)
  const pushOutside = (p) => { if (!inside[p] && !outside[p]) { outside[p] = 1; stack[top++] = p } }
  for (let x = 0; x < W; x++) { pushOutside(x); pushOutside((H - 1) * W + x) }
  for (let y = 0; y < H; y++) { pushOutside(y * W); pushOutside(y * W + W - 1) }
  while (top > 0) {
    const p = stack[--top]
    const x = p % W
    const y = (p - x) / W
    if (x > 0) pushOutside(p - 1)
    if (x < W - 1) pushOutside(p + 1)
    if (y > 0) pushOutside(p - W)
    if (y < H - 1) pushOutside(p + W)
  }
  const filled = new Uint8Array(n)
  for (let p = 0; p < n; p++) filled[p] = outside[p] ? 0 : 1
  const deepInside = erodeBinary(filled, W, H, band)

  const keep = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    if (core[p] && !deepInside[p]) { keep[p] = 1; stack[top++] = p }
  }
  while (top > 0) {
    const p = stack[--top]
    const x = p % W
    const y = (p - x) / W
    if (x > 0 && core[p - 1] && !keep[p - 1]) { keep[p - 1] = 1; stack[top++] = p - 1 }
    if (x < W - 1 && core[p + 1] && !keep[p + 1]) { keep[p + 1] = 1; stack[top++] = p + 1 }
    if (y > 0 && core[p - W] && !keep[p - W]) { keep[p - W] = 1; stack[top++] = p - W }
    if (y < H - 1 && core[p + W] && !keep[p + W]) { keep[p + W] = 1; stack[top++] = p + W }
  }

  const zone = dilate(keep, W, H, re)
  let released = 0
  for (let p = 0; p < n; p++) {
    if (weight[p] > 0 && !zone[p]) { weight[p] = 0; released++ }
  }
  return released
}


/** Separable box SUM of `src` (Float32, w*h) with radius r (edges use the pixels that exist). */
function boxSum(src, w, h, r) {
  const tmp = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let acc = 0
    for (let x = 0; x <= Math.min(r, w - 1); x++) acc += src[row + x]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc
      const add = x + r + 1
      const sub = x - r
      if (add < w) acc += src[row + add]
      if (sub >= 0) acc -= src[row + sub]
    }
  }
  const out = new Float32Array(w * h)
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let y = 0; y <= Math.min(r, h - 1); y++) acc += tmp[y * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc
      const add = y + r + 1
      const sub = y - r
      if (add < h) acc += tmp[add * w + x]
      if (sub >= 0) acc -= tmp[sub * w + x]
    }
  }
  return out
}

/**
 * SOFT FABRIC SHARE - how much of each fabric-classified pixel really is fabric.
 *
 * The colour test is per pixel and snapped, so a PALE or SOFT-EDGED part of a DTF print (smoke, glow, fade-out, cream on a
 * white tee) whose colour is only a little off the shirt's dye passes as 100% fabric and the colour switch tints it. Real
 * fabric is the SAME colour everywhere (shading only changes lightness), while such print areas sit a steady step away from it. So
 * the chroma offset from the fabric dye is measured on a small neighbourhood average of the fabric-classified pixels (noise
 * averages out; hard ink is excluded from the average, so there is no halo around it) and the weight is faded with it:
 * <= d0 (the noise floor measured on the shirt's own edge) keeps full weight, d0 + 6 and beyond goes to zero.
 * Combined with the "keep the print's share" render, a half-print pixel keeps the print's half, as photographed.
 * @returns {number} how many pixels lost weight
 */
function softenWeightNearPrintTone(weight, lab, W, H, ref, bandPool) {
  const n = W * H
  const [Lref, aref, bref] = ref
  const rb = clamp(Math.round(Math.min(W, H) / 260), 2, 5)
  const A = new Float32Array(n)
  const B = new Float32Array(n)
  const M = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    if (weight[p] >= 128) {
      const k = (Lref + 16) / (lab[p * 3] + 16) // undo shading so a fold does not read as a colour shift
      A[p] = lab[p * 3 + 1] * k
      B[p] = lab[p * 3 + 2] * k
      M[p] = 1
    }
  }
  const sA = boxSum(A, W, H, rb)
  const sB = boxSum(B, W, H, rb)
  const sM = boxSum(M, W, H, rb)
  const dist = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    if (weight[p] === 0) continue
    if (sM[p] < 4) { dist[p] = 0; continue }
    dist[p] = Math.hypot(sA[p] / sM[p] - aref, sB[p] / sM[p] - bref)
  }
  // noise floor: how far the shirt's own edge fabric strays on this neighbourhood scale
  let d0 = 3
  if (bandPool && bandPool.length >= 300) {
    const ds = []
    for (const p of bandPool) if (weight[p] >= 128 && sM[p] >= 4) ds.push(dist[p])
    if (ds.length >= 200) {
      ds.sort((x, y) => x - y)
      d0 = clamp(ds[Math.floor(ds.length * 0.9)] * 1.15 + 0.3, 1.5, 5)
    }
  }
  const d1 = d0 + 6
  let lowered = 0
  for (let p = 0; p < n; p++) {
    if (weight[p] === 0) continue
    const s = 1 - clamp((dist[p] - d0) / (d1 - d0), 0, 1) // linear: a pixel that is x% print sits x% of the way to the print's colour
    if (s < 1) {
      weight[p] = Math.round(weight[p] * s)
      lowered++
    }
  }
  return lowered
}

/** Weighted percentile of values in 0..100 using a 512-bin histogram. */
function percentiles(hist, total, fractions) {
  const out = []
  let acc = 0
  let fi = 0
  for (let b = 0; b < hist.length && fi < fractions.length; b++) {
    acc += hist[b]
    while (fi < fractions.length && acc >= fractions[fi] * total) {
      out.push((b / (hist.length - 1)) * 100)
      fi++
    }
  }
  while (out.length < fractions.length) out.push(100)
  return out
}

const labToHex = (L, a, b) => '#' + labToSrgbBytes(L, a, b).map((c) => c.toString(16).padStart(2, '0')).join('')

const median = (arr) => {
  const a = Float32Array.from(arr).sort()
  return a.length ? a[a.length >> 1] : 0
}

/**
 * The shirt's own dye colour as it appears IN THIS PHOTO, measured inside the saved mask: median Lab of the mask's solid
 * interior, narrowed to the product's known colour when given (so a print covering much of the shirt cannot win), and
 * the chroma tolerance from how far real fabric pixels (folds and shadows included) spread around it.
 * @returns {[number, number, number, number] | null} [Lref, aref, bref, chromaTolerance]
 */
function estimateFabricFromMask(lab, mask, data, n, hint, W, H) {
  const idx = []
  let inside = 0
  for (let p = 0; p < n; p++) if (mask[p] >= 250 && data[p * 4 + 3] >= 250) inside++
  if (inside < 200) return null
  const stride = Math.max(1, Math.floor(inside / 60000))
  let seen = 0
  for (let p = 0; p < n; p++) {
    if (mask[p] < 250 || data[p * 4 + 3] < 250) continue
    if (seen++ % stride === 0) idx.push(p)
  }
  const chromaDist = (p, L0, a0, b0) => {
    const k = (lab[p * 3] + 16) / (L0 + 16)
    return Math.hypot(lab[p * 3 + 1] - a0 * k, lab[p * 3 + 2] - b0 * k)
  }
  // WHICH colour is the fabric? Fabric always reaches the silhouette's outer edge (sides, sleeve ends, hem); even a huge
  // print usually does not. So the fabric colour is measured on a thin band along the mask's left/right/bottom edge, not
  // from "the biggest colour inside the mask" (a large print would win that) and NOT from the product's first swatch
  // (that is the colour of ONE photo; this photo can be a different colourway entirely — a black tee when swatch #1 is
  // white — and a swatch that resembles part of the print made the PRINT count as fabric).
  const solid = (p) => mask[p] >= 250 && data[p * 4 + 3] >= 250
  const band = []
  if (W && H) {
    const d = Math.max(3, Math.round(Math.min(W, H) * 0.03))
    const rowStep = Math.max(1, Math.floor(H / 400))
    for (let y = 0; y < H; y += rowStep) {
      const row = y * W
      let xl = -1
      let xr = -1
      for (let x = 0; x < W; x++) if (solid(row + x)) { xl = x; break }
      if (xl < 0) continue
      for (let x = W - 1; x >= 0; x--) if (solid(row + x)) { xr = x; break }
      for (let k = 0; k < d && xl + k <= xr; k++) {
        band.push(row + xl + k)
        if (xr - k > xl + k) band.push(row + xr - k)
      }
    }
    const colStep = Math.max(1, Math.floor(W / 400))
    for (let x = 0; x < W; x += colStep) {
      let yb = -1
      for (let y = H - 1; y >= 0; y--) if (solid(y * W + x)) { yb = y; break }
      if (yb < 0) continue
      for (let k = 0; k < d && yb - k >= 0; k++) if (solid((yb - k) * W + x)) band.push((yb - k) * W + x)
    }
  }
  let pool = band.length >= 300 ? band : idx
  if (pool === idx) {
    // no usable edge band (e.g. a close-up that fills the frame): fall back to the interior, narrowed by the known colour
    const h = hint ? hexToLab(hint) : null
    if (h) {
      const near = idx.filter((p) => chromaDist(p, h[0], h[1], h[2]) < 26)
      if (near.length >= idx.length * 0.03) pool = near
    }
  }
  let L0 = median(pool.map((p) => lab[p * 3]))
  let a0 = median(pool.map((p) => lab[p * 3 + 1]))
  let b0 = median(pool.map((p) => lab[p * 3 + 2]))
  // second pass: re-centre on the pixels that actually agree with the first estimate
  const tight = idx.filter((p) => chromaDist(p, L0, a0, b0) < 16)
  if (tight.length >= 50) {
    L0 = median(tight.map((p) => lab[p * 3]))
    a0 = median(tight.map((p) => lab[p * 3 + 1]))
    b0 = median(tight.map((p) => lab[p * 3 + 2]))
  }
  // how far REAL fabric strays from its dye (folds, shadows, sensor noise): measured on the edge band when there is one,
  // because the interior includes the artwork, whose colours would inflate the tolerance and let the print pass as fabric
  const spreadPool = pool === idx ? idx : pool
  const spread = spreadPool.map((p) => chromaDist(p, L0, a0, b0)).filter((d) => d < 30).sort((x, y) => x - y)
  const p85 = spread.length ? spread[Math.floor(spread.length * 0.85)] : 12
  return [L0, a0, b0, clamp(p85 * 1.25, 11, 24), pool === band ? pool : null]
}

/**
 * @param {{ width: number, height: number, data: Uint8ClampedArray }} photo RGBA at the size you want to render at
 * @param {{ mask?: Uint8Array|null, sensitivity?: 'tight'|'normal'|'loose', fabricHint?: string|null, fillsFrame?: boolean }} [options] `mask`: this photo's own saved garment mask (0-255, width*height; skips detection); `fabricHint`: the T-shirt's known '#rrggbb'; `fillsFrame`: close-up with no backdrop (both: see detectGarment)
 * @returns {object} `{ ok: false, reason }` or a prep object for renderRecolor()
 */
export function prepareGarment(photo, options = {}) {
  const { width: W, height: H, data } = photo
  const n = W * H

  // --- the T-shirt mask (0..255, full photo size).
  //   * `options.mask` (the photo's OWN saved mask, made when the product was saved) is used as-is: nothing is guessed.
  //   * otherwise the detector runs on this photo (only for photos saved before per-photo masks existed).
  let mask
  let det = null
  if (options.mask && options.mask.length === n) {
    // Used exactly as saved — NOT grown. Its own anti-aliased edge decides how much of a silhouette pixel is recolored,
    // so not a single backdrop pixel outside the shirt is touched.
    mask = Uint8Array.from(options.mask)
  } else {
    det = detectGarment({ width: W, height: H, data }, { sensitivity: options.sensitivity ?? 'normal', fabricHint: options.fabricHint ?? null, fillsFrame: options.fillsFrame === true })
    if (!det.ok) return { ok: false, reason: det.stats?.warnings?.[0] || 'No T-shirt detected.' }
    mask = new Uint8Array(n)
    const band = new Uint8ClampedArray(W * BAND_ROWS * 4)
    for (let y0 = 0; y0 < H; y0 += BAND_ROWS) {
      const y1 = Math.min(H, y0 + BAND_ROWS)
      upsampleMaskRows(det.mask, det.width, det.height, W, H, y0, y1, band)
      for (let i = 0, p = y0 * W; p < y1 * W; i += 4, p++) mask[p] = band[i]
    }
    const upscale = W / det.width
    mask = dilate(mask, W, H, clamp(Math.round(upscale * 0.5), 1, 2))
  }

  // --- Lab of the whole photo (freed before returning)
  const lab = toLab(data, n)
  let Lref, aref, bref, Ct
  let bandPool = null // pixels on the shirt's outer edge: certainly fabric, the reference for its colour AND lightness range
  if (det) {
    ;[Lref, aref, bref] = hexToLab(det.stats.fabricColor)
    Ct = det.stats.tolerance?.chroma ?? 18
    // The detector's tolerance is deliberately generous (it must find the shirt at all). For deciding fabric vs ARTWORK it
    // is far too loose - dark-teal ink passes as black fabric - so tighten it to the spread real fabric shows at the edge.
    const est = estimateFabricFromMask(lab, mask, data, n, options.fabricHint, W, H)
    if (est) { Ct = Math.min(Ct, est[3]); bandPool = est[4] }
  } else {
    const est = estimateFabricFromMask(lab, mask, data, n, options.fabricHint, W, H)
    if (!est) return { ok: false, reason: 'The saved mask does not cover enough of the photo.' }
    ;[Lref, aref, bref, Ct] = est
    bandPool = est[4]
  }
  const T1 = Math.max(4, 0.45 * Ct)
  const T2 = Math.max(T1 + 3, 0.85 * Ct)

  // --- pass A: chromaticity fabric-ness + histogram of L over clear fabric pixels
  const chromaW = new Float32Array(n)
  const HB = 512
  const hist = new Float64Array(HB)
  let histTotal = 0
  const seedHist = new Float64Array(HB)
  let seedTotal = 0
  for (let p = 0; p < n; p++) {
    if (mask[p] === 0 || data[p * 4 + 3] < 128) continue
    const L = lab[p * 3]
    const k = (L + 16) / (Lref + 16)
    const d = Math.hypot(lab[p * 3 + 1] - aref * k, lab[p * 3 + 2] - bref * k)
    const w = 1 - smoothstep(T1, T2, d)
    chromaW[p] = w
    if (w > 0.5) {
      const bin = clamp(Math.round((L / 100) * (HB - 1)), 0, HB - 1)
      hist[bin] += 1
      histTotal += 1
    }
    if (w > 0.9) {
      seedHist[clamp(Math.round((L / 100) * (HB - 1)), 0, HB - 1)] += 1
      seedTotal += 1
    }
  }
  if (histTotal < 200) return { ok: false, reason: 'Not enough T-shirt fabric found to recolor.' }

  // The fabric's lightness range is measured on the shirt's OUTER EDGE (certainly fabric), not on everything that passed the
  // colour test: a big soft print passes it too, stretched the range over the artwork and let dark ink count as shaded fabric.
  let statHist = hist
  let statTotal = histTotal
  if (bandPool && bandPool.length >= 300) {
    const bh = new Float64Array(HB)
    let bt = 0
    for (const p of bandPool) {
      if (chromaW[p] <= 0.5) continue
      bh[clamp(Math.round((lab[p * 3] / 100) * (HB - 1)), 0, HB - 1)] += 1
      bt += 1
    }
    if (bt >= 200) { statHist = bh; statTotal = bt }
  }

  // The fabric's own lightness range. A first pass finds the median and spread of the colour-matching pixels; a print
  // whose lightness is far from the fabric's (white ink on a black tee) would otherwise stretch the "highlight" up to
  // itself and get recolored as if it were a fold. So the range is re-measured from the main body of the distribution.
  const [, med0] = percentiles(statHist, statTotal, [0.005, 0.5, 0.995])
  const [q25, q75] = percentiles(statHist, statTotal, [0.25, 0.75])
  const sigma = Math.max(1.5, ((q75 - q25) / 1.349))
  const reach = Math.max(28, 6 * sigma)
  const lo = med0 - reach
  const hi = med0 + reach
  const hist2 = new Float64Array(HB)
  let hist2Total = 0
  for (let b = 0; b < HB; b++) {
    const Lb = (b / (HB - 1)) * 100
    if (Lb >= lo && Lb <= hi) { hist2[b] = statHist[b]; hist2Total += statHist[b] }
  }
  const [shadow, median, highlight] = percentiles(hist2, hist2Total || statTotal, [0.005, 0.5, 0.995])
  // margin beyond the fabric's own lightness range before a pixel is treated as ink
  const margin = 6 + 0.1 * (highlight - shadow)

  // --- pass B: final fabric weight (colour + lightness tests)
  const weight = new Uint8Array(n)
  for (let p = 0; p < n; p++) {
    if (mask[p] === 0 || data[p * 4 + 3] === 0) continue
    const L = lab[p * 3]
    const wL = smoothstep(shadow - margin, shadow, L) * (1 - smoothstep(highlight, highlight + margin, L))
    // Snap: >=0.75 -> fully fabric (no speckle from noise), <=0.25 -> untouched (print, even thin lines)
    let w = smoothstep(0.25, 0.75, Math.min(chromaW[p], wL))
    w *= (mask[p] / 255) * (data[p * 4 + 3] / 255)
    weight[p] = Math.round(w * 255)
  }

  // --- pass C: artwork that merely LOOKS like the fabric (dark tones on a black tee, ink the shirt's colour) is not fabric:
  // only fabric connected to the shirt's silhouette may be recolored.
  keepSilhouetteConnectedFabric(weight, mask, data, W, H)

  // --- pass D: pale / soft-edged print that is close to the fabric tone keeps its own share (see softenWeightNearPrintTone)
  softenWeightNearPrintTone(weight, lab, W, H, [Lref, aref, bref], bandPool)

  // The fabric's median lightness, re-measured on the pixels that really are fabric (the artwork no longer skews it).
  const keptHist = new Float64Array(HB)
  let keptTotal = 0
  for (let p = 0; p < n; p++) {
    if (weight[p] < 128) continue
    keptHist[clamp(Math.round((lab[p * 3] / 100) * (HB - 1)), 0, HB - 1)] += 1
    keptTotal += 1
  }
  const keptMedian = keptTotal >= 200 ? percentiles(keptHist, keptTotal, [0.5])[0] : median

  // --- lightness deviation index per fabric pixel
  const dev = new Uint16Array(n)
  let fabricPixels = 0
  for (let p = 0; p < n; p++) {
    if (weight[p] === 0) continue
    fabricPixels++
    dev[p] = clamp(Math.round(((lab[p * 3] - keptMedian) / DEV_RANGE * 0.5 + 0.5) * (TABLE_SIZE - 1)), 0, TABLE_SIZE - 1)
  }
  if (fabricPixels < 200) return { ok: false, reason: 'Not enough T-shirt fabric found to recolor.' }

  let hasAlpha = false
  for (let p = 3; p < data.length; p += 4) {
    if (data[p] < 250) { hasAlpha = true; break }
  }

  return {
    ok: true,
    width: W,
    height: H,
    data, // original RGBA, kept for blending
    weight,
    dev,
    medianL: keptMedian,
    fabricLab: [Lref, aref, bref],
    fabricHex: det ? det.stats.fabricColor : labToHex(Lref, aref, bref),
    confidence: det ? det.stats.confidence : 1,
    level: det ? det.stats.level : 'mask',
    coverage: det ? det.stats.coverage : fabricPixels / n,
    source: det ? 'auto' : 'mask',
    hasAlpha,
    fabricPixels,
  }
}

// ---------------------------------------------------------------- stage 2: render

/** "lightness deviation index" -> [r,g,b] bytes for one target color. 4096 x 3. */
export function buildShadeTable(hex, medianL) {
  const target = hexToLab(hex)
  if (!target) throw new Error(`Invalid color: ${hex}`)
  const [tLRaw, ta, tb] = target
  // A photographed white shirt never sits at pure 255: its lit areas are a touch below, which is what leaves room for
  // the highlights to show at all. Anchoring the median at L* 95 (~#f2f2f2) keeps folds visible on white/very pale
  // targets; every other color lands on its exact value.
  const tL = Math.min(tLRaw, WHITE_ANCHOR_MAX_L)
  const tC = Math.hypot(ta, tb)
  const hue = Math.atan2(tb, ta)
  const cosH = Math.cos(hue)
  const sinH = Math.sin(hue)

  // Photo contrast is relative to its own brightness: scale deviations toward the new base lightness, bounded so a
  // dark photo recolored light (or the reverse) neither goes flat nor amplifies sensor noise.
  const scale = clamp(Math.sqrt((tL + 8) / (medianL + 8)), 0.7, 2)

  // chroma ceiling per lightness, sampled every 0.5 L*
  const steps = 201
  const ceiling = new Float32Array(steps)
  for (let i = 0; i < steps; i++) ceiling[i] = maxChroma(i * 0.5, cosH, sinH)
  const ceilAt = (L) => {
    const pos = clamp(L, 0, 100) * 2
    const i0 = Math.floor(pos)
    const i1 = Math.min(steps - 1, i0 + 1)
    return ceiling[i0] + (ceiling[i1] - ceiling[i0]) * (pos - i0)
  }

  const out = new Uint8Array(TABLE_SIZE * 3)
  for (let i = 0; i < TABLE_SIZE; i++) {
    const d = ((i / (TABLE_SIZE - 1)) * 2 - 1) * DEV_RANGE * scale
    // smooth roll-off toward 0 / 100 instead of a hard clip, slope 1 near the median
    const room = d < 0 ? tL : 100 - tL
    const shifted = room > 1e-6 ? Math.sign(d) * room * Math.tanh(Math.abs(d) / room) : 0
    const L = clamp(tL + shifted, 0, 100)
    const C = Math.min(tC, ceilAt(L))
    const [r, g, b] = labToSrgbBytes(L, C * cosH, C * sinH)
    out[i * 3] = r
    out[i * 3 + 1] = g
    out[i * 3 + 2] = b
  }
  return out
}

/**
 * "lightness deviation index" -> [r,g,b] of the fabric's ORIGINAL dye at that shade (what the photo's fabric looked like
 * before recoloring). Needed to tell how far a shirt-colour change moves the fabric, so that a pixel that is part print and
 * part fabric (feathered / anti-aliased artwork edge) only moves by its FABRIC share and keeps its print share untouched.
 */
function buildOriginalFabricTable(prep) {
  const [Lref, aref, bref] = prep.fabricLab
  const out = new Uint8Array(TABLE_SIZE * 3)
  for (let i = 0; i < TABLE_SIZE; i++) {
    const d = ((i / (TABLE_SIZE - 1)) * 2 - 1) * DEV_RANGE
    const L = clamp(prep.medianL + d, 0, 100)
    const k = (L + 16) / (Lref + 16)
    const [r, g, b] = labToSrgbBytes(L, aref * k, bref * k)
    out[i * 3] = r
    out[i * 3 + 1] = g
    out[i * 3 + 2] = b
  }
  return out
}

/**
 * @param {object} prep result of prepareGarment() with ok === true
 * @param {string} hex target color '#rrggbb'
 * @returns {Uint8ClampedArray} new RGBA buffer (same size as the photo)
 *
 * Fully-fabric pixels (weight 255) become exactly the shaded target colour. Partial pixels are NOT blended toward the
 * target any more - that dragged the artwork's own colour toward the shirt colour (the "shirt colour mixed into the DTF
 * design" bug). A partial pixel is  print*(1-w) + fabric*w,  so recoloring the fabric share means adding w * (new fabric -
 * old fabric): the print share stays exactly as photographed. (Same maths fixes the shirt/backdrop silhouette edge.)
 */
export function renderRecolor(prep, hex) {
  const { width, height, data, weight, dev, medianL } = prep
  const table = buildShadeTable(hex, medianL)
  const orig = buildOriginalFabricTable(prep)
  const out = new Uint8ClampedArray(data) // copy: untouched pixels (background, print, alpha) stay byte-identical
  const n = width * height
  for (let p = 0; p < n; p++) {
    const w = weight[p]
    if (w === 0) continue
    const t = dev[p] * 3
    const i = p * 4
    if (w === 255) {
      out[i] = table[t]
      out[i + 1] = table[t + 1]
      out[i + 2] = table[t + 2]
    } else {
      const f = w / 255
      // only the nearly-pure fabric pixels (f -> 1) are pulled onto the exact target, so there is no visible step at w=255
      const snap = f <= 0.9 ? 0 : (f - 0.9) / 0.1
      for (let c = 0; c < 3; c++) {
        const delta = data[i + c] + f * (table[t + c] - orig[t + c])
        out[i + c] = delta + (table[t + c] - delta) * snap * snap * (3 - 2 * snap)
      }
    }
  }
  return out
}

/**
 * Hex-exact, physically-plausible garment recoloring for the product
 * gallery's color switcher (Part 12) — REWRITTEN FROM SCRATCH.
 *
 * ----------------------------------------------------------------------
 * WHY THE OLD VERSION LOOKED NEON/FILTERED
 * ----------------------------------------------------------------------
 * The previous implementation was an RGB "duotone" gradient map: it built
 * a straight-line interpolation black → hex → white directly in sRGB
 * numbers and slid every fabric pixel along it by its own luminance. That
 * approach is a color *filter*, not a recolor, and it fails for two
 * fundamental reasons:
 *
 *  1. RGB is not a perceptual space. A straight RGB line from black to a
 *     saturated primary like #00FF00 stays extremely saturated across
 *     almost its whole length — only the two endpoints are actually
 *     neutral. So most of the shirt's midtones rendered at or near
 *     maximum chroma, which reads as flat, glowing, "plastic/neon" rather
 *     than a photographed dyed fabric with natural falloff.
 *  2. It had no concept of a color gamut. Real dyed cotton can't be as
 *     saturated as a screen primary at every brightness level — a real
 *     bright-green tee's shadows and highlights are necessarily *less*
 *     saturated than its midtone, because that's a hard physical/optical
 *     limit (you cannot print a color darker than black or lighter than
 *     white while keeping full saturation). The RGB gradient had no way
 *     to express that limit, so it clipped straight to garish, banded
 *     color instead of tapering off naturally.
 *
 * ----------------------------------------------------------------------
 * HOW THIS VERSION WORKS
 * ----------------------------------------------------------------------
 * This is a proper lightness/chroma/hue decomposition, done in CIE LAB /
 * LCH — the perceptually-uniform, device-independent space colorists
 * actually use for exactly this kind of "keep the shading, replace the
 * dye" operation:
 *
 *   1. MASK — classify every visible pixel as "fabric" (0..1 weight) or
 *      "print/artwork" using the garment's own dominant hue, same idea as
 *      before: low-saturation shading pixels always count as fabric;
 *      saturated pixels close to the garment's own dominant hue count as
 *      (already-dyed) fabric; saturated pixels far from it are treated as
 *      a printed logo/graphic and left untouched, with a soft blended
 *      edge between the two.
 *
 *   2. LIGHTNESS EXTRACTION — convert fabric pixels to LAB and read off
 *      L* (perceptual lightness) only. The a and b channels (the original
 *      garment's hue and chroma) are discarded entirely — this is the "remove the
 *      original garment colour" step. The photo's own shadow/median/
 *      highlight L* levels are measured (2nd/50th/98th percentile,
 *      weighted by fabric mask) so the normalization uses this garment's
 *      actual tonal range, not an assumed 0–100 span.
 *
 *   3. RELIGHTING — each pixel's L* is expressed as a 0..1 "shading
 *      position" relative to that garment's own shadow → median →
 *      highlight, then re-anchored so the median lands exactly on the
 *      TARGET hex's own L*, with the original photo's shadow/highlight
 *      *contrast* preserved proportionally on each side — but never
 *      pushed past 0 or 100. That's what makes #000000 keep visible fold
 *      highlights instead of crushing to a flat black rectangle, and
 *      #FFFFFF keep visible fold shadows instead of blowing out to a flat
 *      white rectangle: whichever side has headroom keeps the original
 *      photo's relative contrast; the side that's already at a hard
 *      physical limit (can't go blacker than black, can't go whiter than
 *      white) is compressed to fit.
 *
 *   4. CHROMA FROM THE TARGET HEX, GAMUT-MAPPED PER LIGHTNESS — the
 *      target hex is converted to LCH once, giving a target hue angle and
 *      a target chroma. Every fabric pixel is painted with that exact
 *      hue, at that exact chroma, EXCEPT chroma is clamped to the maximum
 *      chroma the sRGB display gamut can actually reproduce at that
 *      pixel's own (relit) lightness. That per-lightness ceiling is
 *      precomputed once per color pick (not per pixel) as a 101-entry
 *      lookup table, so it's cheap. This is the step that makes shadows
 *      and highlights desaturate naturally near black/white — exactly
 *      how a real photographed garment behaves — instead of clipping to
 *      a flat neon plateau. At the garment's own midtone the output
 *      chroma equals the hex's *actual* chroma (never boosted, never
 *      reduced) — so the exact selected hex is what appears in the base
 *      color of the shirt, per the brief.
 *
 *   5. COMPOSITE — the fully-recolored pixel and the original pixel are
 *      blended by the fabric-vs-print weight from step 1, so print/logo
 *      pixels are left completely alone and the boundary is soft.
 *
 * Alpha (transparency) is passed through untouched, so the background is
 * never touched.
 *
 * Caveat, stated plainly: this is one flat photo, not a layered file with
 * the print on its own channel, so the fabric/print mask is a strong
 * heuristic, not true segmentation. It reliably protects prints/logos
 * that read as a distinctly different, reasonably saturated color from
 * the shirt. A print rendered in the same near-neutral gray family as the
 * shirt's own shading (e.g. a plain white/gray print on a black tee)
 * can't be told apart from fabric shading by color alone; best results
 * come from an evenly, flatly lit product photo.
 */

/** In-memory cache, keyed by `${src}|${hex}`, shared for the whole session
 *  so re-selecting a color already viewed is instant instead of
 *  recomputing the canvas work. */
const cache = new Map()

// --- tunables ---------------------------------------------------------

// A photo is capped to this longest side before processing, purely for
// speed — the gallery never displays a shirt photo larger than this
// anyway, and it keeps the "instant" feel on very large source photos.
const MAX_DIMENSION = 2200

// Minimum saturation for a pixel to "vote" on what the garment's dominant
// hue is. Near-gray pixels have an unstable/meaningless hue, so they sit
// this out rather than adding noise.
const HUE_VOTE_MIN_SAT = 0.15

// Hue histogram resolution for dominant-hue detection.
const HUE_BINS = 48
const HUE_BIN_DEGREES = 360 / HUE_BINS

// A dominant hue is only trusted as "the fabric's own color" if pixels
// that voted for it cover at least this fraction of the garment's visible
// area. A small printed logo, even if strongly saturated, won't clear
// this bar.
const DOMINANT_HUE_MIN_AREA_FRACTION = 0.12

// Saturation band across which a pixel is treated as "neutral" (i.e.
// fabric shading/highlight, regardless of hue) rather than "colored".
const NEUTRAL_SAT_LOW = 0.08
const NEUTRAL_SAT_HIGH = 0.22

// Hue-distance band (degrees) across which a saturated pixel is treated as
// "matches the fabric's own dominant hue" vs. "a different-colored print".
const FABRIC_HUE_MATCH_SOFT = 18
const FABRIC_HUE_MATCH_HARD = 45

// Percentile pair used to find the fabric's own shadow/highlight extremes
// in L* (kept a little inside 0/100 so a handful of true outlier pixels —
// a stray blown-out speck of glare, a near-black seam shadow — don't
// stretch the whole normalization to accommodate them).
const SHADOW_PERCENTILE = 0.02
const HIGHLIGHT_PERCENTILE = 0.98

// Resolution of the per-color gamut-max-chroma lookup table, sampled
// across L* 0..100.
const GAMUT_LUT_STEPS = 101

// -----------------------------------------------------------------------
// sRGB <-> Linear <-> XYZ <-> LAB / LCH color science (D65 white point)
// -----------------------------------------------------------------------

function srgbChannelToLinear(c) {
  const cn = c / 255
  return cn <= 0.04045 ? cn / 12.92 : Math.pow((cn + 0.055) / 1.055, 2.4)
}

/** Raw (unclamped) linear -> sRGB companding. Deliberately does NOT clamp
 *  its input or output — used for gamut testing, where an out-of-[0,1]
 *  linear value (and therefore an out-of-[0,255] result) is exactly the
 *  signal we're checking for. Clamping here would make every color look
 *  falsely "in gamut". */
function linearChannelToSrgbRaw(c) {
  if (c <= 0.0031308) return c * 12.92 * 255
  // Guard only against a negative base to Math.pow (which would be NaN),
  // not against the value being out of the displayable range — a negative
  // linear value should surface as a negative (out-of-gamut) sRGB value.
  const sign = c < 0 ? -1 : 1
  const mag = Math.abs(c)
  return sign * (1.055 * Math.pow(mag, 1 / 2.4) - 0.055) * 255
}

/** Clamped linear -> sRGB companding, for producing an actual displayable
 *  pixel value. */
function linearChannelToSrgb(c) {
  const clamped = c < 0 ? 0 : c > 1 ? 1 : c
  const out = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
  return out * 255
}

const WHITE_XN = 95.047
const WHITE_YN = 100.0
const WHITE_ZN = 108.883

function rgbToXyz(r, g, b) {
  const rl = srgbChannelToLinear(r)
  const gl = srgbChannelToLinear(g)
  const bl = srgbChannelToLinear(b)
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) * 100
  const y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175) * 100
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) * 100
  return [x, y, z]
}

function xyzToRgb(x, y, z) {
  const xn = x / 100
  const yn = y / 100
  const zn = z / 100
  const rl = xn * 3.2404542 + yn * -1.5371385 + zn * -0.4985314
  const gl = xn * -0.969266 + yn * 1.8760108 + zn * 0.041556
  const bl = xn * 0.0556434 + yn * -0.2040259 + zn * 1.0572252
  return [linearChannelToSrgb(rl), linearChannelToSrgb(gl), linearChannelToSrgb(bl)]
}

/** Same as xyzToRgb but returns raw, unclamped sRGB numbers (can be
 *  negative or >255) — used only for gamut-boundary testing. */
function xyzToRgbRaw(x, y, z) {
  const xn = x / 100
  const yn = y / 100
  const zn = z / 100
  const rl = xn * 3.2404542 + yn * -1.5371385 + zn * -0.4985314
  const gl = xn * -0.969266 + yn * 1.8760108 + zn * 0.041556
  const bl = xn * 0.0556434 + yn * -0.2040259 + zn * 1.0572252
  return [linearChannelToSrgbRaw(rl), linearChannelToSrgbRaw(gl), linearChannelToSrgbRaw(bl)]
}

function xyzFwd(t) {
  const delta = 6 / 29
  return t > delta * delta * delta ? Math.cbrt(t) : t / (3 * delta * delta) + 4 / 29
}

function xyzInv(t) {
  const delta = 6 / 29
  return t > delta ? t * t * t : 3 * delta * delta * (t - 4 / 29)
}

function rgbToLab(r, g, b) {
  const [x, y, z] = rgbToXyz(r, g, b)
  const fx = xyzFwd(x / WHITE_XN)
  const fy = xyzFwd(y / WHITE_YN)
  const fz = xyzFwd(z / WHITE_ZN)
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function labToRgb(L, a, b) {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const x = WHITE_XN * xyzInv(fx)
  const y = WHITE_YN * xyzInv(fy)
  const z = WHITE_ZN * xyzInv(fz)
  return xyzToRgb(x, y, z)
}

/** Same as labToRgb but returns raw, unclamped sRGB numbers — used only
 *  for gamut-boundary testing (see linearChannelToSrgbRaw). */
function labToRgbRaw(L, a, b) {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const x = WHITE_XN * xyzInv(fx)
  const y = WHITE_YN * xyzInv(fy)
  const z = WHITE_ZN * xyzInv(fz)
  return xyzToRgbRaw(x, y, z)
}

/** Whether a RAW (unclamped) sRGB triple is within the real, displayable
 *  0-255 gamut (small epsilon so float rounding right at the edge isn't
 *  rejected). Must be called with labToRgbRaw's output, not labToRgb's —
 *  labToRgb clamps its output, which would make every color falsely
 *  test as "in gamut". */
function inSrgbGamut(r, g, b) {
  const EPS = 0.5
  return r >= -EPS && r <= 255 + EPS && g >= -EPS && g <= 255 + EPS && b >= -EPS && b <= 255 + EPS
}

/**
 * Finds the maximum LCH chroma reproducible in sRGB at a given lightness
 * L* and hue angle (degrees), via binary search. This is the physical
 * gamut boundary — e.g. very little chroma is displayable near L*=0 or
 * L*=100 for any hue, which is exactly why real dyed fabric desaturates
 * in deep shadow and bright highlight.
 */
function maxChromaForLH(L, hueDeg) {
  const hueRad = (hueDeg * Math.PI) / 180
  const cosH = Math.cos(hueRad)
  const sinH = Math.sin(hueRad)
  // Quick check: even C=0 (fully neutral gray) must be in gamut for every
  // L in [0,100] — if not (shouldn't happen), bail to 0.
  let lo = 0
  let hi = 200
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2
    const [r, g, b] = labToRgbRaw(L, mid * cosH, mid * sinH)
    if (inSrgbGamut(r, g, b)) lo = mid
    else hi = mid
  }
  return lo
}

/** Builds a 0..100 L* -> max-chroma-at-target-hue lookup table, once per
 *  color selection, so per-pixel work is a cheap array lookup instead of
 *  a binary search per pixel. */
function buildGamutChromaLUT(hueDeg) {
  const lut = new Float64Array(GAMUT_LUT_STEPS)
  for (let i = 0; i < GAMUT_LUT_STEPS; i++) {
    const L = (i / (GAMUT_LUT_STEPS - 1)) * 100
    lut[i] = maxChromaForLH(L, hueDeg)
  }
  return lut
}

function lookupMaxChroma(lut, L) {
  const clampedL = L < 0 ? 0 : L > 100 ? 100 : L
  const pos = (clampedL / 100) * (GAMUT_LUT_STEPS - 1)
  const i0 = Math.floor(pos)
  const i1 = Math.min(GAMUT_LUT_STEPS - 1, i0 + 1)
  const t = pos - i0
  return lut[i0] + (lut[i1] - lut[i0]) * t
}

// -----------------------------------------------------------------------
// HSL-space hue/saturation, used only for the fabric-vs-print mask (this
// heuristic doesn't need to be perceptual, just cheap and stable).
// -----------------------------------------------------------------------

function hexToRgb(hex) {
  const clean = hex.replace('#', '').trim()
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/** Standard smoothstep, 0 at/before edge0, 1 at/after edge1, eased between. */
function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function hueSaturationHSL(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return [h * 360, s]
}

function circularHueDistance(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image for recoloring: ${src}`))
    img.src = src
  })
}

/**
 * How much a given pixel counts as "fabric" (1) vs. "leave it alone,
 * that's print/artwork" (0), given the garment's dominant hue (or `null`
 * if the garment didn't have one clear enough to trust).
 */
function fabricWeightFor(s, h, dominantHue) {
  const neutralWeight = 1 - smoothstep(NEUTRAL_SAT_LOW, NEUTRAL_SAT_HIGH, s)
  if (dominantHue === null) return neutralWeight
  const dist = circularHueDistance(h, dominantHue)
  const hueWeight = 1 - smoothstep(FABRIC_HUE_MATCH_SOFT, FABRIC_HUE_MATCH_HARD, dist)
  return Math.max(neutralWeight, hueWeight)
}

/**
 * Finds the garment's own dominant hue by histogramming hue (weighted by
 * saturation) across every visible pixel, then checks that hue actually
 * covers enough of the garment's area to be trusted as "the fabric's
 * color" rather than noise from a small saturated print.
 *
 * @returns {number | null} dominant hue in degrees, or null if none clears
 *   the area bar (e.g. a black/white/gray garment, or a garment whose
 *   strongest saturated region is actually just its printed graphic).
 */
function findDominantHue(data) {
  const hist = new Float64Array(HUE_BINS)
  const areaCount = new Uint32Array(HUE_BINS)
  let totalVisible = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue
    totalVisible++
    const [h, s] = hueSaturationHSL(data[i], data[i + 1], data[i + 2])
    if (s >= HUE_VOTE_MIN_SAT) {
      const bin = Math.min(HUE_BINS - 1, Math.floor(h / HUE_BIN_DEGREES))
      hist[bin] += s
      areaCount[bin] += 1
    }
  }

  if (totalVisible === 0) return null

  let bestBin = -1
  let bestWeight = 0
  for (let b = 0; b < HUE_BINS; b++) {
    if (hist[b] > bestWeight) {
      bestWeight = hist[b]
      bestBin = b
    }
  }
  if (bestBin === -1) return null
  if (areaCount[bestBin] / totalVisible < DOMINANT_HUE_MIN_AREA_FRACTION) return null

  return (bestBin + 0.5) * HUE_BIN_DEGREES
}

/**
 * Measures the fabric's own shadow -> median -> highlight L* (perceptual
 * lightness) via a weighted histogram (weighted by fabric-ness, so print
 * pixels don't skew it). This is what the relighting step normalizes
 * against, instead of assuming a fixed 0-100 span.
 */
function findFabricLightnessLandmarks(lStar, data, dominantHue) {
  const BINS = 256
  const hist = new Float64Array(BINS)
  let total = 0

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] === 0) continue
    const [h, s] = hueSaturationHSL(data[i], data[i + 1], data[i + 2])
    const weight = fabricWeightFor(s, h, dominantHue)
    if (weight <= 0) continue
    const bin = Math.min(BINS - 1, Math.max(0, Math.round((lStar[p] / 100) * (BINS - 1))))
    hist[bin] += weight
    total += weight
  }

  if (total === 0) {
    // Degenerate case (e.g. an entirely transparent or print-only image) —
    // fall back to a neutral mid-range so nothing throws.
    return { shadow: 20, median: 50, highlight: 80 }
  }

  const targets = [SHADOW_PERCENTILE * total, 0.5 * total, HIGHLIGHT_PERCENTILE * total]
  const results = []
  let cumulative = 0
  let targetIndex = 0
  for (let bin = 0; bin < BINS && targetIndex < targets.length; bin++) {
    cumulative += hist[bin]
    while (targetIndex < targets.length && cumulative >= targets[targetIndex]) {
      results.push((bin / (BINS - 1)) * 100)
      targetIndex++
    }
  }
  while (results.length < 3) results.push(100)

  const [shadow, median, highlight] = results
  return { shadow, median: Math.max(shadow + 0.5, Math.min(median, highlight - 0.5)), highlight }
}

/** Maps a pixel's own L* into a 0..1 shading position relative to the
 *  fabric's own measured shadow/median/highlight (piecewise-linear, median
 *  -> 0.5). This is the "remove absolute brightness, keep relative
 *  shading shape" step. */
function normalizeShading(l, landmarks) {
  const { shadow, median, highlight } = landmarks
  if (l <= shadow) return 0
  if (l >= highlight) return 1
  if (l <= median) return ((l - shadow) / (median - shadow)) * 0.5
  return 0.5 + ((l - median) / (highlight - median)) * 0.5
}

/**
 * Re-anchors a 0..1 shading position onto the target hex's own L*,
 * preserving the original photo's shadow/highlight contrast
 * proportionally on each side, but never pushing past the hard physical
 * limits of 0 (true black) or 100 (true white). Whichever side still has
 * headroom keeps full original contrast; the side already pinned to a
 * limit is compressed to fit — this is why a black target keeps visible
 * fold *highlights* and a white target keeps visible fold *shadows*.
 */
function relight(shadingPos, targetL, landmarks) {
  const originalHalfBelow = Math.max(0, landmarks.median - landmarks.shadow)
  const originalHalfAbove = Math.max(0, landmarks.highlight - landmarks.median)
  const availableBelow = targetL
  const availableAbove = 100 - targetL
  const halfBelow = Math.min(originalHalfBelow, availableBelow)
  const halfAbove = Math.min(originalHalfAbove, availableAbove)

  if (shadingPos <= 0.5) {
    return targetL - (0.5 - shadingPos) * 2 * halfBelow
  }
  return targetL + (shadingPos - 0.5) * 2 * halfAbove
}

/**
 * Recolors one photo to a target hex and returns a data: URL. Cached by
 * (src, hex), so callers can call this freely — repeated requests for the
 * same pair resolve from cache rather than re-drawing the canvas.
 *
 * @param {string} src - original photo URL (same-origin, e.g. "/images/…")
 * @param {string} hex - target color, e.g. "#e8836b"
 * @returns {Promise<string>} a data: URL of the recolored image
 */
export function getRecoloredImage(src, hex) {
  const key = `${src}|${hex.toLowerCase()}`
  if (cache.has(key)) return cache.get(key)

  const promise = (async () => {
    const img = await loadImage(src)

    let { naturalWidth: width, naturalHeight: height } = img
    if (Math.max(width, height) > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height)
      width = Math.round(width * scale)
      height = Math.round(height * scale)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    const { data } = imageData
    const pixelCount = width * height

    const [tr, tg, tb] = hexToRgb(hex)
    const [targetL, targetA, targetB] = rgbToLab(tr, tg, tb)
    const targetC = Math.sqrt(targetA * targetA + targetB * targetB)
    const targetHueDeg = (Math.atan2(targetB, targetA) * 180) / Math.PI

    // Pass 1: what hue, if any, is this garment actually dyed? (drives the
    // fabric-vs-print mask)
    const dominantHue = findDominantHue(data)

    // Pass 2: convert every visible pixel's lightness to perceptual L*
    // once, up front (reused by the landmark measurement and the main
    // per-pixel pass below).
    const lStar = new Float64Array(pixelCount)
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] === 0) continue
      const [L] = rgbToLab(data[i], data[i + 1], data[i + 2])
      lStar[p] = L
    }

    // Pass 3: this garment's own shadow/median/highlight L*, measured
    // only from pixels classified as fabric (so print doesn't skew it).
    const landmarks = findFabricLightnessLandmarks(lStar, data, dominantHue)

    // Pass 4: the physical sRGB-gamut chroma ceiling at the target hue,
    // sampled across the full L* range — computed once per color pick,
    // then just looked up per pixel. This is what naturally desaturates
    // shadows/highlights instead of clipping to flat neon.
    const gamutLUT = buildGamutChromaLUT(targetHueDeg)

    // Pass 5: recolor fabric pixels — replace hue/chroma with the
    // target's, relight using this garment's own shading shape, leave
    // print/artwork pixels alone, soft-blend the boundary between them.
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      if (data[i + 3] === 0) continue // fully transparent — leave alone

      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const [h, s] = hueSaturationHSL(r, g, b)
      const weight = fabricWeightFor(s, h, dominantHue)

      if (weight <= 0) continue // pure print/artwork pixel — untouched

      const shadingPos = normalizeShading(lStar[p], landmarks)
      const outL = relight(shadingPos, targetL, landmarks)
      const maxC = lookupMaxChroma(gamutLUT, outL)
      const outC = Math.min(targetC, maxC)

      const hueRad = (targetHueDeg * Math.PI) / 180
      const outA = outC * Math.cos(hueRad)
      const outB = outC * Math.sin(hueRad)
      let [cr, cg, cb] = labToRgb(outL, outA, outB)
      // Guard against the rare sub-pixel float overshoot right at the
      // gamut edge.
      cr = cr < 0 ? 0 : cr > 255 ? 255 : cr
      cg = cg < 0 ? 0 : cg > 255 ? 255 : cg
      cb = cb < 0 ? 0 : cb > 255 ? 255 : cb

      if (weight >= 1) {
        data[i] = cr
        data[i + 1] = cg
        data[i + 2] = cb
      } else {
        // Soft edge between recolored fabric and untouched print.
        data[i] = r + (cr - r) * weight
        data[i + 1] = g + (cg - g) * weight
        data[i + 2] = b + (cb - b) * weight
      }
    }

    ctx.putImageData(imageData, 0, 0)
    return canvas.toDataURL('image/png')
  })()

  cache.set(key, promise)
  // A failed attempt shouldn't stay cached as a dead promise — let the
  // next call try again.
  promise.catch(() => cache.delete(key))
  return promise
}

/**
 * Automatic T-shirt garment detection — pure pixel math, no DOM, no ML download, no network.
 *
 * Input : RGBA pixels of a FINISHED T-shirt photo (flat-lay, hanging, mannequin or on a person).
 * Output: a binary garment mask (255 = T-shirt fabric incl. printed graphics, 0 = everything else) at the working
 *         resolution, plus stats. `upsampleMaskRows` brings it back to the photo's exact pixel size.
 *
 * Pipeline (all steps are deterministic, so the same photo always gives the same mask):
 *   1. Background  – estimated from the photo's border (k-means in Lab, handles studio gradients). The background is
 *                    the border-connected region that matches it. A transparent PNG uses its own alpha instead.
 *   2. Foreground  – everything that is not background (garment + hanger + mannequin/person + shadow).
 *   3. Fabric      – the dominant colour in the middle of the foreground is the T-shirt colour. Foreground pixels that
 *                    are not that colour (hanger, mannequin, hair, hands, shoes…) are dropped; skin tones are excluded
 *                    unless the shirt itself is skin-coloured.
 *   4. Clean-up    – opening removes thin hangers/strings, small pieces are dropped, pieces of the foreground that are mostly surrounded by fabric
 *                    (the printed graphic, even one running off the hem) are put back INSIDE the garment (a print is not a hole), edges are smoothed.
 * Gaps that are real background (between arm and body, under a hanger) stay outside the mask.
 */

export const WORK_MAX_SIDE = 640
/** A non-fabric piece joins the garment when at least this share of its outline touches fabric. */
const ENCLOSED_SHARE = 0.6

/** Tolerances per sensitivity. `loose` keeps more shading/colour variation, `tight` is stricter about fabric colour. */
export const SENSITIVITY = Object.freeze({
  tight: { label: 'Tight', k: 0.7 },
  normal: { label: 'Normal', k: 1 },
  loose: { label: 'Loose', k: 1.35 },
})

// ---------------------------------------------------------------- colour

const LIN = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const c = i / 255
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const XN = 0.95047
const ZN = 1.08883
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)

/** sRGB bytes -> interleaved Lab (L 0-100, a/b about -100..100). */
export function toLab(data, n) {
  const lab = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const r = LIN[data[i * 4]]
    const g = LIN[data[i * 4 + 1]]
    const b = LIN[data[i * 4 + 2]]
    const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / XN)
    const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b)
    const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / ZN)
    lab[i * 3] = 116 * fy - 16
    lab[i * 3 + 1] = 500 * (fx - fy)
    lab[i * 3 + 2] = 200 * (fy - fz)
  }
  return lab
}

/** Common skin-tone rule in YCbCr + RGB (covers light to dark skin; deliberately narrow in chroma). */
function isSkin(r, g, b) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
  return cb >= 77 && cb <= 127 && cr >= 135 && cr <= 173 && r > g && r >= b && r > 40
}

// ---------------------------------------------------------------- grids

/** Downscale RGBA to fit `maxSide` (box filter). Returns the input untouched when already small enough. */
export function downscaleRGBA(img, maxSide = WORK_MAX_SIDE) {
  const { width: W, height: H, data } = img
  const s = Math.min(1, maxSide / Math.max(W, H))
  if (s >= 1) return { width: W, height: H, data, scale: 1 }
  const w = Math.max(1, Math.round(W * s))
  const h = Math.max(1, Math.round(H * s))
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * H) / h)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * H) / h))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * W) / w)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * W) / w))
      let r = 0, g = 0, b = 0, a = 0, c = 0
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const p = (yy * W + xx) * 4
          const al = data[p + 3]
          r += data[p] * al; g += data[p + 1] * al; b += data[p + 2] * al; a += al; c++
        }
      }
      const o = (y * w + x) * 4
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a }
      out[o + 3] = a / c
    }
  }
  return { width: w, height: h, data: out, scale: w / W }
}

/** Separable square erode (mode 'min') / dilate (mode 'max') on a 0/1 Uint8Array. The image edge is not treated as a border. */
function morph(src, w, h, r, mode) {
  if (r <= 0) return src.slice()
  const want = mode === 'max' ? 1 : 0
  const tmp = new Uint8Array(w * h)
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let found = false
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (src[y * w + k] === want) { found = true; break }
      tmp[y * w + x] = found ? want : 1 - want
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let found = false
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (tmp[k * w + x] === want) { found = true; break }
      out[y * w + x] = found ? want : 1 - want
    }
  }
  return out
}
const erode = (m, w, h, r) => morph(m, w, h, r, 'min')
const dilate = (m, w, h, r) => morph(m, w, h, r, 'max')
const open = (m, w, h, r) => dilate(erode(m, w, h, r), w, h, r)

/** 4-connected components. Returns { labels, sizes } (label 0 = background, sizes[label] = pixel count). */
export function components(mask, w, h) {
  const labels = new Int32Array(w * h)
  const sizes = [0]
  const stack = new Int32Array(w * h)
  let next = 0
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || labels[s]) continue
    next++
    let sp = 0
    let size = 0
    stack[sp++] = s
    labels[s] = next
    while (sp) {
      const p = stack[--sp]
      size++
      const x = p % w
      const y = (p - x) / w
      if (x > 0 && mask[p - 1] && !labels[p - 1]) { labels[p - 1] = next; stack[sp++] = p - 1 }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1]) { labels[p + 1] = next; stack[sp++] = p + 1 }
      if (y > 0 && mask[p - w] && !labels[p - w]) { labels[p - w] = next; stack[sp++] = p - w }
      if (y < h - 1 && mask[p + w] && !labels[p + w]) { labels[p + w] = next; stack[sp++] = p + w }
    }
    sizes.push(size)
  }
  return { labels, sizes }
}

/** Keeps the largest component plus any other at least `minRatio` of its size. */
function keepMajor(mask, w, h, minRatio) {
  const { labels, sizes } = components(mask, w, h)
  const biggest = Math.max(0, ...sizes.slice(1))
  const out = new Uint8Array(w * h)
  if (!biggest) return out
  for (let i = 0; i < out.length; i++) if (labels[i] && sizes[labels[i]] >= biggest * minRatio) out[i] = 1
  return out
}

/**
 * Pixels (1) reachable from the image border through `pass` pixels (1). With `lab`, a step is only taken between
 * neighbours whose colours differ by at most STEP, so a flood can follow a smooth studio gradient or soft shadow but
 * cannot jump across a real edge (a white sleeve against a light-grey backdrop).
 */
const STEP = 6
function floodFromBorder(pass, w, h, lab = null) {
  const seen = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let sp = 0
  for (let x = 0; x < w; x++) for (const p of [x, (h - 1) * w + x]) if (pass[p] && !seen[p]) { seen[p] = 1; stack[sp++] = p }
  for (let y = 0; y < h; y++) for (const p of [y * w, y * w + w - 1]) if (pass[p] && !seen[p]) { seen[p] = 1; stack[sp++] = p }
  const ok = (p, q) => pass[q] && !seen[q] && (!lab || Math.hypot(lab[p * 3] - lab[q * 3], lab[p * 3 + 1] - lab[q * 3 + 1], lab[p * 3 + 2] - lab[q * 3 + 2]) <= STEP)
  while (sp) {
    const p = stack[--sp]
    const x = p % w
    if (x > 0 && ok(p, p - 1)) { seen[p - 1] = 1; stack[sp++] = p - 1 }
    if (x < w - 1 && ok(p, p + 1)) { seen[p + 1] = 1; stack[sp++] = p + 1 }
    if (p >= w && ok(p, p - w)) { seen[p - w] = 1; stack[sp++] = p - w }
    if (p < w * h - w && ok(p, p + w)) { seen[p + w] = 1; stack[sp++] = p + w }
  }
  return seen
}

function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const d = 2 * r + 1
  for (let y = 0; y < h; y++) {
    let acc = 0
    for (let k = -r; k <= r; k++) acc += src[y * w + Math.min(w - 1, Math.max(0, k))]
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / d
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / d
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return out
}

// ---------------------------------------------------------------- k-means (deterministic)

/** points: interleaved Lab. Farthest-point initialisation, so there is no randomness. */
function kmeans(points, n, k, iters = 8) {
  if (n === 0) return { centers: [], counts: [], rms: [] }
  let mean = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mean[c] += points[i * 3 + c] / n
  const d2 = (i, c) => (points[i * 3] - c[0]) ** 2 + (points[i * 3 + 1] - c[1]) ** 2 + (points[i * 3 + 2] - c[2]) ** 2
  let first = 0
  for (let i = 1; i < n; i++) if (d2(i, mean) < d2(first, mean)) first = i
  const centers = [[points[first * 3], points[first * 3 + 1], points[first * 3 + 2]]]
  while (centers.length < Math.min(k, n)) {
    let best = -1, bestD = -1
    for (let i = 0; i < n; i++) {
      const dm = Math.min(...centers.map((c) => d2(i, c)))
      if (dm > bestD) { bestD = dm; best = i }
    }
    if (bestD < 1) break
    centers.push([points[best * 3], points[best * 3 + 1], points[best * 3 + 2]])
  }
  const assign = new Int32Array(n)
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0])
    for (let i = 0; i < n; i++) {
      let bi = 0, bd = Infinity
      for (let c = 0; c < centers.length; c++) { const dd = d2(i, centers[c]); if (dd < bd) { bd = dd; bi = c } }
      assign[i] = bi
      sum[bi][0] += points[i * 3]; sum[bi][1] += points[i * 3 + 1]; sum[bi][2] += points[i * 3 + 2]; sum[bi][3]++
    }
    for (let c = 0; c < centers.length; c++) if (sum[c][3]) centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]]
  }
  const counts = centers.map(() => 0)
  const sq = centers.map(() => 0)
  for (let i = 0; i < n; i++) { counts[assign[i]]++; sq[assign[i]] += d2(i, centers[assign[i]]) }
  return { centers, counts, rms: sq.map((s, c) => Math.sqrt(s / Math.max(1, counts[c]))) }
}

/**
 * Finds a flat "card" backdrop sitting inside the border-connected backdrop: the foreground is (nearly) a filled
 * rectangle AND the pixels along its rim are one flat colour. Returns a backdrop cluster { c, share, r } or null.
 */
function findCardBackdrop(bg, lab, w, h, side) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1, area = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (bg[y * w + x]) continue
    area++
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
  }
  if (area < 0.2 * w * h) return null
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  if (bw < 0.6 * w || bh < 0.6 * h || area / (bw * bh) < 0.88) return null // not a filled rectangle: a garment/person
  const inset = Math.max(2, Math.round(side * 0.012))
  const band = Math.max(2, Math.round(side * 0.02))
  const pts = []
  for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) {
    const d = Math.min(x - x0, x1 - x, y - y0, y1 - y)
    if (d < inset || d > inset + band || bg[y * w + x]) continue
    pts.push(y * w + x)
  }
  if (pts.length < 40) return null
  const med = (c) => { const v = pts.map((p) => lab[p * 3 + c]).sort((a, b) => a - b); return v[v.length >> 1] }
  const c = [med(0), med(1), med(2)]
  const dist = pts.map((p) => Math.hypot(lab[p * 3] - c[0], lab[p * 3 + 1] - c[1], lab[p * 3 + 2] - c[2])).sort((a, b) => a - b)
  const r = Math.min(24, Math.max(9, 2.5 * dist[dist.length >> 1] + 6))
  if (dist.filter((d) => d <= r).length / dist.length < 0.7) return null // the rim is not one flat colour
  return { c, share: area / (w * h), r }
}

// ---------------------------------------------------------------- detection

/**
 * @param {{width:number,height:number,data:Uint8ClampedArray}} image RGBA
 * @param {{ sensitivity?: 'tight'|'normal'|'loose', maxSide?: number }} [options]
 * @returns {{ ok: boolean, status: 'ok'|'no_garment', mask: Uint8Array, width: number, height: number, scale: number, stats: object }}
 */
export function detectGarment(image, options = {}) {
  const sens = SENSITIVITY[options.sensitivity] ?? SENSITIVITY.normal
  const work = downscaleRGBA(image, options.maxSide ?? WORK_MAX_SIDE)
  const { width: w, height: h, data } = work
  const n = w * h
  const side = Math.max(w, h)
  const warnings = []
  const lab = toLab(data, n)
  // The background stage works on a lightly blurred copy so sensor noise / JPEG blocks don't fragment it
  const labBg = new Float32Array(n * 3)
  {
    const r = Math.max(1, Math.round(side * 0.004))
    for (let c = 0; c < 3; c++) {
      const ch = new Float32Array(n)
      for (let i = 0; i < n; i++) ch[i] = lab[i * 3 + c]
      const bl = boxBlur(ch, w, h, r)
      for (let i = 0; i < n; i++) labBg[i * 3 + c] = bl[i]
    }
  }
  let bgClusters = []

  // ---- 1. background --------------------------------------------------------------------------------------------
  let alphaPixels = 0
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 250) alphaPixels++
  const hasAlpha = alphaPixels / n > 0.02
  // `fillsFrame` (optional): the caller knows the garment fills the whole photo (fabric / detail close-up), so there is
  // no backdrop to peel off — without this, an all-fabric border is mistaken for the backdrop and only the print is
  // left as "garment". Handled by the same edge-to-edge path used when the border can't be separated anyway.
  const fillsFrame = !hasAlpha && options.fillsFrame === true

  // The backdrop is separated from the garment by flooding inward from the photo border. `maxFarDelta` limits which border
  // colours may count as backdrop: Infinity = every border colour with a real share (the normal case); a number = only
  // colours within that Lab distance of the DOMINANT border colour (see the retry below).
  const separateBackground = (maxFarDelta) => {
    let bgLike = new Uint8Array(n)
    let borderBgFraction = 1
    let bgClusters = []
    if (hasAlpha) {
      for (let i = 0; i < n; i++) bgLike[i] = data[i * 4 + 3] < 128 ? 1 : 0
    } else if (fillsFrame) {
      // nothing is background: bgLike / bgClusters stay empty
    } else {
      const ring = Math.max(2, Math.round(side * 0.02))
      const samples = []
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < ring || y < ring || x >= w - ring || y >= h - ring) samples.push(y * w + x)
      const stride = Math.max(1, Math.floor(samples.length / 2500))
      const pts = []
      for (let s = 0; s < samples.length; s += stride) pts.push(labBg[samples[s] * 3], labBg[samples[s] * 3 + 1], labBg[samples[s] * 3 + 2])
      const km = kmeans(Float32Array.from(pts), pts.length / 3, 4)
      const total = km.counts.reduce((a, b) => a + b, 0)
      // a "background colour" must cover a real share of the border; this drops a shirt that merely touches the edge
      let clusters = km.centers
        .map((c, i) => ({ c, share: km.counts[i] / total, r: Math.min(24, Math.max(9, 2.5 * km.rms[i] + 4)) }))
        .filter((cl) => cl.share >= 0.06)
      if (Number.isFinite(maxFarDelta) && clusters.length > 1) {
        const dom = clusters.reduce((m, cl) => (cl.share > m.share ? cl : m), clusters[0])
        clusters = clusters.filter((cl) => cl === dom || Math.hypot(cl.c[0] - dom.c[0], cl.c[1] - dom.c[1], cl.c[2] - dom.c[2]) <= maxFarDelta)
      }
      bgClusters = clusters
      for (let i = 0; i < n; i++) {
        const L = labBg[i * 3], A = labBg[i * 3 + 1], B = labBg[i * 3 + 2]
        for (const cl of clusters) {
          if (Math.hypot(L - cl.c[0], A - cl.c[1], B - cl.c[2]) <= cl.r) { bgLike[i] = 1; break }
        }
      }
    }
    let bg = floodFromBorder(bgLike, w, h, hasAlpha ? null : lab)
    // Nested backdrop: many product photos are a beige "card" inside an off-white frame. The border colour (the frame) is
    // peeled off above, but the card is then a big flat rectangle of "foreground" that out-weighs the shirt. A foreground
    // that fills its bounding box and whose edge is one flat colour is a card, not a garment: that colour joins the
    // backdrop and the border flood is repeated (twice at most).
    if (!hasAlpha && !fillsFrame) {
      for (let round = 0; round < 2; round++) {
        const card = findCardBackdrop(bg, lab, w, h, side)
        if (!card) break
        bgClusters = [...bgClusters, card]
        for (let i = 0; i < n; i++) {
          if (!bgLike[i] && Math.hypot(labBg[i * 3] - card.c[0], labBg[i * 3 + 1] - card.c[1], labBg[i * 3 + 2] - card.c[2]) <= card.r) bgLike[i] = 1
        }
        // no colour-step limit here: the frame -> card edge is a real step, and the card colour is already vetted above
        bg = floodFromBorder(bgLike, w, h, null)
      }
    }
    let bb = 0, bt = 0
    for (let x = 0; x < w; x++) { bt += 2; bb += bg[x] + bg[(h - 1) * w + x] }
    for (let y = 1; y < h - 1; y++) { bt += 2; bb += bg[y * w] + bg[y * w + w - 1] }
    borderBgFraction = bb / bt
    return { bgLike, bg, bgClusters, borderBgFraction }
  }

  /** Share of the photo covered by the main foreground blob(s) for a given separation. */
  const garmentCoverage = (sep) => {
    const f = new Uint8Array(n)
    for (let i = 0; i < n; i++) if (!sep.bg[i]) f[i] = 1
    const kept = keepMajor(f, w, h, 0.05)
    let c = 0
    for (let i = 0; i < n; i++) if (kept[i]) c++
    return c / n
  }

  let separation = separateBackground(Infinity)
  // A DARK SHIRT THAT TOUCHES THE PHOTO EDGE (sleeves reaching the sides, shoulders at the top) puts its own colour into the
  // border sample; if that colour covers a real share it is mistaken for backdrop, the black fabric is flooded away and only
  // the artwork is left as "garment" (the colour switch then recoloured the print and left the fabric alone). Retry with
  // only the colours close to the dominant border colour as backdrop, and keep the retry ONLY when the first result looks
  // like a print sitting inside the dark region the retry found: the first "garment" must be mostly surrounded by it. (A
  // dark floor strip or a dark backdrop band does not surround a garment, so those photos keep the first result.)
  if (!hasAlpha && !fillsFrame && separation.bgClusters.length > 1) {
    const retry = separateBackground(35)
    const keptA = (() => {
      const f = new Uint8Array(n)
      for (let i = 0; i < n; i++) if (!separation.bg[i]) f[i] = 1
      return keepMajor(f, w, h, 0.05)
    })()
    const keptB = (() => {
      const f = new Uint8Array(n)
      for (let i = 0; i < n; i++) if (!retry.bg[i]) f[i] = 1
      return keepMajor(f, w, h, 0.05)
    })()
    let areaA = 0, areaB = 0
    for (let i = 0; i < n; i++) { areaA += keptA[i]; areaB += keptB[i] }
    if (areaA > 0 && areaB / n >= 0.2 && areaB >= 1.4 * areaA) {
      // pixels around the first garment: how many of them belong to the extra (previously "backdrop") dark region?
      const inv = new Uint8Array(n)
      for (let i = 0; i < n; i++) inv[i] = keptA[i] ? 0 : 1
      const outside = erode(inv, w, h, Math.max(2, Math.round(side * 0.012))) // grown garment = not(eroded not-garment)
      let ring = 0, ringInExtra = 0
      for (let i = 0; i < n; i++) {
        if (keptA[i] || outside[i]) continue
        ring++
      }
      // ring = pixels within r of the first garment; count those that the retry keeps as foreground but the first call dropped
      const grown = new Uint8Array(n)
      for (let i = 0; i < n; i++) grown[i] = !keptA[i] && !outside[i] ? 1 : 0
      for (let i = 0; i < n; i++) if (grown[i] && keptB[i] && separation.bg[i]) ringInExtra++
      if (ring > 0 && ringInExtra / ring >= 0.5) separation = retry
    }
  }
  const { bgLike, bg, borderBgFraction } = separation
  bgClusters = separation.bgClusters
  let backgroundSeparated = true

  let fg = new Uint8Array(n)
  let fgCount = 0
  for (let i = 0; i < n; i++) if (!bg[i]) { fg[i] = 1; fgCount++ }
  if (fgCount / n < 0.03) {
    return emptyResult(work, ['No T-shirt could be found in this photo (it looks like an empty backdrop).'], { backgroundSeparated: true, borderBgFraction, hasAlpha })
  }
  if (borderBgFraction < 0.15) {
    // the photo is garment (or scene) edge to edge: no background to peel off, rely on the fabric colour alone
    backgroundSeparated = false
    fg.fill(1)
    fgCount = n
    warnings.push('The background could not be separated from the garment; the result relies on fabric colour only.')
  } else {
    fg = keepMajor(fg, w, h, 0.05)
  }

  // ---- 2. fabric colour -----------------------------------------------------------------------------------------
  // The T-shirt is the biggest single colour in the foreground. (The middle of the shirt is NOT sampled on its own:
  // a large print there would be mistaken for the fabric.) Prints, hanger, hair etc. are minority clusters.
  const skin = new Uint8Array(n)
  let skinInFg = 0
  for (let i = 0; i < n; i++) if (fg[i] && isSkin(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])) { skin[i] = 1; skinInFg++ }

  const innerFg = erode(fg, w, h, Math.max(2, Math.round(side * 0.012)))
  // Outline ring of the foreground: sleeves, hem, collar edge. FABRIC is always on the outline; a print is (almost)
  // always inside it. So "which colour is the shirt" is decided by outline presence as well as by area.
  const deepFg = erode(innerFg, w, h, Math.max(3, Math.round(side * 0.03)))
  const collect = (excludeSkin) => {
    const pts = []
    const ring = []
    let count = 0
    for (let i = 0; i < n; i++) {
      if (!innerFg[i] || (excludeSkin && skin[i])) continue
      count++
      if (count % 3 === 0) { pts.push(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]); ring.push(deepFg[i] ? 0 : 1) }
    }
    return { pts: Float32Array.from(pts), ring: Uint8Array.from(ring), count }
  }
  // 1st pass over everything: is the biggest colour itself skin-toned (beige/tan/peach shirt)? Then skin tones must
  // NOT be excluded. Otherwise skin (face, arms, neck) is removed before the fabric colour is chosen.
  let sample = collect(false)
  if (sample.pts.length < 30) {
    return emptyResult(work, ['No usable fabric area found in the photo.'], { backgroundSeparated, borderBgFraction, hasAlpha })
  }
  let useSkinRule = false
  if (skinInFg > 0) {
    const first = kmeans(sample.pts, sample.pts.length / 3, 4)
    let bi = 0
    for (let c = 1; c < first.counts.length; c++) if (first.counts[c] > first.counts[bi]) bi = c
    const [r, g, b] = labToRgb(first.centers[bi])
    if (!isSkin(r, g, b)) {
      const noSkin = collect(true)
      if (noSkin.pts.length >= 30) { useSkinRule = true; sample = noSkin }
    }
  }
  const km = kmeans(sample.pts, sample.pts.length / 3, 4)
  const total = km.counts.reduce((a, b) => a + b, 0)
  // per-colour share of the area and of the outline ring
  const np = sample.pts.length / 3
  const ringCount = km.centers.map(() => 0)
  let ringTotal = 0
  for (let i = 0; i < np; i++) {
    if (!sample.ring[i]) continue
    let bi = 0, bd = Infinity
    for (let c = 0; c < km.centers.length; c++) {
      const d = (sample.pts[i * 3] - km.centers[c][0]) ** 2 + (sample.pts[i * 3 + 1] - km.centers[c][1]) ** 2 + (sample.pts[i * 3 + 2] - km.centers[c][2]) ** 2
      if (d < bd) { bd = d; bi = c }
    }
    ringCount[bi]++
    ringTotal++
  }
  let big = 0
  let bestScore = -1
  for (let c = 0; c < km.counts.length; c++) {
    const score = 0.4 * (km.counts[c] / total) + 0.6 * (ringTotal ? ringCount[c] / ringTotal : km.counts[c] / total)
    if (score > bestScore) { bestScore = score; big = c }
  }
  // Optional `fabricHint` (a '#rrggbb' the caller thinks the T-shirt is, e.g. the product's first colour swatch). It is
  // only a TIP, never an order: the hinted colour is used only if it really is on the garment's outline. A swatch that
  // is not the shirt's colour in this photo (a "red" swatch on a black tee with a red print) therefore changes nothing.
  // On views where something else is the biggest colour (jeans on a model) the hint still picks the right colour.
  let ref = km.centers[big]
  let refRms = km.rms[big]
  let dominance = km.counts[big] / total
  const hintLab = options.fabricHint ? hexToLabLocal(options.fabricHint) : null
  if (hintLab) {
    const pts = sample.pts
    const near = []
    let nearRing = 0
    for (let i = 0; i < np; i++) {
      const d = Math.hypot(0.35 * (pts[i * 3] - hintLab[0]), pts[i * 3 + 1] - hintLab[1], pts[i * 3 + 2] - hintLab[2])
      if (d <= HINT_MAX_DISTANCE) { near.push(i); if (sample.ring[i]) nearRing++ }
    }
    // A swatch is only a tip. The photo may show a DIFFERENT colour of the same shirt (swatch #1 is "white" but this photo
    // is a black tee), and then the swatch can resemble a big colour in the PRINT (a blue cape draped over the shoulders
    // touches the outline too). Fabric forms the outline far more than any print does, so the hinted colour must hold
    // at least a comparable share of the outline — and be as dense on it — as the colour chosen without the hint;
    // otherwise the tip is ignored. (Without this the print was recoloured and the fabric stayed untouched.)
    const bigRingShare = ringTotal ? ringCount[big] / ringTotal : 0
    const bigRingDensity = km.counts[big] ? ringCount[big] / km.counts[big] : 0
    const hintRingShare = ringTotal ? nearRing / ringTotal : 0
    const hintRingDensity = near.length ? nearRing / near.length : 0
    const hintBeatsOutlineEvidence = hintRingShare >= 0.75 * bigRingShare || hintRingDensity >= 0.5 * bigRingDensity
    const onOutline = ringTotal > 0 && hintRingShare >= 0.12 && hintRingDensity >= 0.06 && hintBeatsOutlineEvidence
    if (onOutline && near.length >= Math.max(30, 0.04 * np)) {
      const med = (c) => {
        const v = near.map((i) => pts[i * 3 + c]).sort((x, y) => x - y)
        return v[v.length >> 1]
      }
      const hRef = [med(0), med(1), med(2)]
      let sq = 0
      for (const i of near) sq += (pts[i * 3] - hRef[0]) ** 2 + (pts[i * 3 + 1] - hRef[1]) ** 2 + (pts[i * 3 + 2] - hRef[2]) ** 2
      ref = hRef
      refRms = Math.sqrt(sq / near.length)
      dominance = near.length / np
    }
  }
  const chromaRef = Math.hypot(ref[1], ref[2])
  const Ct = Math.min(34, (13 + 0.3 * chromaRef + 1.2 * refRms) * sens.k)
  const Lt = Math.min(48, (30 + 1.5 * refRms) * sens.k)

  // Pixels that are only a darker/lighter version of the backdrop (contact shadow, soft vignette) are never fabric,
  // unless the shirt itself is that colour (white tee on light grey) — then colour can't tell them apart.
  const shadowish = new Uint8Array(n)
  const nearBackdrop = (L, A, B) => {
    for (const cl of bgClusters) if (Math.hypot(L - cl.c[0], A - cl.c[1], B - cl.c[2]) <= cl.r * 1.7) return true
    return false
  }
  if (!nearBackdrop(ref[0], ref[1], ref[2])) {
    for (let i = 0; i < n; i++) if (fg[i] && nearBackdrop(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2])) shadowish[i] = 1
  }

  // ---- 3. fabric pixels -----------------------------------------------------------------------------------------
  const fabric = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (!fg[i] || shadowish[i] || (useSkinRule && skin[i])) continue
    if (Math.abs(lab[i * 3] - ref[0]) <= Lt && Math.hypot(lab[i * 3 + 1] - ref[1], lab[i * 3 + 2] - ref[2]) <= Ct) fabric[i] = 1
  }

  // ---- 4. clean-up ----------------------------------------------------------------------------------------------
  const ro = Math.max(2, Math.round(side * 0.012))
  // opening removes thin hangers/strings; re-growing the opened shape by `ro` inside the fabric restores sleeve tips
  // and corners that the opening rounded, but not a hanger (it is gone from the opened shape, only a stub remains)
  const opened = keepMajor(open(fabric, w, h, ro), w, h, 0.1)
  const regrown = dilate(opened, w, h, ro)
  let m = new Uint8Array(n)
  for (let i = 0; i < n; i++) m[i] = regrown[i] && fabric[i] ? 1 : 0
  // prints/graphics that are mostly surrounded by fabric are part of the garment, even when skin-coloured (a face
  // print) or running off the hem. Pieces that mainly border the background (hanger stub, arm, neck, shadow) are not.
  const rest = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    rest[i] = fg[i] && !m[i] && !shadowish[i] ? 1 : 0
  }
  const cc = components(rest, w, h)
  const touchFabric = new Float64Array(cc.sizes.length)
  const touchOther = new Float64Array(cc.sizes.length)
  const tally = (p, q) => { // p is a `rest` pixel, q its neighbour
    const l = cc.labels[p]
    if (m[q]) touchFabric[l]++
    else if (!rest[q]) touchOther[l]++ // background (or beyond the foreground)
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x
    if (!cc.labels[p]) continue
    if (x > 0) tally(p, p - 1); else touchOther[cc.labels[p]]++
    if (x < w - 1) tally(p, p + 1); else touchOther[cc.labels[p]]++
    if (y > 0) tally(p, p - w); else touchOther[cc.labels[p]]++
    if (y < h - 1) tally(p, p + w); else touchOther[cc.labels[p]]++
  }
  const maskArea = m.reduce((a, v) => a + v, 0)
  const attach = new Uint8Array(cc.sizes.length)
  for (let l = 1; l < cc.sizes.length; l++) {
    const share = touchFabric[l] / Math.max(1, touchFabric[l] + touchOther[l])
    if (share >= ENCLOSED_SHARE && cc.sizes[l] <= maskArea * 0.6) attach[l] = 1
  }
  let holesFilled = 0
  for (let i = 0; i < n; i++) if (rest[i] && attach[cc.labels[i]]) { m[i] = 1; holesFilled++ }
  // smooth the outline
  const soft = boxBlur(Float32Array.from(m), w, h, Math.max(1, Math.round(side * 0.004)))
  for (let i = 0; i < n; i++) m[i] = soft[i] >= 0.5 ? 1 : 0
  m = keepMajor(m, w, h, 0.1)

  let area = 0
  let mx0 = w, my0 = h, mx1 = -1, my1 = -1
  let edgeContact = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue
    area++
    if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edgeContact++
  }
  const coverage = area / n
  if (coverage < 0.02) {
    return emptyResult(work, ['No T-shirt could be found in this photo.'], { backgroundSeparated, borderBgFraction, hasAlpha })
  }

  // ---- confidence -----------------------------------------------------------------------------------------------
  let score = 1
  if (!backgroundSeparated) score -= 0.5
  else if (borderBgFraction < 0.6) { score -= 0.25; warnings.push('The background is busy or uneven, so the outline may be rough.') }
  if (coverage < 0.06) { score -= 0.3; warnings.push('The detected area is very small.') }
  if (coverage > 0.8) { score -= 0.3; warnings.push('The detected area covers almost the whole photo — it may include background.') }
  if (dominance < 0.45) { score -= 0.2; warnings.push('The fabric has several strong colours; check that all of the shirt is covered.') }
  const perimeter = 2 * (w + h)
  if (edgeContact / perimeter > 0.15) { score -= 0.1; warnings.push('The garment touches the photo edge (it may be cropped).') }
  const level = score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low'

  return {
    ok: true,
    status: 'ok',
    mask: Uint8Array.from(m, (v) => (v ? 255 : 0)),
    width: w,
    height: h,
    scale: work.scale,
    stats: {
      coverage,
      bbox: { x: mx0 / w, y: my0 / h, w: (mx1 - mx0 + 1) / w, h: (my1 - my0 + 1) / h }, // fractions of the photo
      fabricColor: labToHex(ref),
      confidence: Math.max(0, Math.min(1, score)),
      level,
      warnings,
      backgroundSeparated,
      hasAlpha,
      borderBgFraction,
      skinExcluded: useSkinRule,
      holesFilledPx: holesFilled,
      tolerance: { chroma: Ct, lightness: Lt },
    },
  }
}

/** How close (weighted Lab distance) a colour cluster must be to `fabricHint` to be taken as the T-shirt. */
const HINT_MAX_DISTANCE = 28

function hexToLabLocal(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const lab = toLab(new Uint8ClampedArray([(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]), 1)
  return [lab[0], lab[1], lab[2]]
}

function emptyResult(work, warnings, extra) {
  return {
    ok: false,
    status: 'no_garment',
    mask: new Uint8Array(work.width * work.height),
    width: work.width,
    height: work.height,
    scale: work.scale,
    stats: { coverage: 0, bbox: null, fabricColor: null, confidence: 0, level: 'low', warnings, ...extra },
  }
}

function labToRgb([L, a, b]) {
  const fy = (L + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))
  const X = XN * inv(fx), Y = inv(fy), Z = ZN * inv(fz)
  const lin = [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, -0.969266 * X + 1.8760108 * Y + 0.041556 * Z, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z]
  const enc = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)))
  return lin.map(enc)
}
const labToHex = (lab) => '#' + labToRgb(lab).map((c) => c.toString(16).padStart(2, '0')).join('')

// ---------------------------------------------------------------- full-size mask

/**
 * Bilinear-resamples the working-resolution mask to rows [y0, y1) of the photo's exact W×H and writes opaque
 * grayscale RGBA (white = garment) into `out` (length >= (y1-y0)*W*4). A contrast curve keeps the edge crisp
 * (about one pixel of anti-aliasing) instead of a blurry ramp. Band-wise so a huge photo never needs a second copy.
 */
export function upsampleMaskRows(mask, mw, mh, W, H, y0, y1, out) {
  const sx = mw / W
  const sy = mh / H
  for (let y = y0; y < y1; y++) {
    const fy = Math.min(mh - 1, Math.max(0, (y + 0.5) * sy - 0.5))
    const iy = Math.floor(fy), ty = fy - iy, iy2 = Math.min(mh - 1, iy + 1)
    for (let x = 0; x < W; x++) {
      const fx = Math.min(mw - 1, Math.max(0, (x + 0.5) * sx - 0.5))
      const ix = Math.floor(fx), tx = fx - ix, ix2 = Math.min(mw - 1, ix + 1)
      const v =
        (mask[iy * mw + ix] * (1 - tx) + mask[iy * mw + ix2] * tx) * (1 - ty) +
        (mask[iy2 * mw + ix] * (1 - tx) + mask[iy2 * mw + ix2] * tx) * ty
      // steepen around 0.5 over roughly one output pixel's worth of the ramp
      const gain = Math.max(1, 1 / Math.max(sx, sy))
      const g = Math.min(255, Math.max(0, (v - 127.5) * gain + 127.5))
      const o = ((y - y0) * W + x) * 4
      out[o] = out[o + 1] = out[o + 2] = g
      out[o + 3] = 255
    }
  }
}

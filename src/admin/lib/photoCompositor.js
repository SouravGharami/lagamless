/**
 * Photographic mockup compositor.
 *
 * This is the piece that makes a print look printed rather than pasted:
 * every placement is perspective-warped onto its destination quad (two
 * texture-mapped triangles — a standard corner-pin technique that plain
 * canvas 2D can do without WebGL), then multiplied against a light map
 * pulled straight from the real garment photo, so the fabric's own
 * wrinkles, shadows and highlights show back through the ink exactly like
 * a real DTF transfer would.
 *
 * Nothing here is AI image generation and nothing here redraws the
 * garment — the base photo's pixels are untouched except for the solid
 * "recolor" path (see recolorGarment), which is a hue/lightness remap of
 * a real photo, not a generated one. Special finishes (acid wash,
 * tie-dye, marble…) always come from their own real uploaded photo
 * instead of being recolored, because no color remap of a solid-color
 * photo can fake those.
 */

const lightMapCache = new WeakMap()

/** Loads an <img> from a src (data URL or object URL), decoded and ready to draw. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image.'))
    img.src = src
  })
}

function makeCanvas(width, height) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(width))
  c.height = Math.max(1, Math.round(height))
  return c
}

/**
 * Builds (and caches, per source image) a "light map" of the garment
 * photo: a near-white canvas that only encodes the fabric's own RELATIVE
 * shading (its wrinkles, folds, shadows and highlights, measured against
 * that garment photo's own average brightness), never the garment's
 * absolute base color. This is what every print gets multiplied against,
 * so the same crease that darkens the real fabric darkens the print
 * sitting on top of it — without the garment's own color/darkness ever
 * being able to multiply the print itself toward black.
 *
 * ROOT CAUSE NOTE (previously): this used to remap the garment's own
 * absolute grayscale value around a fixed midpoint (`(gray - 190) *
 * 1.35 + 190`). For a light garment that's a mild, correct contrast
 * boost — but for a black/dark garment, `gray` itself is already low
 * (near 0), so the old formula drove the ENTIRE light map to near-0
 * ("black") almost everywhere. Multiplying colorful DTF artwork against
 * an almost-entirely-black light map is exactly what turned it into a
 * near-black silhouette: it wasn't a filter, a grayscale conversion, or
 * an inverted mask on the artwork itself, it was the shading map being
 * (unintentionally) black. Normalizing around each garment photo's own
 * mean brightness — instead of a fixed absolute midpoint — fixes this at
 * the source: a black tee's light map now sits near-white (like any
 * other garment's), with only its real relative wrinkles/highlights
 * showing through, so the print keeps its original colors on any
 * garment color while still reading as fabric-shaded, not flat-pasted.
 * Cached because a studio session re-composites on every drag frame.
 */
export function getLightMap(garmentImage) {
  const cached = lightMapCache.get(garmentImage)
  if (cached) return cached

  const { naturalWidth: width, naturalHeight: height } = garmentImage
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(garmentImage, 0, 0, width, height)

  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData

  // Pass 1: grayscale luminance per pixel, plus this garment photo's own
  // mean brightness — the reference point shading is measured against,
  // instead of a fixed absolute midpoint that assumes a light garment.
  const pixelCount = data.length / 4
  const gray = new Float32Array(pixelCount)
  let sum = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    gray[p] = g
    sum += g
  }
  const mean = sum / pixelCount

  // Pass 2: re-center onto a near-white BASELINE ("no shading" for
  // multiply) and apply only the garment's RELATIVE deviation from its
  // own mean, scaled by CONTRAST. MIN floors how dark even a deep crease
  // can push a print, so shading always reads as texture, never as a
  // near-black wash — on a white tee or a black one alike.
  const BASELINE = 235
  const CONTRAST = 0.9
  const MIN = 120
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const adjusted = Math.min(255, Math.max(MIN, BASELINE + (gray[p] - mean) * CONTRAST))
    data[i] = data[i + 1] = data[i + 2] = adjusted
  }
  ctx.putImageData(imageData, 0, 0)

  lightMapCache.set(garmentImage, canvas)
  return canvas
}

/**
 * The four rotated-rect corners for a placement, each nudged by its own
 * independent `corners[i]` offset — the "perspective adjustment" control.
 * With no offsets this is a plain rotated rectangle (ordinary
 * move/resize/rotate); dragging a single corner handle skews just that
 * corner, which is what lets a print visibly follow a sleeve curve or a
 * worn garment's fold instead of sitting as a flat rectangle.
 *
 * Order: top-left, top-right, bottom-right, bottom-left.
 */
export function computeQuad(placement) {
  const { x, y, width, height, rotation = 0 } = placement
  const rad = (rotation * Math.PI) / 180
  const hw = width / 2
  const hh = height / 2
  const local = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  const corners = placement.corners || [
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
    { dx: 0, dy: 0 },
  ]
  return local.map(([lx, ly], i) => {
    const rx = lx * Math.cos(rad) - ly * Math.sin(rad)
    const ry = lx * Math.sin(rad) + ly * Math.cos(rad)
    const c = corners[i] || { dx: 0, dy: 0 }
    return { x: x + rx + (c.dx || 0), y: y + ry + (c.dy || 0) }
  })
}

/** Affine-maps one source triangle onto one destination triangle and draws `image` clipped to it. */
function drawTriangle(ctx, image, srcPts, dstPts) {
  const [s0, s1, s2] = srcPts
  const [d0, d1, d2] = dstPts
  const denom = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y)
  if (Math.abs(denom) < 1e-6) return

  const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denom
  const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denom
  const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denom
  const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denom
  const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denom
  const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denom

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(d0.x, d0.y)
  ctx.lineTo(d1.x, d1.y)
  ctx.lineTo(d2.x, d2.y)
  ctx.closePath()
  ctx.clip()
  ctx.transform(a, b, c, d, e, f)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0)
  ctx.restore()
}

/**
 * Texture-maps the whole `image` onto destination `quad` (4 points,
 * clockwise from top-left) by splitting it into two triangles. This is
 * the "perspective transform / mesh warp" step: a genuinely projective
 * corner-pin, not a simple CSS skew, so a print can be pinned to all four
 * corners independently (e.g. following a sleeve's taper).
 */
export function drawTexturedQuad(ctx, image, quad) {
  const w = image.naturalWidth || image.width
  const h = image.naturalHeight || image.height
  const srcTL = { x: 0, y: 0 }
  const srcTR = { x: w, y: 0 }
  const srcBR = { x: w, y: h }
  const srcBL = { x: 0, y: h }
  const [dTL, dTR, dBR, dBL] = quad
  drawTriangle(ctx, image, [srcTL, srcTR, srcBL], [dTL, dTR, dBL])
  drawTriangle(ctx, image, [srcTR, srcBR, srcBL], [dTR, dBR, dBL])
}

/**
 * Renders one placement's artwork, warped and shaded, onto its own
 * transparent layer the size of the garment canvas. Kept separate from
 * `renderMockup` so the interactive canvas can draw a print's own layer
 * every drag frame without re-touching the ones that aren't moving.
 */
function renderPlacementLayer({ width, height, artworkImage, placement, lightMap }) {
  const quad = computeQuad(placement)

  const artLayer = makeCanvas(width, height)
  const actx = artLayer.getContext('2d')
  drawTexturedQuad(actx, artworkImage, quad)

  // Multiply against the fabric's own light map, then clip the result
  // back down to the artwork's exact alpha shape (multiply's own alpha
  // compositing would otherwise bleed opaque gray across the whole
  // layer — see photoCompositor's design note in the module docstring).
  const shaded = makeCanvas(width, height)
  const sctx = shaded.getContext('2d')
  sctx.drawImage(artLayer, 0, 0)
  sctx.globalCompositeOperation = 'multiply'
  sctx.drawImage(lightMap, 0, 0, width, height)
  sctx.globalCompositeOperation = 'destination-in'
  sctx.drawImage(artLayer, 0, 0)
  sctx.globalCompositeOperation = 'source-over'

  return { canvas: shaded, opacity: placement.opacity ?? 1 }
}

/**
 * Draws the full mockup — real garment photo + every placement, warped
 * and fabric-shaded — onto `ctx`. `ctx`'s canvas should already be sized
 * to the garment photo's natural dimensions (or a multiple of them for a
 * higher-res export; pass `scale` to match).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {HTMLImageElement} opts.garmentImage - the real, untouched garment photo
 * @param {Array} opts.placements - placements for this angle only, already in the photo's pixel space
 * @param {Record<string, HTMLImageElement>} opts.artworkImages - keyed by placement.artworkId
 * @param {number} [opts.scale] - draw at N× the photo's natural size (export only)
 */
export function renderMockup(ctx, { garmentImage, placements, artworkImages, scale = 1 }) {
  const width = (garmentImage.naturalWidth || garmentImage.width) * scale
  const height = (garmentImage.naturalHeight || garmentImage.height) * scale

  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(garmentImage, 0, 0, width, height)

  const baseWidth = garmentImage.naturalWidth || garmentImage.width
  const baseHeight = garmentImage.naturalHeight || garmentImage.height
  const lightMap = getLightMap(garmentImage)

  for (const placement of placements) {
    const artwork = artworkImages[placement.artworkId]
    if (!artwork) continue
    const scaledPlacement = scale === 1 ? placement : scalePlacement(placement, scale)
    const layer = renderPlacementLayer({
      width,
      height,
      artworkImage: artwork,
      placement: scaledPlacement,
      lightMap: scale === 1 ? lightMap : lightMap, // light map re-sampled by drawImage's own scale below
    })
    ctx.globalAlpha = layer.opacity
    // A hair of blur softens the triangle seam and reads as ink sitting
    // slightly into the weave rather than a razor-edge sticker.
    ctx.filter = 'blur(0.4px)'
    ctx.drawImage(layer.canvas, 0, 0)
    ctx.filter = 'none'
    ctx.globalAlpha = 1
  }

  return { width: baseWidth, height: baseHeight }
}

function scalePlacement(placement, scale) {
  return {
    ...placement,
    x: placement.x * scale,
    y: placement.y * scale,
    width: placement.width * scale,
    height: placement.height * scale,
    corners: (placement.corners || []).map((c) => ({ dx: (c?.dx || 0) * scale, dy: (c?.dy || 0) * scale })),
  }
}

/**
 * Recolors a *solid* garment photo toward a target hex by remapping
 * lightness while preserving the photo's own luminance (so folds/shadows
 * survive) — shifting hue+saturation only. Only valid for the 'solid'
 * fabric; every other finish must come from its own real photo (see
 * templatePhotoStore) because no per-pixel remap of one photo can
 * fabricate an acid-wash or tie-dye pattern that isn't there.
 */
export function recolorGarment(garmentImage, hex) {
  const width = garmentImage.naturalWidth || garmentImage.width
  const height = garmentImage.naturalHeight || garmentImage.height
  const canvas = makeCanvas(width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(garmentImage, 0, 0, width, height)

  const { h, s } = hexToHsl(hex)
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const l = rgbToL(data[i], data[i + 1], data[i + 2])
    const [r, g, b] = hslToRgb(h, s, l)
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

function rgbToL(r, g, b) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  return (max + min) / 2
}

function hexToHsl(hex) {
  const clean = (hex || '#7a7a7a').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16) || 0x7a7a7a
  const r = ((num >> 16) & 255) / 255
  const g = ((num >> 8) & 255) / 255
  const b = (num & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, l }
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (h < 60) [r1, g1, b1] = [c, x, 0]
  else if (h < 120) [r1, g1, b1] = [x, c, 0]
  else if (h < 180) [r1, g1, b1] = [0, c, x]
  else if (h < 240) [r1, g1, b1] = [0, x, c]
  else if (h < 300) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)]
}

/**
 * Background removal + studio backdrop compositing.
 *
 * Split into two independent, cacheable steps so the (relatively slow,
 * a few seconds on first run) ML background-removal pass only ever runs
 * ONCE per uploaded template photo, no matter how many times the admin
 * changes their mind about the backdrop afterwards:
 *
 *   1. removeBackground(dataUrl) — a transparent-background PNG "cutout"
 *      of the real garment/model photo, produced entirely in the
 *      browser by @imgly/background-removal (an ONNX image-matting
 *      model run over WASM/WebGPU — no server round-trip, no per-image
 *      cost, and the photo never leaves the admin's machine). This is a
 *      real matting model with a soft alpha edge, not a bounding-box
 *      crop, so hair, sleeve edges and fine fabric detail survive —
 *      "good, not pixel-perfect" edge quality, as expected from a free
 *      in-browser model.
 *   2. compositeOnBackdrop(cutoutImage, backdropId) — lays that cutout
 *      over a clean studio backdrop (white/light-grey/dark/black/
 *      concrete) with a synthesized soft contact shadow plus a fainter
 *      ambient shadow, so the subject reads as standing IN the scene
 *      rather than a flat sticker pasted on top of a gradient.
 *
 * The output of step 2 is what ultimately gets stored as the template
 * photo's own `dataUrl` (see templatePhotoStore.js) — everything
 * downstream (MockupCanvas, mockupExport.js, the DTF placement/warp/
 * fabric-shading pipeline in photoCompositor.js) stays completely
 * unaware this ever happened; it just sees "the garment photo", exactly
 * like before this feature existed. Print placement, resize, rotate,
 * perspective and fabric light-map shading all keep working unmodified.
 */

// Loaded lazily (not as a static import) so the ~400KB(gzipped) JS runtime
// for this ML model — plus, on first actual use, its much larger WASM/ONNX
// model weights — is only ever fetched when an admin actually opens the
// background-removal step, instead of bloating every page load of the app
// (this project currently ships one single JS bundle with no route-level
// code-splitting, so a static top-level import here would have shipped
// this to every visitor, not just the mockup studio).
let backgroundRemovalModulePromise = null
function loadBackgroundRemovalModule() {
  if (!backgroundRemovalModulePromise) {
    backgroundRemovalModulePromise = import('@imgly/background-removal')
  }
  return backgroundRemovalModulePromise
}

// ---- studio backdrops --------------------------------------------------

/**
 * Clean, code-only studio backdrops — no AI image generation involved.
 *
 * Order matters: `STUDIO_BACKDROPS[0]` is the DEFAULT backdrop offered to
 * a brand-new upload (see MockupStudio's `initialBackdropId =
 * STUDIO_BACKDROPS[0].id`) and ImageSlotManager's own DEFAULT_BACKDROP_ID.
 * "Reference Light Grey" is first on purpose — it's the exact soft
 * light-grey-with-gradient studio look the reference product photo
 * (hanging tee, light-grey seamless, soft shadow) is built around, so a
 * brand-new mockup matches that reference out of the box without the
 * admin having to hunt for it in the list.
 *
 * The first 8 below are the named presets required by the studio brief;
 * the rest are additional, always-available options beyond that minimum.
 */
export const STUDIO_BACKDROPS = [
  { id: 'light-grey', label: 'Reference Light Grey', top: '#e9e9e6', bottom: '#cfcfc9' },
  { id: 'white', label: 'Clean White', top: '#ffffff', bottom: '#f0f0ee' },
  { id: 'warm-beige', label: 'Warm Beige', top: '#f2e9dd', bottom: '#ddccb4' },
  { id: 'cool-grey', label: 'Cool Grey', top: '#dde1e3', bottom: '#b7bec2' },
  { id: 'dark', label: 'Dark Charcoal', top: '#3c3c3e', bottom: '#1b1b1d' },
  { id: 'blue-gray', label: 'Soft Blue Grey', top: '#e3e8ec', bottom: '#aab6c0' },
  { id: 'minimal-shadow', label: 'Minimal Cream', top: '#f7f4ec', bottom: '#e6ddc7' },
  { id: 'concrete', label: 'Concrete Editorial', top: '#a9a59d', bottom: '#8a8680' },
  // Beyond the 8 required presets above — extra options, not part of the
  // named minimum set.
  { id: 'sand', label: 'Soft Light Studio', top: '#e9dcc6', bottom: '#c8b28c' },
  { id: 'sage', label: 'Soft Sage', top: '#e6ebe1', bottom: '#b7c4ac' },
  { id: 'blush', label: 'Blush', top: '#f3e2df', bottom: '#dcb6ae' },
  { id: 'charcoal', label: 'Charcoal', top: '#4a4a4d', bottom: '#242426' },
  // Unlike the fixed two-tone studio-paper looks above, this one's
  // top/bottom colors are admin-adjustable — see MockupStudio's gradient
  // color pickers, only shown when this backdrop is selected. The colors
  // below are just its starting point.
  { id: 'gradient', label: 'Custom gradient', top: '#e7c9a9', bottom: '#7c6a8f' },
]

function getBackdrop(id) {
  return STUDIO_BACKDROPS.find((b) => b.id === id) || STUDIO_BACKDROPS[0]
}

// ---- background removal (ML) -------------------------------------------

/**
 * Runs the in-browser segmentation model once and returns a transparent
 * PNG data URL of just the subject (garment or model), edges intact.
 * Slow-ish the first time per browser session (fetches + warms up the
 * ONNX model — a few seconds depending on bandwidth/device); fast on
 * every call after, since the model stays cached.
 *
 * Wrapped in a hard timeout: a blocked/very slow model download (a
 * restrictive network, a proxy that silently drops the request, etc.)
 * used to leave the admin staring at a progress bar stuck at 0%
 * forever, with no error to react to and no way out short of reloading
 * the whole page. Past MODEL_TIMEOUT_MS this now rejects instead, which
 * MockupStudio's bgFailure panel turns into a real Retry / Use original
 * background choice.
 *
 * @param {string} dataUrl - the admin's original uploaded photo
 * @param {(ratio: number) => void} [onProgress] - 0..1, for a loading bar
 * @returns {Promise<string>} transparent-background PNG data URL
 */
const MODEL_TIMEOUT_MS = 45_000

export async function removeBackground(dataUrl, onProgress) {
  const { removeBackground: removeBackgroundImpl } = await loadBackgroundRemovalModule()
  const removalPromise = removeBackgroundImpl(dataUrl, {
    model: 'isnet_fp16',
    output: { format: 'image/png', quality: 1, type: 'foreground' },
    progress: onProgress
      ? (_key, current, total) => onProgress(total ? Math.min(1, current / total) : 0)
      : undefined,
  })
  let timeoutHandle
  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error('Background removal timed out — this is usually a slow or blocked network fetch of the AI model')),
      MODEL_TIMEOUT_MS,
    )
  })
  let blob
  try {
    blob = await Promise.race([removalPromise, timeoutPromise])
  } finally {
    // Whichever one lost the race, stop it from rejecting into the void
    // later (an unhandled-rejection console warning for the timeout if
    // removal won, or just a dangling timer if the timeout won).
    clearTimeout(timeoutHandle)
  }
  const rawCutoutDataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Could not read the background-removal result.'))
    reader.readAsDataURL(blob)
  })
  // Clean up the raw matting output — see decontaminateCutout below. This is
  // a best-effort pass; if it fails for any reason, the raw (unprocessed)
  // cutout is still perfectly usable, so a failure here should never turn
  // into a "background removal failed" error for the admin.
  try {
    return await decontaminateCutout(rawCutoutDataUrl)
  } catch {
    return rawCutoutDataUrl
  }
}

/**
 * Cleans up the raw output of the segmentation model before it's ever shown
 * or saved. The free in-browser matting model is good but not perfect, and
 * two specific artifacts kept showing up in admin uploads:
 *
 *  1. "It removed the color of the t-shirt" / a faint dark rim around the
 *     subject: the model's soft, semi-transparent edge pixels keep their
 *     RGB color exactly as the ORIGINAL photo (a technique called
 *     "uncontaminated" or "spill" color) — meaning a pixel that's 30%
 *     opaque at the garment's edge still carries a blend of garment color
 *     AND whatever the original backdrop behind it happened to be. Paste
 *     that onto a NEW backdrop and the old backdrop's color shows through
 *     as a thin, wrong-colored fringe — often reading as a grey/black halo
 *     if the original photo had any shadow near the edge.
 *  2. "It added a black bottom sometimes": a hanging garment's photo often
 *     has a soft contact shadow on the surface right below the hem. The
 *     matting model sometimes keeps a faint, low-confidence sliver of that
 *     shadow as very-low-alpha "foreground" instead of cutting it fully —
 *     invisible against the ORIGINAL backdrop, but a visible dark smudge
 *     once composited onto a lighter one.
 *
 * Fix, in order: (a) hard-zero any near-invisible alpha noise so shadow
 * slivers can't survive as ghost pixels; (b) "decontaminate" every
 * remaining semi-transparent edge pixel by pulling its color from the
 * nearest fully-opaque garment pixels instead of trusting the model's own
 * (potentially backdrop-tinted) color there; (c) slightly contract the
 * alpha feather so a soft-but-tinted edge can't still read as a halo once
 * composited. None of this touches confidently-opaque interior pixels —
 * the garment's real color, texture and wrinkles are untouched.
 */
async function decontaminateCutout(dataUrl) {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = () => reject(new Error('Could not decode background-removal result.'))
    img.src = dataUrl
  })
  const width = img.naturalWidth
  const height = img.naturalHeight
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const { data } = imageData
  const pixelCount = width * height

  // (a) Hard-zero near-invisible alpha — removes ghost shadow slivers
  // ("black bottom") that were technically non-zero but never meant to be
  // visible foreground.
  const HARD_ZERO_ALPHA = 14
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] <= HARD_ZERO_ALPHA) data[i] = 0
  }

  // (b) Decontaminate remaining semi-transparent edge pixels: seed a
  // "clean color" buffer from fully-opaque pixels, then grow it outward a
  // few pixels (a cheap dilation) so edge pixels learn what color they
  // SHOULD be from their confident neighbors, instead of keeping whatever
  // backdrop-tinted color the model gave them.
  const OPAQUE_ALPHA = 235
  let cleanR = new Float32Array(pixelCount)
  let cleanG = new Float32Array(pixelCount)
  let cleanB = new Float32Array(pixelCount)
  let known = new Uint8Array(pixelCount)
  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] >= OPAQUE_ALPHA) {
      cleanR[p] = data[i]
      cleanG[p] = data[i + 1]
      cleanB[p] = data[i + 2]
      known[p] = 1
    }
  }
  const DILATE_ITERATIONS = 5
  for (let iter = 0; iter < DILATE_ITERATIONS; iter++) {
    const nr = cleanR.slice()
    const ng = cleanG.slice()
    const nb = cleanB.slice()
    const nk = known.slice()
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (known[p]) continue
        let sr = 0
        let sg = 0
        let sb = 0
        let count = 0
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
          const np = ny * width + nx
          if (known[np]) {
            sr += cleanR[np]
            sg += cleanG[np]
            sb += cleanB[np]
            count++
          }
        }
        if (count > 0) {
          nr[p] = sr / count
          ng[p] = sg / count
          nb[p] = sb / count
          nk[p] = 1
        }
      }
    }
    cleanR = nr
    cleanG = ng
    cleanB = nb
    known = nk
  }
  for (let p = 0, i = 0; i < data.length; i += 4, p++) {
    const a = data[i + 3]
    if (a === 0 || a >= OPAQUE_ALPHA || !known[p]) continue
    // Blend toward the decontaminated color, most strongly right at the
    // faint edge where the original spill is worst.
    const mix = Math.min(1, (1 - a / 255) * 1.4)
    data[i] = data[i] * (1 - mix) + cleanR[p] * mix
    data[i + 1] = data[i + 1] * (1 - mix) + cleanG[p] * mix
    data[i + 2] = data[i + 2] * (1 - mix) + cleanB[p] * mix
  }

  // (c) Contract the alpha feather slightly so a soft edge can't still read
  // as a grey/black halo once composited onto a much lighter backdrop.
  for (let i = 3; i < data.length; i += 4) {
    const a = data[i] / 255
    data[i] = Math.round(Math.pow(a, 1.35) * 255)
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

/** Optional: warms the model cache ahead of the admin's first upload. */
export async function preloadBackgroundRemovalModel() {
  try {
    const { preload } = await loadBackgroundRemovalModule()
    await preload({ model: 'isnet_fp16' })
  } catch {
    // Preloading is a nice-to-have, never a hard requirement — the first
    // real removeBackground() call will just fetch it lazily instead.
  }
}

// ---- shadow + backdrop compositing --------------------------------------

/**
 * Finds the tight bounding box of non-transparent pixels in a cutout, so
 * the studio shadow can be anchored to where the subject actually
 * stands rather than to the full canvas (which is mostly transparent
 * margin after background removal).
 */
function findOpaqueBounds(ctx, width, height) {
  const { data } = ctx.getImageData(0, 0, width, height)
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  const ALPHA_THRESHOLD = 16
  // A sampling stride keeps this fast even on a full-resolution photo —
  // a shadow anchor doesn't need per-pixel precision.
  const stride = Math.max(1, Math.round(Math.max(width, height) / 400))
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const alpha = data[(y * width + x) * 4 + 3]
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width, height }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Draws the subject (the cutout) onto an already-painted backdrop with a
 * synthesized ground shadow, honoring an optional position/scale
 * transform so the composition editor (subject scale + X/Y position) has
 * something real to drive.
 *
 * ROOT CAUSE NOTE ("mockups look bad — the shirt is edge-to-edge, sleeves
 * cut off"): this used to fit the RAW UPLOADED PHOTO's full pixel width to
 * the canvas width (`dw = width * scale`), then center that. Real product
 * photography always keeps a generous, CONSISTENT margin around the
 * garment — but that old formula just reproduced whatever framing the
 * admin's camera happened to use. A tightly-cropped upload (sleeves
 * already near the frame edge) came out looking amateurish: garment
 * filling the entire canvas, nothing to breathe, sometimes visibly
 * clipped. Fixed by sizing and centering the GARMENT'S OWN opaque pixels
 * (nativeBounds, already computed below for the shadow) to a fixed,
 * comfortable fraction of the canvas instead of the raw photo's edges —
 * the same consistent "product on a clean backdrop with generous
 * whitespace" framing every polished apparel listing uses, regardless of
 * how the original photo was framed. `scale` is now a fine-tune multiplier
 * on top of that curated default (1 = the default framing), not a raw
 * fit-to-width factor.
 *
 * All coordinates are canvas pixels; `transform` offsets are fractions of
 * the canvas (-0.5..0.5 is a sane practical range, but nothing clamps it)
 * so the same numbers work at any photo resolution.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLImageElement} cutoutImage
 * @param {number} width - canvas width
 * @param {number} height - canvas height
 * @param {{scale?: number, offsetX?: number, offsetY?: number}} [transform]
 */
// How much of the canvas the garment's own visible pixels should occupy by
// default — tuned to read as "generously framed product shot", not
// "zoomed to fill the frame" or "lost in empty space".
const AUTO_FIT_WIDTH_FRACTION = 0.72
const AUTO_FIT_HEIGHT_FRACTION = 0.8

function drawSubjectWithShadow(ctx, cutoutImage, width, height, transform = {}, hanger = DEFAULT_HANGER) {
  const { scale = 1, offsetX = 0, offsetY = 0 } = transform
  const naturalW = cutoutImage.naturalWidth || cutoutImage.width
  const naturalH = cutoutImage.naturalHeight || cutoutImage.height

  // Locate the subject's opaque bounds at NATIVE resolution once (cheap,
  // independent of scale/position) — used both to auto-frame the garment
  // below and to anchor the ground shadow under its actual hem.
  const probe = document.createElement('canvas')
  probe.width = naturalW
  probe.height = naturalH
  const pctx = probe.getContext('2d', { willReadFrequently: true })
  pctx.drawImage(cutoutImage, 0, 0, naturalW, naturalH)
  const nativeBounds = findOpaqueBounds(pctx, naturalW, naturalH)

  const autoFit = Math.min(
    (width * AUTO_FIT_WIDTH_FRACTION) / Math.max(1, nativeBounds.width),
    (height * AUTO_FIT_HEIGHT_FRACTION) / Math.max(1, nativeBounds.height),
  )
  const drawScale = autoFit * scale
  const dw = naturalW * drawScale
  const dh = naturalH * drawScale

  // Center the GARMENT'S BOUNDS (not the raw photo's own canvas) in the
  // frame, then apply the admin's pan on top.
  const boundsCenterX = (nativeBounds.x + nativeBounds.width / 2) * drawScale
  const boundsCenterY = (nativeBounds.y + nativeBounds.height / 2) * drawScale
  const dx = width / 2 - boundsCenterX + offsetX * width
  const dy = height / 2 - boundsCenterY + offsetY * height

  const bounds = {
    x: dx + nativeBounds.x * drawScale,
    y: dy + nativeBounds.y * drawScale,
    width: nativeBounds.width * drawScale,
    height: nativeBounds.height * drawScale,
  }
  const groundY = bounds.y + bounds.height

  // Soft, tight contact shadow right at the base.
  ctx.save()
  ctx.filter = `blur(${Math.max(4, bounds.width * 0.03)}px)`
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)'
  ctx.beginPath()
  ctx.ellipse(
    bounds.x + bounds.width / 2,
    groundY - bounds.height * 0.015,
    Math.max(1, bounds.width * 0.42),
    Math.max(6, bounds.height * 0.035),
    0,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()

  // Fainter, wider ambient shadow beneath that, for depth.
  ctx.save()
  ctx.filter = `blur(${Math.max(10, bounds.width * 0.08)}px)`
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)'
  ctx.beginPath()
  ctx.ellipse(
    bounds.x + bounds.width / 2,
    groundY,
    Math.max(1, bounds.width * 0.55),
    Math.max(10, bounds.height * 0.06),
    0,
    0,
    Math.PI * 2,
  )
  ctx.fill()
  ctx.restore()

  // The hanger, drawn BEFORE the subject so the garment photo's own
  // opaque pixels naturally occlude the arms below the collar — see
  // drawHanger's own docstring for why draw order is what makes this work.
  if (hanger?.show) drawHanger(ctx, bounds, { style: hanger.style })

  // The subject itself, on top of the backdrop + shadow (+ hanger arms).
  ctx.drawImage(cutoutImage, dx, dy, dw, dh)
}

/** Hanger finishes offered in the studio — see requirement: "natural wood OR minimal neutral hanger", never colorful/distracting. */
export const HANGER_STYLES = {
  wood: { label: 'Natural wood', light: '#dcb583', mid: '#b3854c', dark: '#7c5a30' },
  neutral: { label: 'Minimal neutral', light: '#d2d2cd', mid: '#a3a39c', dark: '#6f6f68' },
}

export const DEFAULT_HANGER = { show: true, style: 'wood' }

/**
 * Traces the hanger's silhouette (hook + two angled arms meeting at a
 * center peak) as one or more subpaths on `ctx`, ready for `stroke()`.
 * Deliberately simple and symmetric — a slim, rounded, unbranded hanger
 * silhouette reads as "real product photography prop" precisely because
 * it does NOT try to be a detailed illustration (that's what tips a
 * hanger over into looking cartoonish).
 */
/**
 * Traces the hanger's two angled wood arms (meeting at a center peak,
 * where the metal hook attaches) as subpaths on `ctx`, ready for
 * `stroke()`. Deliberately simple and symmetric — a slim, rounded,
 * unbranded silhouette reads as "real product photography prop"
 * precisely because it does NOT try to be a detailed illustration
 * (that's what tips a hanger over into looking cartoonish).
 */
function traceHangerArms(ctx, { peakX, peakY, leftX, rightX, armY, yNudge = 0 }) {
  ctx.beginPath()
  // Left arm: a shallow outward curve down to the left tip, the way a
  // real hanger's molded shoulder curves rather than a straight ruled line.
  ctx.moveTo(peakX, peakY + yNudge)
  ctx.quadraticCurveTo(peakX - (peakX - leftX) * 0.55, peakY - (armY - peakY) * 0.1 + yNudge, leftX, armY + yNudge)
  // Right arm, mirrored.
  ctx.moveTo(peakX, peakY + yNudge)
  ctx.quadraticCurveTo(peakX + (rightX - peakX) * 0.55, peakY - (armY - peakY) * 0.1 + yNudge, rightX, armY + yNudge)
}

/** Traces the small metal hook above the peak — requirement #10: "a simple metal hook", visually distinct from the wood body. */
function traceHangerHook(ctx, { peakX, peakY, hookHeight, yNudge = 0 }) {
  ctx.beginPath()
  ctx.moveTo(peakX, peakY - hookHeight + yNudge)
  ctx.quadraticCurveTo(peakX + hookHeight * 0.62, peakY - hookHeight * 0.5 + yNudge, peakX, peakY + yNudge)
}

/**
 * Draws a simple, realistic, unbranded garment hanger peeking out above
 * the collar — requirement #7/#10 ("hanger visible above the collar",
 * "must NOT look cartoonish", "simple realistic wooden hanger", "simple
 * metal hook").
 *
 * This is drawn onto the backdrop BEFORE the real garment cutout is
 * drawn on top of it (see drawSubjectWithShadow), which is what makes
 * the hanger's arms correctly disappear behind the collar/shoulders
 * instead of floating in front of the fabric: wherever the garment
 * photo is opaque, it simply paints over the lower part of the hanger;
 * only the hook and the small triangle of hanger visible above the
 * collar survive, exactly like a real hanging product photo.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number, y:number, width:number}} bounds - the garment's own opaque bounds (from findOpaqueBounds), already positioned on this canvas
 * @param {{style?: 'wood'|'neutral'}} [options]
 */
function drawHanger(ctx, bounds, options = {}) {
  const palette = HANGER_STYLES[options.style] || HANGER_STYLES.wood
  const garmentWidth = Math.max(1, bounds.width)
  const centerX = bounds.x + bounds.width / 2
  const topY = bounds.y

  const shoulderWidth = garmentWidth * 0.34
  const shoulderDrop = garmentWidth * 0.09
  const hookHeight = garmentWidth * 0.08
  const armStrokeWidth = Math.max(2, garmentWidth * 0.017)
  const hookStrokeWidth = Math.max(1.4, armStrokeWidth * 0.55)

  const geometry = {
    peakX: centerX,
    peakY: topY - hookHeight * 0.3,
    leftX: centerX - shoulderWidth / 2,
    rightX: centerX + shoulderWidth / 2,
    armY: topY + shoulderDrop,
    hookHeight,
  }

  ctx.save()

  // A soft, slightly offset cast shadow of the whole hanger silhouette
  // against the backdrop (hook + arms together — the blur hides the seam).
  ctx.save()
  ctx.translate(garmentWidth * 0.008, garmentWidth * 0.01)
  ctx.filter = `blur(${Math.max(1.5, garmentWidth * 0.006)}px)`
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)'
  ctx.lineCap = 'round'
  ctx.lineWidth = armStrokeWidth * 1.2
  traceHangerArms(ctx, geometry)
  ctx.stroke()
  ctx.lineWidth = hookStrokeWidth * 1.4
  traceHangerHook(ctx, geometry)
  ctx.stroke()
  ctx.restore()

  // The wood arms — a top-to-bottom gradient stroke gives them roundness
  // (real hanger wood catches a highlight along its top edge) without
  // drawing anything as elaborate as a textured illustration.
  const woodGradient = ctx.createLinearGradient(0, topY - hookHeight, 0, geometry.armY)
  woodGradient.addColorStop(0, palette.light)
  woodGradient.addColorStop(0.55, palette.mid)
  woodGradient.addColorStop(1, palette.dark)
  ctx.strokeStyle = woodGradient
  ctx.lineWidth = armStrokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  traceHangerArms(ctx, geometry)
  ctx.stroke()

  // A hairline highlight along the wood's top edge for a subtle varnished/matte sheen.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)'
  ctx.lineWidth = Math.max(0.75, armStrokeWidth * 0.28)
  traceHangerArms(ctx, { ...geometry, yNudge: -armStrokeWidth * 0.2 })
  ctx.stroke()

  // The hook — a distinct brushed-metal finish (silver-grey, not wood),
  // per requirement #10's "simple metal hook". Small enough that most of
  // it sits above the collar and reads as real hardware, not a toy.
  const metalGradient = ctx.createLinearGradient(0, topY - hookHeight, 0, geometry.peakY)
  metalGradient.addColorStop(0, '#f1f1f3')
  metalGradient.addColorStop(0.5, '#c7c8cb')
  metalGradient.addColorStop(1, '#8d8e91')
  ctx.strokeStyle = metalGradient
  ctx.lineWidth = hookStrokeWidth
  ctx.lineCap = 'round'
  traceHangerHook(ctx, geometry)
  ctx.stroke()

  // A tight metallic highlight for a slight shine, like a real steel hook.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
  ctx.lineWidth = Math.max(0.6, hookStrokeWidth * 0.3)
  traceHangerHook(ctx, { ...geometry, yNudge: -hookStrokeWidth * 0.16 })
  ctx.stroke()

  ctx.restore()
}

/**
 * Soft radial darkening toward the canvas edges — the subtle depth cue that
 * separates a flat color fill from a real studio cyclorama/backdrop paper
 * under a single overhead light. Applied UNDER the subject (right after the
 * backdrop, before drawSubjectWithShadow), so it reads as part of the scene
 * rather than a filter over the finished shot, and it's gentle enough to
 * never noticeably darken the garment itself.
 */
function applyStudioVignette(ctx, width, height) {
  ctx.save()
  const radius = Math.max(width, height) * 0.75
  const gradient = ctx.createRadialGradient(width / 2, height * 0.42, radius * 0.25, width / 2, height * 0.42, radius)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, 'rgba(0,0,0,0.16)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  ctx.restore()
}

/**
 * Composites a background-removed cutout onto a clean studio backdrop,
 * with a synthesized soft contact shadow — the cue that separates
 * "standing in the scene" from "cut out and pasted on top of a
 * different photo".
 *
 * @param {HTMLImageElement} cutoutImage - transparent-background PNG from removeBackground()
 * @param {string} backdropId - one of STUDIO_BACKDROPS' ids
 * @param {{scale?: number, offsetX?: number, offsetY?: number}} [subjectTransform] - composition controls: subject scale (1 = fit width) and X/Y position as a fraction of canvas size
 * @param {{top?: string, bottom?: string}} [customColors] - overrides the backdrop's own top/bottom colors; used by the "Custom gradient" backdrop's color pickers so the admin can pick any two-color gradient rather than being limited to the fixed presets
 * @param {{show?: boolean, style?: 'wood'|'neutral'}} [hanger] - requirement #7: a realistic hanger peeking above the collar. Defaults to DEFAULT_HANGER (shown, natural wood); pass `{ show: false }` for angles/crops where a hanger doesn't belong (e.g. a close-up detail shot).
 * @returns {HTMLCanvasElement}
 */
export function compositeOnBackdrop(cutoutImage, backdropId, subjectTransform, customColors, hanger = DEFAULT_HANGER) {
  const width = cutoutImage.naturalWidth || cutoutImage.width
  const height = cutoutImage.naturalHeight || cutoutImage.height
  const backdrop = getBackdrop(backdropId)
  const top = customColors?.top || backdrop.top
  const bottom = customColors?.bottom || backdrop.bottom

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  // The backdrop itself: a soft vertical gradient reads as a real
  // seamless studio paper/cyc, not a flat single-color fill.
  const gradient = ctx.createLinearGradient(0, 0, 0, height)
  gradient.addColorStop(0, top)
  gradient.addColorStop(1, bottom)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
  applyStudioVignette(ctx, width, height)

  drawSubjectWithShadow(ctx, cutoutImage, width, height, subjectTransform, hanger)
  return canvas
}

/**
 * Composites a background-removed cutout onto the admin's OWN uploaded
 * background photograph (street scene, showroom, lifestyle shot, etc.)
 * instead of a code-drawn studio backdrop — this is the "real model/
 * T-shirt + my uploaded background = final mockup" composition path.
 * The background is drawn cover-fit (never stretched/distorted) and can
 * be panned/zoomed independently of the subject.
 *
 * @param {HTMLImageElement} cutoutImage - transparent-background PNG from removeBackground()
 * @param {HTMLImageElement} backgroundImage - the admin's uploaded background photo
 * @param {{scale?: number, offsetX?: number, offsetY?: number}} [backgroundTransform] - background scale (1 = cover-fit) and X/Y pan as a fraction of canvas size
 * @param {{scale?: number, offsetX?: number, offsetY?: number}} [subjectTransform] - subject scale/position, same convention as compositeOnBackdrop
 * @param {{show?: boolean, style?: 'wood'|'neutral'}} [hanger] - same convention as compositeOnBackdrop
 * @returns {HTMLCanvasElement}
 */
export function compositeOnCustomBackground(cutoutImage, backgroundImage, backgroundTransform = {}, subjectTransform, hanger = DEFAULT_HANGER) {
  const width = cutoutImage.naturalWidth || cutoutImage.width
  const height = cutoutImage.naturalHeight || cutoutImage.height

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const { scale: bgScale = 1, offsetX: bgOffsetX = 0, offsetY: bgOffsetY = 0 } = backgroundTransform
  const bgNaturalW = backgroundImage.naturalWidth || backgroundImage.width
  const bgNaturalH = backgroundImage.naturalHeight || backgroundImage.height
  const coverScale = Math.max(width / bgNaturalW, height / bgNaturalH) * Math.max(0.01, bgScale)
  const bgDw = bgNaturalW * coverScale
  const bgDh = bgNaturalH * coverScale
  const bgDx = (width - bgDw) / 2 + bgOffsetX * width
  const bgDy = (height - bgDh) / 2 + bgOffsetY * height
  ctx.drawImage(backgroundImage, bgDx, bgDy, bgDw, bgDh)
  applyStudioVignette(ctx, width, height)

  drawSubjectWithShadow(ctx, cutoutImage, width, height, subjectTransform, hanger)
  return canvas
}

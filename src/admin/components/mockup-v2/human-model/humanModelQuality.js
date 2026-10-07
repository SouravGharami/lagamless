/**
 * Human Model Studio — NON-DESTRUCTIVE quality analysis.
 *
 * This is NOT a "is this person suitable" detector. It only reads basic image properties (size, aspect
 * ratio, resolution, transparency, readability) and produces WARNINGS. Warnings never block the user;
 * only a technically unusable file (validation errors) does.
 */

export const QUALITY_LIMITS = Object.freeze({
  veryTinySide: 256, // shorter side below this: "Very small image"
  lowSide: 1024, // shorter side below this: "Low resolution image"
  veryWideRatio: 2.5, // width / height above this: "Very wide image"
  veryTallRatio: 2.5, // height / width above this: "Very tall image"
  sampleSide: 48, // pixel-sampling canvas (long side) used for transparency / uniformity
})

export const QUALITY_CODE = Object.freeze({
  VERY_SMALL: 'QUALITY_VERY_SMALL',
  LOW_RESOLUTION: 'QUALITY_LOW_RESOLUTION',
  VERY_WIDE: 'QUALITY_VERY_WIDE',
  VERY_TALL: 'QUALITY_VERY_TALL',
  HAS_TRANSPARENCY: 'QUALITY_HAS_TRANSPARENCY',
  MOSTLY_TRANSPARENT: 'QUALITY_MOSTLY_TRANSPARENT',
  UNIFORM_IMAGE: 'QUALITY_UNIFORM_IMAGE',
})

const warn = (code, message) => ({ code, message })

/**
 * Pure analysis. `pixels` is the optional result of sampleImagePixels() (transparency / uniformity);
 * without it only the dimension-based checks run.
 * @returns {{ level: 'good'|'fair'|'poor', warnings: {code,message}[], facts: object }}
 */
export function analyzeHumanModelQuality({ width, height, fileSize = null, mimeType = '', pixels = null } = {}) {
  const warnings = []
  const facts = {
    width,
    height,
    aspectRatio: width > 0 && height > 0 ? Number((width / height).toFixed(3)) : null,
    megapixels: width > 0 && height > 0 ? Number(((width * height) / 1_000_000).toFixed(2)) : null,
    fileSize,
    mimeType,
    hasAlpha: pixels?.hasAlpha ?? null,
  }
  if (!(width > 0) || !(height > 0)) return { level: 'poor', warnings, facts }

  const short = Math.min(width, height)
  if (short < QUALITY_LIMITS.veryTinySide) {
    warnings.push(warn(QUALITY_CODE.VERY_SMALL, `Very small image (${width} × ${height} px). Fitting needs a clearly visible torso — use a larger photo if you can.`))
  } else if (short < QUALITY_LIMITS.lowSide) {
    warnings.push(warn(QUALITY_CODE.LOW_RESOLUTION, `Low resolution image (${width} × ${height} px). ${QUALITY_LIMITS.lowSide} px or more on the shorter side gives better results.`))
  }
  if (width / height > QUALITY_LIMITS.veryWideRatio) {
    warnings.push(warn(QUALITY_CODE.VERY_WIDE, 'Very wide image. A portrait or near-square photo that shows the upper body works best.'))
  }
  if (height / width > QUALITY_LIMITS.veryTallRatio) {
    warnings.push(warn(QUALITY_CODE.VERY_TALL, 'Very tall image. The person may be small in the frame — a tighter crop on the upper body works best.'))
  }
  if (pixels) {
    if (pixels.fullyTransparent || pixels.transparentShare >= 0.9) {
      warnings.push(warn(QUALITY_CODE.MOSTLY_TRANSPARENT, 'The image is almost entirely transparent, so very little of the person is visible.'))
    } else if (pixels.hasAlpha) {
      warnings.push(warn(QUALITY_CODE.HAS_TRANSPARENCY, 'The image has transparent areas. They are kept as they are; a photo with its background is usually safer for fitting.'))
    }
    if (pixels.uniform && !pixels.fullyTransparent) {
      warnings.push(warn(QUALITY_CODE.UNIFORM_IMAGE, 'The image looks like a single flat colour — check that it is the right photo.'))
    }
  }

  const severe = warnings.some((w) => [QUALITY_CODE.VERY_SMALL, QUALITY_CODE.MOSTLY_TRANSPARENT, QUALITY_CODE.UNIFORM_IMAGE].includes(w.code))
  const level = severe ? 'poor' : warnings.length > 0 ? 'fair' : 'good'
  return { level, warnings, facts }
}

/**
 * Pure: summarises RGBA pixel data (Uint8ClampedArray) into transparency / uniformity facts.
 * Exported separately so it can be tested without a canvas.
 */
export function summarizePixels(data) {
  const count = Math.floor((data?.length ?? 0) / 4)
  if (count === 0) return { hasAlpha: false, fullyTransparent: false, transparentShare: 0, uniform: false }
  let transparent = 0
  let partial = 0
  let uniform = true
  const r0 = data[0], g0 = data[1], b0 = data[2], a0 = data[3]
  for (let i = 0; i < count; i += 1) {
    const o = i * 4
    const a = data[o + 3]
    if (a === 0) transparent += 1
    else if (a < 255) partial += 1
    if (uniform && (data[o] !== r0 || data[o + 1] !== g0 || data[o + 2] !== b0 || a !== a0)) uniform = false
  }
  return {
    hasAlpha: transparent + partial > 0,
    fullyTransparent: transparent === count,
    transparentShare: transparent / count,
    uniform,
  }
}

/**
 * Browser helper: draws a decoded image (from a same-origin blob: URL, so the canvas is never tainted)
 * onto a tiny canvas and summarises it. Returns null if pixels can't be read — the analysis just skips
 * the pixel-based warnings; it never throws and never blocks the upload.
 */
export function sampleImagePixels(img, { createCanvas } = {}) {
  try {
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    if (!(w > 0) || !(h > 0)) return null
    const scale = Math.min(1, QUALITY_LIMITS.sampleSide / Math.max(w, h))
    const sw = Math.max(1, Math.round(w * scale))
    const sh = Math.max(1, Math.round(h * scale))
    const canvas = createCanvas ? createCanvas(sw, sh) : Object.assign(document.createElement('canvas'), { width: sw, height: sh })
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, sw, sh)
    ctx.drawImage(img, 0, 0, sw, sh)
    return summarizePixels(ctx.getImageData(0, 0, sw, sh).data)
  } catch {
    return null
  }
}

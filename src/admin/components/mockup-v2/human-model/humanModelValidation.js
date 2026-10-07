/**
 * Human Model Studio — upload validation. Pure checks that return STRUCTURED results
 * ({ code, message }) so the UI can show a human-readable reason for every rejection.
 * Errors block the upload and mean the file is technically unusable (missing, empty, wrong type, too big,
 * cannot be decoded, zero / absurd dimensions). Quality concerns (low resolution, very wide ...) are
 * WARNINGS produced by humanModelQuality.js: shown, never blocking — the user stays in control.
 */
import { analyzeHumanModelQuality, sampleImagePixels } from './humanModelQuality.js'
import { createHumanModelAsset } from './humanModelAsset.js'

export const HUMAN_MODEL_ACCEPTED_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp'])
export const HUMAN_MODEL_ACCEPT = [...HUMAN_MODEL_ACCEPTED_TYPES, '.png', '.jpg', '.jpeg', '.webp'].join(',')

export const HUMAN_MODEL_LIMITS = Object.freeze({
  maxBytes: 30 * 1024 * 1024,
  minSide: 64, // below this the file is technically unusable -> error (anything larger only WARNS, see humanModelQuality.js)
  maxSide: 12000,
  maxPixels: 100_000_000,
})

export const VALIDATION_CODE = Object.freeze({
  NO_FILE: 'NO_FILE',
  EMPTY_FILE: 'EMPTY_FILE',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNREADABLE_IMAGE: 'UNREADABLE_IMAGE',
  ZERO_DIMENSIONS: 'ZERO_DIMENSIONS',
  RESOLUTION_TOO_LOW: 'RESOLUTION_TOO_LOW',
  RESOLUTION_TOO_HIGH: 'RESOLUTION_TOO_HIGH',
})

const EXT_TO_TYPE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }

/** MIME type, falling back to the extension when the browser leaves `type` empty. */
export function detectMimeType(file) {
  if (file?.type) return file.type
  const ext = (file?.name?.split('.').pop() || '').toLowerCase()
  return EXT_TO_TYPE[ext] || ''
}

export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const issue = (code, message) => ({ code, message })
const result = (errors, warnings) => ({ ok: errors.length === 0, errors, warnings })

/** File-level checks that need no decoding: exists, non-empty, supported type, size. */
export function validateHumanModelFile(file) {
  if (!file) return result([issue(VALIDATION_CODE.NO_FILE, 'No file was selected.')], [])
  const errors = []
  const name = file.name || 'This file'
  if (!(file.size > 0)) errors.push(issue(VALIDATION_CODE.EMPTY_FILE, `"${name}" is empty (0 bytes).`))
  if (!HUMAN_MODEL_ACCEPTED_TYPES.includes(detectMimeType(file))) {
    errors.push(issue(VALIDATION_CODE.UNSUPPORTED_TYPE, `"${name}" isn't a supported image type. Use PNG, JPG, JPEG or WEBP.`))
  }
  if (file.size > HUMAN_MODEL_LIMITS.maxBytes) {
    errors.push(issue(VALIDATION_CODE.FILE_TOO_LARGE, `"${name}" is ${formatFileSize(file.size)}. The limit is ${formatFileSize(HUMAN_MODEL_LIMITS.maxBytes)}.`))
  }
  return result(errors, [])
}

/** Dimension checks on a decoded image: non-zero, not absurdly small / huge. Everything in between is usable. */
export function validateHumanModelDimensions({ width, height }) {
  const errors = []
  if (!(width > 0) || !(height > 0)) {
    errors.push(issue(VALIDATION_CODE.ZERO_DIMENSIONS, 'The image has no readable width or height.'))
    return result(errors, [])
  }
  const { minSide, maxSide, maxPixels } = HUMAN_MODEL_LIMITS
  if (Math.min(width, height) < minSide) {
    errors.push(issue(VALIDATION_CODE.RESOLUTION_TOO_LOW, `The image is ${width} × ${height} px, which is too small to use. The shorter side must be at least ${minSide} px.`))
  }
  if (Math.max(width, height) > maxSide || width * height > maxPixels) {
    errors.push(issue(VALIDATION_CODE.RESOLUTION_TOO_HIGH, `The image is ${width} × ${height} px, which is larger than this studio can handle. Resize it below ${maxSide} px per side.`))
  }
  return result(errors, [])
}

/**
 * Validates a picked file end to end. Decodes it locally (blob URL, never uploaded).
 * Resolves `{ ok, errors, warnings, asset }`; `asset` (a HumanModelAsset that owns a live object URL the caller
 * must eventually release with releaseHumanModelAsset) is present only when ok.
 */
export async function readHumanModelFile(file, { now = new Date() } = {}) {
  const fileCheck = validateHumanModelFile(file)
  if (!fileCheck.ok) return { ...fileCheck, asset: null }

  const mimeType = detectMimeType(file)
  const blob = file.type ? file : new Blob([file], { type: mimeType })
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode failed'))
      el.src = url
    })
    const width = img.naturalWidth
    const height = img.naturalHeight
    const dimCheck = validateHumanModelDimensions({ width, height })
    if (!dimCheck.ok) {
      URL.revokeObjectURL(url)
      return { ...dimCheck, asset: null }
    }
    // Non-destructive: the pixel sample only feeds warnings, it never changes the image.
    const pixels = mimeType === 'image/jpeg' ? null : sampleImagePixels(img)
    const quality = analyzeHumanModelQuality({ width, height, fileSize: file.size, mimeType, pixels })
    const validation = { ok: true, errors: [], warnings: quality.warnings }
    const asset = createHumanModelAsset({ file: blob, url, mimeType, width, height, validation, quality, pixels, now })
    return { ok: true, errors: [], warnings: quality.warnings, asset }
  } catch {
    URL.revokeObjectURL(url)
    return result([issue(VALIDATION_CODE.UNREADABLE_IMAGE, `"${file.name}" couldn't be read as an image. It may be corrupted or not really a ${mimeType || 'supported'} file.`)], [])
  }
}

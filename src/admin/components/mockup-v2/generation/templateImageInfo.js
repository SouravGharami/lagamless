/**
 * Step 5-2 — plain facts about a template photograph (size, ratio, type) and a resolution warning.
 * Read-only: nothing here resamples, upscales or edits an image, and nothing claims a resolution the
 * file does not have.
 */
export const MIN_RECOMMENDED = Object.freeze({ shortSide: 1200, longSide: 1600 })
export const LOW_RESOLUTION_MESSAGE = 'Image resolution may be insufficient for high-quality mockups.'

const TYPE_LABELS = { 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' }
export const fileTypeLabel = (mime) => TYPE_LABELS[mime] ?? (mime ? mime.replace('image/', '').toUpperCase() : 'Unknown')
export const extensionForType = (mime) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[mime] ?? 'jpg'

const gcd = (a, b) => (b ? gcd(b, a % b) : a)

/** "4:5" for clean ratios, otherwise "0.82 : 1". null when unknown. */
export function formatAspectRatio(width, height) {
  if (!(width > 0) || !(height > 0)) return null
  const d = gcd(Math.round(width), Math.round(height))
  const w = Math.round(width) / d
  const h = Math.round(height) / d
  if (w <= 20 && h <= 20) return `${w}:${h}`
  return `${(width / height).toFixed(2)} : 1`
}

export function formatBytes(bytes) {
  if (!(bytes > 0)) return null
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Display strings for whatever is known; unknown parts are null (callers simply skip them). */
export function describeImageInfo(info = {}) {
  const { width, height } = info
  const known = width > 0 && height > 0
  return {
    dimensions: known ? `${width} × ${height} px` : null,
    aspectRatio: known ? formatAspectRatio(width, height) : null,
    fileType: info.fileType ? fileTypeLabel(info.fileType) : null,
    size: formatBytes(info.bytes),
  }
}

/** { ok, message }. `ok:false` only when the dimensions are known and small; unknown size is not a warning. */
export function assessImageQuality(info = {}) {
  const { width, height } = info
  if (!(width > 0) || !(height > 0)) return { ok: true, message: null }
  const short = Math.min(width, height)
  const long = Math.max(width, height)
  if (short < MIN_RECOMMENDED.shortSide || long < MIN_RECOMMENDED.longSide) return { ok: false, message: LOW_RESOLUTION_MESSAGE }
  return { ok: true, message: null }
}

/** True when two photographs differ in aspect ratio by more than `tolerance` (relative). Unknown sizes count as "same". */
export function aspectDiffers(a, b, tolerance = 0.02) {
  if (!(a?.width > 0 && a?.height > 0 && b?.width > 0 && b?.height > 0)) return false
  const ra = a.width / a.height
  const rb = b.width / b.height
  return Math.abs(ra - rb) / ra > tolerance
}

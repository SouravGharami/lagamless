/**
 * Browser-side image intake for Mockup Studio v2. Files become in-memory
 * blob: URLs (never data URLs, never localStorage). The caller owns the
 * URLs and is responsible for URL.revokeObjectURL when finished.
 */

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
// The T-shirt is a photograph, so only raster formats are allowed (no SVG).
const TSHIRT_ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']
const EXT_TO_TYPE = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' }
const MAX_BYTES = 30 * 1024 * 1024

export const IMAGE_ACCEPT = ACCEPTED.join(',')
export const TSHIRT_ACCEPT = [...TSHIRT_ACCEPTED, '.jpg', '.jpeg', '.png', '.webp'].join(',')
// DTF artwork: PNG (transparency preserved) plus JPG/JPEG/WebP. No SVG.
export const ARTWORK_ACCEPTED = ['image/png', 'image/jpeg', 'image/webp']
export const ARTWORK_ACCEPT = [...ARTWORK_ACCEPTED, '.png', '.jpg', '.jpeg', '.webp'].join(',')
export { TSHIRT_ACCEPTED }

function detectType(file) {
  if (file.type) return file.type
  // Some browsers/OSes leave `type` empty; fall back to the extension.
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  return EXT_TO_TYPE[ext] || ''
}

/** @returns {Promise<{ url: string, name: string, width: number, height: number }>} */
export function readImageFile(file, accepted = ACCEPTED) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('No file selected.'))
    if (!accepted.includes(detectType(file))) {
      const list = accepted.includes('image/svg+xml') ? 'PNG, JPG, WebP or SVG' : 'PNG, JPG, JPEG or WebP'
      return reject(new Error(`"${file.name}" isn't a supported image. Use ${list}.`))
    }
    if (file.size > MAX_BYTES) {
      return reject(new Error(`"${file.name}" is larger than 30 MB.`))
    }
    // If the browser reported no MIME type, re-wrap the file so decoding works.
    const blob = file.type ? file : new Blob([file], { type: detectType(file) })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      // SVGs without intrinsic dimensions report 0.
      const width = img.naturalWidth || 1000
      const height = img.naturalHeight || 1000
      resolve({ url, file, name: file.name.replace(/\.[^.]+$/, '') || 'Untitled', width, height })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`"${file.name}" couldn't be read as an image.`))
    }
    img.src = url
  })
}

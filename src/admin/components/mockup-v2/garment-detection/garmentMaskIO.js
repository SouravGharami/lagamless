/** Browser-side glue for garment detection: decode a photo, build the exact-size mask PNG, paint previews. */
import { WORK_MAX_SIDE, upsampleMaskRows } from './detectGarment.js'

const BAND_ROWS = 128

/**
 * Decodes a photo URL (the untouched upload) into RGBA pixels at detection size. Same-origin blob: URLs never taint
 * the canvas; saved Supabase photos need CORS, which public Storage buckets send.
 * @returns {Promise<{ width, height, data, naturalWidth, naturalHeight }>}
 */
export async function decodePhotoForDetection(url, maxSide = WORK_MAX_SIDE) {
  const img = await new Promise((resolve, reject) => {
    const el = new Image()
    if (!url.startsWith('blob:') && !url.startsWith('data:')) el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('The T-shirt photo could not be read for detection.'))
    el.src = url
  })
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const s = Math.min(1, maxSide / Math.max(nw, nh))
  const width = Math.max(1, Math.round(nw * s))
  const height = Math.max(1, Math.round(nh * s))
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, width, height)
  let imageData
  try {
    imageData = ctx.getImageData(0, 0, width, height)
  } catch {
    throw new Error('This photo is hosted on another site that blocks reading its pixels. Re-upload it from your computer.')
  }
  return { width, height, data: imageData.data, naturalWidth: nw, naturalHeight: nh }
}

/**
 * PNG of the mask at the photo's EXACT pixel size — opaque, white = garment, black = everything else — i.e. the format
 * the studio's T-shirt mask slot already expects. Written band by band so a very large photo needs no second full copy.
 */
export async function buildMaskBlob(result, width, height) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height })
  const ctx = canvas.getContext('2d')
  for (let y0 = 0; y0 < height; y0 += BAND_ROWS) {
    const rows = Math.min(BAND_ROWS, height - y0)
    const band = new ImageData(width, rows)
    upsampleMaskRows(result.mask, result.width, result.height, width, height, y0, y0 + rows, band.data)
    ctx.putImageData(band, 0, y0)
  }
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the mask.'))), 'image/png'))
}

export const PREVIEW_MODES = Object.freeze([
  { id: 'overlay', label: 'Overlay' },
  { id: 'mask', label: 'Mask' },
  { id: 'cutout', label: 'Cutout' },
  { id: 'photo', label: 'Photo' },
])

/** Paints one preview mode onto `canvas` (sized to the detection resolution; CSS scales it). */
export function paintPreview(canvas, photo, result, mode, opacity = 0.55) {
  const { width: w, height: h } = result
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const out = ctx.createImageData(w, h)
  const o = out.data
  const p = photo.data
  const m = result.mask
  for (let i = 0; i < w * h; i++) {
    const inside = m[i] > 127
    const k = i * 4
    if (mode === 'mask') {
      o[k] = o[k + 1] = o[k + 2] = inside ? 255 : 0
      o[k + 3] = 255
    } else if (mode === 'cutout') {
      o[k] = p[k]; o[k + 1] = p[k + 1]; o[k + 2] = p[k + 2]
      o[k + 3] = inside ? 255 : 0 // transparent outside; the CSS checkerboard shows through
    } else if (mode === 'photo') {
      o[k] = p[k]; o[k + 1] = p[k + 1]; o[k + 2] = p[k + 2]; o[k + 3] = 255
    } else {
      // overlay: tint the detected garment, dim everything else, draw a 1px outline on the boundary
      const x = i % w
      const y = (i - x) / w
      const edge = inside && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || m[i - 1] <= 127 || m[i + 1] <= 127 || m[i - w] <= 127 || m[i + w] <= 127)
      if (edge) { o[k] = 0; o[k + 1] = 230; o[k + 2] = 140 }
      else if (inside) { o[k] = p[k] * (1 - opacity); o[k + 1] = p[k + 1] * (1 - opacity) + 210 * opacity; o[k + 2] = p[k + 2] * (1 - opacity) + 120 * opacity }
      else { o[k] = p[k] * 0.45; o[k + 1] = p[k + 1] * 0.45; o[k + 2] = p[k + 2] * 0.45 }
      o[k + 3] = 255
    }
  }
  ctx.putImageData(out, 0, 0)
}

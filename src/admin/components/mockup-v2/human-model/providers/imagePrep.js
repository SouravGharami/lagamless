/**
 * Converts images into what a Gradio VTON Space expects. Browser-only conversions (canvas) are skipped when there is
 * no DOM, so the provider logic stays testable in Node.
 *
 *  - Garment: the finished T-shirt render is a PNG with a transparent background. Most VTON Spaces decode to RGB and
 *    would turn transparency black, so the garment is flattened onto plain white. Only the EMPTY background changes; the
 *    T-shirt pixels (colour, artwork) are not touched.
 *  - Person: sent as-is unless it is very large, then scaled down (keeps the upload small).
 */

const MAX_SIDE = 2048

const canDraw = () => typeof document !== 'undefined' && typeof createImageBitmap === 'function'

async function redraw(blob, { flattenWhite, maxSide, mime, quality }) {
  const bmp = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * scale))
    const h = Math.max(1, Math.round(bmp.height * scale))
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h })
    const ctx = canvas.getContext('2d')
    if (flattenWhite) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h) }
    ctx.drawImage(bmp, 0, 0, w, h)
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), mime, quality))
  } finally {
    bmp.close?.()
  }
}

export async function prepareGarmentForSpace(blob, { flattenWhite = true } = {}) {
  if (!canDraw() || !flattenWhite) return blob
  return redraw(blob, { flattenWhite: true, maxSide: MAX_SIDE, mime: 'image/png' })
}

export async function preparePersonForSpace(blob) {
  if (!canDraw()) return blob
  try {
    const bmp = await createImageBitmap(blob)
    const big = Math.max(bmp.width, bmp.height) > MAX_SIDE
    bmp.close?.()
    return big ? await redraw(blob, { flattenWhite: false, maxSide: MAX_SIDE, mime: 'image/jpeg', quality: 0.93 }) : blob
  } catch {
    return blob
  }
}

/** Confirms a result blob is really a decodable image. In Node (no DOM) only the MIME/size check applies. */
export async function isDecodableImage(blob) {
  if (!(blob instanceof Blob) || blob.size === 0) return false
  if (blob.type && !blob.type.startsWith('image/')) return false
  if (!canDraw()) return true
  try {
    const bmp = await createImageBitmap(blob)
    const ok = bmp.width > 0 && bmp.height > 0
    bmp.close?.()
    return ok
  } catch {
    return false
  }
}


/**
 * Builds a garment-only PNG from the existing Studio source.
 * Priority: an existing background-removed image; otherwise the Studio's T-shirt mask
 * is applied to the original photo. The transparent result is cropped to the garment
 * bounds before it is sent to VTON, so no studio/custom background can leak into VTON.
 */
export async function buildCleanGarmentBlob({ processedUrl = null, originalUrl = null, maskUrl = null } = {}) {
  if (!canDraw()) throw new Error('Clean garment preparation requires a browser canvas.')

  const loadBlob = async (url, label) => {
    if (!url) return null
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${label} returned HTTP ${response.status}.`)
    const blob = await response.blob()
    if (!blob.size) throw new Error(`${label} is empty.`)
    return blob
  }

  const sourceBlob = await loadBlob(processedUrl, 'Processed T-shirt image')
  const originalBlob = sourceBlob ? null : await loadBlob(originalUrl, 'Original T-shirt image')
  if (!sourceBlob && !originalBlob) throw new Error('No T-shirt source image is available.')

  const source = await createImageBitmap(sourceBlob || originalBlob)
  let mask = null
  try {
    // ALWAYS prefer the Studio's garment mask when one exists. A processed image can
    // still be a full rectangular render, so trusting it blindly can send the Studio
    // background into VTON (which FASHN then treats as part of the garment).
    if (maskUrl) {
      mask = await createImageBitmap(await loadBlob(maskUrl, 'T-shirt mask'))
    } else if (!sourceBlob) {
      throw new Error('The T-shirt has no background-removed image or T-shirt mask.')
    }

    const width = source.width
    const height = source.height
    const canvas = Object.assign(document.createElement('canvas'), { width, height })
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(source, 0, 0, width, height)

    if (mask) {
      const maskCanvas = Object.assign(document.createElement('canvas'), { width, height })
      const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
      maskCtx.drawImage(mask, 0, 0, width, height)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(maskCanvas, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    }

    // Crop transparent margins so VTON sees the actual garment instead of a full studio frame.
    const pixels = ctx.getImageData(0, 0, width, height).data
    let minX = width, minY = height, maxX = -1, maxY = -1
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        if (pixels[(y * width + x) * 4 + 3] > 8) {
          minX = Math.min(minX, x); minY = Math.min(minY, y)
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
        }
      }
    }
    if (maxX < minX || maxY < minY) throw new Error('The T-shirt cutout contains no visible garment pixels.')

    const pad = Math.max(2, Math.round(Math.max(maxX - minX + 1, maxY - minY + 1) * 0.02))
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
    maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad)

    const crop = Object.assign(document.createElement('canvas'), {
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    })
    const cropCtx = crop.getContext('2d')
    cropCtx.clearRect(0, 0, crop.width, crop.height)
    cropCtx.drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height)

    return await new Promise((resolve, reject) => {
      crop.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode the clean T-shirt PNG.')), 'image/png')
    })
  } finally {
    source.close?.()
    mask?.close?.()
  }
}

/**
 * STEP 7B — EXACT DTF ARTWORK POST-COMPOSITOR
 *
 * The VTON provider receives a CLEAN T-shirt only. After VTON returns, this module
 * paints the ORIGINAL artwork source pixels back onto the generated model image.
 * The AI provider is never asked to redraw the DTF artwork.
 *
 * This is intentionally a deterministic 2D placement pass. It preserves the source
 * artwork pixels and uses the original Mockup Studio percentage geometry. It does
 * not pretend to infer a hidden cloth mesh or invent a perspective warp.
 */
import { MODEL_VIEW_TO_ANGLE } from './humanModelState.js'

const clamp = (n, min, max) => Math.min(max, Math.max(min, n))

function imageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode an image.')) }
    img.src = url
  })
}

async function imageFromUrl(url) {
  if (!url) throw new Error('Artwork source URL is missing.')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Artwork source returned HTTP ${response.status}.`)
  return imageFromBlob(await response.blob())
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Detects the region changed by VTON inside the torso. This is only a placement guide, never a source of artwork pixels. */
async function detectModelGarmentBounds(personBlob, resultBlob, width, height) {
  try {
    const [person, result] = await Promise.all([imageFromBlob(personBlob), imageFromBlob(resultBlob)])
    const size = 256
    const canvas = createCanvas(size, size)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(person, 0, 0, size, size)
    const a = ctx.getImageData(0, 0, size, size).data
    ctx.clearRect(0, 0, size, size)
    ctx.drawImage(result, 0, 0, size, size)
    const b = ctx.getImageData(0, 0, size, size).data

    let minX = size, minY = size, maxX = -1, maxY = -1, count = 0
    for (let y = Math.floor(size * 0.18); y < Math.floor(size * 0.82); y += 2) {
      for (let x = Math.floor(size * 0.08); x < Math.floor(size * 0.92); x += 2) {
        const i = (y * size + x) * 4
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
        if (d < 78) continue
        count += 1
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
      }
    }

    const area = count / ((size * 0.84) * (size * 0.64) / 4)
    if (maxX > minX && maxY > minY && area >= 0.025) {
      const padX = (maxX - minX) * 0.08
      const padY = (maxY - minY) * 0.08
      return {
        x: clamp((minX - padX) / size * width, 0, width),
        y: clamp((minY - padY) / size * height, 0, height),
        width: clamp((maxX - minX + padX * 2) / size * width, 1, width),
        height: clamp((maxY - minY + padY * 2) / size * height, 1, height),
        method: 'vton-difference',
      }
    }
  } catch {
    // Deterministic fallback below; no generated artwork is invented.
  }

  return {
    x: width * 0.20,
    y: height * 0.22,
    width: width * 0.60,
    height: height * 0.56,
    method: 'conservative-torso-fallback',
  }
}

function drawLayer(ctx, image, layer, garmentBounds, sourceWidth, sourceHeight) {
  if (layer.visible === false || !image) return
  const x = garmentBounds.x + (Number(layer.x) || 0) / 100 * garmentBounds.width
  const y = garmentBounds.y + (Number(layer.y) || 0) / 100 * garmentBounds.height
  const scale = Number.isFinite(Number(layer.scale)) && Number(layer.scale) > 0 ? Number(layer.scale) : 1
  const w = Math.max(1, ((Number(layer.width) || 0) * scale) / 100 * garmentBounds.width)
  const h = Math.max(1, ((Number(layer.height) || 0) * scale) / 100 * garmentBounds.height)
  if (!(w > 0 && h > 0)) return

  const rotation = (Number(layer.rotation) || 0) * Math.PI / 180
  const opacity = clamp(Number.isFinite(Number(layer.opacity)) ? Number(layer.opacity) : 1, 0, 1)
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.translate(x + w / 2, y + h / 2)
  ctx.rotate(rotation)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, -w / 2, -h / 2, w, h)
  ctx.restore()
}

/**
 * Re-applies the original DTF artwork for one generated model view.
 * Returns the original provider image unchanged when there is no visible artwork for the view.
 */
export async function compositeExactArtwork({ resultBlob, personBlob, assets, view }) {
  if (!(resultBlob instanceof Blob) || resultBlob.size === 0) return { blob: resultBlob, applied: false, reason: 'missing-result' }
  const angle = MODEL_VIEW_TO_ANGLE[view]
  const layers = (assets?.composition?.artworkLayers ?? [])
    .filter((layer) => layer?.visible !== false && layer?.view === angle && layer?.sourceUrl)
  if (layers.length === 0) return { blob: resultBlob, applied: false, reason: 'no-artwork-for-view' }

  const resultImage = await imageFromBlob(resultBlob)
  const canvas = createCanvas(resultImage.naturalWidth || resultImage.width, resultImage.naturalHeight || resultImage.height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(resultImage, 0, 0, canvas.width, canvas.height)

  const bounds = await detectModelGarmentBounds(personBlob, resultBlob, canvas.width, canvas.height)
  const cache = new Map()
  for (const layer of layers) {
    let image = cache.get(layer.sourceUrl)
    if (!image) {
      image = await imageFromUrl(layer.sourceUrl)
      cache.set(layer.sourceUrl, image)
    }
    drawLayer(ctx, image, layer, bounds, image.naturalWidth || image.width, image.naturalHeight || image.height)
  }

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Could not encode the post-composited mockup.')), 'image/png')
  })
  return {
    blob,
    applied: true,
    artworkLayerCount: layers.length,
    mapping: { method: bounds.method, garmentBounds: bounds },
  }
}

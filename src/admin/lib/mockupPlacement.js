import { getPrintZones, getZone, zoneGeometry } from './mockupTemplates.js'

let idCounter = 0
/** Short, collision-free-enough id for artworks/placements within one session. */
export function nextId(prefix) {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

export function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image.'))
    img.src = src
  })
}

/**
 * Loads a DTF artwork file and reads off the true, alpha-trimmed shape of
 * the printed design — a 4500×5400px canvas with a 600×600px logo centered
 * on it should be treated as a small square, not a huge portrait sheet.
 * Sampled on a downscaled copy (never more than ~500px on the long edge)
 * so this stays fast even on full-resolution print-ready files.
 *
 * @param {File} file
 * @returns {Promise<{
 *   dataUrl: string, naturalWidth: number, naturalHeight: number,
 *   trimmed: { x: number, y: number, width: number, height: number },
 *   aspectRatio: number, coverage: number, hasTransparency: boolean,
 * }>}
 */
export async function analyzeArtwork(file) {
  const dataUrl = await readFileAsDataUrl(file)
  const img = await loadImageElement(dataUrl)
  const naturalWidth = img.naturalWidth || img.width
  const naturalHeight = img.naturalHeight || img.height

  const longEdge = Math.max(naturalWidth, naturalHeight)
  const scale = longEdge > 500 ? 500 / longEdge : 1
  const sampleW = Math.max(1, Math.round(naturalWidth * scale))
  const sampleH = Math.max(1, Math.round(naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = sampleW
  canvas.height = sampleH
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, sampleW, sampleH)

  let data
  try {
    data = ctx.getImageData(0, 0, sampleW, sampleH).data
  } catch {
    // Cross-origin/tainted canvas (shouldn't happen for a local file, but
    // never let this crash the upload) — fall back to "whole image".
    return fallbackAnalysis(dataUrl, naturalWidth, naturalHeight)
  }

  const ALPHA_THRESHOLD = 12
  let minX = sampleW, minY = sampleH, maxX = -1, maxY = -1
  let opaquePixels = 0
  let sawTransparentPixel = false

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const alpha = data[(y * sampleW + x) * 4 + 3]
      if (alpha < 255) sawTransparentPixel = true
      if (alpha > ALPHA_THRESHOLD) {
        opaquePixels += 1
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0) {
    // Fully transparent file (or a read error) — fall back rather than
    // suggest a zero-size placement.
    return fallbackAnalysis(dataUrl, naturalWidth, naturalHeight)
  }

  const trimmedSampleW = maxX - minX + 1
  const trimmedSampleH = maxY - minY + 1
  const inv = 1 / scale

  const trimmed = {
    x: Math.round(minX * inv),
    y: Math.round(minY * inv),
    width: Math.round(trimmedSampleW * inv),
    height: Math.round(trimmedSampleH * inv),
  }

  return {
    dataUrl,
    naturalWidth,
    naturalHeight,
    trimmed,
    aspectRatio: trimmed.width / trimmed.height,
    coverage: opaquePixels / (trimmedSampleW * trimmedSampleH),
    hasTransparency: sawTransparentPixel,
  }
}

function fallbackAnalysis(dataUrl, naturalWidth, naturalHeight) {
  return {
    dataUrl,
    naturalWidth,
    naturalHeight,
    trimmed: { x: 0, y: 0, width: naturalWidth, height: naturalHeight },
    aspectRatio: naturalWidth / naturalHeight,
    coverage: 1,
    hasTransparency: false,
  }
}

/**
 * Rule-based "smart placement" — not a vision model. It reasons only from
 * the artwork's own trimmed shape (aspect ratio + how much of its own
 * bounding box is actually ink) plus the one thing only the admin can
 * know: which body area this design is meant for. That one-click area
 * hint is the "Admin accepts or changes the suggestion" step in the brief
 * — the studio still proposes the exact zone, size and rotation; the
 * admin is only confirming *where on the body*, not doing the geometry.
 *
 * @param {{ aspectRatio: number, coverage: number }} artworkMeta
 * @param {'front'|'back'|'sleeve'} areaHint
 * @returns {{ angle: 'front'|'back', zoneId: string, width: number, rotation: number, note: string }}
 */
export function suggestPlacement(artworkMeta, areaHint = 'front') {
  const { aspectRatio, coverage } = artworkMeta
  const wide = aspectRatio >= 1.6
  const tall = aspectRatio <= 0.62
  const square = !wide && !tall

  if (areaHint === 'sleeve') {
    return {
      angle: 'front',
      zoneId: 'left-sleeve',
      widthScale: 1,
      note: 'Sized for a sleeve print — narrow column, warped to follow the seam.',
    }
  }

  if (areaHint === 'back') {
    if (wide) {
      return { angle: 'back', zoneId: 'back-full', widthScale: 1,
        note: 'Wide artwork — placed as a full-back print, centered between the shoulder blades and hem.' }
    }
    return { angle: 'back', zoneId: 'back-center', widthScale: square ? 1 : 0.85,
      note: 'Compact artwork — placed centered on the upper back, the classic "back hit" position.' }
  }

  // Front (default).
  if (wide && coverage > 0.35) {
    return { angle: 'front', zoneId: 'full-front', widthScale: 1,
      note: 'Wide, dense artwork — sized as a full-front print spanning chest to hem.' }
  }
  if (tall) {
    return { angle: 'front', zoneId: 'full-front', widthScale: 0.55,
      note: 'Tall/vertical artwork — sized as a narrower full-length front print.' }
  }
  if (square && coverage > 0.4) {
    return { angle: 'front', zoneId: 'center-chest', widthScale: 1,
      note: 'Compact, dense artwork — placed as a standard center-chest print.' }
  }
  return { angle: 'front', zoneId: 'left-chest', widthScale: 1,
    note: 'Small/sparse artwork — placed as a left-chest hit, the usual spot for a light mark.' }
}

/**
 * Builds a full placement object at a named zone, sized from the
 * artwork's own aspect ratio and positioned in the REAL photo's own
 * pixel space (`photoWidth`/`photoHeight` — the uploaded template
 * photo's natural dimensions for this angle), so the same zone lands in
 * the right spot whatever resolution that photo actually is.
 */
export function placementAtZone({ artwork, angle, zoneId, photoWidth, photoHeight, widthScale = 1, rotation }) {
  const zone = getZone(angle, zoneId) || getPrintZones(angle)[0]
  const geo = zoneGeometry(zone, photoWidth, photoHeight)
  const w = geo.width * widthScale
  const height = w / artwork.aspectRatio
  const finalRotation = rotation ?? geo.rotation
  return {
    id: nextId('placement'),
    artworkId: artwork.id,
    artworkName: artwork.name,
    angle,
    zoneId: zone.id,
    x: geo.x,
    y: geo.y,
    width: w,
    height,
    rotation: finalRotation,
    corners: geo.corners,
    opacity: 1,
    // The admin's "Reset" controls restore to this snapshot, never back to
    // a hardcoded default — so resetting after re-zoning (handleRezone)
    // or duplicating (duplicatePlacement) restores to THAT action's own
    // starting point, not the very first suggestion from hours ago.
    original: { x: geo.x, y: geo.y, width: w, height, rotation: finalRotation, corners: geo.corners },
  }
}

/**
 * Clones a placement as an independent new print: new id, nudged a little
 * so it doesn't sit exactly on top of the original (making it obvious a
 * duplicate was made and immediately draggable apart), same artwork,
 * angle, size and rotation otherwise. Never touches the source placement.
 */
export function duplicatePlacement(placement) {
  const OFFSET = 24
  return {
    ...placement,
    id: nextId('placement'),
    x: placement.x + OFFSET,
    y: placement.y + OFFSET,
    original: {
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      rotation: placement.rotation,
      corners: placement.corners,
    },
  }
}

/**
 * Moves one placement up/down the render (z) order among placements on
 * the SAME angle only — swapping it with whichever same-angle placement
 * is the next one up/down, never with a placement on a different angle
 * (angles are rendered independently, so their relative order is
 * meaningless). Array order IS the layer order (see renderMockup, which
 * draws later entries on top), so this is the only thing "layer order"
 * needs to change, and it's exactly what gets persisted on save.
 *
 * @param {Array} placements - the FULL placements array (every angle)
 * @param {string} id
 * @param {'up'|'down'} direction - 'up' = bring forward (draw later/on top)
 */
export function reorderPlacement(placements, id, direction) {
  const target = placements.find((p) => p.id === id)
  if (!target) return placements

  const sameAngleIndices = []
  placements.forEach((p, i) => {
    if (p.angle === target.angle) sameAngleIndices.push(i)
  })
  const globalIndex = placements.findIndex((p) => p.id === id)
  const posInGroup = sameAngleIndices.indexOf(globalIndex)
  const swapGroupPos = direction === 'up' ? posInGroup + 1 : posInGroup - 1
  if (swapGroupPos < 0 || swapGroupPos >= sameAngleIndices.length) return placements

  const i1 = sameAngleIndices[posInGroup]
  const i2 = sameAngleIndices[swapGroupPos]
  const next = placements.slice()
  const tmp = next[i1]
  next[i1] = next[i2]
  next[i2] = tmp
  return next
}

/**
 * The ONLY boundary free drag/resize respects: the real photo's own
 * canvas. Deliberately does NOT look at the placement's `zoneId` or any
 * zone/torso "safe area" — a zone quad is only ever used once, to seed
 * where a print starts (see placementAtZone and MockupStudio's
 * "Position" dropdown / handleRezone), never to restrict where the
 * admin drags or resizes it afterwards. That's the distinction the
 * editor draws between "AI/zone suggests a starting placement" and
 * "admin has 100% manual control from then on": once a print exists,
 * this function's only job is to stop it from being dragged fully off
 * the visible garment image or resized to nothing/absurdly huge — never
 * to pull it back toward a chest-only or predefined print position.
 *
 * `margin` lets the print's center slide a bit past the photo's edge
 * (so a sleeve/hem print can bleed off the edge like a real transfer
 * can) without ever vanishing off-canvas or snapping back.
 */
export function clampPlacement(placement, photoWidth, photoHeight) {
  const MIN_SIZE = 12
  const MAX_SIZE = Math.max(photoWidth, photoHeight) * 4
  const width = Math.max(MIN_SIZE, Math.min(placement.width, MAX_SIZE))
  const height = Math.max(MIN_SIZE, Math.min(placement.height, MAX_SIZE))
  const halfW = width / 2
  const halfH = height / 2
  const margin = 0.6 // fraction of the print's own half-size allowed to hang past the canvas edge
  return {
    ...placement,
    width,
    height,
    x: Math.min(Math.max(placement.x, -halfW * margin), photoWidth + halfW * margin),
    y: Math.min(Math.max(placement.y, -halfH * margin), photoHeight + halfH * margin),
  }
}

/** Nudges one corner of a placement's perspective quad — the "perspective adjustment" handle. */
export function updateCorner(placement, index, dx, dy) {
  const corners = (placement.corners || [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }, { dx: 0, dy: 0 }]).map((c) => ({ ...c }))
  corners[index] = { dx: (corners[index]?.dx || 0) + dx, dy: (corners[index]?.dy || 0) + dy }
  return { ...placement, corners }
}

// ---- color helpers (garment shading) --------------------------------

function hexToRgb(hex) {
  const clean = (hex || '#7a7a7a').replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16) || 0x7a7a7a
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

function rgbToHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Mixes a hex color toward white (positive amount) or black (negative), amount in [-1, 1]. */
export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  const target = amount >= 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 }
  const t = Math.min(1, Math.abs(amount))
  return rgbToHex({
    r: r + (target.r - r) * t,
    g: g + (target.g - g) * t,
    b: b + (target.b - b) * t,
  })
}

/** Relative luminance (0–1), used to decide whether guide text/icons should be light or dark. */
export function luminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

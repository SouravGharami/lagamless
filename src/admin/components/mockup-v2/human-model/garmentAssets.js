/**
 * STEP 3 — generation-ready GARMENT assets.
 *
 * The Mockup Studio compositor stays the single source of truth: finishedTshirtSnapshot.renderFinishedTshirt()
 * already renders each view with the EXISTING renderFinalView and keeps the resulting PNG Blob. This module
 * does NOT render and does NOT alter a pixel. It only VERIFIES those renders and arranges stable references:
 *
 *   garment = {
 *     front?:       { view, blob, width, height, mimeType, bytes, objectUrl, surfaces }   // the FRONT view's render
 *     back?:        { ... }                                                              // the BACK view's render
 *     views:        { FRONT, BACK, THREE_QUARTER_FRONT, ... }                            // every rendered view
 *     leftSleeve?:  { kind: 'embedded_in_view', view, layerIds, layerCount }
 *     rightSleeve?: { kind: 'embedded_in_view', view, layerIds, layerCount }
 *   }
 *
 * Sleeves: this project has no separate sleeve photo/render. Sleeve artwork is a print area INSIDE a view's
 * render (usually FRONT), so a sleeve entry is a reference to that render, never a second image. A surface
 * with no visible artwork is simply absent ("only include surfaces that actually exist").
 */
import { SURFACE_KEYS } from '../mockupStudioState.js'
import { EXPORT_ERROR, GarmentAssetError } from './exportSafety.js'
import { summarizePixels, QUALITY_LIMITS } from './humanModelQuality.js'

const SIZE_TOLERANCE_PX = 1

/**
 * Browser default: decode the Blob and sample it on a tiny canvas. Blob URLs are same-origin, so this canvas can
 * never be tainted. Resolves { width, height, pixels }. Tests inject their own `inspect`.
 */
export async function inspectBlobInBrowser(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('The rendered image could not be decoded.'))
      el.src = url
    })
    const w = img.naturalWidth
    const h = img.naturalHeight
    const scale = Math.min(1, QUALITY_LIMITS.sampleSide / Math.max(w, h))
    const sw = Math.max(1, Math.round(w * scale))
    const sh = Math.max(1, Math.round(h * scale))
    const canvas = Object.assign(document.createElement('canvas'), { width: sw, height: sh })
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, sw, sh)
    return { width: w, height: h, pixels: summarizePixels(ctx.getImageData(0, 0, sw, sh).data) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Reads the Blob behind a session object URL when the snapshot didn't carry it (older snapshots). */
async function blobFromRender(render) {
  if (render.blob instanceof Blob) return render.blob
  if (render.url && typeof fetch === 'function') {
    const res = await fetch(render.url)
    return res.blob()
  }
  return null
}

const fail = (view, code, message, technical) => ({ view, code, message, technical: technical ?? message })

/** Surfaces (front / back / leftSleeve / rightSleeve) that have a visible layer inside THIS view's render. */
function surfacesInView(snapshot, view) {
  return SURFACE_KEYS.filter((key) => snapshot.surfaces[key].artworkLayers.some((l) => l.view === view && l.inRender))
}

/**
 * Every visible layer whose view has a photo must be inside a rendered view, otherwise artwork was lost on the
 * way to the garment image. Returns the layers that are not (empty array = artwork preserved).
 */
export function findUnrenderedArtwork(snapshot) {
  const out = []
  for (const key of SURFACE_KEYS) {
    for (const layer of snapshot.surfaces[key].artworkLayers) {
      if (layer.visible === false) continue
      if (!snapshot.views[layer.view]) continue // view without a T-shirt photo: flagged by snapshot.warnings, never part of a render
      if (!layer.inRender || snapshot.renderedComposition[layer.view]?.status !== 'rendered') out.push({ id: layer.id, name: layer.name, view: layer.view, surface: key })
    }
  }
  return out
}

/**
 * Verifies every rendered view and returns the stable garment structure. NEVER throws and never returns a
 * blank image: anything wrong becomes a structured failure.
 *
 * @returns {Promise<{ ok: boolean, garment: object|null, failures: object[], artworkPreserved: boolean, unrenderedArtwork: object[] }>}
 */
export async function prepareGarmentAssets(snapshot, { inspect = inspectBlobInBrowser } = {}) {
  const failures = []
  const entries = {}

  const rendered = Object.entries(snapshot?.renderedComposition ?? {}).filter(([, r]) => r.status === 'rendered')
  if (!snapshot || rendered.length === 0) {
    failures.push(fail(null, EXPORT_ERROR.NO_RENDER, 'The finished T-shirt has no rendered image.'))
    return { ok: false, garment: null, failures, artworkPreserved: false, unrenderedArtwork: [] }
  }

  for (const [view, render] of rendered) {
    const label = snapshot.views[view]?.label ?? view
    try {
      const blob = await blobFromRender(render)
      if (!blob) { failures.push(fail(view, EXPORT_ERROR.NO_RENDER, `${label}: the rendered image is missing.`)); continue }
      if (!(blob.size > 0)) { failures.push(fail(view, EXPORT_ERROR.EMPTY_BLOB, `${label}: the rendered image is empty (0 bytes).`)); continue }

      let probe
      try {
        probe = await inspect(blob)
      } catch (err) {
        failures.push(fail(view, EXPORT_ERROR.UNREADABLE_BLOB, `${label}: the rendered image could not be read back.`, err?.message))
        continue
      }
      if (!(probe.width > 0) || !(probe.height > 0)) { failures.push(fail(view, EXPORT_ERROR.UNREADABLE_BLOB, `${label}: the rendered image has no readable size.`)); continue }
      if (probe.pixels && (probe.pixels.fullyTransparent || probe.pixels.uniform)) {
        failures.push(fail(view, EXPORT_ERROR.BLANK_RENDER, `${label}: the rendered garment image is blank.`, `sampled pixels: ${JSON.stringify(probe.pixels)}`))
        continue
      }
      if (Math.abs(probe.width - render.width) > SIZE_TOLERANCE_PX || Math.abs(probe.height - render.height) > SIZE_TOLERANCE_PX) {
        failures.push(fail(view, EXPORT_ERROR.UNREADABLE_BLOB, `${label}: the rendered image size does not match the renderer's report.`, `blob ${probe.width}x${probe.height} vs render ${render.width}x${render.height}`))
        continue
      }

      entries[view] = {
        view,
        label,
        blob,
        width: probe.width,
        height: probe.height,
        mimeType: blob.type || render.mimeType || 'image/png',
        bytes: blob.size,
        objectUrl: render.url ?? null, // session-only preview URL owned by the snapshot — do NOT revoke here
        surfaces: surfacesInView(snapshot, view),
        sourceAsset: render.sourceAsset ?? null,
        downscaled: !!render.downscaled,
      }
    } catch (err) {
      failures.push(fail(view, EXPORT_ERROR.RENDER_FAILED, `${label}: ${err?.message || 'could not be verified'}`, err?.stack))
    }
  }

  const unrenderedArtwork = findUnrenderedArtwork(snapshot)
  if (failures.length > 0 || Object.keys(entries).length === 0) {
    return { ok: false, garment: null, failures, artworkPreserved: unrenderedArtwork.length === 0, unrenderedArtwork }
  }

  const garment = { views: entries }
  if (entries.FRONT) garment.front = entries.FRONT
  if (entries.BACK) garment.back = entries.BACK
  for (const key of ['leftSleeve', 'rightSleeve']) {
    const layers = snapshot.surfaces[key].artworkLayers.filter((l) => l.inRender && entries[l.view])
    if (layers.length === 0) continue
    garment[key] = { kind: 'embedded_in_view', view: layers[0].view, views: [...new Set(layers.map((l) => l.view))], layerIds: layers.map((l) => l.id), layerCount: layers.length }
  }
  return { ok: true, garment, failures: [], artworkPreserved: unrenderedArtwork.length === 0, unrenderedArtwork }
}

/** Throwing variant for callers that prefer exceptions. */
export async function prepareGarmentAssetsOrThrow(snapshot, options) {
  const res = await prepareGarmentAssets(snapshot, options)
  if (!res.ok) throw new GarmentAssetError(res.failures)
  return res
}

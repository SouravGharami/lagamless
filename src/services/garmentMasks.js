import { detectGarment } from '../admin/components/mockup-v2/garment-detection/detectGarment.js'
import { decodePhotoForDetection, buildMaskBlob } from '../admin/components/mockup-v2/garment-detection/garmentMaskIO.js'
import { garmentMaskPathFor, garmentMaskUrlFor, storagePathFromPublicUrl } from '../lib/garmentRecolor/maskPaths.js'
import { getProductImagePublicUrl } from '../lib/supabase.js'
import { uploadProductImageAtPath, deleteProductImageFiles } from './productImages.js'

/**
 * Per-photo T-shirt masks (admin side).
 *
 * Every gallery photo — front, back, side, 3/4, detail, fabric — gets its OWN mask, built from that photo's own pixels
 * when the product is saved, and stored next to the photo (see lib/garmentRecolor/maskPaths.js for the naming). The
 * storefront colour switcher recolors only inside that mask, so what counts as "the T-shirt" is decided once, here,
 * per picture, instead of being re-guessed in every shopper's browser.
 *
 * Mask PNG: opaque, white = garment (printed graphics included — the recolor protects the artwork separately by its
 * colour), black = everything else, at the photo's aspect ratio and at most MASK_MAX_SIDE px on the long side.
 */
const MASK_MAX_SIDE = 1600
/** Gallery slots that are close-ups of fabric/print with no backdrop around the garment. */
const CLOSE_UP_SLOTS = new Set(['detail', 'fabric'])

/** Builds the mask PNG for one photo. Never throws: returns { ok:false, reason } when no T-shirt is found. */
export async function buildGarmentMask(photoUrl, { baseColorHex = null, slotKey = '' } = {}) {
  try {
    const photo = await decodePhotoForDetection(photoUrl)
    const det = detectGarment(photo, { fabricHint: baseColorHex, fillsFrame: CLOSE_UP_SLOTS.has(slotKey) })
    if (!det.ok) return { ok: false, reason: det.stats?.warnings?.[0] || 'No T-shirt found in this photo.' }
    const s = Math.min(1, MASK_MAX_SIDE / Math.max(photo.naturalWidth, photo.naturalHeight))
    const width = Math.max(1, Math.round(photo.naturalWidth * s))
    const height = Math.max(1, Math.round(photo.naturalHeight * s))
    const blob = await buildMaskBlob(det, width, height)
    return { ok: true, blob, coverage: det.stats?.coverage ?? null }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'Could not build the garment mask.' }
  }
}

async function maskExists(maskUrl) {
  if (!maskUrl) return false
  try {
    const res = await fetch(maskUrl, { method: 'HEAD', cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Makes sure one saved photo has its mask. A newly uploaded/replaced photo always gets a fresh mask; an unchanged photo
 * only gets one if it has none yet (this is also how photos saved before masks existed get theirs, on the next save).
 * Never throws — a failed mask must not fail the product save; the storefront then shows that photo uncolored rather
 * than recoloring it wrongly.
 *
 * @returns {Promise<{ status: 'created'|'kept'|'failed'|'skipped', reason?: string }>}
 */
export async function ensureGarmentMask({ slotKey, storagePath, src, pendingFile, baseColorHex }) {
  try {
    const photoPath = storagePath || storagePathFromPublicUrl(src)
    const maskPath = garmentMaskPathFor(photoPath)
    if (!maskPath) return { status: 'skipped', reason: 'Photo is not stored in the product-images bucket.' }

    if (!pendingFile && (await maskExists(garmentMaskUrlFor(getProductImagePublicUrl(photoPath))))) return { status: 'kept' }

    const photoUrl = pendingFile ? URL.createObjectURL(pendingFile) : src
    if (!photoUrl) return { status: 'skipped' }
    let result
    try {
      result = await buildGarmentMask(photoUrl, { baseColorHex, slotKey })
    } finally {
      if (pendingFile) URL.revokeObjectURL(photoUrl)
    }
    if (!result.ok) {
      console.warn(`[garment-mask] ${slotKey}: ${result.reason}`)
      return { status: 'failed', reason: result.reason }
    }
    await uploadProductImageAtPath(maskPath, result.blob)
    return { status: 'created' }
  } catch (err) {
    console.warn(`[garment-mask] ${slotKey}:`, err)
    return { status: 'failed', reason: err instanceof Error ? err.message : String(err) }
  }
}

/** Removes the mask files that belong to these photo storage paths (best effort). */
export async function deleteGarmentMasks(photoStoragePaths) {
  const paths = (photoStoragePaths || []).map(garmentMaskPathFor).filter(Boolean)
  if (paths.length) await deleteProductImageFiles(paths).catch(() => {})
}

/**
 * Uploaded DTF artwork store.
 *
 * Placements save cleanly into the product's `mockupConfig` (see
 * MockupStudio/ProductForm) — every geometry field (x, y, width, height,
 * rotation, corners, angle, artworkId, layer) round-trips through that
 * config already. What it can't carry on its own is the actual artwork
 * *image* the placement points at (`artworkId` is just an id) — without
 * somewhere to persist that pixel data, reopening a product used to force
 * a manual re-upload of the exact matching DTF file before its saved
 * placements would render again.
 *
 * This module closes that gap the same intentionally-simple way
 * templatePhotoStore.js does for garment photos: localStorage, keyed by
 * artwork id, storing the untouched original data URL plus the same
 * metadata analyzeArtwork() produces. Every placement operation in the
 * studio (move/resize/rotate/duplicate/reset) only ever touches the
 * placement's geometry — the artwork record saved here is written once,
 * on upload, and never mutated, so the exact original DTF file a real
 * print order pulls from is always available untouched.
 *
 * Same tradeoff as templatePhotoStore.js: fine for admin use today with
 * zero backend changes, per-browser, with a storage ceiling. Move to real
 * object storage (Supabase Storage, etc.) before relying on this for
 * production scale — every caller goes through the three functions below,
 * never `localStorage` directly, so that swap stays contained here.
 */

const STORAGE_KEY = 'lagamless:mockup-artworks:v1'

function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(map) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Most likely quota exceeded (DTF PNGs as data URLs are large). Never
    // let this break the upload/editing flow — the artwork still works
    // for the rest of this session, it just won't survive a reload.
  }
}

/** Persists one analyzed artwork record (never mutates the caller's object). */
export function saveArtwork(artwork) {
  if (!artwork?.id) return
  const all = readAll()
  all[artwork.id] = {
    id: artwork.id,
    name: artwork.name,
    dataUrl: artwork.dataUrl,
    naturalWidth: artwork.naturalWidth,
    naturalHeight: artwork.naturalHeight,
    trimmed: artwork.trimmed,
    aspectRatio: artwork.aspectRatio,
    coverage: artwork.coverage,
    hasTransparency: artwork.hasTransparency,
    suggestion: artwork.suggestion,
  }
  writeAll(all)
}

/** @returns {object|null} the previously-saved artwork record, or null if it was never saved / storage was cleared. */
export function getArtwork(id) {
  if (!id) return null
  return readAll()[id] || null
}

export function removeArtwork(id) {
  if (!id) return
  const all = readAll()
  delete all[id]
  writeAll(all)
}

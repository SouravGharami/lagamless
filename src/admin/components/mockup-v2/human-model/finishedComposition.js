/**
 * INTEGRATION BOUNDARY — Mockup Studio -> Human Model Studio.
 *
 *   Existing Mockup Studio state (read only)
 *         ↓   buildFinishedCompositionRef()
 *   Finished Composition reference (serializable)
 *         ↓
 *   Human Model Studio
 *
 * This is a thin ADAPTER. It never renders, never mutates studio state and never re-implements
 * placement: it reuses serializeComposition (mockupStudioState) and exportableViews (compositing).
 * A later step can hand `renderSnapshot` to the existing renderer (compositing/finalRender.js) to
 * produce the actual flat image; nothing is rendered here.
 */
import { SURFACE_KEYS, allArtworks, serializeComposition } from '../mockupStudioState.js'
import { exportableViews } from '../compositing/index.js'

/** Small, stable string hash (djb2) — identifies a composition, not a security primitive. */
function hashString(text) {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** True when the studio holds a real finished T-shirt: a photo with at least one visible artwork layer placed on it. */
export function hasFinishedComposition(state) {
  const withPhoto = new Set(exportableViews(state).map((v) => v.view))
  return allArtworks(state.composition).some((layer) => layer.visible !== false && withPhoto.has(layer.view))
}

/** Serializable reference to the finished T-shirt. Blob URLs inside are session-only. */
export function buildFinishedCompositionRef(state) {
  const serialized = serializeComposition(state)
  const views = exportableViews(state)
  const finished = hasFinishedComposition(state)
  const { garment } = state.generation

  return {
    schemaVersion: 1,
    // Changes whenever the T-shirt, artwork, placement or background changes.
    compositionId: finished ? `composition-${hashString(JSON.stringify(serialized))}` : null,
    hasFinishedComposition: finished,

    tshirt: {
      type: garment.type,
      color: garment.color,
      source: serialized.tshirt, // { originalUrl, processedUrl, backgroundRemoved } of the active view
      viewPhotos: serialized.viewPhotos, // other views' photos
    },

    activeView: serialized.activeView,
    views, // [{ view, label, layers }] — every view that has a photo

    // Artwork layers and their placement, per surface (front / back / sleeves) — straight from the studio's own serializer.
    artwork: Object.fromEntries(SURFACE_KEYS.map((key) => [key, serialized.surfaces[key].artworks])),

    background: serialized.background,
    tshirtPresentation: serialized.tshirtPresentation,

    // Flat render of the finished T-shirt. Not produced in Step 1 (no rendering happens here).
    renderSnapshot: { status: 'not_rendered', url: null, width: null, height: null },
  }
}

/** Short human summary for the UI, derived from the reference (never stored). */
export function summarizeFinishedComposition(ref) {
  const layerCount = SURFACE_KEYS.reduce((n, key) => n + ref.artwork[key].length, 0)
  return {
    layerCount,
    viewCount: ref.views.length,
    surfacesWithArtwork: SURFACE_KEYS.filter((key) => ref.artwork[key].length > 0),
  }
}

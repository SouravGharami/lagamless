/**
 * Step 5-1 — artwork REGIONS. A region is a named print area on the garment. It maps 1:1 onto
 * the existing studio "surface" (composition.surfaces[surface].artworks), so the current artwork
 * editor stays the single source of truth: regions are DERIVED from it, never stored twice.
 * A mockup may use any number of regions at once (front + back + sleeve ...), and a region may
 * hold several artworks. Geometry is copied unchanged: % of the T-shirt box, degrees, opacity 0-1.
 */
export const ARTWORK_REGIONS = Object.freeze({
  FRONT: 'FRONT',
  BACK: 'BACK',
  LEFT_SLEEVE: 'LEFT_SLEEVE',
  RIGHT_SLEEVE: 'RIGHT_SLEEVE',
})

export const REGION_DEFS = Object.freeze([
  { id: 'FRONT', label: 'Front', surface: 'front' },
  { id: 'BACK', label: 'Back', surface: 'back' },
  { id: 'LEFT_SLEEVE', label: 'Left sleeve', surface: 'leftSleeve' },
  { id: 'RIGHT_SLEEVE', label: 'Right sleeve', surface: 'rightSleeve' },
].map(Object.freeze))

export const REGION_IDS = REGION_DEFS.map((r) => r.id)
export const isRegion = (id) => REGION_IDS.includes(id)
export const regionForSurface = (surface) => REGION_DEFS.find((r) => r.surface === surface)?.id ?? null
export const surfaceForRegion = (region) => REGION_DEFS.find((r) => r.id === region)?.surface ?? null

/** One artwork placement inside a region (a plain, serialisable snapshot of an existing layer). */
export function createRegionPlacement(layer) {
  return {
    artworkId: layer.id,
    sourceId: layer.sourceId ?? null,
    name: layer.name ?? '',
    x: layer.x, y: layer.y, width: layer.width, height: layer.height, // % of the T-shirt box (top-left origin)
    rotation: layer.rotation ?? 0,
    opacity: layer.opacity ?? 1,
    visible: layer.visible !== false,
    position: { x: layer.x, y: layer.y }, // convenience alias of x / y
    scale: { width: layer.width, height: layer.height }, // convenience alias of width / height
  }
}

/** { FRONT: [...], BACK: [...], LEFT_SLEEVE: [...], RIGHT_SLEEVE: [...] } from the studio composition. Empty regions stay [] . */
export function describeArtworkRegions(composition, { includeHidden = false } = {}) {
  const out = {}
  for (const { id, surface } of REGION_DEFS) {
    const view = composition?.activeView ?? 'FRONT' // Step 5-3C: describe the view being edited
    const layers = (composition?.surfaces?.[surface]?.artworks ?? []).filter((l) => (l.view ?? 'FRONT') === view)
    out[id] = layers.filter((l) => includeHidden || l.visible !== false).map(createRegionPlacement)
  }
  return out
}

/** Regions that actually carry artwork — a mockup can have several. */
export const activeRegions = (regions) => REGION_IDS.filter((id) => (regions?.[id]?.length ?? 0) > 0)

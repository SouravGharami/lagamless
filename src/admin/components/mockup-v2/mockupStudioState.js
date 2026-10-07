/**
 * LAGAMLESS Mockup Studio v2 — state model.
 *
 * Three kinds of data are kept apart on purpose:
 *
 *   sourceAssets   Uploaded inputs: the T-shirt photo and an optional
 *                  background image. Never edited by composition changes.
 *   composition    How things are arranged: artwork layers (position, size,
 *                  rotation, surface), the active surface and the chosen
 *                  background. This is what a later stage will persist and
 *                  what the renderer will consume.
 *   finalMockups   Generated output images. Reserved and always empty until
 *                  the generation stage exists.
 *
 * Geometry units (artwork layers): x, y, width and height are PERCENTAGES of
 * the T-shirt image box (0-100), so a layout is independent of screen size.
 * x/y is the layer's top-left corner. Rotation is degrees, opacity is 0-1.
 * Artwork lives in `composition.surfaces[surface].artworks` — four independent
 * collections (front, back, leftSleeve, rightSleeve). Array order inside one
 * surface is its stacking order (last = on top); order is never shared across surfaces.
 * `realism` (0-100, default 50) is the per-layer fabric integration strength; `warp` (0-100, default 35) is the per-layer surface warp strength. Neither is a transform (Reset leaves them alone).
 * Step 5-3C — VIEWS. A view is a mockup angle (generation/mockupAngles.js: FRONT, THREE_QUARTER_FRONT, SIDE, BACK, ...). Every artwork
 * layer is one PLACEMENT in exactly one view (`view`); `groupId` ties the placements of the same artwork together (the same source
 * image, never copied). Each placement owns its own geometry, opacity, `realism`, `warp`, visibility and lock, so nothing edited in one
 * view can change another. `composition.activeView` selects which placements the editor shows; the active view's photo and masks live
 * in sourceAssets.tshirt / tshirtMask / designMask and other views' are parked in sourceAssets.viewPhotos (swapped on SET_VIEW).
 * `aspectLocked` (default true) makes width/height edits keep the layer's current ratio.
 *
 * Nothing here touches localStorage or the database. Image URLs are
 * in-memory blob: URLs owned by the launcher (see MockupStudioLauncher).
 */

import { wrapDegrees } from './artworkTransform.js'
import { DEFAULT_REALISM } from './compositing/placement.js'
import { DEFAULT_WARP } from './compositing/surfaceWarp.js'
import { BACKGROUND_MODES, DEFAULT_BACKGROUND, isGradientDirection, normalizeHex } from './backgroundStyle.js'

import { getPreset } from './backgroundPresets.js'
import { DEFAULT_PRESENTATION, clampPresentation, clampScale } from './tshirtPresentation.js'
import { createInitialGenerationState } from './generation/generationState.js'
import { isAngle, ANGLE_DEFS, DEFAULT_ANGLE } from './generation/mockupAngles.js'
import { canTransition } from './generation/generationStatus.js'
import { isTemplateUsable } from './generation/templateModel.js'
import { templateRegistry } from './generation/templateRegistry.js'
import { providerRegistry } from './generation/generationProvider.js'
import { QUALITY_LEVELS, OUTPUT_FORMATS } from './generation/generationRequest.js'

export { BACKGROUND_MODES }

export const SURFACES = [
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'leftSleeve', label: 'Left sleeve' },
  { key: 'rightSleeve', label: 'Right sleeve' },
]

export const SURFACE_KEYS = SURFACES.map((s) => s.key)

const LEGACY_SURFACE = { 'left-sleeve': 'leftSleeve', 'right-sleeve': 'rightSleeve' }
/** Maps any input to exactly one valid surface key (legacy names migrated, anything else -> 'front'). */
export function normalizeSurface(value) {
  if (SURFACE_KEYS.includes(value)) return value
  return LEGACY_SURFACE[value] ?? 'front'
}

export function emptySurfaces() {
  return { front: { artworks: [] }, back: { artworks: [] }, leftSleeve: { artworks: [] }, rightSleeve: { artworks: [] } }
}

/**
 * Migration layer: accepts the older flat `composition.artworks` list (with
 * 'left-sleeve' style names) or a surfaces map, and returns a valid surfaces
 * map where every artwork's `surface` matches the collection holding it.
 * Transform values are carried over untouched.
 */
export function normalizeSurfaces(composition) {
  const out = emptySurfaces()
  const place = (art, fallback) => {
    if (!art || typeof art !== 'object') return
    const surface = normalizeSurface(art.surface ?? fallback)
    out[surface].artworks.push({ ...art, surface, view: isAngle(art.view) ? art.view : DEFAULT_ANGLE, groupId: art.groupId ?? art.id })
  }
  if (composition?.surfaces) {
    SURFACE_KEYS.forEach((key) => (composition.surfaces[key]?.artworks || []).forEach((a) => place(a, key)))
  }
  if (Array.isArray(composition?.artworks)) composition.artworks.forEach((a) => place(a))
  return out
}

/** Every artwork across all surfaces (surface order, then stacking order). */
export function allArtworks(composition) {
  return SURFACE_KEYS.flatMap((key) => composition.surfaces[key].artworks)
}

export function findArtwork(composition, id) {
  if (!id) return null
  return allArtworks(composition).find((a) => a.id === id) || null
}

/** Replaces one surface's artwork list immutably. */
function withSurfaceArtworks(composition, surface, artworks) {
  return { ...composition, surfaces: { ...composition.surfaces, [surface]: { ...composition.surfaces[surface], artworks } } }
}

/** Per-surface artwork counts, derived from state (never stored). */
export function surfaceCounts(composition) {
  const view = composition.activeView ?? DEFAULT_ANGLE
  return Object.fromEntries(SURFACE_KEYS.map((key) => [key, composition.surfaces[key].artworks.filter((a) => (a.view ?? DEFAULT_ANGLE) === view).length]))
}

/**
 * Serialisable snapshot of the studio composition (state is the source of truth).
 * Blob URLs are session-only; nothing is persisted yet.
 */
export function serializeComposition(state) {
  const t = state.sourceAssets.tshirt
  return {
    tshirtPresentation: { ...state.composition.tshirtPresentation },
    background: {
      ...state.composition.background,
      image: state.sourceAssets.backgroundImage
        ? { name: state.sourceAssets.backgroundImage.name, sourceUrl: state.sourceAssets.backgroundImage.sourceUrl }
        : null,
    },
    tshirt: t
      ? { originalUrl: t.originalUrl, processedUrl: t.processedUrl, backgroundRemoved: t.backgroundRemoved }
      : null,
    activeView: state.composition.activeView ?? DEFAULT_ANGLE,
    viewPhotos: Object.fromEntries(
      Object.entries(state.sourceAssets.viewPhotos ?? {}).filter(([, v]) => v.tshirt).map(([angle, v]) => [angle, { originalUrl: v.tshirt.originalUrl, processedUrl: v.tshirt.processedUrl, backgroundRemoved: v.tshirt.backgroundRemoved }]),
    ),
    surfaces: Object.fromEntries(
      SURFACE_KEYS.map((key) => [
        key,
        {
          artworks: state.composition.surfaces[key].artworks.map((a) => ({
            id: a.id, groupId: a.groupId ?? a.id, view: a.view ?? DEFAULT_ANGLE, name: a.name, sourceUrl: a.sourceUrl, surface: a.surface,
            x: a.x, y: a.y, width: a.width, height: a.height, rotation: a.rotation,
            opacity: a.opacity, realism: a.realism ?? DEFAULT_REALISM, warp: a.warp ?? DEFAULT_WARP, visible: a.visible, locked: a.locked,
          })),
        },
      ]),
    ),
  }
}

let idCounter = 0
export function makeId(prefix) {
  idCounter += 1
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${idCounter}-${rand}`
}

export function createInitialState() {
  return {
    sourceAssets: {
      tshirt: null, // see createTshirt()
      // Uploaded DTF images, one entry per file: { id, name, url, width, height }.
      // Layers reference these by `sourceId`; duplicating a layer never copies
      // the image. A source is dropped once no layer uses it.
      artworkSources: [],
      backgroundImage: null, // { id, name, sourceUrl, width, height }
      // Step 5-2: the person's own T-shirt photo, parked while a library template's photo is loaded (so selection is reversible).
      tshirtBeforeTemplate: null,
      // Step 5-3A: black/white masks, same pixel size as the T-shirt photo. { id, name, url, width, height } or null.
      tshirtMask: null, // white = garment (allowed), black = protected
      designMask: null, // optional printable region; when null the T-shirt mask is the printable region
      // Step 5-3C: photo + masks of the views that are NOT being edited, { [angle]: { tshirt, tshirtMask, designMask, tshirtBeforeTemplate } }.
      viewPhotos: {},
    },
    composition: {
      surfaces: emptySurfaces(),
      background: { ...DEFAULT_BACKGROUND },
      // Where/how big the T-shirt sits in the composition frame (Step 4A-2). See tshirtPresentation.js.
      tshirtPresentation: { ...DEFAULT_PRESENTATION },
      activeSurface: 'front',
      activeView: DEFAULT_ANGLE, // Step 5-3C
      selectedArtworkId: null,
    },
    // Step 5-1: realistic-mockup generation CHOICES (template, angle, garment facts, settings). Never touches composition.
    generation: createInitialGenerationState(),
    finalMockups: [],
    ui: { previewMode: false, notice: null },
  }
}

/** Builds the T-shirt model from a loaded image asset. */
export function createTshirt(asset) {
  return {
    id: makeId('tshirt'),
    name: asset.name,
    sourceUrl: asset.url,
    originalUrl: asset.url,
    processedUrl: null, // transparent cut-out; kept once made so the user can toggle
    width: asset.width,
    height: asset.height,
    // true = the cut-out is the version currently shown. The cut-out itself
    // survives "Restore original" (processedUrl stays set).
    backgroundRemoved: false,
    bgStatus: 'idle', // 'idle' | 'processing' | 'failed'
    bgError: null,
    // How the garment photo's own background is treated: 'original' until a
    // cut-out exists. (The scene BEHIND the garment in final mockups is
    // composition.background, a separate concept.)
    backgroundMode: 'original',
  }
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, n))

/** Layer height (in % of shirt height) that preserves the artwork's aspect for a given width %. */
function heightForWidth(widthPct, artAspect, tshirt) {
  const shirtAspect = tshirt ? tshirt.width / tshirt.height : 1
  return (widthPct * shirtAspect) / artAspect
}
/** Fits (w, h) into the allowed size range while keeping their ratio. */
function fitSize(w, h) {
  let s = Math.min(1, 300 / w, 300 / h)
  s = Math.max(s, 1 / w, 1 / h)
  return { width: round(w * s), height: round(h * s) }
}

const DEFAULT_WIDTH = { front: 34, back: 40, leftSleeve: 16, rightSleeve: 16 }
const DEFAULT_TOP = { front: 24, back: 20, leftSleeve: 22, rightSleeve: 22 }

/** Starting placement for a layer on a surface: horizontally centred, sized by surface. */
export function defaultPlacement(surface, artAspect, tshirt) {
  const width = DEFAULT_WIDTH[surface] ?? 30
  const height = heightForWidth(width, artAspect, tshirt)
  return {
    x: round((100 - width) / 2),
    y: DEFAULT_TOP[surface] ?? 24,
    width: round(width),
    height: round(height),
    rotation: 0,
    opacity: 1,
  }
}

function round(n) {
  return Math.round(n * 100) / 100
}

export function createArtworkSource(asset) {
  return {
    id: makeId('source'),
    name: asset.name,
    url: asset.url, // the untouched upload; never modified
    width: asset.width,
    height: asset.height,
    // Artwork background removal: the transparent cut-out lives beside the original so either can be shown again.
    processedUrl: null,
    backgroundRemoved: false, // true = layers currently show processedUrl
    bgStatus: 'idle', // 'idle' | 'processing' | 'failed'
    bgError: null,
    bgMethod: null, // 'ai' | 'solid'
    bgOptions: null, // { tolerance, enclosed } for 'solid'
  }
}

/** Patches one artwork source. */
function patchSource(state, sourceId, patch) {
  const list = state.sourceAssets.artworkSources
  if (!list.some((s) => s.id === sourceId)) return state
  return { ...state, sourceAssets: { ...state.sourceAssets, artworkSources: list.map((s) => (s.id === sourceId ? { ...s, ...patch } : s)) } }
}

/** Points every placement of one source (all surfaces, all views) at `url`. Geometry is untouched. */
function setSourceLayersUrl(state, sourceId, url) {
  const composition = state.composition
  const surfaces = Object.fromEntries(
    SURFACE_KEYS.map((key) => [
      key,
      { ...composition.surfaces[key], artworks: composition.surfaces[key].artworks.map((a) => (a.sourceId === sourceId ? { ...a, sourceUrl: url } : a)) },
    ]),
  )
  return { ...state, composition: { ...composition, surfaces } }
}

/** An instance of a source placed on a surface. `sourceUrl` is just the source's blob URL string. */
export function createArtworkLayer(source, name, surface, tshirt, view = DEFAULT_ANGLE) {
  const aspect = source.width / source.height
  const id = makeId('artwork')
  return {
    id,
    groupId: id, // Step 5-3C: shared by every placement of this artwork
    view,
    sourceId: source.id,
    name,
    sourceUrl: source.url,
    naturalWidth: source.width,
    naturalHeight: source.height,
    surface,
    ...defaultPlacement(surface, aspect, tshirt),
    // Step 5-3B-2: how strongly the photo's folds, shadows and texture show through this print (0 = flat, 100 = strongest).
    realism: DEFAULT_REALISM,
    // Step 5-3B-3: how strongly the print follows the shirt's folds (0 = no surface deformation, 100 = maximum safe). Not a transform.
    warp: DEFAULT_WARP,
    visible: true,
    locked: false,
    aspectLocked: true,
  }
}

/** "Logo" -> "Logo copy" -> "Logo copy 2" ... (first name not already taken). */
function duplicateName(name, layers) {
  const base = name.replace(/ copy( \d+)?$/, '')
  const taken = new Set(layers.map((l) => l.name))
  let candidate = `${base} copy`
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base} copy ${n}`
  return candidate
}

/** Applies fn to one artwork, touching only the surface collection that holds it. */
function patchLayer(state, id, fn) {
  const found = findArtwork(state.composition, id)
  if (!found) return state
  const list = state.composition.surfaces[found.surface].artworks
  return {
    ...state,
    composition: withSurfaceArtworks(state.composition, found.surface, list.map((a) => (a.id === id ? fn(a) : a))),
  }
}

function sanitizePatch(patch) {
  const out = {}
  const num = (v) => typeof v === 'number' && Number.isFinite(v)
  if (num(patch.x)) out.x = round(clamp(patch.x, -100, 200))
  if (num(patch.y)) out.y = round(clamp(patch.y, -100, 200))
  if (num(patch.width)) out.width = round(clamp(patch.width, 1, 300))
  if (num(patch.height)) out.height = round(clamp(patch.height, 1, 300))
  if (num(patch.rotation)) out.rotation = round(wrapDegrees(patch.rotation))
  if (num(patch.opacity)) out.opacity = clamp(patch.opacity, 0, 1)
  if (num(patch.realism)) out.realism = round(clamp(patch.realism, 0, 100))
  if (num(patch.warp)) out.warp = round(clamp(patch.warp, 0, 100))
  return out
}

function withTshirt(state, patch) {
  return {
    ...state,
    sourceAssets: { ...state.sourceAssets, tshirt: { ...state.sourceAssets.tshirt, ...patch } },
  }
}

/**
 * Artwork geometry is stored as % of the T-shirt box, so swapping in a photo with a different aspect ratio
 * would stretch every layer. Heights are scaled by the aspect change so each layer keeps its visual proportions
 * and stays anchored at the same x/y. Only the given view's placements (default: the active one) are touched (other views have their own photo).
 */
function rescaleArtworkForPhoto(composition, from, to, view = composition.activeView ?? DEFAULT_ANGLE) {
  if (!from || !to || !(from.width > 0 && from.height > 0 && to.width > 0 && to.height > 0)) return composition
  const ratio = to.width / to.height / (from.width / from.height)
  if (Math.abs(ratio - 1) < 0.005) return composition
  const surfaces = Object.fromEntries(
    SURFACE_KEYS.map((key) => [key, { ...composition.surfaces[key], artworks: composition.surfaces[key].artworks.map((a) => ((a.view ?? DEFAULT_ANGLE) === view ? { ...a, height: round(clamp(a.height * ratio, 1, 300)) } : a)) }]),
  )
  return { ...composition, surfaces }
}

/** A T-shirt whose photograph comes from a library template (the photo itself is untouched). */
function tshirtFromTemplate(template) {
  return { ...createTshirt({ url: template.source.url, name: template.name, width: template.source.width, height: template.source.height }), fromTemplateId: template.id }
}

/** generation slice after the person supplies their own photo: no library template is selected any more. */
const unlinkedGeneration = (state) => (state.sourceAssets.tshirt?.fromTemplateId ? { ...state.generation, templateId: null } : state.generation)

/** Step 5-3C: parks the active view's photo + masks and loads the target view's (or the empty state). Artwork placements are untouched. */
function switchView(state, angle) {
  const current = state.composition.activeView ?? DEFAULT_ANGLE
  if (!isAngle(angle) || angle === current) return state
  const sa = state.sourceAssets
  const parked = { ...sa.viewPhotos, [current]: { tshirt: sa.tshirt, tshirtMask: sa.tshirtMask, designMask: sa.designMask, tshirtBeforeTemplate: sa.tshirtBeforeTemplate } }
  const next = parked[angle] || {}
  delete parked[angle]
  const tshirt = next.tshirt ?? null
  return {
    ...state,
    sourceAssets: { ...sa, viewPhotos: parked, tshirt, tshirtMask: next.tshirtMask ?? null, designMask: next.designMask ?? null, tshirtBeforeTemplate: next.tshirtBeforeTemplate ?? null },
    composition: { ...state.composition, activeView: angle, selectedArtworkId: null },
    // The generation choice follows the view being edited (a library photo that is loaded there stays the selected template).
    // The reverse is not true: picking an angle in the generation panel only records the choice, as before.
    generation: { ...state.generation, angle, templateId: tshirt?.fromTemplateId ?? null },
  }
}

/** Applies fn to the photo record of every view that is not being edited (used when a library photo changes under them). */
function mapParkedPhotos(state, fn) {
  const viewPhotos = Object.fromEntries(Object.entries(state.sourceAssets.viewPhotos ?? {}).map(([angle, v]) => [angle, fn(v)]))
  return { ...state, sourceAssets: { ...state.sourceAssets, viewPhotos } }
}

/** Placements (layers) shown in one view, across all surfaces. */
export function placementsInView(composition, view) {
  return allArtworks(composition).filter((a) => (a.view ?? DEFAULT_ANGLE) === view)
}

/** { [angle]: layer } — the placement of this layer's artwork in each view where it is assigned. */
export function placementsOfArtwork(composition, layer) {
  const out = {}
  for (const a of allArtworks(composition)) {
    if ((a.groupId ?? a.id) === (layer.groupId ?? layer.id)) out[a.view ?? DEFAULT_ANGLE] = a
  }
  return out
}

/** Photo record of a view (the active view reads the live fields). */
export function viewPhoto(state, view) {
  if (view === (state.composition.activeView ?? DEFAULT_ANGLE)) return state.sourceAssets.tshirt
  return state.sourceAssets.viewPhotos?.[view]?.tshirt ?? null
}

/** Per-view counts of placements (derived, never stored). */
export function viewCounts(composition) {
  return Object.fromEntries(ANGLE_DEFS.map((a) => [a.id, placementsInView(composition, a.id).length]))
}

const PER_VIEW_FIELDS = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'realism', 'warp']

export function mockupReducer(state, action) {
  const { composition } = state
  switch (action.type) {
    case 'SET_TSHIRT':
      return {
        ...state,
        sourceAssets: { ...state.sourceAssets, tshirt: createTshirt(action.asset), tshirtBeforeTemplate: null },
        generation: unlinkedGeneration(state),
        ui: { ...state.ui, notice: null },
      }

    case 'BG_START': {
      const t = state.sourceAssets.tshirt
      if (!t || t.id !== action.id || t.bgStatus === 'processing') return state
      return withTshirt(state, { bgStatus: 'processing', bgError: null })
    }

    case 'BG_SUCCESS': {
      const t = state.sourceAssets.tshirt
      if (!t || t.id !== action.id) return state // T-shirt was replaced meanwhile
      return withTshirt(state, {
        processedUrl: action.url,
        backgroundRemoved: true,
        backgroundMode: 'transparent',
        bgStatus: 'idle',
        bgError: null,
      })
    }

    case 'BG_FAIL': {
      const t = state.sourceAssets.tshirt
      if (!t || t.id !== action.id) return state
      return withTshirt(state, { bgStatus: 'failed', bgError: action.message })
    }

    // Switch views without re-running removal. Both keep both images.
    case 'SHOW_ORIGINAL':
      return state.sourceAssets.tshirt
        ? withTshirt(state, { backgroundRemoved: false, backgroundMode: 'original' })
        : state

    case 'SHOW_PROCESSED': {
      const t = state.sourceAssets.tshirt
      if (!t || !t.processedUrl) return state
      return withTshirt(state, { backgroundRemoved: true, backgroundMode: 'transparent' })
    }

    // Clears the studio's T-shirt only. Never touches product images or the DB.
    case 'RESET_TSHIRT':
      return { ...state, sourceAssets: { ...state.sourceAssets, tshirt: null, tshirtBeforeTemplate: null }, generation: unlinkedGeneration(state) }

    case 'ADD_ARTWORK': {
      // Artwork is placed relative to the garment, so a T-shirt must exist first.
      if (!state.sourceAssets.tshirt) return state
      const source = createArtworkSource(action.asset)
      const name =
        !action.asset.name || action.asset.name === 'Untitled'
          ? `Design ${String(allArtworks(composition).length + 1).padStart(2, '0')}`
          : action.asset.name
      const surface = normalizeSurface(composition.activeSurface)
      const layer = createArtworkLayer(source, name, surface, state.sourceAssets.tshirt, composition.activeView ?? DEFAULT_ANGLE)
      return {
        ...state,
        sourceAssets: { ...state.sourceAssets, artworkSources: [...state.sourceAssets.artworkSources, source] },
        composition: {
          ...withSurfaceArtworks(composition, surface, [...composition.surfaces[surface].artworks, layer]),
          selectedArtworkId: layer.id,
        },
        ui: { ...state.ui, notice: null },
      }
    }

    // ---- Artwork background removal. Only the displayed image changes (layer.sourceUrl); position, size, rotation, warp and
    // fabric settings of every placement are preserved. The original upload is never modified. ----
    case 'ART_BG_START': {
      const src = state.sourceAssets.artworkSources.find((s) => s.id === action.sourceId)
      if (!src || src.bgStatus === 'processing') return state
      return patchSource(state, action.sourceId, { bgStatus: 'processing', bgError: null })
    }

    case 'ART_BG_SUCCESS': {
      if (!state.sourceAssets.artworkSources.some((s) => s.id === action.sourceId)) return state // artwork was deleted meanwhile
      const next = patchSource(state, action.sourceId, {
        processedUrl: action.url,
        backgroundRemoved: true,
        bgStatus: 'idle',
        bgError: null,
        bgMethod: action.method ?? 'ai',
        bgOptions: action.options ?? null,
      })
      return setSourceLayersUrl(next, action.sourceId, action.url)
    }

    case 'ART_BG_FAIL':
      return patchSource(state, action.sourceId, { bgStatus: 'failed', bgError: action.message })

    case 'ART_BG_RESTORE': {
      const src = state.sourceAssets.artworkSources.find((s) => s.id === action.sourceId)
      if (!src) return state
      return setSourceLayersUrl(patchSource(state, action.sourceId, { backgroundRemoved: false, bgStatus: 'idle', bgError: null }), action.sourceId, src.url)
    }

    case 'ART_BG_USE_CUTOUT': {
      const src = state.sourceAssets.artworkSources.find((s) => s.id === action.sourceId)
      if (!src || !src.processedUrl) return state
      return setSourceLayersUrl(patchSource(state, action.sourceId, { backgroundRemoved: true }), action.sourceId, src.processedUrl)
    }

    case 'UPDATE_ARTWORK': {
      const target = findArtwork(composition, action.id)
      if (!target || target.locked) return state
      const patch = sanitizePatch(action.patch)
      // Gestures pass both dimensions (and keepRatio: false); typed edits pass one.
      const keep = action.keepRatio ?? target.aspectLocked !== false
      if (keep && (patch.width != null) !== (patch.height != null)) {
        const ratio = target.height / target.width // current ratio, so relocking never snaps the art
        if (Number.isFinite(ratio) && ratio > 0) {
          const w = patch.width ?? patch.height / ratio
          const h = patch.height ?? patch.width * ratio
          Object.assign(patch, fitSize(w, h))
        }
      }
      return patchLayer(state, action.id, (a) => ({ ...a, ...patch }))
    }

    case 'RESET_ARTWORK': {
      const target = findArtwork(composition, action.id)
      if (!target || target.locked) return state
      // Transform only: position, size, rotation. Opacity, visibility, lock, order stay.
      const { opacity: _keep, ...placement } = defaultPlacement(
        target.surface,
        target.naturalWidth / target.naturalHeight,
        state.sourceAssets.tshirt,
      )
      return patchLayer(state, action.id, (a) => ({ ...a, ...placement }))
    }

    case 'DUPLICATE_ARTWORK': {
      const src = findArtwork(composition, action.id)
      if (!src) return state
      const list = composition.surfaces[src.surface].artworks
      const index = list.findIndex((a) => a.id === src.id)
      // New id, same source (no image copy), same surface/size/rotation/opacity/visibility.
      // Nudged 2% right/down so the copy is visibly separate; always starts unlocked.
      const copyId = makeId('artwork')
      const copy = {
        ...src,
        id: copyId,
        groupId: copyId, // a duplicate is a new artwork, not another view of the same one
        name: duplicateName(src.name, list),
        x: round(clamp(src.x + 2, -100, 200)),
        y: round(clamp(src.y + 2, -100, 200)),
        locked: false,
      }
      const artworks = [...list]
      artworks.splice(index + 1, 0, copy)
      return { ...state, composition: { ...withSurfaceArtworks(composition, src.surface, artworks), selectedArtworkId: copy.id } }
    }

    case 'DELETE_ARTWORK': {
      const target = findArtwork(composition, action.id)
      if (!target || target.locked) return state
      const next = withSurfaceArtworks(
        composition,
        target.surface,
        composition.surfaces[target.surface].artworks.filter((a) => a.id !== action.id),
      )
      // Keep a source as long as any remaining layer (on any surface) still references it.
      const used = new Set(allArtworks(next).map((a) => a.sourceId))
      return {
        ...state,
        sourceAssets: {
          ...state.sourceAssets,
          artworkSources: state.sourceAssets.artworkSources.filter((s) => used.has(s.id)),
        },
        composition: {
          ...next,
          selectedArtworkId: composition.selectedArtworkId === action.id ? null : composition.selectedArtworkId,
        },
      }
    }

    case 'SELECT_ARTWORK': {
      const layer = findArtwork(composition, action.id)
      return {
        ...state,
        composition: {
          ...composition,
          selectedArtworkId: layer ? layer.id : null,
          // Selecting a layer always brings its surface into view.
          activeSurface: layer ? layer.surface : composition.activeSurface,
        },
      }
    }

    case 'TOGGLE_ASPECT_LOCK': {
      const target = findArtwork(composition, action.id)
      if (!target || target.locked) return state
      return patchLayer(state, action.id, (a) => ({ ...a, aspectLocked: a.aspectLocked === false }))
    }

    // Reorders within the layer's own surface: 'forward' | 'backward' | 'front' | 'back'.
    case 'ORDER_ARTWORK': {
      const target = findArtwork(composition, action.id)
      if (!target || target.locked) return state
      // Stacking is per view: only this view's placements are reordered; other views' slots keep their place.
      const all = composition.surfaces[target.surface].artworks
      const view = target.view ?? DEFAULT_ANGLE
      const ordered = all.filter((a) => (a.view ?? DEFAULT_ANGLE) === view)
      const pos = ordered.findIndex((a) => a.id === target.id)
      const last = ordered.length - 1
      const to = { forward: pos + 1, backward: pos - 1, front: last, back: 0 }[action.op]
      if (to == null) return state
      const next = clamp(to, 0, last)
      if (next === pos) return state
      ordered.splice(pos, 1)
      ordered.splice(next, 0, target)
      let cursor = 0
      const merged = all.map((a) => ((a.view ?? DEFAULT_ANGLE) === view ? ordered[cursor++] : a))
      return { ...state, composition: withSurfaceArtworks(composition, target.surface, merged) }

    }

    case 'TOGGLE_VISIBLE':
      return patchLayer(state, action.id, (a) => ({ ...a, visible: !a.visible }))

    case 'TOGGLE_LOCK':
      return patchLayer(state, action.id, (a) => ({ ...a, locked: !a.locked }))

    // ---- Multi-view (5-3C) ----
    case 'SET_VIEW':
      return switchView(state, action.view)

    // Assigns an artwork to a view, or copies its placement onto a view where it is already assigned. The destination always
    // stores its OWN copy (new id, same source image); editing it later never touches the source placement.
    case 'COPY_PLACEMENT_TO_VIEW': {
      const src = findArtwork(composition, action.id)
      if (!src || !isAngle(action.view)) return state
      const from = src.view ?? DEFAULT_ANGLE
      if (action.view === from) return state
      const existing = placementsOfArtwork(composition, src)[action.view]
      if (existing?.locked) return state
      // Keep the artwork's visual proportions if the two photographs have different aspect ratios.
      const a = viewPhoto(state, from)
      const b = viewPhoto(state, action.view)
      const ratio = a && b && a.width > 0 && a.height > 0 && b.width > 0 && b.height > 0 ? b.width / b.height / (a.width / a.height) : 1
      const values = Object.fromEntries(PER_VIEW_FIELDS.map((k) => [k, src[k]]))
      values.height = round(clamp(src.height * ratio, 1, 300))
      if (existing) return patchLayer(state, existing.id, (l) => ({ ...l, ...values }))
      const copy = { ...src, ...values, id: makeId('artwork'), groupId: src.groupId ?? src.id, view: action.view, locked: false, visible: true }
      const list = composition.surfaces[src.surface].artworks
      return { ...state, composition: withSurfaceArtworks(composition, src.surface, [...list, copy]) }
    }

    case 'SET_SURFACE': {
      if (!SURFACE_KEYS.includes(action.surface)) return state
      // Switching surfaces always clears the selection: nothing hidden can be transformed.
      return { ...state, composition: { ...composition, activeSurface: action.surface, selectedArtworkId: null } }
    }

    // Same artwork object (id, source, transform) is removed from one collection and
    // appended (on top) to another. No copy is made.
    case 'MOVE_ARTWORK_SURFACE': {
      const target = findArtwork(composition, action.id)
      if (!target || target.locked || !SURFACE_KEYS.includes(action.surface)) return state
      if (target.surface === action.surface) return state
      const from = composition.surfaces[target.surface].artworks.filter((a) => a.id !== target.id)
      const moved = { ...target, surface: action.surface }
      let next = withSurfaceArtworks(composition, target.surface, from)
      next = withSurfaceArtworks(next, action.surface, [...next.surfaces[action.surface].artworks, moved])
      return { ...state, composition: { ...next, activeSurface: action.surface, selectedArtworkId: moved.id } }
    }

    // Loads an older/foreign composition through the migration layer.
    case 'LOAD_COMPOSITION':
      return {
        ...state,
        composition: {
          ...composition,
          surfaces: normalizeSurfaces(action.composition),
          activeSurface: normalizeSurface(action.composition?.activeSurface),
          activeView: isAngle(action.composition?.activeView) ? action.composition.activeView : composition.activeView ?? DEFAULT_ANGLE,
          selectedArtworkId: null,
        },
      }

    // ---- Background Studio (4A-1): these actions touch composition.background
    // and sourceAssets.backgroundImage only — never the T-shirt or artwork. ----
    case 'SET_BACKGROUND_MODE':
      if (!BACKGROUND_MODES.some((m) => m.key === action.mode)) return state
      // Any chip mode replaces a library preset, so a preset never lingers behind Original/Transparent/etc.
      return { ...state, composition: { ...composition, background: { ...composition.background, mode: action.mode, presetId: null } } }

    // Library preset: only composition.background changes; the uploaded background image (if any) is kept for later.
    case 'APPLY_BACKGROUND_PRESET': {
      if (!getPreset(action.id)) return state
      return { ...state, composition: { ...composition, background: { ...composition.background, mode: 'preset', presetId: action.id } } }
    }

    case 'SET_BACKGROUND_COLOR': {
      const color = normalizeHex(action.color)
      if (!color) return state
      return { ...state, composition: { ...composition, background: { ...composition.background, color } } }
    }

    case 'SET_BACKGROUND_GRADIENT': {
      const { color1, color2, direction } = action.patch || {}
      const next = { ...composition.background }
      if (color1 !== undefined) next.gradientColor1 = normalizeHex(color1) ?? next.gradientColor1
      if (color2 !== undefined) next.gradientColor2 = normalizeHex(color2) ?? next.gradientColor2
      if (direction !== undefined && isGradientDirection(direction)) next.gradientDirection = direction
      return { ...state, composition: { ...composition, background: next } }
    }

    case 'SET_BACKGROUND_IMAGE':
      return {
        ...state,
        sourceAssets: {
          ...state.sourceAssets,
          backgroundImage: {
            id: makeId('background'),
            name: action.asset.name,
            sourceUrl: action.asset.url,
            width: action.asset.width,
            height: action.asset.height,
          },
        },
        composition: { ...composition, background: { ...composition.background, mode: 'image', presetId: null } },
        ui: { ...state.ui, notice: null },
      }

    // Drops the uploaded image; if it was showing, fall back to Original.
    case 'REMOVE_BACKGROUND_IMAGE':
      return {
        ...state,
        sourceAssets: { ...state.sourceAssets, backgroundImage: null },
        composition: {
          ...composition,
          background: {
            ...composition.background,
            mode: composition.background.mode === 'image' ? 'original' : composition.background.mode,
          },
        },
      }

    // Back to the original look; colours, gradient and image stay for a quick return.
    case 'RESET_BACKGROUND':
      return { ...state, composition: { ...composition, background: { ...composition.background, mode: 'original', presetId: null } } }

    // Forgets every background setting, including the uploaded image.
    case 'CLEAR_BACKGROUND':
      return {
        ...state,
        sourceAssets: { ...state.sourceAssets, backgroundImage: null },
        composition: { ...composition, background: { ...DEFAULT_BACKGROUND } },
      }

    // ---- T-shirt presentation (4A-2): touches composition.tshirtPresentation only. ----
    case 'SET_TSHIRT_SCALE': {
      const t = state.sourceAssets.tshirt
      if (!t || !Number.isFinite(action.scale)) return state
      const next = clampPresentation(t, { ...composition.tshirtPresentation, scale: clampScale(action.scale) })
      return { ...state, composition: { ...composition, tshirtPresentation: next } }
    }

    case 'SET_TSHIRT_POSITION': {
      const t = state.sourceAssets.tshirt
      if (!t) return state
      const cur = composition.tshirtPresentation
      const next = clampPresentation(t, {
        ...cur,
        x: Number.isFinite(action.x) ? action.x : cur.x,
        y: Number.isFinite(action.y) ? action.y : cur.y,
      })
      return { ...state, composition: { ...composition, tshirtPresentation: next } }
    }

    // axis: 'x' | 'y' | 'both' (both = reset position). Scale and shadow are kept.
    case 'CENTER_TSHIRT': {
      const t = state.sourceAssets.tshirt
      if (!t) return state
      const cur = composition.tshirtPresentation
      const next = clampPresentation(t, {
        ...cur,
        x: action.axis === 'y' ? cur.x : DEFAULT_PRESENTATION.x,
        y: action.axis === 'x' ? cur.y : DEFAULT_PRESENTATION.y,
      })
      return { ...state, composition: { ...composition, tshirtPresentation: next } }
    }

    case 'SET_TSHIRT_SHADOW':
      return { ...state, composition: { ...composition, tshirtPresentation: { ...composition.tshirtPresentation, shadow: !!action.shadow } } }

    case 'RESET_TSHIRT_PRESENTATION':
      return { ...state, composition: { ...composition, tshirtPresentation: { ...DEFAULT_PRESENTATION } } }

    // ---- Generation foundation (5-1): these actions touch state.generation only. ----
    case 'SET_GENERATION_TEMPLATE': {
      if (action.id == null) return { ...state, generation: { ...state.generation, templateId: null } }
      const template = templateRegistry.get(action.id)
      if (!template || !isTemplateUsable(template)) return state
      return { ...state, generation: { ...state.generation, templateId: template.id, angle: template.angle } }
    }

    case 'SET_GENERATION_ANGLE': {
      if (!isAngle(action.angle)) return state
      const g = state.generation
      const stored = g.templateId ? templateRegistry.get(g.templateId) : null
      // A stored template is one specific angle; picking another angle falls back to the current T-shirt photo.
      const templateId = stored && stored.angle !== action.angle ? null : g.templateId
      return { ...state, generation: { ...g, angle: action.angle, templateId } }
    }

    case 'SET_GENERATION_GARMENT': {
      const next = { ...state.generation.garment }
      for (const key of ['type', 'color', 'fabric', 'size']) {
        const v = action.patch?.[key]
        if (v === null || (typeof v === 'string' && v.trim())) next[key] = v === null ? null : v.trim()
      }
      return { ...state, generation: { ...state.generation, garment: next } }
    }

    case 'SET_GENERATION_SETTINGS': {
      const p = action.patch || {}
      const next = { ...state.generation.settings }
      if (QUALITY_LEVELS.includes(p.quality)) next.quality = p.quality
      if (OUTPUT_FORMATS.includes(p.outputFormat)) next.outputFormat = p.outputFormat
      if (typeof p.provider === 'string' && providerRegistry.get(p.provider)) next.provider = p.provider
      return { ...state, generation: { ...state.generation, settings: next } }
    }

    // Reserved for the future pipeline. Only legal transitions apply; nothing in the UI dispatches this yet.
    case 'SET_GENERATION_STATUS': {
      if (!canTransition(state.generation.status, action.status)) return state
      return { ...state, generation: { ...state.generation, status: action.status, result: action.result ?? state.generation.result } }
    }

    // ---- Real-photo templates (5-2). They swap the T-shirt PHOTO only; background, presentation, artwork data, garment and settings stay. ----
    case 'APPLY_TEMPLATE_PHOTO': {
      const template = templateRegistry.get(action.id)
      if (!template || !isTemplateUsable(template) || !template.source.url || !(template.source.width > 0 && template.source.height > 0)) return state
      // Step 5-3C: like every photo change, this loads into the view being edited; other views keep their own photo.
      const base = state
      const previous = base.sourceAssets.tshirt
      const next = tshirtFromTemplate(template)
      return {
        ...base,
        sourceAssets: {
          ...base.sourceAssets,
          tshirt: next,
          // keep the person's own photo (not another template's) so "Use my own photo" always restores it
          tshirtBeforeTemplate: previous && !previous.fromTemplateId ? previous : base.sourceAssets.tshirtBeforeTemplate,
        },
        composition: rescaleArtworkForPhoto(base.composition, previous, next),
        generation: { ...base.generation, templateId: template.id, angle: template.angle },
        ui: { ...base.ui, notice: null },
      }
    }

    case 'RELEASE_TEMPLATE_PHOTO': {
      const current = state.sourceAssets.tshirt
      if (!current?.fromTemplateId) return state
      const restored = state.sourceAssets.tshirtBeforeTemplate
      return {
        ...state,
        sourceAssets: { ...state.sourceAssets, tshirt: restored, tshirtBeforeTemplate: null },
        composition: rescaleArtworkForPhoto(composition, current, restored),
        generation: { ...state.generation, templateId: null },
      }
    }

    // The library photo was replaced: refresh the loaded photo from the registry. Composition, generation config and background are not reset.
    case 'REPLACE_TEMPLATE_PHOTO': {
      const template = templateRegistry.get(action.id)
      if (!template) return state
      let next = state
      const current = state.sourceAssets.tshirt
      if (current?.fromTemplateId === action.id) {
        const fresh = tshirtFromTemplate(template)
        next = { ...next, sourceAssets: { ...next.sourceAssets, tshirt: { ...fresh, id: current.id } }, composition: rescaleArtworkForPhoto(composition, current, fresh) }
      }
      // The same library photo may also be loaded in a view that is not being edited.
      for (const [angle, parked] of Object.entries(state.sourceAssets.viewPhotos ?? {})) {
        if (parked.tshirt?.fromTemplateId !== action.id) continue
        const fresh = tshirtFromTemplate(template)
        next = {
          ...next,
          sourceAssets: { ...next.sourceAssets, viewPhotos: { ...next.sourceAssets.viewPhotos, [angle]: { ...parked, tshirt: { ...fresh, id: parked.tshirt.id } } } },
          composition: rescaleArtworkForPhoto(next.composition, parked.tshirt, fresh, angle),
        }
      }
      return next
    }

    // The template was deactivated/deleted: keep the loaded photo as the person's own, just stop calling it a template.
    case 'DETACH_TEMPLATE_PHOTO': {
      const detach = (t) => { const { fromTemplateId: _unused, ...rest } = t; return rest }
      let next = mapParkedPhotos(state, (v) => (v.tshirt?.fromTemplateId === action.id ? { ...v, tshirt: detach(v.tshirt), tshirtBeforeTemplate: null } : v))
      const current = state.sourceAssets.tshirt
      if (current?.fromTemplateId === action.id) {
        next = { ...next, sourceAssets: { ...next.sourceAssets, tshirt: detach(current), tshirtBeforeTemplate: null }, generation: { ...next.generation, templateId: null } }
      }
      return next
    }

    // ---- Photo compositing masks (5-3A): touch sourceAssets.tshirtMask / designMask only. ----
    case 'SET_MASK': {
      const key = action.kind === 'design' ? 'designMask' : action.kind === 'tshirt' ? 'tshirtMask' : null
      if (!key || !action.asset?.url) return state
      const { name, url, width, height } = action.asset
      return { ...state, sourceAssets: { ...state.sourceAssets, [key]: { id: makeId('mask'), name, url, width, height } }, ui: { ...state.ui, notice: null } }
    }

    case 'CLEAR_MASK': {
      const key = action.kind === 'design' ? 'designMask' : action.kind === 'tshirt' ? 'tshirtMask' : null
      return key ? { ...state, sourceAssets: { ...state.sourceAssets, [key]: null } } : state
    }

    case 'TOGGLE_PREVIEW':
      return { ...state, ui: { ...state.ui, previewMode: !state.ui.previewMode } }

    case 'NOTICE':
      return { ...state, ui: { ...state.ui, notice: action.message } }

    case 'CLEAR_NOTICE':
      return { ...state, ui: { ...state.ui, notice: null } }

    default:
      return state
  }
}

/** Artwork layers for one surface of the ACTIVE view, in stacking order. */
export function layersForSurface(state, surface) {
  const view = state.composition.activeView ?? DEFAULT_ANGLE // Step 5-3C: only the active view's placements
  return (state.composition.surfaces[surface]?.artworks ?? []).filter((a) => (a.view ?? DEFAULT_ANGLE) === view)
}

/**
 * STEP 2 — Finished T-shirt snapshot (Mockup Studio -> Human Model Studio handoff).
 *
 *   Mockup Studio state (read only, source of truth)
 *        ↓  snapshotView()  +  renderFinalView()   <- the EXISTING compositor, nothing re-implemented here
 *   Finished T-shirt snapshot (serializable) + one rendered PNG per view that has artwork
 *        ↓
 *   Human Model Studio
 *
 * Project facts this model is built around (it deliberately differs from a naive front/back/sleeve split):
 *   - The compositor renders per VIEW (a photo angle: FRONT, BACK, THREE_QUARTER_FRONT …), not per surface.
 *   - A SURFACE (front / back / leftSleeve / rightSleeve) is the print area an artwork layer belongs to. Each layer
 *     also belongs to exactly one view. One view's render contains every visible layer placed in that view.
 *   So: `surfaces` preserves every layer by print area; `views` / `renderedComposition` hold the real renders.
 *
 * Nothing here touches the database, storage or any AI service. URLs are session-only blob: URLs.
 */
import { ANGLE_DEFS } from './generation/mockupAngles.js'
import { SURFACE_KEYS, makeId } from './mockupStudioState.js'
import { exportableViews, snapshotView, renderFinalView } from './compositing/finalRender.js'
import { classifyRenderError, createSafeImageLoader } from './human-model/exportSafety.js'

export const SNAPSHOT_SCHEMA_VERSION = 1
export const FINISHED_TSHIRT_ERROR_MESSAGE =
  'Unable to prepare the finished T-shirt. Please return to Mockup Studio and check the composition.'

export class FinishedTshirtError extends Error {
  constructor(details = [], failures = []) {
    super(FINISHED_TSHIRT_ERROR_MESSAGE)
    this.name = 'FinishedTshirtError'
    this.details = details // per-view reasons, shown as secondary text
    this.failures = failures // STEP 3: structured [{ view, code, message, technical }] (CORS / tainted canvas / blank ... see exportSafety.js)
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value))

/** Small stable string hash (djb2). Identifies a composition; not a security primitive. */
function hashString(text) {
  let h = 5381
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Every view that has a T-shirt photo, as the compositor's own render job (deep copy, editor untouched). */
function collectJobs(state) {
  return exportableViews(state).map((v) => snapshotView(state, v.view)).filter(Boolean)
}

/**
 * Fingerprint of everything the compositor reads: photo (original/processed), masks, every layer and its
 * geometry/warp/fabric, background, uploaded background image, presentation. If it changes, the render changes.
 */
export function computeCompositionSignature(state) {
  const garment = state.generation?.garment ?? null
  return hashString(JSON.stringify({ jobs: collectJobs(state), garment }))
}

/** True when the studio holds a finished T-shirt by the studio's own rule: a view with a photo and >= 1 visible artwork layer. */
export function hasFinishedTshirt(state) {
  return exportableViews(state).some((v) => v.layers > 0)
}

/**
 * Builds the snapshot WITHOUT rendering. Every layer is preserved with every field the editor stores
 * (nothing is picked or flattened), plus `renderOrder` (the compositor's stacking position inside its view)
 * and `inRender` (whether the layer is actually part of a rendered view).
 */
export function buildFinishedTshirtSnapshot(state, { now = new Date() } = {}) {
  const jobs = collectJobs(state)
  const jobByView = new Map(jobs.map((j) => [j.view, j]))
  const garment = state.generation?.garment ?? {}
  const warnings = []

  // ---- layers, grouped by surface (project model), in the studio's own array order
  const surfaces = {}
  for (const key of SURFACE_KEYS) {
    const layers = state.composition.surfaces[key].artworks.map((layer) => {
      const job = jobByView.get(layer.view)
      const renderOrder = job ? job.layers.findIndex((l) => l.id === layer.id) : -1
      const inRender = renderOrder >= 0
      if (!job && layer.visible !== false) warnings.push(`"${layer.name}" is placed in the ${layer.view} view, which has no T-shirt photo, so it is not part of any render.`)
      return { ...clone(layer), renderOrder: inRender ? renderOrder : null, inRender }
    })
    surfaces[key] = { artworkLayers: layers }
  }

  // ---- views: the real base photos and what each view's render contains
  const views = {}
  const renderedComposition = {}
  for (const { id, label } of ANGLE_DEFS) {
    const job = jobByView.get(id)
    if (!job) continue
    views[id] = {
      label,
      baseImage: {
        originalUrl: job.photoAsset?.originalUrl ?? null,
        processedUrl: job.photoAsset?.processedUrl ?? null,
        backgroundRemoved: !!job.photoAsset?.backgroundRemoved,
        renderedFrom: job.photoAsset?.backgroundRemoved && job.photoAsset?.processedUrl ? 'processed' : 'original',
        width: job.photo.width,
        height: job.photo.height,
      },
      masks: { tshirtMaskUrl: job.tshirtMaskUrl, designMaskUrl: job.designMaskUrl },
      layerIds: job.layers.map((l) => l.id), // stacking order
    }
    renderedComposition[id] = { status: job.layers.length > 0 ? 'pending' : 'no_artwork', url: null }
  }

  const primaryView = views.FRONT ? 'FRONT' : Object.keys(views)[0] ?? null

  return {
    id: makeId('finished-tshirt'),
    createdAt: now.toISOString(),
    compositionSignature: computeCompositionSignature(state),

    tshirt: {
      type: garment.type ?? null,
      color: garment.color ?? null,
      fabric: garment.fabric ?? null,
      size: garment.size ?? null,
      primaryView,
      baseImage: primaryView ? views[primaryView].baseImage : null,
      width: primaryView ? views[primaryView].baseImage.width : null,
      height: primaryView ? views[primaryView].baseImage.height : null,
    },

    surfaces, // { front | back | leftSleeve | rightSleeve: { artworkLayers } }
    views, // only views that really have a photo — nothing is invented
    renderedComposition, // { [view]: { status, url, width, height, … } } — filled by renderFinishedTshirt()

    // Background and T-shirt presentation are global in the studio (not per surface); stored once, as the renderer reads them.
    background: clone({ ...state.composition.background, image: state.sourceAssets.backgroundImage ? { name: state.sourceAssets.backgroundImage.name, url: state.sourceAssets.backgroundImage.sourceUrl } : null }),
    tshirtPresentation: clone(state.composition.tshirtPresentation),

    warnings,
    metadata: { source: 'mockup-studio-v2', version: SNAPSHOT_SCHEMA_VERSION },
  }
}

/**
 * Renders every view that has artwork with the EXISTING final renderer (the one behind Download PNG and Save to gallery).
 * Returns a NEW snapshot whose renderedComposition holds blob: URLs (owned by the caller). All-or-nothing: if any view fails
 * the URLs already made are released and a FinishedTshirtError is thrown — an incomplete garment is never handed over.
 *
 * `loadImage`, `env`, `limit` are passed straight to renderFinalView (tests inject them; the browser defaults are used otherwise).
 */
export async function renderFinishedTshirt(state, snapshot, { loadImage, env, limit, renderView = renderFinalView } = {}) {
  // STEP 3: every loader (default or injected) is wrapped so a failed remote image is diagnosed (CORS vs 404 vs decode) instead of reported generically.
  const baseLoad = loadImage ?? (await import('./gallery/mockupRender.js')).loadImageElement
  const load = createSafeImageLoader(baseLoad)
  const targets = Object.entries(snapshot.renderedComposition).filter(([, r]) => r.status === 'pending').map(([view]) => view)
  if (targets.length === 0) throw new FinishedTshirtError(['There is no view with a T-shirt photo and visible artwork.'])

  const renders = {}
  const made = []
  const problems = []
  const failures = []
  for (const view of targets) {
    try {
      const job = snapshotView(state, view)
      const options = { loadImage: load }
      if (env) options.env = env
      if (limit) options.limit = limit
      const result = await renderView(job, options)
      const blob = result.blob instanceof Blob ? result.blob : new Blob([result.blob], { type: 'image/png' })
      const url = URL.createObjectURL(blob)
      made.push(url)
      renders[view] = {
        status: 'rendered',
        url,
        blob, // STEP 3: the exact bytes behind `url` — what buildGenerationAssets hands to a provider adapter (no base64)
        mimeType: 'image/png',
        bytes: blob.size,
        width: result.width,
        height: result.height,
        sourceWidth: result.sourceWidth,
        sourceHeight: result.sourceHeight,
        downscaled: result.downscaled,
        sourceAsset: result.sourceAsset,
        backgroundMode: result.backgroundMode,
        customBackground: result.customBackground,
      }
    } catch (err) {
      const failure = classifyRenderError(err, { view })
      failures.push(failure)
      console.error(`[garment export] ${view} render failed (${failure.code}):`, failure.technical)
      problems.push(`${snapshot.views[view]?.label ?? view}: ${failure.message}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 0)) // let the browser breathe between large renders
  }

  if (problems.length > 0) {
    made.forEach((url) => URL.revokeObjectURL(url))
    throw new FinishedTshirtError(problems, failures)
  }
  return { ...snapshot, renderedComposition: { ...snapshot.renderedComposition, ...renders } }
}

/** Build + render in one call. */
export async function prepareFinishedTshirt(state, options = {}) {
  if (!hasFinishedTshirt(state)) throw new FinishedTshirtError(['There is no T-shirt photo with visible artwork.'])
  const snapshot = buildFinishedTshirtSnapshot(state)
  return renderFinishedTshirt(state, snapshot, options)
}

/** Counts computed from the snapshot itself — never hard-coded. `placed` = all preserved layers, `rendered` = layers inside a render. */
export function summarizeSnapshot(snapshot) {
  const bySurface = {}
  let placed = 0
  let rendered = 0
  for (const key of SURFACE_KEYS) {
    const layers = snapshot.surfaces[key].artworkLayers
    const inRender = layers.filter((l) => l.inRender).length
    bySurface[key] = { placed: layers.length, rendered: inRender }
    placed += layers.length
    rendered += inRender
  }
  const renderedViews = Object.entries(snapshot.renderedComposition).filter(([, r]) => r.status === 'rendered').map(([view]) => view)
  return { bySurface, placed, rendered, renderedViews }
}

/** True when the studio changed after the snapshot was taken (artwork moved, background changed, photo swapped …). */
export function isSnapshotStale(snapshot, state) {
  return !snapshot || snapshot.compositionSignature !== computeCompositionSignature(state)
}

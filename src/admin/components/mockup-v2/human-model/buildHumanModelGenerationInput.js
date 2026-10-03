/**
 * Provider-neutral input for the FUTURE AI fitting step. It only ASSEMBLES what already exists in the
 * browser (model photo + finished T-shirt snapshot + chosen views). It sends nothing anywhere, calls no
 * provider and holds no credentials. Image references are session-only blob: URLs; a later step must
 * upload the bytes through a backend that keeps the API key server-side.
 */
import { MODEL_VIEW_TO_ANGLE } from './humanModelState.js'
import { SURFACE_KEYS } from '../mockupStudioState.js'
import { summarizeSnapshot } from '../finishedTshirtSnapshot.js'

export const GENERATION_INPUT_VERSION = 1

/** @returns {{ ok: boolean, problems: string[], input: object|null }} */
export function buildHumanModelGenerationInput({ modelImage, snapshot, requestedViews }) {
  const problems = []
  if (!modelImage) problems.push('A human model image is required.')
  if (!snapshot) problems.push('The finished T-shirt has not been loaded.')
  if (!requestedViews?.length) problems.push('Select at least one model view.')

  const summary = snapshot ? summarizeSnapshot(snapshot) : null
  if (snapshot && summary.renderedViews.length === 0) problems.push('The finished T-shirt has no rendered image.')
  if (problems.length > 0) return { ok: false, problems, input: null }

  const renders = summary.renderedViews.map((view) => {
    const r = snapshot.renderedComposition[view]
    // surfaces that actually have visible layers in THIS view's render
    const surfaces = SURFACE_KEYS.filter((key) => snapshot.surfaces[key].artworkLayers.some((l) => l.view === view && l.inRender))
    return { view, label: snapshot.views[view].label, image: { kind: 'local_blob', url: r.url, mimeType: r.mimeType, width: r.width, height: r.height }, surfaces }
  })
  const byView = (view) => renders.find((r) => r.view === view)?.image ?? null

  return {
    ok: true,
    problems: [],
    input: {
      schemaVersion: GENERATION_INPUT_VERSION,
      humanModel: {
        id: modelImage.id,
        name: modelImage.fileName,
        mimeType: modelImage.mimeType,
        size: modelImage.fileSize,
        width: modelImage.width,
        height: modelImage.height,
        image: { kind: 'local_blob', url: modelImage.sourceUrl },
      },
      garment: {
        snapshotId: snapshot.id,
        compositionId: snapshot.compositionSignature,
        renders, // every rendered view of the finished T-shirt
        frontImage: byView('FRONT'),
        backImage: byView('BACK'),
        // renders whose layers sit on a sleeve print area (sleeve artwork lives inside a view's render, not in its own photo)
        sleeveImages: renders.filter((r) => r.surfaces.includes('leftSleeve') || r.surfaces.includes('rightSleeve')),
      },
      composition: {
        // every preserved layer with its full editor data (geometry, warp, fabric, view, surface, stacking)
        artworkLayers: SURFACE_KEYS.flatMap((key) => snapshot.surfaces[key].artworkLayers),
        counts: summary.bySurface,
        tshirtMetadata: snapshot.tshirt,
        background: snapshot.background,
        tshirtPresentation: snapshot.tshirtPresentation,
      },
      requestedViews: requestedViews.map((type) => ({ type, angle: MODEL_VIEW_TO_ANGLE[type] })),
    },
  }
}

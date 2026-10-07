/**
 * Step 5-3C — one render job per view.
 *
 * IMPORTANT:
 * The render job must use the SAME T-shirt image that the editor is currently
 * showing. If background removal has been completed, `processedUrl` is used.
 * This prevents Download PNG / Gallery renders from silently reverting to the
 * original-background image.
 */

import { ANGLE_DEFS, DEFAULT_ANGLE } from '../generation/mockupAngles.js'
import { SURFACE_KEYS } from '../mockupStudioState.js'
import { buildPrintableRegion, renderComposite, browserEnv } from './renderComposite.js'
import { placementFromLayer } from './placement.js'

/**
 * Photo + masks belonging to one view.
 *
 * The active view reads the live editor fields.
 * Other views read their parked assets from sourceAssets.viewPhotos.
 */
function viewAssets(state, view) {
  const sa = state.sourceAssets

  if (view === (state.composition.activeView ?? DEFAULT_ANGLE)) {
    return {
      tshirt: sa.tshirt,
      tshirtMask: sa.tshirtMask,
      designMask: sa.designMask,
    }
  }

  return sa.viewPhotos?.[view] ?? {
    tshirt: null,
    tshirtMask: null,
    designMask: null,
  }
}

/**
 * Returns the exact photo URL that should be rendered.
 *
 * When background removal is active:
 *   processedUrl = transparent T-shirt
 *
 * Otherwise:
 *   originalUrl = original uploaded photograph
 */
function renderPhotoUrl(tshirt) {
  if (!tshirt) return null

  if (
    tshirt.backgroundRemoved === true &&
    tshirt.processedUrl
  ) {
    return tshirt.processedUrl
  }

  return tshirt.originalUrl ?? tshirt.sourceUrl ?? null
}

/**
 * Collect one isolated render job for every available view.
 *
 * Nothing from another view is mixed into the job.
 */
export function collectViewJobs(state) {
  return ANGLE_DEFS.flatMap(({ id, label }) => {
    const { tshirt, tshirtMask, designMask } = viewAssets(state, id)

    if (!tshirt) return []

    const layers = SURFACE_KEYS
      .flatMap((key) => state.composition.surfaces[key].artworks)
      .filter(
        (layer) =>
          (layer.view ?? DEFAULT_ANGLE) === id &&
          layer.visible !== false,
      )

    const photoUrl = renderPhotoUrl(tshirt)

    if (!photoUrl) return []

    return [
      {
        view: id,
        label,

        // CRITICAL:
        // This is now processedUrl when background removal is active.
        photoUrl,

        photo: {
          width: tshirt.width,
          height: tshirt.height,
        },

        tshirtMaskUrl: tshirtMask?.url ?? null,
        designMaskUrl: designMask?.url ?? null,

        // Keep the actual shirt metadata in the job so downstream renderers
        // can distinguish original vs processed assets if required.
        photoAsset: {
          originalUrl: tshirt.originalUrl ?? null,
          processedUrl: tshirt.processedUrl ?? null,
          backgroundRemoved: !!tshirt.backgroundRemoved,
        },

        photoAlphaAllowed:
          !!(tshirt.backgroundRemoved && tshirt.processedUrl),

        layers,
      },
    ]
  })
}

/**
 * Views that contain artwork but do not yet have a T-shirt photo.
 */
export function viewsWithoutPhoto(state) {
  const have = new Set(
    collectViewJobs(state).map((job) => job.view),
  )

  return ANGLE_DEFS
    .filter(
      ({ id }) =>
        !have.has(id) &&
        SURFACE_KEYS.some((surface) =>
          state.composition.surfaces[surface].artworks.some(
            (layer) =>
              (layer.view ?? DEFAULT_ANGLE) === id,
          ),
        ),
    )
    .map((definition) => definition.id)
}

/**
 * Render all jobs through the existing compositor.
 *
 * The compositor itself remains unchanged.
 */
export async function renderViewJobs(
  jobs,
  {
    loadImage,
    env = browserEnv,
    scale = 1,
    renderer = renderComposite,
  } = {},
) {
  const out = []

  for (const job of jobs) {
    const photo = await loadImage(
      job.photoUrl,
      `${job.label} photo`,
    )

    const tshirtMask = job.tshirtMaskUrl
      ? await loadImage(
          job.tshirtMaskUrl,
          `${job.label} T-shirt mask`,
        )
      : null

    const designMask = job.designMaskUrl
      ? await loadImage(
          job.designMaskUrl,
          `${job.label} design mask`,
        )
      : null

    const artworks = []

    for (const layer of job.layers) {
      artworks.push({
        image: await loadImage(
          layer.sourceUrl,
          `artwork "${layer.name}"`,
        ),
        placement: placementFromLayer(layer, photo),
      })
    }

    const region = artworks.length
      ? buildPrintableRegion(
          {
            photo,
            tshirtMask,
            designMask,
            photoAlphaAllowed: job.photoAlphaAllowed,
          },
          env,
        )
      : null

    const canvas = env.createCanvas(1, 1)

    const result = renderer(
      {
        photo,
        tshirtMask,
        designMask,
        photoAlphaAllowed: job.photoAlphaAllowed,
        artworks,
        region,
        scale,
      },
      { canvas },
      env,
    )

    out.push({
      view: job.view,
      label: job.label,
      canvas,
      width: result.width,
      height: result.height,
      renderWidth: result.renderWidth,
      renderHeight: result.renderHeight,
    })
  }

  return out
}
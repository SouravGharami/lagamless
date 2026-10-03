/**
 * STEP 5-3C — FINAL EXPORT PIPELINE
 *
 * Final export uses the same presentation compositor used by the studio's
 * presentation system:
 *
 * background
 *      ↓
 * background-removed T-shirt
 *      ↓
 * artwork
 *      ↓
 * shadow / presentation
 *      ↓
 * PNG
 *
 * IMPORTANT:
 * The editor's original photograph background must NEVER silently return
 * when the user has removed the T-shirt background or selected a studio
 * background.
 */

import {
  COMPOSITE_ERROR,
  CompositeError,
  toCompositeError,
} from './compositeErrors.js'

import {
  browserEnv,
  releaseFabricMaps,
  sizeOf,
} from './renderComposite.js'

import {
  collectViewJobs,
} from './multiView.js'

import {
  renderPresentationJob,
} from './presentationRender.js'

/* -------------------------------------------------------------------------- */
/* PREVIEW SIZING                                                             */
/* -------------------------------------------------------------------------- */

export const DRAFT_MAX_SIDE = 1100
export const PREVIEW_MAX_SIDE = 2400

export function previewScale({
  width,
  height,
  cssWidth = 0,
  devicePixelRatio = 1,
  draft = false,
}) {
  if (!(width > 0 && height > 0)) return 1

  const longest = Math.max(width, height)

  if (draft) {
    return longest > DRAFT_MAX_SIDE
      ? DRAFT_MAX_SIDE / longest
      : 1
  }

  const dpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? Math.min(devicePixelRatio, 3)
      : 1

  const wantWidth =
    (cssWidth > 0 ? cssWidth : 480) * dpr

  const wantLongest =
    wantWidth * (longest / width)

  const target = Math.min(
    PREVIEW_MAX_SIDE,
    Math.max(DRAFT_MAX_SIDE, wantLongest),
  )

  return longest > target
    ? target / longest
    : 1
}

/* -------------------------------------------------------------------------- */
/* FINAL EXPORT SIZE                                                          */
/* -------------------------------------------------------------------------- */

export const MAX_EXPORT_PIXELS = 36_000_000
export const MAX_EXPORT_PIXELS_IOS = 16_000_000
export const MAX_EXPORT_SIDE = 16_384

export function exportPixelLimit(
  userAgent =
    typeof navigator === 'undefined'
      ? ''
      : navigator.userAgent || '',
  maxTouchPoints =
    typeof navigator === 'undefined'
      ? 0
      : navigator.maxTouchPoints || 0,
) {
  const ios =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (/Macintosh/.test(userAgent) && maxTouchPoints > 1)

  return ios
    ? MAX_EXPORT_PIXELS_IOS
    : MAX_EXPORT_PIXELS
}

export function finalSize(
  width,
  height,
  limit = exportPixelLimit(),
) {
  if (!(width > 0 && height > 0)) {
    throw new CompositeError(
      COMPOSITE_ERROR.INVALID_IMAGE,
      'The T-shirt image has no readable dimensions.',
    )
  }

  const byArea =
    width * height > limit
      ? Math.sqrt(limit / (width * height))
      : 1

  const bySide =
    Math.max(width, height) > MAX_EXPORT_SIDE
      ? MAX_EXPORT_SIDE / Math.max(width, height)
      : 1

  const scale = Math.min(
    1,
    byArea,
    bySide,
  )

  if (scale < 1) {
    return {
      scale,
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale)),
      downscaled: true,
    }
  }

  return {
    scale: 1,
    width,
    height,
    downscaled: false,
  }
}

/* -------------------------------------------------------------------------- */
/* FILE NAME                                                                  */
/* -------------------------------------------------------------------------- */

const FILE_SLUGS = {
  FRONT: 'front',
  THREE_QUARTER_FRONT: '3-4-front',
  SIDE: 'side',
  BACK: 'back',
  THREE_QUARTER_BACK: '3-4-back',
  DETAIL: 'detail',
}

export const finalFilename = (view) =>
  `lagamless-${
    FILE_SLUGS[view] ??
    String(view || 'mockup')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
  }.png`

/* -------------------------------------------------------------------------- */
/* PNG ENCODING                                                               */
/* -------------------------------------------------------------------------- */

export function encodePng(canvas) {
  return new Promise((resolve, reject) => {
    try {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob)
              return
            }

            reject(
              new CompositeError(
                COMPOSITE_ERROR.RENDER_FAILURE,
                'The browser could not encode the PNG.',
              ),
            )
          },
          'image/png',
        )

        return
      }

      if (typeof canvas.toBuffer === 'function') {
        resolve(canvas.toBuffer('image/png'))
        return
      }

      reject(
        new CompositeError(
          COMPOSITE_ERROR.RENDER_FAILURE,
          'This canvas cannot be encoded as PNG.',
        ),
      )
    } catch (err) {
      reject(toCompositeError(err))
    }
  })
}

/* -------------------------------------------------------------------------- */
/* DOWNLOAD                                                                   */
/* -------------------------------------------------------------------------- */

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'

  document.body.appendChild(anchor)

  anchor.click()

  anchor.remove()

  setTimeout(
    () => URL.revokeObjectURL(url),
    10_000,
  )
}

/* -------------------------------------------------------------------------- */
/* VIEW ASSET RESOLUTION                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Gets the actual T-shirt asset belonging to a particular export view.
 *
 * The active view uses state.sourceAssets.tshirt.
 * Other parked views use state.sourceAssets.viewPhotos[view].tshirt.
 */
function tshirtAssetForView(state, view) {
  const activeView =
    state.composition?.activeView

  if (view === activeView) {
    return state.sourceAssets?.tshirt ?? null
  }

  return (
    state.sourceAssets?.viewPhotos?.[view]?.tshirt ??
    null
  )
}

/**
 * Adds all presentation information to the render job.
 *
 * collectViewJobs() is responsible for finding:
 * - photo
 * - mask
 * - artwork
 *
 * This function adds:
 * - processed background-removed photo
 * - background mode
 * - uploaded background image
 * - presentation position / scale / shadow
 *
 * This is what makes Download PNG use the same composition settings
 * that the editor is showing.
 */
function decoratePresentationJob(state, job) {
  if (!job) return null

  const tshirt =
    tshirtAssetForView(state, job.view)

  const background =
    state.composition?.background
      ? {
          ...state.composition.background,
        }
      : {
          mode: 'original',
        }

  const backgroundImage =
    state.sourceAssets?.backgroundImage

  const backgroundImageUrl =
    backgroundImage?.sourceUrl ??
    backgroundImage?.url ??
    null

  /*
   * processedUrl can remain stored even after the user chooses
   * "Restore Original".
   *
   * Therefore we ONLY export processedUrl when backgroundRemoved
   * is currently true.
   */
  const processedPhotoUrl =
    tshirt?.backgroundRemoved &&
    tshirt?.processedUrl
      ? tshirt.processedUrl
      : null

  const presentation =
    state.composition?.tshirtPresentation
      ? {
          ...state.composition.tshirtPresentation,
        }
      : {}

  return {
    ...job,

    /*
     * Keep the original photo URL for dimensions and fallback.
     */
    photoUrl:
      tshirt?.originalUrl ??
      job.photoUrl ??
      null,

    /*
     * Current background-removed version.
     */
    processedPhotoUrl,

    /*
     * Background Studio state.
     */
    background,

    /*
     * Uploaded custom background.
     */
    backgroundImageUrl,

    /*
     * T-shirt scale / position / shadow.
     */
    presentation,

    /*
     * Preserve the complete photo asset information for debugging.
     */
    photoAsset: tshirt
      ? {
          originalUrl:
            tshirt.originalUrl ?? null,

          processedUrl:
            tshirt.processedUrl ?? null,

          backgroundRemoved:
            !!tshirt.backgroundRemoved,
        }
      : null,
  }
}

/* -------------------------------------------------------------------------- */
/* IMMUTABLE VIEW SNAPSHOT                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Creates a completely independent render snapshot.
 *
 * The snapshot contains everything required by renderPresentationJob().
 *
 * Most importantly it preserves:
 *
 * - originalUrl
 * - processedUrl
 * - backgroundRemoved
 * - background mode
 * - uploaded custom background
 * - T-shirt presentation
 * - masks
 * - artwork layers
 *
 * No editor state is mutated.
 */
export function snapshotView(state, view) {
  const jobs = collectViewJobs(state)

  const rawJob = jobs.find(
    (item) => item.view === view,
  )

  if (!rawJob) return null

  const job =
    decoratePresentationJob(
      state,
      rawJob,
    )

  if (!job) return null

  return JSON.parse(
    JSON.stringify({
      ...job,

      photoAsset: job.photoAsset
        ? {
            originalUrl:
              job.photoAsset.originalUrl ?? null,

            processedUrl:
              job.photoAsset.processedUrl ?? null,

            backgroundRemoved:
              !!job.photoAsset.backgroundRemoved,
          }
        : null,
    }),
  )
}

/* -------------------------------------------------------------------------- */
/* AVAILABLE EXPORT VIEWS                                                     */
/* -------------------------------------------------------------------------- */

export function exportableViews(state) {
  return collectViewJobs(state).map(
    (job) => ({
      view: job.view,
      label: job.label,
      layers: Array.isArray(job.layers)
        ? job.layers.length
        : 0,
    }),
  )
}

/* -------------------------------------------------------------------------- */
/* FINAL VIEW RENDER                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Final PNG renderer.
 *
 * IMPORTANT:
 * This no longer calls renderViewJobs().
 *
 * It calls renderPresentationJob(), which is the renderer responsible for:
 *
 * 1. Custom background
 * 2. Background-removed T-shirt
 * 3. T-shirt mask fallback
 * 4. Artwork
 * 5. T-shirt presentation position/scale
 * 6. Shadow
 * 7. Final composition frame
 */
export async function renderFinalView(
  job,
  {
    loadImage,
    env = browserEnv,
    limit,
    encode = encodePng,
  } = {},
) {
  if (!job) {
    throw new CompositeError(
      COMPOSITE_ERROR.MISSING_PHOTO,
      'There is no T-shirt photo for this view.',
    )
  }

  if (!job.layers?.length) {
    throw new CompositeError(
      COMPOSITE_ERROR.MISSING_ARTWORK,
      `There is no visible artwork on the ${job.label} view to export.`,
    )
  }

  if (!job.photoUrl) {
    throw new CompositeError(
      COMPOSITE_ERROR.MISSING_PHOTO,
      `The ${job.label} T-shirt image is missing.`,
    )
  }

  const loadedImages = new Set()
  const memo = new Map()

  const load = (url, label) => {
    if (!url) {
      throw new CompositeError(
        COMPOSITE_ERROR.MISSING_PHOTO,
        `${label} is missing.`,
      )
    }

    if (!memo.has(url)) {
      memo.set(
        url,
        Promise.resolve(
          loadImage(url, label),
        ).then((img) => {
          loadedImages.add(img)
          return img
        }),
      )
    }

    return memo
      .get(url)
      .catch((err) => {
        memo.delete(url)
        throw err
      })
  }

  let canvas = null

  try {
    /* ---------------------------------------------------------------------- */
    /* Load source only to determine native dimensions.                       */
    /* ---------------------------------------------------------------------- */

    const photo = await load(
      job.photoUrl,
      `${job.label} T-shirt photo`,
    )

    const native = sizeOf(photo)

    const size = finalSize(
      native.width,
      native.height,
      limit,
    )

    /* ---------------------------------------------------------------------- */
    /* NEW PRESENTATION RENDERER                                               */
    /* ---------------------------------------------------------------------- */

    const rendered =
      await renderPresentationJob(
        job,
        {
          loadImage: load,
          env,
          scale: size.scale,
        },
      )

    if (!rendered?.canvas) {
      throw new CompositeError(
        COMPOSITE_ERROR.RENDER_FAILURE,
        `The ${job.label} mockup could not be rendered.`,
      )
    }

    canvas = rendered.canvas

    const blob = await encode(canvas)

    return {
      blob,

      filename: finalFilename(
        job.view,
      ),

      view: job.view,

      label: job.label,

      width: canvas.width,

      height: canvas.height,

      sourceWidth: native.width,

      sourceHeight: native.height,

      downscaled: size.downscaled,

      /*
       * Useful for debugging.
       *
       * This tells the caller which T-shirt version was used.
       */
      sourceAsset:
        job.photoAsset?.backgroundRemoved &&
        job.photoAsset?.processedUrl
          ? 'processed'
          : 'original',

      /*
       * Additional debugging information.
       * These fields do not affect the PNG.
       */
      backgroundMode:
        job.background?.mode ??
        'original',

      customBackground:
        !!job.backgroundImageUrl,
    }
  } catch (err) {
    throw toCompositeError(err)
  } finally {
    /*
     * Release cached fabric maps created for images loaded during export.
     */
    for (const image of loadedImages) {
      releaseFabricMaps(image)
    }

    /*
     * Release the output canvas memory.
     */
    if (canvas) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
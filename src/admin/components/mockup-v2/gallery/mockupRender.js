/**
 * LAGAMLESS Mockup Studio
 *
 * Gallery render bridge.
 *
 * IMPORTANT:
 * This file contains NO independent rendering algorithm.
 *
 * Saving and regenerating always use:
 *
 *     finalRender.js
 *          ↓
 *     presentationRender.js
 *
 * Therefore:
 *
 * Preview
 * Download
 * Gallery
 * Regenerate
 *
 * all use the same composition pipeline.
 */

import {
  COMPOSITE_ERROR,
  CompositeError,
  toCompositeError,
} from '../compositing/compositeErrors.js'

import {
  renderFinalView,
  snapshotView,
} from '../compositing/finalRender.js'

import {
  createMockup,
  mockupSourceUrl,
  replaceMockupImage,
  uploadMockupSource,
  MockupError,
} from '../../../../services/adminMockups.js'

import {
  buildRenderConfig,
  configSourcePaths,
  resolveRenderJob,
  validateDimensions,
  validateImageFile,
} from './galleryModel.js'


// ============================================================
// IMAGE LOADING
// ============================================================

/**
 * Loads an image for canvas rendering.
 *
 * crossOrigin is required for Supabase-hosted images.
 * Blob URLs are also supported.
 */
export function loadImageElement(
  url,
  label
) {
  return new Promise(
    (resolve, reject) => {
      if (!url) {
        reject(
          new CompositeError(
            COMPOSITE_ERROR.MISSING_PHOTO,
            `The ${label} is missing.`
          )
        )

        return
      }

      const img =
        new Image()

      img.crossOrigin =
        'anonymous'

      img.onload = () => {
        if (
          img.naturalWidth > 0 &&
          img.naturalHeight > 0
        ) {
          resolve(img)
        } else {
          reject(
            new CompositeError(
              COMPOSITE_ERROR.INVALID_IMAGE,
              `The ${label} decoded with no readable dimensions.`
            )
          )
        }
      }

      img.onerror = () => {
        reject(
          new CompositeError(
            COMPOSITE_ERROR.CORRUPTED_IMAGE,
            `The ${label} could not be loaded. It may be missing, corrupted or in an unsupported format.`
          )
        )
      }

      img.src = url
    }
  )
}


// ============================================================
// FILE VALIDATION
// ============================================================

/**
 * Reads an uploaded image and proves that it decodes.
 */
export async function readImageFile(
  file
) {
  const url =
    URL.createObjectURL(file)

  try {
    const img =
      await loadImageElement(
        url,
        'image'
      )

    return {
      width:
        img.naturalWidth,

      height:
        img.naturalHeight,
    }
  } finally {
    URL.revokeObjectURL(
      url
    )
  }
}


/**
 * Full validation for uploaded gallery replacement images.
 */
export async function validateReplacementFile(
  file
) {
  const basic =
    validateImageFile(file)

  if (basic) {
    throw new MockupError(
      'INVALID_FILE',
      basic
    )
  }

  let size

  try {
    size =
      await readImageFile(
        file
      )
  } catch {
    throw new MockupError(
      'INVALID_FILE',
      'That file could not be read as an image. It may be corrupted.'
    )
  }

  const dimensionError =
    validateDimensions(
      size.width,
      size.height
    )

  if (dimensionError) {
    throw new MockupError(
      'INVALID_FILE',
      dimensionError
    )
  }

  return size
}


// ============================================================
// SOURCE STORAGE
// ============================================================

/**
 * Store every source required to regenerate one render job.
 *
 * This now includes:
 *
 * - original T-shirt photo
 * - processed/background-removed T-shirt
 * - T-shirt mask
 * - design mask
 * - custom background
 * - artwork
 */
async function storeJobSources(
  productId,
  job
) {
  const urls = [
    job.photoUrl,
    job.processedPhotoUrl,
    job.tshirtMaskUrl,
    job.designMaskUrl,
    job.backgroundImageUrl,

    ...(job.layers ?? []).map(
      (layer) =>
        layer.sourceUrl
    ),
  ].filter(Boolean)

  const pathByUrl =
    new Map()

  /*
   * Upload each unique source only once.
   */
  for (
    const url of new Set(urls)
  ) {
    let blob

    try {
      const response =
        await fetch(url)

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        )
      }

      blob =
        await response.blob()
    } catch {
      throw new MockupError(
        'SOURCE_UNREADABLE',
        'A source image of this mockup could not be read, so the mockup cannot be saved as regenerable.'
      )
    }

    const path =
      await uploadMockupSource(
        productId,
        blob
      )

    pathByUrl.set(
      url,
      path
    )
  }

  /*
   * Convert the live render job into a durable JSON configuration.
   */
  const config =
    buildRenderConfig(
      job,
      (url) =>
        pathByUrl.get(url)
    )

  return {
    config,

    sourcePaths:
      configSourcePaths(
        config
      ),
  }
}


// ============================================================
// SAVE CURRENT STUDIO VIEW
// ============================================================

/**
 * Render and save one exact Studio view.
 *
 * IMPORTANT:
 *
 * This snapshots the requested view.
 *
 * It does NOT change activeView.
 */
export async function saveStudioView({
  state,
  view,
  productId,
  replace = null,
}) {
  if (!state) {
    throw new MockupError(
      'INVALID_STATE',
      'Mockup Studio state is unavailable.'
    )
  }

  if (!productId) {
    throw new MockupError(
      'INVALID_PRODUCT',
      'The product ID is missing.'
    )
  }

  /*
   * Immutable view snapshot.
   */
  const job =
    snapshotView(
      state,
      view
    )

  if (!job) {
    throw new MockupError(
      'VIEW_NOT_READY',
      `The ${view} view does not have a T-shirt photo yet.`
    )
  }

  let result

  try {
    result =
      await renderFinalView(
        job,
        {
          loadImage:
            loadImageElement,
        }
      )
  } catch (err) {
    throw toCompositeError(
      err
    )
  }

  /*
   * Store every source required for future regeneration.
   */
  const {
    config,
    sourcePaths,
  } =
    await storeJobSources(
      productId,
      job
    )

  const payload = {
    blob:
      result.blob,

    width:
      result.width,

    height:
      result.height,

    renderConfig:
      config,

    sourcePaths,

    origin:
      'studio',
  }

  /*
   * Replace existing view if requested.
   *
   * Otherwise create a new view record.
   */
  if (replace) {
    return replaceMockupImage(
      replace,
      payload
    )
  }

  return createMockup({
    productId,
    view,

    ...payload,
  })
}


// ============================================================
// REGENERATE GALLERY MOCKUP
// ============================================================

/**
 * Re-render a saved Studio mockup from its stored configuration.
 *
 * Supports:
 *
 * version 1
 * version 2
 *
 * Version 2 contains:
 *
 * - processed T-shirt
 * - background
 * - custom background
 * - presentation
 * - view-specific artwork
 */
export async function regenerateMockup(
  mockup
) {
  if (!mockup) {
    throw new MockupError(
      'INVALID_MOCKUP',
      'The selected mockup could not be found.'
    )
  }

  const config =
    mockup.renderConfig

  if (
    !config ||
    !(
      config.version === 1 ||
      config.version === 2
    )
  ) {
    throw new MockupError(
      'NO_CONFIG',
      'This mockup has no saved render settings, so it cannot be regenerated. Recreate it in Mockup Studio and save it again.'
    )
  }

  /*
   * Version 2 configurations are already in the exact
   * structure expected by the final renderer.
   *
   * Version 1 configurations are converted by resolveRenderJob()
   * for backward compatibility.
   */
  let job

  try {
    job =
      resolveRenderJob(
        config,
        mockupSourceUrl
      )
  } catch (err) {
    throw new MockupError(
      'INVALID_CONFIG',
      `This mockup configuration could not be restored: ${err?.message || 'invalid configuration'}.`
    )
  }

  let result

  try {
    result =
      await renderFinalView(
        job,
        {
          loadImage:
            loadImageElement,
        }
      )
  } catch (err) {
    const error =
      toCompositeError(
        err
      )

    throw new MockupError(
      'SOURCE_MISSING',
      `Could not regenerate — ${error.message} Nothing was changed.`
    )
  }

  /*
   * Replace only the rendered image.
   *
   * Keep the existing render configuration and source paths.
   */
  return replaceMockupImage(
    mockup,
    {
      blob:
        result.blob,

      width:
        result.width,

      height:
        result.height,

      /*
       * Preserve the saved configuration.
       */
      renderConfig:
        config,

      sourcePaths:
        mockup.sourcePaths ??
        [],

      origin:
        'studio',
    }
  )
}
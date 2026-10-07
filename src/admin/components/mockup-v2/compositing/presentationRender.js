import {
  COMPOSITE_ERROR,
  CompositeError,
  toCompositeError,
} from './compositeErrors.js'

import {
  renderComposite,
  browserEnv,
  sizeOf,
  releaseFabricMaps,
} from './renderComposite.js'

import { placementFromLayer } from './placement.js'
import {
  clampPresentation,
  shirtSize,
} from '../tshirtPresentation.js'

import { COMPOSITION_ASPECT } from '../compositionFrame.js'
import { getPreset } from '../backgroundPresets.js'

function parseHex(value) {
  const m =
    /^#?([0-9a-f]{6})$/i.exec(
      String(value || '').trim(),
    )

  return m
    ? `#${m[1]}`
    : '#111111'
}

function paintGradient(
  ctx,
  width,
  height,
  c1,
  c2,
  direction = 'top-bottom',
) {
  let g

  if (direction === 'left-right') {
    g = ctx.createLinearGradient(
      0,
      0,
      width,
      0,
    )
  } else if (direction === 'tl-br') {
    g = ctx.createLinearGradient(
      0,
      0,
      width,
      height,
    )
  } else if (direction === 'bl-tr') {
    g = ctx.createLinearGradient(
      0,
      height,
      width,
      0,
    )
  } else if (direction === 'radial') {
    g = ctx.createRadialGradient(
      width * 0.5,
      height * 0.35,
      0,
      width * 0.5,
      height * 0.55,
      Math.max(width, height) * 0.8,
    )
  } else {
    g = ctx.createLinearGradient(
      0,
      0,
      0,
      height,
    )
  }

  g.addColorStop(0, c1)
  g.addColorStop(1, c2)

  ctx.fillStyle = g
  ctx.fillRect(
    0,
    0,
    width,
    height,
  )
}

function paintPreset(
  ctx,
  preset,
  width,
  height,
) {
  if (!preset) {
    return false
  }

  const id = preset.id

  const solid = {
    'studio-gray': '#e4e4e2',
    'studio-warm': '#e6ded2',
    'minimal-offwhite': '#f7f5f0',
    'minimal-beige': '#e9ddcb',
    'dark-black': '#101010',
    'dark-charcoal': '#2a2c30',
    'dark-navy': '#0e1a33',
    'light-blush': '#f2e4e0',
    'light-sage': '#e2e9de',
  }[id]

  if (solid) {
    ctx.fillStyle = solid
    ctx.fillRect(
      0,
      0,
      width,
      height,
    )

    return true
  }

  if (id === 'studio-white') {
    paintGradient(
      ctx,
      width,
      height,
      '#ffffff',
      '#ededeb',
      'radial',
    )

    return true
  }

  if (id === 'grad-light') {
    paintGradient(
      ctx,
      width,
      height,
      '#ffffff',
      '#e2e0dc',
    )

    return true
  }

  if (id === 'grad-dark') {
    paintGradient(
      ctx,
      width,
      height,
      '#30333a',
      '#0a0a0b',
      'tl-br',
    )

    return true
  }

  if (id === 'grad-warm') {
    paintGradient(
      ctx,
      width,
      height,
      '#f7e9da',
      '#e8c7ac',
      'tl-br',
    )

    return true
  }

  if (id === 'life-wall-floor') {
    const y = height * 0.70

    const g =
      ctx.createLinearGradient(
        0,
        0,
        0,
        height,
      )

    g.addColorStop(
      0,
      '#ebe4d9',
    )

    g.addColorStop(
      0.695,
      '#ebe4d9',
    )

    g.addColorStop(
      0.70,
      '#cdb9a0',
    )

    g.addColorStop(
      1,
      '#b69e83',
    )

    ctx.fillStyle = g

    ctx.fillRect(
      0,
      0,
      width,
      height,
    )

    ctx.fillStyle =
      'rgba(255,255,255,.20)'

    ctx.fillRect(
      width * 0.08,
      0,
      width * 0.22,
      y,
    )

    return true
  }

  if (id === 'life-sunlit') {
    paintGradient(
      ctx,
      width,
      height,
      '#e9dcc8',
      '#d8c6ad',
    )

    const glow =
      ctx.createRadialGradient(
        width * 0.22,
        height * 0.12,
        0,
        width * 0.22,
        height * 0.12,
        width * 0.7,
      )

    glow.addColorStop(
      0,
      'rgba(255,247,234,.95)',
    )

    glow.addColorStop(
      1,
      'rgba(255,247,234,0)',
    )

    ctx.fillStyle = glow

    ctx.fillRect(
      0,
      0,
      width,
      height,
    )

    return true
  }

  return false
}

async function paintBackground(
  ctx,
  job,
  width,
  height,
  loadImage,
) {
  const background =
    job.background || {
      mode: 'original',
    }

  const mode =
    background.mode || 'original'

  /**
   * Transparent means no background at all.
   */
  if (mode === 'transparent') {
    return
  }

  /**
   * Custom uploaded background.
   *
   * The image is cropped using cover behaviour.
   * It is never stretched.
   */
  if (
    mode === 'image' &&
    job.backgroundImageUrl
  ) {
    const image =
      await loadImage(
        job.backgroundImageUrl,
        'background image',
      )

    const iw =
      image.naturalWidth ||
      image.width

    const ih =
      image.naturalHeight ||
      image.height

    if (
      !(iw > 0) ||
      !(ih > 0)
    ) {
      throw new CompositeError(
        COMPOSITE_ERROR.INVALID_IMAGE,
        'The background image has no readable dimensions.',
      )
    }

    const scale =
      Math.max(
        width / iw,
        height / ih,
      )

    const dw =
      iw * scale

    const dh =
      ih * scale

    ctx.drawImage(
      image,
      (width - dw) / 2,
      (height - dh) / 2,
      dw,
      dh,
    )

    return
  }

  /**
   * Solid background.
   */
  if (mode === 'solid') {
    ctx.fillStyle =
      parseHex(
        background.color,
      )

    ctx.fillRect(
      0,
      0,
      width,
      height,
    )

    return
  }

  /**
   * Gradient background.
   */
  if (mode === 'gradient') {
    paintGradient(
      ctx,
      width,
      height,
      parseHex(
        background.gradientColor1,
      ),
      parseHex(
        background.gradientColor2,
      ),
      background.gradientDirection,
    )

    return
  }

  /**
   * Preset background.
   */
  if (mode === 'preset') {
    if (
      paintPreset(
        ctx,
        getPreset(
          background.presetId,
        ),
        width,
        height,
      )
    ) {
      return
    }
  }

  /**
   * IMPORTANT:
   *
   * Original mode is intentionally left
   * empty here when background removal is
   * active.
   *
   * The original complete photograph is
   * handled separately below.
   */
}

/**
 * Creates a T-shirt-only version of the
 * ORIGINAL photograph.
 *
 * The important difference from the old
 * implementation is:
 *
 * ORIGINAL PHOTO
 *       ↓
 * processed cutout alpha
 *       ↓
 * original shirt pixels preserved
 *
 * This keeps:
 *
 * - folds
 * - fabric texture
 * - natural shadows
 * - highlights
 * - garment edges
 *
 * from the real photograph.
 */
function createPhotoFromCutout(
  original,
  processed,
  env = browserEnv,
) {
  if (!original) {
    return null
  }

  if (!processed) {
    return null
  }

  const {
    width,
    height,
  } = sizeOf(original)

  if (
    !(width > 0) ||
    !(height > 0)
  ) {
    return null
  }

  const {
    width: processedWidth,
    height: processedHeight,
  } = sizeOf(processed)

  if (
    processedWidth !== width ||
    processedHeight !== height
  ) {
    throw new CompositeError(
      COMPOSITE_ERROR.INVALID_IMAGE,
      'The background-removed T-shirt dimensions do not match the original photograph.',
    )
  }

  /**
   * Base canvas contains the ORIGINAL
   * photograph.
   */
  const canvas =
    env.createCanvas(
      width,
      height,
    )

  const ctx =
    canvas.getContext('2d')

  ctx.clearRect(
    0,
    0,
    width,
    height,
  )

  ctx.drawImage(
    original,
    0,
    0,
    width,
    height,
  )

  /**
   * The processed cutout supplies only
   * its alpha channel.
   *
   * This removes the original photo
   * background while keeping the original
   * shirt pixels.
   */
  const alpha =
    env.createCanvas(
      width,
      height,
    )

  const alphaCtx =
    alpha.getContext('2d')

  alphaCtx.clearRect(
    0,
    0,
    width,
    height,
  )

  alphaCtx.drawImage(
    processed,
    0,
    0,
    width,
    height,
  )

  /**
   * Keep only pixels belonging to the
   * processed T-shirt.
   */
  ctx.globalCompositeOperation =
    'destination-in'

  ctx.drawImage(
    alpha,
    0,
    0,
    width,
    height,
  )

  ctx.globalCompositeOperation =
    'source-over'

  return canvas
}

/**
 * Fallback when no processed cutout
 * exists but a T-shirt mask is available.
 *
 * This keeps the existing mask workflow
 * compatible.
 */
function createMaskedCutout(
  photo,
  tshirtMask,
  env = browserEnv,
) {
  if (!tshirtMask) {
    return null
  }

  const {
    width,
    height,
  } = sizeOf(photo)

  const canvas =
    env.createCanvas(
      width,
      height,
    )

  const ctx =
    canvas.getContext('2d')

  ctx.clearRect(
    0,
    0,
    width,
    height,
  )

  ctx.drawImage(
    photo,
    0,
    0,
    width,
    height,
  )

  const mask =
    env.createCanvas(
      width,
      height,
    )

  const mctx =
    mask.getContext('2d')

  mctx.drawImage(
    tshirtMask,
    0,
    0,
    width,
    height,
  )

  ctx.globalCompositeOperation =
    'destination-in'

  ctx.drawImage(
    mask,
    0,
    0,
    width,
    height,
  )

  ctx.globalCompositeOperation =
    'source-over'

  return canvas
}

/**
 * Main presentation compositor.
 *
 * Layer order:
 *
 * BACKGROUND
 *     ↓
 * REAL T-SHIRT PHOTO / CUTOUT
 *     ↓
 * ARTWORK + FABRIC INTEGRATION
 *     ↓
 * PRESENTATION SHADOW
 *     ↓
 * VIGNETTE
 */
export async function renderPresentationJob(
  job,
  {
    loadImage,
    env = browserEnv,
    scale = 1,
  } = {},
) {
  try {
    if (!job?.photoUrl) {
      throw new CompositeError(
        COMPOSITE_ERROR.MISSING_PHOTO,
        `The ${
          job?.label || 'view'
        } photo is missing.`,
      )
    }

    /**
     * ALWAYS load the original photograph.
     *
     * This is the important source for
     * realistic fabric.
     */
    const original =
      await loadImage(
        job.photoUrl,
        `${job.label} photo`,
      )

    const originalSize =
      sizeOf(original)

    if (
      !(originalSize.width > 0) ||
      !(originalSize.height > 0)
    ) {
      throw new CompositeError(
        COMPOSITE_ERROR.INVALID_IMAGE,
        `${job.label} photo has no readable dimensions.`,
      )
    }

    /**
     * Optional T-shirt mask.
     */
    const tshirtMask =
      job.tshirtMaskUrl
        ? await loadImage(
            job.tshirtMaskUrl,
            `${job.label} T-shirt mask`,
          )
        : null

    /**
     * Optional design mask.
     */
    const designMask =
      job.designMaskUrl
        ? await loadImage(
            job.designMaskUrl,
            `${job.label} design mask`,
          )
        : null

    /**
     * Background-removed T-shirt.
     *
     * IMPORTANT:
     * We DO NOT use this as the final
     * photographic source.
     *
     * We use it only as an alpha/cutout
     * reference.
     */
    const processed =
      job.processedPhotoUrl
        ? await loadImage(
            job.processedPhotoUrl,
            `${job.label} background-removed T-shirt`,
          )
        : null

    /**
     * Validate processed dimensions.
     */
    if (processed) {
      const processedSize =
        sizeOf(processed)

      if (
        processedSize.width !==
          originalSize.width ||
        processedSize.height !==
          originalSize.height
      ) {
        throw new CompositeError(
          COMPOSITE_ERROR.INVALID_IMAGE,
          `${job.label} processed T-shirt dimensions do not match the original photograph.`,
        )
      }
    }

    const backgroundMode =
      job.background?.mode ||
      'original'

    /**
     * We need a cutout whenever:
     *
     * - background removal is active
     * OR
     * - user selected a studio/custom
     *   background.
     */
    const useCutout =
      Boolean(processed) ||
      backgroundMode !== 'original'

    let garment = null

    /**
     * PRIMARY PATH:
     *
     * Use the processed image ONLY to
     * determine transparency.
     *
     * The actual visible shirt comes
     * from the ORIGINAL photograph.
     */
    if (processed) {
      garment =
        createPhotoFromCutout(
          original,
          processed,
          env,
        )
    }

    /**
     * FALLBACK PATH:
     *
     * If background removal was not
     * performed but a T-shirt mask exists,
     * use the mask against the original photo.
     */
    if (
      !garment &&
      useCutout &&
      tshirtMask
    ) {
      garment =
        createMaskedCutout(
          original,
          tshirtMask,
          env,
        )
    }

    /**
     * Studio background requires some
     * transparent garment source.
     */
    if (
      !garment &&
      useCutout &&
      !tshirtMask
    ) {
      throw new CompositeError(
        COMPOSITE_ERROR.MISSING_MASK,
        `${job.label}: remove the photo background or upload a T-shirt mask before using a studio background.`,
      )
    }

    /**
     * Original mode with no cutout:
     *
     * simply show the original photograph.
     */
    const frameW =
      Math.max(
        1,
        Math.round(
          1200 * scale,
        ),
      )

    const frameH =
      Math.max(
        1,
        Math.round(
          frameW /
            COMPOSITION_ASPECT,
        ),
      )

    const out =
      env.createCanvas(
        frameW,
        frameH,
      )

    const ctx =
      out.getContext('2d')

    ctx.clearRect(
      0,
      0,
      frameW,
      frameH,
    )

    /**
     * ORIGINAL PHOTO MODE
     *
     * No background removal and no
     * alternate background.
     */
    if (
      backgroundMode ===
        'original' &&
      !processed
    ) {
      const k =
        Math.min(
          frameW /
            originalSize.width,
          frameH /
            originalSize.height,
        )

      const dw =
        originalSize.width *
        k

      const dh =
        originalSize.height *
        k

      ctx.drawImage(
        original,
        (frameW - dw) / 2,
        (frameH - dh) / 2,
        dw,
        dh,
      )

      return {
        canvas: out,
        width: frameW,
        height: frameH,
        sourceWidth:
          originalSize.width,
        sourceHeight:
          originalSize.height,
      }
    }

    /**
     * STUDIO / CUSTOM / TRANSPARENT MODE
     */
    await paintBackground(
      ctx,
      job,
      frameW,
      frameH,
      loadImage,
    )

    /**
     * Presentation controls.
     */
    const p =
      clampPresentation(
        {
          width:
            originalSize.width,
          height:
            originalSize.height,
        },
        job.presentation || {},
      )

    const shirtDimensions =
      shirtSize(
        {
          width:
            originalSize.width,
          height:
            originalSize.height,
        },
        p.scale,
        COMPOSITION_ASPECT,
      )

    const shirtW =
      frameW *
      (shirtDimensions.w / 100)

    const shirtH =
      frameH *
      (shirtDimensions.h / 100)

    const shirtX =
      frameW *
        (p.x / 100) -
      shirtW / 2

    const shirtY =
      frameH *
        (p.y / 100) -
      shirtH / 2

    /**
     * This is the REAL garment image.
     *
     * It contains:
     *
     * - original fabric
     * - original lighting
     * - original folds
     * - original shadows
     *
     * but NO original background.
     */
    const garmentSource =
      garment || original

    const sourceSize =
      sizeOf(garmentSource)

    const garmentCanvas =
      env.createCanvas(
        sourceSize.width,
        sourceSize.height,
      )

    /**
     * Artwork list.
     */
    const artworkImages = []

    for (
      const layer of
        job.layers || []
    ) {
      if (!layer.visible) {
        continue
      }

      if (!layer.sourceUrl) {
        continue
      }

      const image =
        await loadImage(
          layer.sourceUrl,
          `artwork "${
            layer.name ||
            'Artwork'
          }"`,
        )

      artworkImages.push({
        image,

        placement:
          placementFromLayer(
            layer,
            original,
          ),
      })
    }

    /**
     * IMPORTANT:
     *
     * renderComposite receives the
     * ORIGINAL-PHOTO-BASED garment.
     *
     * Therefore fabricIntegration.js
     * can analyse the real shirt texture
     * instead of the flattened processed
     * cutout.
     */
    renderComposite(
      {
        photo:
          garmentSource,

        fabricPhoto:
          original,

        tshirtMask,

        designMask,

        photoAlphaAllowed:
          Boolean(processed),

        artworks:
          artworkImages,

        scale: 1,
      },
      {
        canvas:
          garmentCanvas,
      },
      env,
    )

    /**
     * Release cached fabric analysis.
     */
    releaseFabricMaps(
      garmentSource,
    )

    /**
     * Presentation shadow.
     */
    if (
      p.shadow !== false
    ) {
      ctx.save()

      ctx.shadowColor =
        'rgba(0,0,0,.32)'

      ctx.shadowBlur =
        Math.max(
          12,
          frameW * 0.018,
        )

      ctx.shadowOffsetY =
        Math.max(
          8,
          frameH * 0.012,
        )

      ctx.drawImage(
        garmentCanvas,
        shirtX,
        shirtY,
        shirtW,
        shirtH,
      )

      ctx.restore()
    } else {
      ctx.drawImage(
        garmentCanvas,
        shirtX,
        shirtY,
        shirtW,
        shirtH,
      )
    }

    /**
     * Premium vignette.
     */
    const vignette =
      ctx.createRadialGradient(
        frameW * 0.5,
        frameH * 0.42,
        frameW * 0.18,
        frameW * 0.5,
        frameH * 0.5,
        frameW * 0.78,
      )

    vignette.addColorStop(
      0,
      'rgba(255,255,255,0)',
    )

    vignette.addColorStop(
      1,
      'rgba(0,0,0,.18)',
    )

    ctx.fillStyle =
      vignette

    ctx.fillRect(
      0,
      0,
      frameW,
      frameH,
    )

    return {
      canvas: out,
      width: frameW,
      height: frameH,
      sourceWidth:
        originalSize.width,
      sourceHeight:
        originalSize.height,
    }
  } catch (err) {
    throw toCompositeError(
      err,
    )
  }
}
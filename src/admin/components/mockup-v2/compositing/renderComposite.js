import { COMPOSITE_ERROR, CompositeError, toCompositeError } from './compositeErrors.js'
import { assertMaskMatchesPhoto } from './maskValidation.js'
import { allowanceFromRgba, allowanceFromAlphaRgba, combineAllowance, allowanceToAlphaRgba } from './maskMath.js'
import { effectiveBox } from './placement.js'
import { applyFabric, buildFabricMap } from './fabricIntegration.js'
import { applyWarp, warpPadding } from './surfaceWarp.js'

/**
 * STEP 5-3D-1 — PHOTO-AWARE FABRIC COMPOSITING
 *
 * Pipeline:
 *
 * ORIGINAL PHOTO
 *      ↓
 * fabric / fold / lighting analysis
 *
 * BACKGROUND-REMOVED T-SHIRT
 *      ↓
 * visible garment
 *
 * ARTWORK
 *      ↓
 * mask + warp + fabric integration
 *
 * FINAL GARMENT
 *
 * IMPORTANT:
 * - The original photo is used for fabric analysis.
 * - The processed/cutout photo is used for the visible garment.
 * - The original photo background is NEVER painted into the final result.
 * - A processed transparent cutout can define the garment allowance directly; masks remain a fallback.
 * - Artwork remains non-destructive.
 */

export const browserEnv = {
  createCanvas(width, height) {
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    return c
  },
}

export const sizeOf = (img) => ({
  width: img?.naturalWidth || img?.width || 0,
  height: img?.naturalHeight || img?.height || 0,
})

/**
 * Builds the printable-region alpha canvas.
 *
 * White RGB + alpha = allowed artwork region.
 */
export function buildPrintableRegion(
  { photo, tshirtMask, designMask, photoAlphaAllowed = false },
  env = browserEnv,
) {
  const size = sizeOf(photo)

  if (!(size.width > 0 && size.height > 0)) {
    throw new CompositeError(
      COMPOSITE_ERROR.INVALID_IMAGE,
      'The photo has no readable dimensions.',
    )
  }

  if (!tshirtMask && !photoAlphaAllowed) {
    throw new CompositeError(
      COMPOSITE_ERROR.MISSING_MASK,
      'The garment is not isolated. Remove the photo background or upload a T-shirt mask before placing artwork.',
    )
  }

  if (tshirtMask) {
    assertMaskMatchesPhoto(
      size,
      sizeOf(tshirtMask),
      'T-shirt mask',
    )
  }

  if (designMask) {
    assertMaskMatchesPhoto(
      size,
      sizeOf(designMask),
      'design mask',
    )
  }

  const read = (img) => {
    const c = env.createCanvas(size.width, size.height)
    const ctx = c.getContext('2d', {
      willReadFrequently: true,
    })

    ctx.drawImage(
      img,
      0,
      0,
      size.width,
      size.height,
    )

    try {
      return allowanceFromRgba(
        ctx.getImageData(
          0,
          0,
          size.width,
          size.height,
        ).data,
      )
    } catch (err) {
      throw new CompositeError(
        COMPOSITE_ERROR.CORRUPTED_IMAGE,
        `A mask could not be read (${err.message}). It may be corrupted or cross-origin.`,
      )
    }
  }

  const shirtAllowance = tshirtMask
    ? read(tshirtMask)
    : allowanceFromAlphaRgba(
        (() => {
          const c = env.createCanvas(size.width, size.height)
          const ctx = c.getContext('2d', { willReadFrequently: true })
          ctx.drawImage(photo, 0, 0, size.width, size.height)
          try {
            return ctx.getImageData(0, 0, size.width, size.height).data
          } catch (err) {
            throw new CompositeError(
              COMPOSITE_ERROR.CORRUPTED_IMAGE,
              `The background-removed garment could not be read (${err.message}). It may be corrupted or cross-origin.`,
            )
          }
        })(),
      )

  const allowance = combineAllowance(
    shirtAllowance,
    designMask ? read(designMask) : null,
  )

  const out = env.createCanvas(
    size.width,
    size.height,
  )

  const octx = out.getContext('2d')

  const img = octx.createImageData(
    size.width,
    size.height,
  )

  img.data.set(
    allowanceToAlphaRgba(allowance),
  )

  octx.putImageData(img, 0, 0)

  return {
    canvas: out,
    allowance,
    width: size.width,
    height: size.height,
  }
}

/**
 * Draw one artwork with placement.
 */
function drawArtwork(
  ctx,
  art,
  k = 1,
  ox = 0,
  oy = 0,
) {
  const {
    cx,
    cy,
    w,
    h,
  } = effectiveBox(art.placement)

  if (!(w > 0 && h > 0)) return

  ctx.save()

  ctx.globalAlpha =
    art.placement.opacity

  ctx.translate(
    cx * k - ox,
    cy * k - oy,
  )

  ctx.rotate(
    (art.placement.rotation * Math.PI) / 180,
  )

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  ctx.drawImage(
    art.image,
    (-w / 2) * k,
    (-h / 2) * k,
    w * k,
    h * k,
  )

  ctx.restore()
}

/**
 * Pixel bounding box of rotated artwork.
 */
function artworkBounds(
  art,
  k,
  width,
  height,
  pad = 0,
) {
  const {
    cx,
    cy,
    w,
    h,
  } = effectiveBox(art.placement)

  const rad =
    (art.placement.rotation * Math.PI) / 180

  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))

  const hw =
    ((w * c + h * s) / 2) * k +
    2 +
    pad

  const hh =
    ((w * s + h * c) / 2) * k +
    2 +
    pad

  const x0 = Math.max(
    0,
    Math.floor(cx * k - hw),
  )

  const y0 = Math.max(
    0,
    Math.floor(cy * k - hh),
  )

  const x1 = Math.min(
    width,
    Math.ceil(cx * k + hw),
  )

  const y1 = Math.min(
    height,
    Math.ceil(cy * k + hh),
  )

  return {
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
  }
}

/**
 * Fabric maps are now deliberately derived from the ORIGINAL PHOTO,
 * not the background-removed cutout.
 *
 * This is the critical STEP 5-3D fix.
 */
export const MAP_MAX_PIXELS = 12_000_000

const fabricMaps = new WeakMap()

export function releaseFabricMaps(photo) {
  if (
    photo &&
    typeof photo === 'object'
  ) {
    fabricMaps.delete(photo)
  }
}

/**
 * Build/reuse fabric analysis for the ORIGINAL PHOTO.
 *
 * `fabricPhoto` is intentionally separate from the visible garment.
 */
function fabricMapFor(
  fabricPhoto,
  region,
  width,
  height,
  env,
) {
  let entry = fabricMaps.get(
    fabricPhoto,
  )

  if (
    !entry ||
    entry.region !== region.canvas
  ) {
    entry = {
      region: region.canvas,
      sizes: new Map(),
    }

    fabricMaps.set(
      fabricPhoto,
      entry,
    )
  }

  const key =
    `${width}x${height}`

  if (!entry.sizes.has(key)) {
    const cap =
      env.mapMaxPixels ??
      MAP_MAX_PIXELS

    const f =
      width * height > cap
        ? Math.sqrt(
            cap /
              (width * height),
          )
        : 1

    const aw = Math.max(
      1,
      Math.round(width * f),
    )

    const ah = Math.max(
      1,
      Math.round(height * f),
    )

    const read = (source) => {
      const c =
        env.createCanvas(
          aw,
          ah,
        )

      const g =
        c.getContext(
          '2d',
          {
            willReadFrequently: true,
          },
        )

      g.imageSmoothingQuality =
        'high'

      g.drawImage(
        source,
        0,
        0,
        aw,
        ah,
      )

      const data =
        g.getImageData(
          0,
          0,
          aw,
          ah,
        ).data

      c.width = 0
      c.height = 0

      return data
    }

    /**
     * CRITICAL:
     *
     * Fabric information comes from
     * the ORIGINAL photograph.
     */
    const rgba =
      read(fabricPhoto)

    /**
     * Printable region still comes
     * from the garment mask.
     */
    const regionRgba =
      read(region.canvas)

    const allowance =
      new Uint8ClampedArray(
        aw * ah,
      )

    for (
      let i = 0, j = 3;
      i < allowance.length;
      i += 1, j += 4
    ) {
      allowance[i] =
        regionRgba[j]
    }

    if (
      entry.sizes.size >= 3
    ) {
      entry.sizes.delete(
        entry.sizes.keys().next().value,
      )
    }

    const map =
      buildFabricMap(
        rgba,
        aw,
        ah,
        allowance,
      )

    if (f < 1) {
      Object.assign(
        map,
        {
          scaleX:
            aw / width,

          scaleY:
            ah / height,

          renderWidth:
            width,

          renderHeight:
            height,
        },
      )
    }

    entry.sizes.set(
      key,
      map,
    )
  }

  return entry.sizes.get(key)
}

/**
 * Main compositor.
 *
 * `photo`
 *   = visible garment source.
 *
 * `fabricPhoto`
 *   = ORIGINAL T-shirt photo used only
 *     for fabric/fold/light analysis.
 */
export function renderComposite(
  input,
  target,
  env = browserEnv,
) {
  try {
    const {
      photo,
      fabricPhoto = photo,
      tshirtMask,
      designMask = null,
      photoAlphaAllowed = false,
      artworks = [],
    } = input

    if (!photo) {
      throw new CompositeError(
        COMPOSITE_ERROR.MISSING_PHOTO,
        'No T-shirt photo loaded.',
      )
    }

    if (!fabricPhoto) {
      throw new CompositeError(
        COMPOSITE_ERROR.MISSING_PHOTO,
        'No original T-shirt photo available for fabric analysis.',
      )
    }

    const {
      width,
      height,
    } = sizeOf(photo)

    if (
      !(width > 0 && height > 0)
    ) {
      throw new CompositeError(
        COMPOSITE_ERROR.INVALID_IMAGE,
        'The photo has no readable dimensions.',
      )
    }

    const fabricSize =
      sizeOf(fabricPhoto)

    if (
      fabricSize.width !== width ||
      fabricSize.height !== height
    ) {
      throw new CompositeError(
        COMPOSITE_ERROR.INVALID_IMAGE,
        'The original T-shirt photo and visible garment must have identical dimensions for fabric integration.',
      )
    }

    for (
      const a of artworks
    ) {
      if (
        !a?.image ||
        !(sizeOf(a.image).width > 0)
      ) {
        throw new CompositeError(
          COMPOSITE_ERROR.MISSING_ARTWORK,
          'An artwork image is missing or unreadable.',
        )
      }
    }

    /**
     * Draft renders.
     */
    const scale =
      typeof input.scale === 'number' &&
      input.scale > 0 &&
      input.scale < 1
        ? input.scale
        : 1

    const rw =
      scale < 1
        ? Math.max(
            1,
            Math.round(
              width * scale,
            ),
          )
        : width

    const rh =
      scale < 1
        ? Math.max(
            1,
            Math.round(
              height *
                (rw / width),
            ),
          )
        : height

    const k =
      rw / width

    /**
     * Layer 1:
     *
     * Visible garment.
     *
     * IMPORTANT:
     * This may be a transparent cutout.
     */
    const out =
      target.canvas

    if (out.width !== rw) {
      out.width = rw
    }

    if (out.height !== rh) {
      out.height = rh
    }

    const ctx =
      out.getContext('2d')

    ctx.clearRect(
      0,
      0,
      rw,
      rh,
    )

    ctx.drawImage(
      photo,
      0,
      0,
      rw,
      rh,
    )

    const done =
      (region) => ({
        width,
        height,
        renderWidth: rw,
        renderHeight: rh,
        region,
      })

    if (
      artworks.length === 0
    ) {
      return done(
        input.region ?? null,
      )
    }

    /**
     * Layers 2-3:
     *
     * Printable region.
     */
    const region =
      input.region ??
      buildPrintableRegion(
        {
          photo,
          tshirtMask,
          designMask,
          photoAlphaAllowed,
        },
        env,
      )

    /**
     * Layer 4:
     *
     * Artwork.
     */
    const scratch =
      env.createCanvas(
        rw,
        rh,
      )

    const sctx =
      scratch.getContext('2d')

    for (
      const art of artworks
    ) {
      const realism =
        art.placement.realism ??
        0

      const warp =
        art.placement.warp ??
        0

      /**
       * No realism / no warp:
       *
       * Keep the original
       * 5-3A behaviour.
       */
      if (
        !(realism > 0) &&
        !(warp > 0)
      ) {
        drawArtwork(
          sctx,
          art,
          k,
        )

        continue
      }

      /**
       * Per-artwork pipeline:
       *
       * artwork
       *   ↓
       * transform
       *   ↓
       * warp
       *   ↓
       * ORIGINAL PHOTO fabric analysis
       *   ↓
       * integrated artwork
       */
      const eb =
        effectiveBox(
          art.placement,
        )

      const artSize =
        Math.min(
          eb.w,
          eb.h,
        ) * k

      const b =
        artworkBounds(
          art,
          k,
          rw,
          rh,
          warpPadding(
            artSize,
            warp,
          ),
        )

      if (
        !(b.w > 0 && b.h > 0)
      ) {
        continue
      }

      const layer =
        env.createCanvas(
          b.w,
          b.h,
        )

      const lctx =
        layer.getContext(
          '2d',
          {
            willReadFrequently: true,
          },
        )

      drawArtwork(
        lctx,
        art,
        k,
        b.x,
        b.y,
      )

      const pixels =
        lctx.getImageData(
          0,
          0,
          b.w,
          b.h,
        )

      /**
       * CRITICAL FIX:
       *
       * Analyse ORIGINAL PHOTO,
       * while the visible garment
       * remains the cutout.
       */
      const map =
        fabricMapFor(
          fabricPhoto,
          region,
          rw,
          rh,
          env,
        )

      if (warp > 0) {
        applyWarp(
          pixels.data,
          b.w,
          b.h,
          b.x,
          b.y,
          map,
          warp,
          artSize,
        )
      }

      if (realism > 0) {
        applyFabric(
          pixels.data,
          b.w,
          b.h,
          b.x,
          b.y,
          map,
          realism,
        )
      }

      lctx.putImageData(
        pixels,
        0,
        0,
      )

      sctx.drawImage(
        layer,
        b.x,
        b.y,
      )
    }

    /**
     * Clip artwork to the
     * actual printable region.
     */
    sctx.globalCompositeOperation =
      'destination-in'

    sctx.drawImage(
      region.canvas,
      0,
      0,
      rw,
      rh,
    )

    sctx.globalCompositeOperation =
      'source-over'

    /**
     * Layer 5:
     *
     * Final composite.
     */
    ctx.drawImage(
      scratch,
      0,
      0,
    )

    return done(
      region,
    )
  } catch (err) {
    throw toCompositeError(err)
  }
}
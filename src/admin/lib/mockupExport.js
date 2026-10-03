import { MOCKUP_VIEWS } from './mockupTemplates.js'
import { loadImage, renderMockup, recolorGarment } from './photoCompositor.js'
import { getTemplatePhoto, colorKeyFor } from './templatePhotoStore.js'
import { compositeOnBackdrop, compositeOnCustomBackground } from './backgroundStudio.js'

/** Export resolution multiplier over the template photo's own native size. */
const EXPORT_SCALE = 1.5

/**
 * Loads (and, for a solid fabric, recolors) the real template photo for one
 * angle. Throws a clear error if it hasn't been uploaded yet.
 *
 * ROOT CAUSE NOTE ("generated mockup changed the color of the whole photo,
 * not just the shirt"): once a photo has been through the background studio,
 * `record.dataUrl` is the FINAL composited image — the garment cutout
 * already laid over its chosen backdrop (see backgroundStudio.js /
 * templatePhotoStore.js). recolorGarment() remaps hue+saturation across
 * EVERY pixel it's given, so recoloring that composited `dataUrl` directly
 * recolored the studio backdrop right along with the garment — a plain
 * white/grey backdrop barely showed it, but a colorful preset, a gradient,
 * or the admin's own uploaded background all visibly shifted color whenever
 * the garment color was changed. Fixed by recoloring the CUTOUT (the
 * transparent-background subject-only PNG saved alongside `dataUrl`)
 * instead: every non-garment pixel there has alpha 0, so a hue/saturation
 * remap literally cannot touch it, no matter what color it would have
 * mapped to. The recolored cutout is then recomposited onto the exact same
 * backdrop/transform the admin already chose, so the background comes out
 * pixel-for-pixel unchanged. Photos saved before the background studio
 * existed (no cutout on file) fall back to the old whole-photo recolor,
 * same as always.
 */
async function loadGarmentPhoto(templateId, angle, garment) {
  const colorKey = colorKeyFor(garment)
  const record = getTemplatePhoto(templateId, angle, colorKey)
  if (!record) {
    throw new Error(
      `No real template photo uploaded yet for the "${angle}" angle` +
        (garment.fabric !== 'solid' ? ` in "${colorKey}"` : '') +
        '. Upload one in the studio before generating mockups.',
    )
  }
  if (garment.fabric === 'solid' && garment.hex) {
    if (record.cutoutDataUrl) {
      const cutout = await loadImage(record.cutoutDataUrl)
      const recoloredCutout = recolorGarment(cutout, garment.hex)
      const recoloredCutoutImage = await loadImage(recoloredCutout.toDataURL('image/png'))
      const composed =
        record.backdropKind === 'custom' && record.customBackgroundDataUrl
          ? compositeOnCustomBackground(
              recoloredCutoutImage,
              await loadImage(record.customBackgroundDataUrl),
              record.bgTransform,
              record.subjectTransform,
              record.hanger,
            )
          : compositeOnBackdrop(
              recoloredCutoutImage,
              record.backdropId,
              record.subjectTransform,
              record.backdropId === 'gradient' ? record.gradientColors : null,
              record.hanger,
            )
      return loadImage(composed.toDataURL('image/png'))
    }
    // No cutout on file — an older photo saved before the background studio
    // existed, or one explicitly kept with its original background. Nothing
    // to mask against, so recolor the whole photo as before.
    const raw = await loadImage(record.dataUrl)
    const recolored = recolorGarment(raw, garment.hex)
    return loadImage(recolored.toDataURL('image/png'))
  }
  return loadImage(record.dataUrl)
}

/**
 * Cheap "is there actually ink here" check on a rendered angle canvas: samples
 * a modest square centered on one placement's own center point and reports
 * whether any pixel in it is meaningfully non-transparent.
 *
 * This exists for the "intermediate validation" requirement: an artwork
 * reference can go stale (its record removed from artworkStore after a
 * placement was created, or its image failed to decode) without the
 * placement itself being deleted. Silently, `renderPlacementLayer` (see
 * photoCompositor.js) simply skips a placement with no resolvable artwork
 * image — producing a perfectly rendered, perfectly lit... blank T-shirt.
 * Sampling actual pixels here (rather than only checking "does
 * artworksById contain this id") catches that failure mode even if the id
 * resolves but the image was otherwise empty/corrupt/fully transparent.
 */
function placementLeftVisiblePixels(canvas, placement, scale) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const sampleSize = Math.max(24, Math.min(placement.width, placement.height) * scale * 0.4)
  const cx = placement.x * scale
  const cy = placement.y * scale
  const sx = Math.max(0, Math.min(canvas.width - sampleSize, cx - sampleSize / 2))
  const sy = Math.max(0, Math.min(canvas.height - sampleSize, cy - sampleSize / 2))
  const w = Math.max(1, Math.min(sampleSize, canvas.width - sx))
  const h = Math.max(1, Math.min(sampleSize, canvas.height - sy))
  let data
  try {
    data = ctx.getImageData(Math.round(sx), Math.round(sy), Math.round(w), Math.round(h)).data
  } catch {
    // A tainted/unreadable canvas can't be sampled — don't fail the whole
    // generation over a check that itself couldn't run; fall through as
    // "visible" and let the admin's own eyes on the preview be the check.
    return true
  }
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 12) return true
  }
  return false
}

async function renderAngleToFile({ templateId, angle, garment, placements, artworkImages, fileName }) {
  const garmentImage = await loadGarmentPhoto(templateId, angle, garment)
  const canvas = document.createElement('canvas')
  const width = (garmentImage.naturalWidth || garmentImage.width) * EXPORT_SCALE
  const height = (garmentImage.naturalHeight || garmentImage.height) * EXPORT_SCALE
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  renderMockup(ctx, { garmentImage, placements, artworkImages, scale: EXPORT_SCALE })

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed.'))), 'image/png')
  })
  return { file: new File([blob], fileName, { type: 'image/png' }), canvas }
}

/**
 * Renders every angle in MOCKUP_VIEWS (front/back/three-quarter-front)
 * from the real, uploaded template photos to a PNG File, plus an
 * auto-cropped detail close-up and a plain fabric swatch — filling the
 * product form's existing image slots from one Generate action.
 *
 * ROOT CAUSE NOTE ("Generate mockups" doing nothing): this used to await
 * `renderAngleToFile` for EVERY angle in MOCKUP_VIEWS with no try/catch,
 * so if the admin had only uploaded a template photo for (say) "front"
 * and not yet for "back" or "three-quarter-front", the very first missing
 * angle threw and aborted the whole function — the admin got zero
 * mockups out of clicking Generate, with the only explanation an error
 * banner rendered above the studio's canvas, off-screen from the button
 * they just clicked. An admin who only cares about a front print (the
 * common case while a product is still being set up) could never
 * generate anything. Now each angle is attempted independently: an angle
 * with no photo on file yet is skipped (not fatal) and reported back via
 * `skipped`, so "Generate mockups" always produces whatever it actually
 * can from what's been uploaded so far.
 *
 * @param {object} opts
 * @param {string} [opts.templateId]
 * @param {{ hex: string, fabric: string, colorName?: string }} opts.garment
 * @param {Array} opts.placements - every placement, any angle
 * @param {Record<string, object>} opts.artworksById - artwork records with `.dataUrl`
 * @param {string} opts.fileStem
 * @returns {Promise<{ files: Record<string, File>, skipped: string[] }>} files keyed by product image slot; skipped holds the human labels of any angle that had no template photo yet
 */
export async function generateMockupFiles({ templateId = 'oversized-crew', garment, placements, artworksById, fileStem = 'mockup' }) {
  const artworkImages = {}
  await Promise.all(
    Object.values(artworksById).map(async (art) => {
      artworkImages[art.id] = await loadImage(art.dataUrl)
    }),
  )

  const result = {}
  const skipped = []
  let frontCanvas = null
  const colorKey = colorKeyFor(garment)

  for (const view of MOCKUP_VIEWS) {
    const hasTemplatePhoto = !!getTemplatePhoto(templateId, view.angle, colorKey)
    if (!hasTemplatePhoto) {
      // No real template photo uploaded yet for this angle — skip it and
      // keep going rather than throwing away every OTHER angle's mockup
      // too. An admin who only cares about a front print (the common case
      // while a product is still being set up) can still generate that.
      skipped.push(view.label)
      continue
    }

    const anglePlacements = placements.filter((p) => p.angle === view.angle)
    const rendered = await renderAngleToFile({
      templateId,
      angle: view.angle,
      garment,
      placements: anglePlacements,
      artworkImages,
      fileName: `${fileStem}-${view.angle}.png`,
    })

    // Intermediate validation (requirement #13): if this angle has DTF
    // placements at all, at least one of them must have actually left
    // visible pixels on the rendered canvas — otherwise this would silently
    // hand back a beautiful, fully-lit, print-free blank T-shirt instead of
    // the mockup the admin asked for. A missing template photo is handled
    // above (that's a normal "not uploaded yet" skip); THIS is a real data-
    // pipeline problem (a placement whose artwork went missing/corrupt), so
    // it's fatal, not silently skipped.
    if (anglePlacements.length && !anglePlacements.some((p) => placementLeftVisiblePixels(rendered.canvas, p, EXPORT_SCALE))) {
      throw new Error('DTF artwork is missing from the mockup composition.')
    }

    result[view.slot] = rendered.file
    if (view.angle === 'front') frontCanvas = rendered.canvas
  }

  if (!Object.keys(result).length) {
    throw new Error(
      `No real template photo uploaded yet for any angle (${MOCKUP_VIEWS.map((v) => v.label).join(', ')}). Upload at least one in the studio before generating mockups.`,
    )
  }

  if (result.front) result.main = result.front

  // Detail shot: a tight MACRO crop on the print itself (and the fabric
  // weave right around it) — taken straight from the already-rendered
  // full-resolution front canvas so texture and print stay pixel-consistent
  // with it.
  //
  // ROOT CAUSE NOTE ("detail shot just looks like a small version of the
  // front photo"): `cropSize` used to be the print's own width/height ×
  // 1.6 × EXPORT_SCALE (1.5) — for a typical center-chest print that's
  // roughly 2.4× the print's size, which for a normal-to-large print
  // covers most of the shirt's own width. The result was barely
  // distinguishable from the main front shot, just resized. A real
  // "detail" product photo zooms IN on part of the graphic/fabric, closer
  // than the print's own edges — cropSize is now a FRACTION of the print's
  // size instead of a multiple of it.
  const frontPlacements = placements.filter((p) => p.angle === 'front')
  if (frontCanvas) {
    const anchor = frontPlacements[0]
    const scale = frontCanvas.width / ((await loadGarmentPhoto(templateId, 'front', garment)).naturalWidth || 1)
    const cropSize = anchor ? Math.max(anchor.width, anchor.height) * 0.55 * scale : frontCanvas.width * 0.28
    const cropX = anchor ? anchor.x * scale - cropSize / 2 : frontCanvas.width * 0.3
    const cropY = anchor ? anchor.y * scale - cropSize / 2 : frontCanvas.height * 0.25
    const detailCanvas = document.createElement('canvas')
    detailCanvas.width = cropSize
    detailCanvas.height = cropSize
    detailCanvas.getContext('2d').drawImage(frontCanvas, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize)
    const detailBlob = await new Promise((resolve, reject) => {
      detailCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed.'))), 'image/png')
    })
    result.detail = new File([detailBlob], `${fileStem}-detail.png`, { type: 'image/png' })

    // Fabric swatch: a clean mid-torso patch of the garment alone, no print.
    const swatchSize = Math.min(frontCanvas.width, frontCanvas.height) * 0.22
    const swatchCanvas = document.createElement('canvas')
    swatchCanvas.width = swatchSize
    swatchCanvas.height = swatchSize
    const garmentOnly = await loadGarmentPhoto(templateId, 'front', garment)
    const swatchScale = frontCanvas.width / (garmentOnly.naturalWidth || 1)
    swatchCanvas
      .getContext('2d')
      .drawImage(
        garmentOnly,
        (garmentOnly.naturalWidth || 0) * 0.4,
        (garmentOnly.naturalHeight || 0) * 0.55,
        (swatchSize / swatchScale),
        (swatchSize / swatchScale),
        0,
        0,
        swatchSize,
        swatchSize,
      )
    const swatchBlob = await new Promise((resolve, reject) => {
      swatchCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed.'))), 'image/png')
    })
    result.fabric = new File([swatchBlob], `${fileStem}-fabric.png`, { type: 'image/png' })
  }

  return { files: result, skipped }
}

import { COMPOSITE_ERROR, CompositeError } from './compositeErrors.js'

/** Masks must be exactly the photo's dimensions: they share its coordinate system and are never stretched. */
export function assertMaskMatchesPhoto(photo, mask, label) {
  if (!mask) return
  if (mask.width !== photo.width || mask.height !== photo.height) {
    throw new CompositeError(
      COMPOSITE_ERROR.DIMENSION_MISMATCH,
      `The ${label} is ${mask.width} × ${mask.height}px but the photo is ${photo.width} × ${photo.height}px. ` +
        'Masks must match the photo exactly (they are never stretched). Re-export the mask at the photo\'s size.',
      { photo: { width: photo.width, height: photo.height }, mask: { width: mask.width, height: mask.height } },
    )
  }
}

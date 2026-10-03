/**
 * Step 5-3A — pure mask arithmetic on RGBA pixel buffers (Uint8ClampedArray), no DOM needed.
 * WHITE = allowed, BLACK = protected. A mask pixel's allowance = luminance * its own alpha, so a transparent mask
 * pixel counts as protected. Anti-aliased grey edges give a soft clip rather than a hard cut.
 */

/** Allowance 0..255 for each pixel (Rec.709 luminance x alpha). */
/** Alpha-only allowance for an already background-removed garment.
 * RGB is intentionally ignored so black/dark garments are not treated as protected.
 */
export function allowanceFromAlphaRgba(data) {
  const out = new Uint8ClampedArray(data.length / 4)
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    out[j] = data[i + 3]
  }
  return out
}

export function allowanceFromRgba(data) {
  const out = new Uint8ClampedArray(data.length / 4)
  for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    out[j] = Math.round((lum * data[i + 3]) / 255)
  }
  return out
}

/** Printable region = shirt AND design (per-pixel minimum). With no design mask the shirt mask stands alone. */
export function combineAllowance(shirt, design) {
  if (!design) return shirt
  if (design.length !== shirt.length) throw new Error('Mask buffers differ in size.')
  const out = new Uint8ClampedArray(shirt.length)
  for (let i = 0; i < out.length; i += 1) out[i] = Math.min(shirt[i], design[i])
  return out
}

/** Allowance -> RGBA whose ALPHA is the allowance (used as a destination-in clip). */
export function allowanceToAlphaRgba(allow) {
  const out = new Uint8ClampedArray(allow.length * 4)
  for (let i = 0, j = 0; i < allow.length; i += 1, j += 4) {
    out[j] = out[j + 1] = out[j + 2] = 255
    out[j + 3] = allow[i]
  }
  return out
}

/** Pixel-exact clip of premultiplication-free RGBA artwork by an allowance buffer (used by the self-test as the reference). */
export function clipRgba(artRgba, allow) {
  const out = new Uint8ClampedArray(artRgba)
  for (let i = 0, j = 3; i < allow.length; i += 1, j += 4) out[j] = Math.round((artRgba[j] * allow[i]) / 255)
  return out
}

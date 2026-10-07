/**
 * Step 5-3A — admin-facing errors for the photo compositing engine.
 * Every failure carries a stable `code` and a message written for the admin, so the UI never shows a blank canvas.
 */
export const COMPOSITE_ERROR = {
  MISSING_PHOTO: 'missing-photo',
  MISSING_ARTWORK: 'missing-artwork',
  MISSING_MASK: 'missing-mask',
  INVALID_IMAGE: 'invalid-image',
  UNSUPPORTED_FORMAT: 'unsupported-format',
  CORRUPTED_IMAGE: 'corrupted-image',
  DIMENSION_MISMATCH: 'dimension-mismatch',
  RENDER_FAILURE: 'render-failure',
}

export class CompositeError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.name = 'CompositeError'
    this.code = code
    this.detail = detail ?? null
  }
}

/** Any thrown value -> CompositeError (unknown errors become render failures). */
export function toCompositeError(err) {
  if (err instanceof CompositeError) return err
  // `detail` keeps the ORIGINAL thrown value (e.g. a canvas SecurityError, or a loader error carrying its CORS diagnosis) for developers.
  return new CompositeError(COMPOSITE_ERROR.RENDER_FAILURE, `The composite could not be rendered: ${err?.message || 'unknown error'}.`, err)
}

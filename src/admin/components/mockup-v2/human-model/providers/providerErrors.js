/** Human-readable provider errors (Part P). Technical detail is logged, never shown to a normal admin. */

export const ERROR_CODES = Object.freeze({
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  PROCESSING_FAILED: 'PROCESSING_FAILED',
  INVALID_PERSON_IMAGE: 'INVALID_PERSON_IMAGE',
  INVALID_GARMENT_IMAGE: 'INVALID_GARMENT_IMAGE',
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  TIMEOUT: 'TIMEOUT',
  INVALID_RESULT_IMAGE: 'INVALID_RESULT_IMAGE',
  UNSUPPORTED_VIEW: 'UNSUPPORTED_VIEW',
  CANCELLED: 'CANCELLED',
  QUEUE_UNAVAILABLE: 'QUEUE_UNAVAILABLE',
})

export const ERROR_MESSAGES = Object.freeze({
  PROVIDER_UNAVAILABLE: 'Free GPU provider is currently unavailable.',
  QUOTA_EXHAUSTED: 'Free GPU quota is exhausted.',
  PROCESSING_FAILED: 'Model processing failed.',
  INVALID_PERSON_IMAGE: 'Human image is invalid.',
  INVALID_GARMENT_IMAGE: 'Finished garment image is invalid.',
  PROVIDER_NOT_CONFIGURED: 'Provider configuration is missing.',
  TIMEOUT: 'Generation timed out.',
  INVALID_RESULT_IMAGE: 'Provider returned an invalid image.',
  UNSUPPORTED_VIEW: 'This provider does not explicitly support this view.',
  CANCELLED: 'Generation was cancelled.',
  QUEUE_UNAVAILABLE: 'The Kaggle GPU job queue is not available.',
})

export class VtonError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {{ technical?: string, cause?: unknown, hint?: string }} [details] technical = for logs only; hint = safe extra guidance for the admin
   */
  constructor(code, { technical = '', cause, hint = '' } = {}) {
    super(ERROR_MESSAGES[code] || ERROR_MESSAGES.PROCESSING_FAILED)
    this.name = 'VtonError'
    this.code = ERROR_CODES[code] ? code : ERROR_CODES.PROCESSING_FAILED
    this.technical = technical
    this.hint = hint
    this.cause = cause
  }
}

/** Logs the technical side (console only — never rendered). Avoids dumping blobs or URLs that could carry tokens. */
export function logVtonError(context, err) {
  const info = { code: err?.code, message: err?.message, technical: err?.technical || undefined }
  console.error(`[vton] ${context}`, info, err?.cause ?? '')
}

/** Message that is safe to show an admin for ANY thrown value. */
export function toAdminMessage(err) {
  if (err?.name === 'VtonError') return err.hint ? `${err.message} ${err.hint}` : err.message
  if (err?.name === 'AbortError') return ERROR_MESSAGES.CANCELLED
  return ERROR_MESSAGES.PROCESSING_FAILED
}

/** Converts any thrown value into a VtonError (unknown errors become PROCESSING_FAILED / PROVIDER_UNAVAILABLE for network failures). */
export function asVtonError(err) {
  if (err?.name === 'VtonError') return err
  if (err?.name === 'AbortError') return new VtonError(ERROR_CODES.CANCELLED, { cause: err })
  if (err instanceof TypeError) return new VtonError(ERROR_CODES.PROVIDER_UNAVAILABLE, { technical: err.message, cause: err }) // fetch network failure
  return new VtonError(ERROR_CODES.PROCESSING_FAILED, { technical: err?.message, cause: err })
}

/** True when a Gradio/ZeroGPU error text means "no GPU quota". */
export const looksLikeQuotaError = (text) => /quota|rate.?limit|too many requests|exceeded/i.test(String(text ?? ''))

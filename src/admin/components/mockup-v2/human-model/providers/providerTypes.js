/**
 * STEP 4 — provider-neutral types and constants for free VTON (virtual try-on).
 *
 * UI components never see a provider's native response. Every provider resolves to the normalized
 * result built by `createProviderResult()`; nothing else leaves a provider.
 */

export const PROVIDER_IDS = Object.freeze({
  HUGGING_FACE: 'huggingface_zerogpu',
  KAGGLE: 'kaggle_batch',
  KAGGLE_WORKER: 'kaggle_worker', // FASHN VTON 1.5 on our own Kaggle T4 worker, reached through the Supabase job queue
  PIXELCUT: 'pixelcut_try_on',
})

/** live = answers a request now; batch = prepares a manifest for a manual Kaggle run (NOT an always-on API). */
export const PROVIDER_MODES = Object.freeze({ LIVE: 'live', BATCH: 'batch' })

/** Result status values a provider may report. `processing` is the only honest "in progress" value: no percentages exist. */
export const RESULT_STATUS = Object.freeze({
  COMPLETED: 'completed',
  PROCESSING: 'processing',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  BATCH_PREPARED: 'batch_prepared',
})

/** Queue job states (Part J). */
export const JOB_STATES = Object.freeze({
  QUEUED: 'QUEUED',
  SUBMITTING: 'SUBMITTING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
})

export const ACTIVE_JOB_STATES = Object.freeze([JOB_STATES.SUBMITTING, JOB_STATES.PROCESSING])

export const GARMENT_TYPES = Object.freeze({ TOP: 'tops' })

export const NO_USAGE = Object.freeze({ available: false, remaining: null, unit: null, period: null, source: null })

/** The one result shape every provider returns (Part A). */
export function createProviderResult(fields = {}) {
  const usage = fields.usage && typeof fields.usage === 'object' ? fields.usage : NO_USAGE
  return {
    success: fields.success === true,
    imageUrl: fields.imageUrl ?? null,
    imageBlob: fields.imageBlob ?? null,
    provider: fields.provider ?? 'unknown',
    jobId: fields.jobId ?? null,
    status: fields.status ?? (fields.success ? RESULT_STATUS.COMPLETED : RESULT_STATUS.FAILED),
    error: fields.error ?? null,
    // Extra, provider-neutral diagnostics. `errorCode` is one of providerErrors.ERROR_CODES.
    errorCode: fields.errorCode ?? null,
    usage: {
      available: usage.available === true,
      remaining: Number.isFinite(usage.remaining) ? usage.remaining : null,
      unit: usage.unit ?? null,
      period: usage.period ?? null,
      source: usage.source ?? null,
    },
  }
}

/**
 * Views a provider EXPLICITLY supports. A VTON model keeps the pose of the person photo, so the garment render and the
 * photo must show the same side. Everything else is reported, not silently attempted (Part K).
 */
export const UNSUPPORTED_VIEW_MESSAGE = 'This provider does not explicitly support this view.'

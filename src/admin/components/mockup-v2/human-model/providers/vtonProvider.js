/**
 * The VTON provider interface (Part A).
 *
 *   provider = {
 *     id, label, mode: 'live' | 'batch', supportedViews: string[],   // view ids from humanModelState (front, back, …)
 *     isConfigured(): { ok, message },
 *     generate({ personImage, garmentImage, garmentType, view, metadata, options }) -> Promise<NormalizedResult>,
 *   }
 *
 * `options` may carry `signal` (AbortSignal) and `onStatus('SUBMITTING'|'PROCESSING')`. There is no progress
 * percentage anywhere in this interface on purpose.
 */
import { ERROR_CODES, VtonError, asVtonError, logVtonError } from './providerErrors.js'
import { RESULT_STATUS, UNSUPPORTED_VIEW_MESSAGE, createProviderResult } from './providerTypes.js'
import { HUMAN_MODEL_GENERATION_STATUS } from '../generateHumanModelMockups.js'
import { MODEL_VIEW_TO_ANGLE } from '../humanModelState.js'
import { compositeExactArtwork } from '../exactArtworkPostComposite.js'
import { buildCleanGarmentBlob } from './imagePrep.js'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_INPUT_BYTES = 20 * 1024 * 1024

const isBlob = (v) => typeof Blob !== 'undefined' && v instanceof Blob

/** Validates one input image. Throws a VtonError with the right human message. */
export function validateInputImage(blob, code) {
  if (!isBlob(blob)) throw new VtonError(code, { technical: 'not a Blob/File' })
  if (blob.size === 0) throw new VtonError(code, { technical: 'empty blob' })
  if (blob.size > MAX_INPUT_BYTES) throw new VtonError(code, { technical: `blob is ${blob.size} bytes`, hint: 'The image is larger than 20 MB.' })
  if (blob.type && !ALLOWED_TYPES.includes(blob.type)) throw new VtonError(code, { technical: `mime ${blob.type}`, hint: 'Use PNG, JPG or WEBP.' })
}

export const validatePersonImage = (blob) => validateInputImage(blob, ERROR_CODES.INVALID_PERSON_IMAGE)
export const validateGarmentImage = (blob) => validateInputImage(blob, ERROR_CODES.INVALID_GARMENT_IMAGE)

export function providerSupportsView(provider, view) {
  return Array.isArray(provider?.supportedViews) && provider.supportedViews.includes(view)
}

/** Message for a view the provider doesn't explicitly support, else null. */
export function viewSupportMessage(provider, view) {
  return providerSupportsView(provider, view) ? null : UNSUPPORTED_VIEW_MESSAGE
}

/** Checks an object satisfies the interface (used by the registry so a broken provider can't be registered). */
export function assertProvider(p) {
  const ok = p && typeof p.id === 'string' && typeof p.label === 'string' && (p.mode === 'live' || p.mode === 'batch')
    && typeof p.generate === 'function' && typeof p.isConfigured === 'function' && Array.isArray(p.supportedViews)
  if (!ok) throw new TypeError('A VTON provider needs id, label, mode, supportedViews, isConfigured() and generate().')
  return p
}

// ---------------------------------------------------------------------------------------------------------------------
// STEP 5A — VTON adapter boundary
//
//   runVtonAdapter({ personImage, garmentImage, options }, provider) -> Promise<NormalizedResult>
//
// ONE entry point that validates the input, calls an EXISTING registry provider's generate() and validates what comes back.
// It never throws and never fabricates an image: every failure is a normalized `success:false` result with an `errorCode`.
//
//   personImage  : Blob/File (the stored model photo) OR a blob:/https: URL of it.
//   garmentImage : Blob/File (or URL) of the CLEAN T-shirt photo — NO DTF artwork. The artwork is composited AFTER the VTON
//                  step by the existing LAGAMLESS compositor; the VTON model is never asked to recreate it.
//   options      : { view = 'front', garmentType = 'tops', metadata, signal, onStatus, extraParams, timeoutMs }
//
// Nothing here picks, registers or calls a provider on its own, and nothing here contacts Kaggle / Hugging Face by itself.
// ---------------------------------------------------------------------------------------------------------------------

export const DEFAULT_ADAPTER_TIMEOUT_MS = 300 * 1000

const isImageBlob = (b) => isBlob(b) && b.size > 0 && (!b.type || b.type.startsWith('image/'))

/** Turns a Blob/File or a URL string into a Blob. Anything else (including null) is "missing". */
async function resolveInputImage(value, { code, label, hint, signal }) {
  if (value == null || value === '') throw new VtonError(code, { technical: `${label} missing`, hint })
  if (isBlob(value)) return value
  if (typeof value === 'string') {
    if (!/^(blob:|https:\/\/|data:image\/)/i.test(value)) throw new VtonError(code, { technical: `${label} URL has an unsupported scheme` })
    try {
      const res = await fetch(value, { signal })
      if (!res.ok) throw new VtonError(code, { technical: `${label} URL returned HTTP ${res.status}` })
      return await res.blob()
    } catch (err) {
      if (err?.name === 'VtonError' || err?.name === 'AbortError') throw err
      throw new VtonError(code, { technical: `${label} URL could not be read: ${err?.message}`, cause: err })
    }
  }
  throw new VtonError(code, { technical: `${label} is not a Blob, File or URL` })
}

/**
 * Runs one VTON generation through `provider`. See the contract above.
 * @param {{ personImage: Blob|File|string, garmentImage: Blob|File|string, options?: object }} input
 * @param {object} provider an object satisfying the provider interface (from providerRegistry.getProvider)
 */
export async function runVtonAdapter(input, provider) {
  const providerId = typeof provider?.id === 'string' ? provider.id : 'unknown'
  const options = input && typeof input === 'object' && input.options && typeof input.options === 'object' ? input.options : {}
  const view = options.view ?? 'front'
  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_ADAPTER_TIMEOUT_MS

  const controller = new AbortController()
  const onOuterAbort = () => controller.abort()
  if (options.signal?.aborted) controller.abort()
  else options.signal?.addEventListener?.('abort', onOuterAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)

  const failed = (raw) => {
    const err = timedOut ? new VtonError(ERROR_CODES.TIMEOUT, { technical: `adapter timeout after ${timeoutMs}ms` }) : asVtonError(raw)
    if (err.code !== ERROR_CODES.CANCELLED) logVtonError(`vton adapter (${providerId}, view=${view})`, err)
    return createProviderResult({
      provider: providerId, success: false,
      status: err.code === ERROR_CODES.CANCELLED ? RESULT_STATUS.CANCELLED : RESULT_STATUS.FAILED,
      error: err.hint ? `${err.message} ${err.hint}` : err.message, errorCode: err.code,
    })
  }

  try {
    if (!input || typeof input !== 'object') throw new VtonError(ERROR_CODES.PROCESSING_FAILED, { technical: 'adapter input is not an object', hint: 'The VTON request was malformed.' })
    if (!provider || typeof provider.generate !== 'function' || typeof provider.isConfigured !== 'function') {
      throw new VtonError(ERROR_CODES.PROVIDER_UNAVAILABLE, { technical: 'no usable provider was given' })
    }
    const config = provider.isConfigured()
    if (!config?.ok) throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, { technical: config?.message || 'isConfigured() is not ok' })
    if (typeof view !== 'string' || !providerSupportsView(provider, view)) throw new VtonError(ERROR_CODES.UNSUPPORTED_VIEW, { technical: `view ${String(view)}` })
    if (controller.signal.aborted) throw new VtonError(ERROR_CODES.CANCELLED)

    const [person, garment] = await Promise.all([
      resolveInputImage(input.personImage, { code: ERROR_CODES.INVALID_PERSON_IMAGE, label: 'person image', hint: 'Upload a human model photo first.', signal: controller.signal }),
      resolveInputImage(input.garmentImage, { code: ERROR_CODES.INVALID_GARMENT_IMAGE, label: 'garment image', hint: 'The clean T-shirt photo is missing.', signal: controller.signal }),
    ])
    validatePersonImage(person)
    validateGarmentImage(garment)

    const raw = await provider.generate({
      personImage: person,
      garmentImage: garment,
      garmentType: options.garmentType ?? 'tops',
      view,
      metadata: options.metadata,
      options: { signal: controller.signal, onStatus: options.onStatus, extraParams: options.extraParams },
    })
    if (timedOut) throw new VtonError(ERROR_CODES.TIMEOUT)
    if (!raw || typeof raw !== 'object') throw new VtonError(ERROR_CODES.PROCESSING_FAILED, { technical: 'provider returned no result object' })

    const result = createProviderResult({ ...raw, provider: raw.provider ?? providerId })
    if (result.success) {
      const hasBlob = result.imageBlob != null
      const blobOk = hasBlob && isImageBlob(result.imageBlob)
      const urlOk = typeof result.imageUrl === 'string' && result.imageUrl.length > 0
      if (hasBlob ? !blobOk : !urlOk) throw new VtonError(ERROR_CODES.INVALID_RESULT_IMAGE, { technical: 'provider reported success with no usable image' })
      return result
    }
    // Provider reported failure / batch_prepared / cancelled: pass it on, never upgrade it. Guarantee a human message.
    if (!result.error && result.status !== RESULT_STATUS.BATCH_PREPARED) {
      const code = result.errorCode || ERROR_CODES.PROCESSING_FAILED
      return createProviderResult({ ...result, error: new VtonError(code).message, errorCode: code })
    }
    return result
  } catch (raw) {
    return failed(raw)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener?.('abort', onOuterAbort)
  }
}

/**
 * Default clean-garment source: the CLEAN base T-shirt photo that Mockup Studio already holds (processed if background was
 * removed, else original) — never the artwork-bearing finished render. The snapshot currently carries it only for the
 * primary view; any other view returns null and the adapter reports INVALID_GARMENT_IMAGE instead of guessing.
 */
export async function defaultCleanGarmentFor(view, assets) {
  const meta = assets?.composition?.tshirtMetadata
  const base = meta?.baseImage
  const angle = MODEL_VIEW_TO_ANGLE[view]
  const viewMeta = assets?.composition?.views?.[angle] ?? assets?.views?.[angle]
  if (!base || meta.primaryView !== angle) return null

  // NEVER send the finishedTshirt render: it may contain the studio/custom background.
  // Prefer the existing processed cutout; otherwise apply the Studio's real T-shirt mask
  // to the original photo and crop to the garment bounds.
  return buildCleanGarmentBlob({
    processedUrl: base.renderedFrom === 'processed' ? base.processedUrl : null,
    originalUrl: base.originalUrl,
    maskUrl: viewMeta?.masks?.tshirtMaskUrl ?? null,
  })
}

/**
 * Presents a registry provider to the EXISTING generateHumanModelMockups(assets, { provider }) entry point.
 * NOT registered anywhere by this step: nothing calls it until a later step does registerHumanModelProvider(...).
 *
 * @param {object} provider registry provider
 * @param {{ resolveCleanGarment?: (view: string, assets: object) => (Blob|string|null|Promise<Blob|string|null>), timeoutMs?: number, onStatus?: Function }} [opts]
 */
/**
 * The EXACT finished T-shirt render Mockup Studio already produced for this view (all artwork, placement, scale and rotation
 * baked in by the existing compositor). Nothing is redrawn here. Returns null when that view has no render, so the adapter reports
 * INVALID_GARMENT_IMAGE instead of guessing. (The transparent background is flattened to white by the provider, not the T-shirt.)
 */
export function finalGarmentFor(view, assets) {
  const angle = MODEL_VIEW_TO_ANGLE[view]
  return assets?.garment?.views?.[angle]?.blob ?? null
}

export function createVtonAssetsProvider(provider, { resolveCleanGarment = defaultCleanGarmentFor, postComposite = true, timeoutMs, onStatus } = {}) {
  return {
    id: provider?.id ?? 'none',
    label: provider?.label ?? 'Not connected',
    get available() {
      try { return !!provider?.isConfigured?.().ok } catch { return false }
    },
    async generate(assets, { signal } = {}) {
      const results = []
      const failures = []
      const views = (assets?.requestedViews ?? []).map((v) => v?.type).filter(Boolean)
      for (const view of views) {
        if (signal?.aborted) { failures.push({ view, status: RESULT_STATUS.CANCELLED, errorCode: ERROR_CODES.CANCELLED, error: 'Generation was cancelled.' }); break }
        let garmentImage = null
        try { garmentImage = await resolveCleanGarment(view, assets) } catch { garmentImage = null }
        const res = await runVtonAdapter({ personImage: assets?.humanModel?.blob, garmentImage, options: { view, signal, timeoutMs, onStatus } }, provider)
        if (res.success) {
          if (!postComposite) { results.push({ view, ...res }); continue } // the artwork is already part of the garment image sent to the GPU
          try {
            const post = await compositeExactArtwork({ resultBlob: res.imageBlob, personBlob: assets?.humanModel?.blob, assets, view })
            results.push({ view, ...res, imageBlob: post.blob, postComposite: post })
          } catch (err) {
            failures.push({ view, status: RESULT_STATUS.FAILED, errorCode: ERROR_CODES.PROCESSING_FAILED, error: `Artwork post-compositing failed: ${err?.message || 'unknown error'}`, provider: res.provider })
          }
        } else failures.push({ view, status: res.status, errorCode: res.errorCode, error: res.error, provider: res.provider })
      }
      if (results.length === 0) {
        const first = failures[0]
        const cancelled = failures.length > 0 && failures.every((f) => f.status === RESULT_STATUS.CANCELLED)
        return {
          status: cancelled ? HUMAN_MODEL_GENERATION_STATUS.CANCELLED : HUMAN_MODEL_GENERATION_STATUS.PROVIDER_ERROR,
          results: [], failures,
          message: first?.status === RESULT_STATUS.BATCH_PREPARED ? 'A batch was prepared; no image exists until the results are imported.' : first?.error || 'No image was generated.',
        }
      }
      return { status: HUMAN_MODEL_GENERATION_STATUS.COMPLETED, results, failures }
    },
  }
}

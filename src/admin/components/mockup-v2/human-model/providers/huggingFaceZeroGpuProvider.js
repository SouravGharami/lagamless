/**
 * FASHN VTON 1.5 — free Hugging Face ZeroGPU provider.
 *
 * Person + CLEAN garment are sent to the official FASHN Space. Original DTF artwork
 * is restored by the LAGAMLESS post-compositor after VTON returns.
 */
import { runFashnTryOn } from './fashnGradioClient.js'
import { ERROR_CODES, VtonError, asVtonError, logVtonError } from './providerErrors.js'
import { prepareGarmentForSpace, preparePersonForSpace, isDecodableImage } from './imagePrep.js'
import { PROVIDER_IDS, PROVIDER_MODES, RESULT_STATUS, NO_USAGE, createProviderResult } from './providerTypes.js'
import { validateGarmentImage, validatePersonImage } from './vtonProvider.js'
import { hfConfigStatus } from './providerConfig.js'

export const HF_LABEL = 'FASHN VTON 1.5 — Free Hugging Face ZeroGPU'
export const HF_SUPPORTED_VIEWS = Object.freeze(['front'])

function asBlob(value) {
  if (value instanceof Blob) return value
  if (value?.url) return fetch(value.url).then((r) => {
    if (!r.ok) throw new Error(`Could not download FASHN result (${r.status}).`)
    return r.blob()
  })
  if (typeof value === 'string') return fetch(value).then((r) => {
    if (!r.ok) throw new Error(`Could not download FASHN result (${r.status}).`)
    return r.blob()
  })
  throw new Error('FASHN returned an unsupported image result.')
}

export function createHuggingFaceZeroGpuProvider({ config, createRequest, supabaseReady = true }) {
  return {
    id: PROVIDER_IDS.HUGGING_FACE,
    label: config?.hf?.providerLabel || HF_LABEL,
    mode: PROVIDER_MODES.LIVE,
    supportedViews: HF_SUPPORTED_VIEWS,

    isConfigured: () => hfConfigStatus(config, { supabaseReady }),

    async checkReachable() {
      // Do not perform a raw /config request here: ZeroGPU access must use @gradio/client.
      return { reachable: hfConfigStatus(config, { supabaseReady }).ok, reason: hfConfigStatus(config, { supabaseReady }).ok ? null : 'not_configured' }
    },

    async generate({ personImage, garmentImage, garmentType = 'tops', view, options = {} }) {
      const { signal, onStatus } = options
      const base = { provider: PROVIDER_IDS.HUGGING_FACE }
      try {
        const configured = hfConfigStatus(config, { supabaseReady })
        if (!configured.ok) throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, { technical: configured.message })
        validatePersonImage(personImage)
        validateGarmentImage(garmentImage)
        if (!HF_SUPPORTED_VIEWS.includes(view)) throw new VtonError(ERROR_CODES.UNSUPPORTED_VIEW, { technical: `view ${view}` })
        if (signal?.aborted) throw new VtonError(ERROR_CODES.CANCELLED)

        onStatus?.('PREPARING')
        const [person, garment] = await Promise.all([
          preparePersonForSpace(personImage),
          prepareGarmentForSpace(garmentImage, { flattenWhite: true }),
        ])

        // Use the official Gradio browser client for the public FASHN ZeroGPU Space.
        // The browser client is required for Hugging Face/ZeroGPU request handling.
        // No Hugging Face secret is embedded in Vite code.
        const output = await runFashnTryOn({
          spaceUrl: config.hf.spaceUrl,
          personBlob: person,
          garmentBlob: garment,
          category: garmentType,
          garmentPhotoType: 'flat-lay',
          numTimesteps: Number(config.hf.extraParams?.num_timesteps) || 50,
          guidanceScale: Number(config.hf.extraParams?.guidance_scale) || 1.5,
          seed: Number.isFinite(Number(config.hf.extraParams?.seed)) ? Number(config.hf.extraParams.seed) : 42,
          segmentationFree: config.hf.extraParams?.segmentation_free !== false,
          timeoutMs: config.hf.timeoutMs,
          signal,
          onStatus,
        })
        const blob = await asBlob(output)
        if (!(await isDecodableImage(blob))) throw new VtonError(ERROR_CODES.INVALID_RESULT_IMAGE, { technical: `output type=${blob.type} size=${blob.size}` })

        return createProviderResult({ ...base, success: true, imageBlob: blob, jobId: null, status: RESULT_STATUS.COMPLETED, usage: NO_USAGE })
      } catch (raw) {
        const err = asVtonError(raw)
        if (err.name === 'AbortError' || err.code === ERROR_CODES.CANCELLED || signal?.aborted) {
          return createProviderResult({ ...base, success: false, status: RESULT_STATUS.CANCELLED, error: 'Generation was cancelled.', errorCode: ERROR_CODES.CANCELLED, usage: NO_USAGE })
        }
        logVtonError(`fashn zerogpu generate (view=${view})`, err)
        return createProviderResult({
          ...base,
          success: false,
          status: RESULT_STATUS.FAILED,
          error: err.hint ? `${err.message} ${err.hint}` : err.message,
          errorCode: err.code,
          usage: err.usage ?? NO_USAGE,
        })
      }
    },
  }
}

/**
 * Kaggle batch provider. Kaggle is NOT an always-on API: a notebook session is started by hand, runs the job list on Kaggle's
 * free GPU and stops. So `generate()` never "generates" — it only validates the inputs and reports `batch_prepared`; the job
 * stays QUEUED until the admin exports the batch, runs the notebook and imports the results (see kaggleManifest.js).
 * `success` is therefore FALSE and there is no image: a prepared batch is not a result.
 */
import { createProviderResult, PROVIDER_IDS, PROVIDER_MODES, RESULT_STATUS } from './providerTypes.js'
import { validateGarmentImage, validatePersonImage } from './vtonProvider.js'
import { asVtonError, ERROR_CODES, VtonError } from './providerErrors.js'

export const KAGGLE_LABEL = 'Kaggle Batch'
export const KAGGLE_SUPPORTED_VIEWS = Object.freeze(['front', 'back'])

export function createKaggleBatchProvider() {
  return {
    id: PROVIDER_IDS.KAGGLE,
    label: KAGGLE_LABEL,
    mode: PROVIDER_MODES.BATCH,
    supportedViews: KAGGLE_SUPPORTED_VIEWS,
    isConfigured: () => ({ ok: true, message: 'Batch mode available (manual export / import)' }),
    async generate({ personImage, garmentImage, view }) {
      try {
        validatePersonImage(personImage)
        validateGarmentImage(garmentImage)
        if (!KAGGLE_SUPPORTED_VIEWS.includes(view)) throw new VtonError(ERROR_CODES.UNSUPPORTED_VIEW, { technical: `view ${view}` })
        return createProviderResult({ provider: PROVIDER_IDS.KAGGLE, success: false, status: RESULT_STATUS.BATCH_PREPARED })
      } catch (raw) {
        const err = asVtonError(raw)
        return createProviderResult({ provider: PROVIDER_IDS.KAGGLE, success: false, status: RESULT_STATUS.FAILED, error: err.hint ? `${err.message} ${err.hint}` : err.message, errorCode: err.code })
      }
    },
  }
}

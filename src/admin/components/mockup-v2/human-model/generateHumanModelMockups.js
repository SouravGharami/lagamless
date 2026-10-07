/**
 * STEP 3 — provider-neutral entry point for AI fitting.
 *
 *   generateHumanModelMockups(assets, { provider, signal })
 *
 * `assets` is the output of buildGenerationAssets(). With no available provider this returns
 *   { status: 'provider_not_connected', results: [] }
 * and NOTHING else: no request, no progress, no image. A real provider later plugs in through
 * registerHumanModelProvider() without touching HumanModelStudio.
 *
 * A provider is { id, label, available, generate(assets, { signal }) -> Promise<{ status, results[], ... }> } and, like
 * the existing template provider, must be a thin client of OUR OWN backend. API keys never live in React code or VITE_* vars.
 */

export const HUMAN_MODEL_GENERATION_STATUS = Object.freeze({
  PROVIDER_NOT_CONNECTED: 'provider_not_connected',
  INVALID_INPUT: 'invalid_input',
  PROVIDER_ERROR: 'provider_error',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
})

export const NOT_CONNECTED_MESSAGE = 'No AI fitting provider is connected yet, so nothing was generated.'

export const notConnectedProvider = Object.freeze({
  id: 'none',
  label: 'Not connected',
  available: false,
  async generate() {
    return { status: HUMAN_MODEL_GENERATION_STATUS.PROVIDER_NOT_CONNECTED, results: [], message: NOT_CONNECTED_MESSAGE }
  },
})

let activeProvider = notConnectedProvider

export function registerHumanModelProvider(provider) {
  if (!provider?.id || typeof provider.generate !== 'function') throw new TypeError('A provider needs an id and a generate() function.')
  activeProvider = provider
  return provider
}
export const getHumanModelProvider = () => activeProvider
export const resetHumanModelProvider = () => { activeProvider = notConnectedProvider }

/** Shape check only — no network, no provider. */
export function validateGenerationAssets(assets) {
  const problems = []
  if (!assets || typeof assets !== 'object') return ['Generation assets are missing.']
  if (!assets.humanModel?.blob) problems.push('The human model image is missing.')
  const views = assets.garment?.views
  if (!views || Object.keys(views).length === 0) problems.push('There is no rendered garment image.')
  if (!assets.requestedViews?.length) problems.push('No model view was requested.')
  return problems
}

export async function generateHumanModelMockups(assets, { provider = activeProvider, signal } = {}) {
  const problems = validateGenerationAssets(assets)
  if (problems.length > 0) return { status: HUMAN_MODEL_GENERATION_STATUS.INVALID_INPUT, results: [], problems }
  if (!provider?.available) {
    return { status: HUMAN_MODEL_GENERATION_STATUS.PROVIDER_NOT_CONNECTED, results: [], message: NOT_CONNECTED_MESSAGE, provider: { id: provider?.id ?? 'none', label: provider?.label ?? 'Not connected' } }
  }
  if (signal?.aborted) return { status: HUMAN_MODEL_GENERATION_STATUS.CANCELLED, results: [] }
  try {
    const out = await provider.generate(assets, { signal })
    return { results: [], ...out, provider: { id: provider.id, label: provider.label } }
  } catch (err) {
    return { status: HUMAN_MODEL_GENERATION_STATUS.PROVIDER_ERROR, results: [], message: err?.message || 'The provider failed.', provider: { id: provider.id, label: provider.label } }
  }
}

/**
 * Step 5-1 — generation PROVIDER abstraction and pipeline.
 *
 *   INPUT -> TEMPLATE -> ARTWORK -> PLACEMENT -> BACKGROUND -> PROVIDER -> OUTPUT -> MOCKUP
 *   (project)  (template)  (artwork regions)     (background)   (this file)   (result)
 *
 * A provider is anything with this shape (MockupGenerationProvider):
 *   { id: string, label: string, available: boolean,
 *     generate(request, { signal, onStatus }) -> Promise<GenerationResult> }
 *
 * SECURITY: a real provider must be a thin client of OUR OWN backend endpoint. API keys live only on
 * that server; they are never in React code, VITE_* variables, or a request object. No external
 * service is contacted in Step 5-1 — the only provider registered is the unavailable placeholder.
 */
import { GENERATION_STATUS } from './generationStatus.js'
import { createGenerationResult, failedResult } from './generationResult.js'
import { validateGenerationRequest } from './generationRequest.js'
import { isTemplateUsable } from './templateModel.js'

export const NO_PROVIDER_ID = 'none'

/** Placeholder: reports honestly that nothing is connected. It never simulates progress. */
export const noProvider = Object.freeze({
  id: NO_PROVIDER_ID,
  label: 'Not connected',
  available: false,
  async generate(request) {
    return failedResult({ angle: request?.angle, templateId: request?.templateId }, 'PROVIDER_UNAVAILABLE', 'No generation provider is connected yet.')
  },
})

export function createProviderRegistry(initial = [noProvider]) {
  const items = new Map()
  const api = {
    register(provider) {
      if (!provider?.id || typeof provider.generate !== 'function') throw new TypeError('A provider needs an id and a generate() function.')
      if (items.has(provider.id)) throw new Error(`Provider "${provider.id}" is already registered.`)
      items.set(provider.id, provider)
      return provider
    },
    get: (id) => items.get(id) ?? null,
    list: () => [...items.values()],
  }
  initial.forEach((p) => api.register(p))
  return api
}

export const providerRegistry = createProviderRegistry()

/**
 * Validates and hands a request to a provider, reporting only REAL status changes through onStatus.
 * With no available provider it fails immediately (FAILED, PROVIDER_UNAVAILABLE) — no fake work.
 * Nothing in the UI calls this in Step 5-1.
 */
export async function runGenerationPipeline({ request, template, provider = noProvider, signal, onStatus = () => {} }) {
  const base = { angle: request?.angle, templateId: request?.templateId }
  onStatus(GENERATION_STATUS.PREPARING)
  const problems = validateGenerationRequest(request)
  if (!isTemplateUsable(template)) problems.push('The selected template is not usable (its source type is not functional yet).')
  if (problems.length) {
    onStatus(GENERATION_STATUS.FAILED)
    return failedResult(base, 'INVALID_REQUEST', problems.join(' '))
  }
  if (!provider?.available) {
    onStatus(GENERATION_STATUS.FAILED)
    return failedResult(base, 'PROVIDER_UNAVAILABLE', 'No generation provider is connected yet.')
  }
  if (signal?.aborted) {
    onStatus(GENERATION_STATUS.CANCELLED)
    return createGenerationResult({ ...base, status: GENERATION_STATUS.CANCELLED, completedAt: new Date().toISOString() })
  }
  onStatus(GENERATION_STATUS.GENERATING)
  try {
    const result = await provider.generate(request, { signal, onStatus })
    onStatus(result.status)
    return result
  } catch (err) {
    onStatus(GENERATION_STATUS.FAILED)
    return failedResult(base, 'PROVIDER_ERROR', err?.message || 'The provider failed.')
  }
}

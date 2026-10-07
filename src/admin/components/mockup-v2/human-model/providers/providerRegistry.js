/**
 * Provider registry. The UI asks the registry for a provider by id and never imports a concrete provider.
 * To add or swap a provider: create a file that satisfies vtonProvider.js and register it here (docs/free-vton-architecture.md §8).
 * Paid providers are opt-in and never used as an automatic fallback. Pixelcut is disabled unless explicitly enabled.
 */
import { supabase, isSupabaseConfigured } from '../../../../../lib/supabase.js'
import { assertProvider } from './vtonProvider.js'
import { readVtonConfig } from './providerConfig.js'
import { createHuggingFaceZeroGpuProvider } from './huggingFaceZeroGpuProvider.js'
import { createKaggleBatchProvider } from './kaggleBatchProvider.js'
import { createKaggleWorkerProvider } from './kaggleWorkerProvider.js'
import { createPixelcutProvider } from './pixelcutProvider.js'
import { PROVIDER_IDS } from './providerTypes.js'

const PROXY_FUNCTION = 'vton-gradio-proxy'
const SELECTED_KEY = 'lagamless.vton.provider' // the provider id only — never a secret

/** Direct = public Space. Proxy = Edge Function (HF token stays server-side). */
export function createRequestFactory(config) {
  if (config.hf.mode === 'proxy') {
    return ({ signal } = {}) => async (path, init = {}) => {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw Object.assign(new Error('not signed in'), { name: 'TypeError' })
      const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${PROXY_FUNCTION}`
      return fetch(`${base}?path=${encodeURIComponent(path)}`, {
        ...init, signal: init.signal ?? signal,
        headers: { ...init.headers, Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
      })
    }
  }
  return ({ signal } = {}) => (path, init = {}) => fetch(`${config.hf.spaceUrl}${path}`, { ...init, signal: init.signal ?? signal })
}

const config = readVtonConfig()
const providers = new Map()

export function registerProvider(provider) {
  assertProvider(provider)
  providers.set(provider.id, provider)
  return provider
}

registerProvider(createHuggingFaceZeroGpuProvider({ config, createRequest: createRequestFactory, supabaseReady: isSupabaseConfigured }))
registerProvider(createKaggleWorkerProvider({ supabase, supabaseReady: isSupabaseConfigured }))
registerProvider(createKaggleBatchProvider())
registerProvider(createPixelcutProvider({ config }))

// The Kaggle T4 worker replaces the 5-minute ZeroGPU Space as the default VTON backend. The HF provider stays registered.
export const DEFAULT_PROVIDER_ID = PROVIDER_IDS.KAGGLE_WORKER
export const getProvider = (id) => providers.get(id) ?? null
export const listProviders = () => [...providers.values()]
export const getVtonConfig = () => config

export function getSelectedProviderId() {
  try {
    const id = window.localStorage.getItem(SELECTED_KEY)
    // A leftover Hugging Face ZeroGPU selection from before the Kaggle worker existed is dropped, not honoured.
    if (id === PROVIDER_IDS.HUGGING_FACE) { window.localStorage.removeItem(SELECTED_KEY); return DEFAULT_PROVIDER_ID }
    return providers.has(id) ? id : DEFAULT_PROVIDER_ID
  } catch {
    return DEFAULT_PROVIDER_ID
  }
}

export function setSelectedProviderId(id) {
  if (!providers.has(id)) return
  try { window.localStorage.setItem(SELECTED_KEY, id) } catch { /* private mode: selection just isn't remembered */ }
}

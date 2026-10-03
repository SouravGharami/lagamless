/**
 * Pixelcut Try-On provider.
 *
 * API key stays in the Supabase Edge Function. The browser sends the person and
 * CLEAN garment images as multipart data; the edge function returns the generated image.
 * This provider is opt-in and front-view only because a single person photo cannot
 * honestly produce a new back/side pose.
 */
import { supabase, isSupabaseConfigured } from '../../../../../lib/supabase.js'
import { ERROR_CODES, VtonError } from './providerErrors.js'
import { createProviderResult, RESULT_STATUS } from './providerTypes.js'

const FUNCTION_NAME = 'pixelcut-vton'
export function createPixelcutProvider({ config } = {}) {
  const enabled = config?.pixelcut?.enabled === true
  const timeoutMs = config?.pixelcut?.timeoutMs || 300000
  return {
    id: 'pixelcut_try_on',
    label: 'Pixelcut Try-On',
    mode: 'live',
    supportedViews: ['front'],
    isConfigured() {
      if (!enabled) return { ok: false, message: 'Pixelcut provider is disabled.' }
      if (!isSupabaseConfigured) return { ok: false, message: 'Supabase is not configured.' }
      return { ok: true, message: 'Configured through secure Supabase proxy.' }
    },
    async generate({ personImage, garmentImage, view, options = {} }) {
      if (view !== 'front') return createProviderResult({ provider: this.id, success: false, status: RESULT_STATUS.FAILED, errorCode: ERROR_CODES.UNSUPPORTED_VIEW, error: 'Pixelcut is currently connected for Front view only.' })
      const config = this.isConfigured()
      if (!config.ok) return createProviderResult({ provider: this.id, success: false, status: RESULT_STATUS.FAILED, errorCode: ERROR_CODES.PROVIDER_NOT_CONFIGURED, error: config.message })
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const forwardAbort = () => controller.abort()
      options.signal?.addEventListener?.('abort', forwardAbort, { once: true })
      try {
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token
        if (!token) throw new VtonError(ERROR_CODES.PROVIDER_UNAVAILABLE, { hint: 'Admin sign-in is required.' })
        const form = new FormData()
        form.append('person', personImage, 'person.png')
        form.append('garment', garmentImage, 'garment.png')
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCTION_NAME}`, {
          method: 'POST', signal: controller.signal, body: form,
          headers: { Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        })
        if (!response.ok) {
          let message = `Pixelcut request failed (HTTP ${response.status}).`
          try { const body = await response.json(); if (body?.error) message = body.error } catch { /* binary/non-json response */ }
          return createProviderResult({ provider: this.id, success: false, status: RESULT_STATUS.FAILED, errorCode: response.status === 429 ? ERROR_CODES.QUOTA_EXHAUSTED : ERROR_CODES.PROCESSING_FAILED, error: message })
        }
        const imageBlob = await response.blob()
        if (!imageBlob.size) return createProviderResult({ provider: this.id, success: false, status: RESULT_STATUS.FAILED, errorCode: ERROR_CODES.INVALID_RESULT_IMAGE, error: 'Pixelcut returned an empty image.' })
        return createProviderResult({ provider: this.id, success: true, status: RESULT_STATUS.COMPLETED, imageBlob, usage: { available: true, remaining: null, unit: 'credits', period: 'per generation', source: 'Pixelcut API' } })
      } catch (err) {
        if (err?.name === 'AbortError') return createProviderResult({ provider: this.id, success: false, status: RESULT_STATUS.CANCELLED, errorCode: ERROR_CODES.CANCELLED, error: 'Generation was cancelled.' })
        if (err?.name === 'VtonError') return createProviderResult({ provider: this.id, success: false, status: RESULT_STATUS.FAILED, errorCode: err.code, error: err.hint ? `${err.message} ${err.hint}` : err.message })
        return createProviderResult({ provider: this.id, success: false, status: RESULT_STATUS.FAILED, errorCode: ERROR_CODES.PROCESSING_FAILED, error: 'Pixelcut generation failed.' })
      } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener?.('abort', forwardAbort)
      }
    },
  }
}

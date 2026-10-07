/**
 * Official Gradio JavaScript client transport for the FASHN VTON 1.5 Hugging Face Space.
 *
 * Important: FASHN's Space runs on ZeroGPU. Gradio's official documentation requires
 * browser calls through @gradio/client so the Hugging Face iframe/auth headers needed
 * by ZeroGPU are forwarded correctly. Do not replace this with raw fetch() for the
 * live ZeroGPU Space.
 */
import { Client, handle_file } from '@gradio/client'
import { looksLikeQuotaError } from './providerErrors.js'

let cached = null
let cachedUrl = ''

export async function getFashnClient(spaceUrl, { signal, onStatus } = {}) {
  if (!spaceUrl) throw new Error('FASHN Space URL is missing.')
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (!cached || cachedUrl !== spaceUrl) {
    onStatus?.('CONNECTING')
    cached = await Client.connect(spaceUrl, {
      events: ['data', 'status'],
      status_callback: (status) => {
        if (status?.stage === 'pending') onStatus?.('QUEUED', status)
        else if (status?.stage === 'generating') onStatus?.('PROCESSING', status)
        else if (status?.stage === 'complete') onStatus?.('COMPLETED', status)
        else if (status?.stage === 'error') onStatus?.('FAILED', status)
      },
    })
    cachedUrl = spaceUrl
  }

  return cached
}

export async function runFashnTryOn({ spaceUrl, personBlob, garmentBlob, category = 'tops', garmentPhotoType = 'flat-lay', numTimesteps = 50, guidanceScale = 1.5, seed = 42, segmentationFree = true, timeoutMs = 600000, signal, onStatus }) {
  const client = await getFashnClient(spaceUrl, { signal, onStatus })
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  onStatus?.('SUBMITTING')
  const job = client.submit('/try_on', {
    person_image: handle_file(personBlob),
    garment_image: handle_file(garmentBlob),
    category,
    garment_photo_type: garmentPhotoType,
    num_timesteps: numTimesteps,
    guidance_scale: guidanceScale,
    seed,
    segmentation_free: segmentationFree,
  })

  const consume = (async () => {
    for await (const message of job) {
      if (signal?.aborted) {
        try { job.cancel?.() } catch { /* best effort */ }
        throw new DOMException('Aborted', 'AbortError')
      }
      if (message?.type === 'status') {
        const stage = message?.stage || message?.status?.stage
        if (stage === 'pending') onStatus?.('QUEUED', message)
        else if (stage === 'generating') onStatus?.('PROCESSING', message)
        else if (stage === 'complete') onStatus?.('COMPLETED', message)
        else if (stage === 'error') {
          const detail = JSON.stringify(message)
          onStatus?.('FAILED', message)
          if (looksLikeQuotaError(detail)) throw new Error('Hugging Face ZeroGPU quota is exhausted. Please wait for the daily quota to reset.')
        }
        continue
      }
      if (message?.type === 'data') {
        const data = message.data
        const output = Array.isArray(data) ? data.find((item) => item?.url || item?.path || typeof item === 'string' || item instanceof Blob) : data
        if (!output) throw new Error('FASHN returned no image result.')
        onStatus?.('COMPLETED')
        return output
      }
    }
    throw new Error('FASHN generation ended without an image result. The Space did not return an output image.')
  })()

  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { job.cancel?.() } catch { /* best effort */ }
      reject(new Error(`FASHN generation timed out after ${Math.round(timeoutMs / 1000)} seconds.`))
    }, timeoutMs)
  })
  try {
    return await Promise.race([consume, timeout])
  } finally {
    clearTimeout(timer)
  }
}

export function clearFashnClientCache() {
  cached = null
  cachedUrl = ''
}

/**
 * Minimal client for the Gradio HTTP API ("/call" protocol, Gradio 4.x/5.x) — the protocol a Hugging Face Space exposes.
 *
 *   GET  {prefix}/info                      endpoint + parameter schema
 *   POST {prefix}/upload   (multipart)      -> ["/tmp/gradio/…"]
 *   POST {prefix}/call/{api_name}  {data}   -> { event_id }
 *   GET  {prefix}/call/{api_name}/{event_id}   Server-Sent Events: heartbeat | generating | complete | error
 *
 * The SSE GET is the job-result channel itself, so no polling loop is needed or used: the request stays open until the
 * server reports `complete` or `error`. A caller that only got `event_id` back never invents progress.
 *
 * The client is transport-agnostic: `request(path, init)` does the fetch. Direct mode targets the public Space URL;
 * proxy mode targets the Supabase Edge Function that adds the (server-side) Hugging Face token. This file holds no token.
 */
import { ERROR_CODES, VtonError, looksLikeQuotaError } from './providerErrors.js'
import { usageFromQuotaError } from './providerUsage.js'

/** Parses a text/event-stream body into [{ event, data }]. */
export function parseSse(text) {
  const events = []
  for (const block of String(text).split(/\r?\n\r?\n/)) {
    if (!block.trim()) continue
    let event = 'message'
    const data = []
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    events.push({ event, data: data.join('\n') })
  }
  return events
}

const safeJson = (t) => { try { return JSON.parse(t) } catch { return undefined } }

export function createGradioClient({ request, spaceOrigin = '', signal } = {}) {
  let prefix = null

  async function json(path, init) {
    const res = await request(path, { ...init, signal })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      if (res.status === 401 || res.status === 403) throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, { technical: `HTTP ${res.status} ${path}`, hint: 'The Space requires authentication — use proxy mode.' })
      if (res.status === 429 || looksLikeQuotaError(body)) throw quotaError(body)
      throw new VtonError(ERROR_CODES.PROVIDER_UNAVAILABLE, { technical: `HTTP ${res.status} ${path}: ${body.slice(0, 300)}` })
    }
    return res.json()
  }

  function quotaError(text) {
    const e = new VtonError(ERROR_CODES.QUOTA_EXHAUSTED, { technical: String(text).slice(0, 400) })
    e.usage = usageFromQuotaError(text)
    return e
  }

  /** Reads /config to learn the API prefix ("/gradio_api" on Gradio 5, "" on older versions). */
  async function getPrefix() {
    if (prefix != null) return prefix
    const cfg = await json('/config', { method: 'GET' })
    prefix = typeof cfg?.api_prefix === 'string' ? cfg.api_prefix.replace(/\/+$/, '') : ''
    return prefix
  }

  async function getInfo() {
    const p = await getPrefix()
    const info = await json(`${p}/info`, { method: 'GET' })
    if (!info || typeof info !== 'object') throw new VtonError(ERROR_CODES.PROVIDER_UNAVAILABLE, { technical: 'empty /info' })
    return info
  }

  /** Uploads a Blob and returns a Gradio FileData reference. */
  async function upload(blob, name) {
    const p = await getPrefix()
    const form = new FormData()
    form.append('files', blob, name)
    const paths = await json(`${p}/upload`, { method: 'POST', body: form })
    const path = Array.isArray(paths) ? paths[0] : null
    if (typeof path !== 'string') throw new VtonError(ERROR_CODES.PROVIDER_UNAVAILABLE, { technical: 'upload returned no path' })
    return { path, orig_name: name, mime_type: blob.type || undefined, meta: { _type: 'gradio.FileData' } }
  }

  async function submit(apiName, data) {
    const p = await getPrefix()
    const name = apiName.replace(/^\//, '')
    const out = await json(`${p}/call/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) })
    if (!out?.event_id) throw new VtonError(ERROR_CODES.PROCESSING_FAILED, { technical: 'no event_id in submit response' })
    return out.event_id
  }

  /** Waits for the terminal SSE event of a submitted call. Resolves the `data` array of `complete`. */
  async function waitForResult(apiName, eventId, { timeoutMs = 300000, onProcessing } = {}) {
    const p = await getPrefix()
    const name = apiName.replace(/^\//, '')
    const ctrl = new AbortController()
    const onAbort = () => ctrl.abort()
    signal?.addEventListener('abort', onAbort)
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs)
    try {
      onProcessing?.()
      let res
      try {
        res = await request(`${p}/call/${name}/${eventId}`, { method: 'GET', signal: ctrl.signal })
      } catch (err) {
        if (signal?.aborted) throw err
        if (ctrl.signal.aborted) throw new VtonError(ERROR_CODES.TIMEOUT, { technical: `no result within ${timeoutMs}ms` })
        throw err
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 429 || looksLikeQuotaError(body)) throw quotaError(body)
        throw new VtonError(ERROR_CODES.PROVIDER_UNAVAILABLE, { technical: `HTTP ${res.status} on result stream` })
      }
      let text
      try {
        text = await res.text()
      } catch (err) {
        if (signal?.aborted) throw err
        if (ctrl.signal.aborted) throw new VtonError(ERROR_CODES.TIMEOUT, { technical: 'result stream timed out' })
        throw err
      }
      const events = parseSse(text)
      const terminal = [...events].reverse().find((e) => e.event === 'complete' || e.event === 'error')
      if (!terminal) throw new VtonError(ERROR_CODES.PROCESSING_FAILED, { technical: 'stream ended without complete/error' })
      if (terminal.event === 'error') {
        const payload = safeJson(terminal.data)
        const msg = typeof payload === 'string' ? payload : terminal.data
        if (looksLikeQuotaError(msg)) throw quotaError(msg)
        throw new VtonError(ERROR_CODES.PROCESSING_FAILED, { technical: `space error: ${String(msg).slice(0, 400)}` })
      }
      const data = safeJson(terminal.data)
      if (!Array.isArray(data)) throw new VtonError(ERROR_CODES.INVALID_RESULT_IMAGE, { technical: 'complete event had no data array' })
      return data
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  /** Downloads an output FileData (or URL string) as a Blob. */
  async function fetchFile(fileData) {
    const p = await getPrefix()
    const f = typeof fileData === 'string' ? { url: fileData } : fileData
    let path = null
    if (f?.url) {
      try {
        const u = new URL(f.url, spaceOrigin || undefined)
        path = spaceOrigin && u.origin === new URL(spaceOrigin).origin ? `${u.pathname}${u.search}` : null
        if (!path && !spaceOrigin) path = `${u.pathname}${u.search}`
      } catch { path = null }
    }
    if (!path && f?.path) path = `${p}/file=${f.path}`
    if (!path) throw new VtonError(ERROR_CODES.INVALID_RESULT_IMAGE, { technical: 'output had neither a same-origin url nor a path' })
    const res = await request(path, { method: 'GET', signal })
    if (!res.ok) throw new VtonError(ERROR_CODES.INVALID_RESULT_IMAGE, { technical: `HTTP ${res.status} downloading output` })
    return res.blob()
  }

  return { getPrefix, getInfo, upload, submit, waitForResult, fetchFile }
}

/* ------------------------------------------------ endpoint / parameter mapping */

const IMAGE_COMPONENTS = /^(image|imageeditor|file|imageslider)$/i
const isImageParam = (p) => IMAGE_COMPONENTS.test(String(p?.component ?? '')) || /filedata|image/i.test(JSON.stringify(p?.python_type ?? p?.type ?? ''))
const paramName = (p) => String(p?.parameter_name || p?.label || '')
const PERSON_RE = /person|model|human|user|body|source|subject/i
const GARMENT_RE = /garment|cloth|apparel|top|shirt|product|outfit|tshirt|t-shirt/i
const CATEGORY_RE = /categor|garment_?type|type/i

/** Picks the endpoint to call: configured name, or the single endpoint that takes ≥2 images. */
export function pickEndpoint(info, configuredName = '') {
  const eps = info?.named_endpoints ?? {}
  if (configuredName) {
    const key = configuredName.startsWith('/') ? configuredName : `/${configuredName}`
    if (!eps[key]) throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, { technical: `endpoint ${key} not in /info`, hint: 'Check VITE_HF_VTON_API_NAME.' })
    return { apiName: key, endpoint: eps[key] }
  }
  const candidates = Object.entries(eps).filter(([, ep]) => (ep.parameters ?? []).filter(isImageParam).length >= 2)
  if (candidates.length !== 1) {
    throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, {
      technical: `${candidates.length} candidate endpoints: ${candidates.map(([k]) => k).join(', ')}`,
      hint: 'Set VITE_HF_VTON_API_NAME to the try-on endpoint of your Space.',
    })
  }
  return { apiName: candidates[0][0], endpoint: candidates[0][1] }
}

/**
 * Builds the positional `data` array for an endpoint. Image roles are resolved by an explicit map
 * (VITE_HF_VTON_PARAM_MAP) or by unambiguous parameter names. Ambiguous → a configuration error, NEVER a guess:
 * swapping person and garment would silently produce a wrong image.
 */
export function buildCallData(endpoint, { person, garment, garmentType, extraParams = {}, paramMap = {} }) {
  const params = endpoint?.parameters ?? []
  const images = params.filter(isImageParam)
  const byRole = {}
  for (const role of ['person', 'garment', 'category']) {
    if (typeof paramMap[role] === 'string') byRole[role] = params.find((p) => paramName(p) === paramMap[role] || p.label === paramMap[role])
  }
  if (!byRole.person || !byRole.garment) {
    const personHits = images.filter((p) => PERSON_RE.test(paramName(p)) && !GARMENT_RE.test(paramName(p)))
    const garmentHits = images.filter((p) => GARMENT_RE.test(paramName(p)) && !PERSON_RE.test(paramName(p)))
    if (!byRole.person && personHits.length === 1) byRole.person = personHits[0]
    if (!byRole.garment && garmentHits.length === 1) byRole.garment = garmentHits[0]
  }
  if (!byRole.person || !byRole.garment || byRole.person === byRole.garment) {
    throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, {
      technical: `cannot tell person/garment apart among: ${images.map(paramName).join(', ')}`,
      hint: 'Set VITE_HF_VTON_PARAM_MAP so the person and garment inputs are identified explicitly.',
    })
  }
  if (!byRole.category) byRole.category = params.find((p) => !isImageParam(p) && CATEGORY_RE.test(paramName(p)))

  return params.map((p) => {
    const name = paramName(p)
    if (p === byRole.person) return person
    if (p === byRole.garment) return garment
    if (Object.prototype.hasOwnProperty.call(extraParams, name)) return extraParams[name]
    if (p === byRole.category) return pickCategory(p, garmentType)
    if (p.parameter_has_default) return p.parameter_default ?? null
    if (isImageParam(p)) return null // an optional extra image input
    throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, { technical: `required parameter "${name}" has no value`, hint: 'Provide it through VITE_HF_VTON_EXTRA_PARAMS.' })
  })
}

/** Chooses the category choice that matches a garment type ("tops"), using the parameter's declared choices when present. */
function pickCategory(param, garmentType) {
  const text = JSON.stringify(param?.python_type ?? param?.type ?? '')
  const choices = [...text.matchAll(/'([^']+)'|\\"([^"\\]+)\\"/g)].map((m) => m[1] || m[2])
  if (choices.length === 0) return garmentType
  const wanted = String(garmentType).toLowerCase()
  const hit = choices.find((c) => c.toLowerCase() === wanted) ?? choices.find((c) => c.toLowerCase().startsWith(wanted.slice(0, 3)) || wanted.startsWith(c.toLowerCase().slice(0, 3)))
  if (!hit) throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, { technical: `no category choice matches "${garmentType}" in ${choices.join(', ')}` })
  return hit
}

/** Finds the generated image inside a `complete` data array. */
export function extractOutputFile(data) {
  const flat = data.flat(2)
  // last file-like value: an image-slider output is [before, after], a plain image output has exactly one
  const files = flat.filter((v) => v && typeof v === 'object' && (v.url || v.path))
  const hit = files[files.length - 1] ?? flat.find((v) => typeof v === 'string' && /^https?:\/\//.test(v))
  if (!hit) throw new VtonError(ERROR_CODES.INVALID_RESULT_IMAGE, { technical: 'no file in output data' })
  return hit
}

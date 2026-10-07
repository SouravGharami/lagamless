/**
 * Browser API for mask-based T-shirt recoloring (see core.js for how the pixels are handled).
 *
 *   getGarmentRecoloredImage(src, hex, opts) -> Promise<string>   a blob: URL of the recolored photo
 *   prewarmGarmentColors(srcs, hexes, opts)  -> () => void        precompute in idle time; returns a cancel function
 *
 * `opts` (all optional, per photo):
 *   fabricHint  '#rrggbb'  the T-shirt's known colour (the product's photographed colour). Every gallery photo is its
 *                          own picture — flat shot, person wearing it, close-up — so "the biggest colour is the shirt"
 *                          does not hold for all of them; the hint tells detection which colour IS the shirt.
 *   fillsFrame  boolean    the photo is a close-up with no backdrop (fabric / detail shot)
 *   maskSrc     string     URL of THIS photo's own saved garment mask (white = T-shirt). When it loads, it is the only thing
 *                          that decides which pixels are shirt — nothing is guessed. See maskPaths.js / admin saveGarmentMasks.
 *   priority    number     scheduling priority, higher runs first (default 0; the photo on screen should use 10)
 *
 * Detection + recoloring run in a Web Worker so the page never janks (falls back to the main thread if workers are
 * unavailable). Photos are prepared ONCE; every color after that is a table lookup per pixel, and finished results are
 * cached by (src, hex) — so a color change is a cache hit for anything pre-warmed.
 *
 * Photos without a saved mask (saved before per-photo masks existed) are detected on the fly, as before. If a photo
 * still has no usable T-shirt mask, it is shown UNCHANGED. The old whole-image hue recolor fallback is gone on purpose:
 * it had no idea where the shirt was and recolored artwork and backdrop.
 */

/** Longest side photos are recolored at. Plenty for the gallery stage and lightbox, keeps memory in check. */
const MAX_SIDE = 1600

const resultCache = new Map() // `${src}|${hex}|${hint}|${frame}` -> Promise<string>
const prepared = new Map() //   `${src}|${hint}|${frame}` -> Promise<{ ok, ... }>

// ---------------------------------------------------------------- scheduler
//
// The engine holds only a few prepared photos at a time (a gallery can have more photos than that), and a prepared
// photo is only useful until it is rendered. So all work goes through ONE priority queue and each job does
// "prepare this photo, then render it" back to back — nothing else can slip in and evict the photo in between, and
// whichever photo the shopper is looking at jumps the queue instead of waiting behind the rest of the gallery.
let jobSeq = 0
let pumping = false
const queue = [] // { priority, seq, run, resolve, reject }
const jobsByKey = new Map() // result key -> queued job (so a later, higher-priority request can bump it)

async function pump() {
  if (pumping) return
  pumping = true
  try {
    while (queue.length) {
      queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq)
      const job = queue.shift()
      try {
        job.resolve(await job.run())
      } catch (err) {
        job.reject(err)
      }
    }
  } finally {
    pumping = false
  }
}

function schedule(key, priority, run) {
  return new Promise((resolve, reject) => {
    const job = { priority, seq: jobSeq++, run, resolve, reject }
    jobsByKey.set(key, job)
    queue.push(job)
    pump()
  })
}

// ---------------------------------------------------------------- worker / main-thread engine

let worker = null
let workerFailed = false
let nextId = 1
const waiting = new Map() // id -> { resolve, reject }
let mainCore = null // lazily imported core.js for the fallback path
const mainPreps = new Map()

function failAll(err) {
  for (const { reject } of waiting.values()) reject(err)
  waiting.clear()
}

function getWorker() {
  if (workerFailed || typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (e) => {
      const entry = waiting.get(e.data.id)
      if (!entry) return
      waiting.delete(e.data.id)
      if (e.data.ok) entry.resolve(e.data)
      else entry.reject(new Error(e.data.error || 'Recolor worker error'))
    }
    worker.onerror = () => {
      workerFailed = true
      worker = null
      failAll(new Error('Recolor worker crashed'))
    }
    return worker
  } catch {
    workerFailed = true
    return null
  }
}

function callWorker(w, message, transfer) {
  return new Promise((resolve, reject) => {
    const id = nextId++
    waiting.set(id, { resolve, reject })
    w.postMessage({ ...message, id }, transfer || [])
  })
}

/** Yield to the browser between heavy main-thread steps (fallback path only). */
const tick = () => new Promise((r) => setTimeout(r, 0))

async function enginePrepare(prepKey, photo, hint, frame, mask) {
  const w = getWorker()
  if (w) {
    try {
      const transfer = [photo.data.buffer]
      if (mask) transfer.push(mask.buffer)
      const res = await callWorker(w, { type: 'prepare', key: prepKey, fabricHint: hint, fillsFrame: frame, width: photo.width, height: photo.height, buffer: photo.data.buffer, maskBuffer: mask ? mask.buffer : null }, transfer)
      return res.info
    } catch (err) {
      if (!workerFailed) throw err
      // worker died: the buffer was transferred, so the caller must re-decode — signal it
      throw Object.assign(new Error('worker-lost'), { retry: true })
    }
  }
  mainCore ??= await import('./core.js')
  await tick()
  const prep = mainCore.prepareGarment(photo, { fabricHint: hint, fillsFrame: frame, mask })
  if (!prep.ok) return { ok: false, reason: prep.reason }
  mainPreps.set(prepKey, prep)
  while (mainPreps.size > 4) mainPreps.delete(mainPreps.keys().next().value)
  return { ok: true, width: prep.width, height: prep.height, hasAlpha: prep.hasAlpha, level: prep.level, confidence: prep.confidence, source: prep.source, fabricHex: prep.fabricHex }
}

async function engineRender(prepKey, hex) {
  const w = getWorker()
  if (w) {
    const res = await callWorker(w, { type: 'render', key: prepKey, hex })
    return { width: res.width, height: res.height, data: new Uint8ClampedArray(res.buffer) }
  }
  mainCore ??= await import('./core.js')
  const prep = mainPreps.get(prepKey)
  if (!prep) throw new Error('evicted')
  await tick()
  return { width: prep.width, height: prep.height, data: mainCore.renderRecolor(prep, hex) }
}

// ---------------------------------------------------------------- colour helpers

function hexToLabQuick(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const X = (0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2]) / 0.95047
  const Y = 0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.072175 * lin[2]
  const Z = (0.0193339 * lin[0] + 0.119192 * lin[1] + 0.9503041 * lin[2]) / 1.08883
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
}

/** True when `hex` is (practically) the colour the shirt already has in this photo — then the photo is shown as shot. */
function sameAsFabric(hex, fabricHex) {
  if (!fabricHex) return false
  const a = hexToLabQuick(hex)
  const b = hexToLabQuick(fabricHex)
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 5
}

// ---------------------------------------------------------------- image helpers

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image for recoloring: ${src}`))
    img.src = src
  })
}

async function decodePhoto(src) {
  const img = await loadImage(src)
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const s = Math.min(1, MAX_SIDE / Math.max(nw, nh))
  const width = Math.max(1, Math.round(nw * s))
  const height = Math.max(1, Math.round(nh * s))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  return { width, height, data: imageData.data }
}

/**
 * Decodes a photo's saved mask to one byte per pixel at the photo's own working size. Returns null (-> the photo is
 * detected on the fly instead) when there is no saved mask or it does not belong to this picture (different shape).
 */
async function decodeMask(maskSrc, width, height) {
  if (!maskSrc) return null
  let img
  try {
    img = await loadImage(maskSrc)
  } catch {
    return null // no saved mask for this photo
  }
  const photoAspect = width / height
  const maskAspect = img.naturalWidth / img.naturalHeight
  if (!Number.isFinite(maskAspect) || Math.abs(maskAspect - photoAspect) / photoAspect > 0.02) return null
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data
  const out = new Uint8Array(width * height)
  let white = 0
  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    out[p] = rgba[i]
    if (rgba[i] > 127) white++
  }
  return white > 200 ? out : null
}

function toBlobUrl(rgba, width, height, hasAlpha) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0)
  return new Promise((resolve, reject) => {
    // PNG keeps transparency; opaque photos use near-lossless JPEG to keep the many cached results small.
    const [type, quality] = hasAlpha ? ['image/png', undefined] : ['image/jpeg', 0.96]
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Could not encode recolored image'))), type, quality)
  })
}

// ---------------------------------------------------------------- public API

function ensurePrepared(src, prepKey, hint, frame, maskSrc) {
  if (prepared.has(prepKey)) return prepared.get(prepKey)
  const promise = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const photo = await decodePhoto(src)
      const mask = await decodeMask(maskSrc, photo.width, photo.height)
      try {
        return await enginePrepare(prepKey, photo, hint, frame, mask)
      } catch (err) {
        if (!err.retry) throw err
      }
    }
    return { ok: false, reason: 'Recolor engine unavailable.' }
  })()
  prepared.set(prepKey, promise)
  promise.catch(() => prepared.delete(prepKey))
  return promise
}

const normHint = (h) => (typeof h === 'string' && /^#?[0-9a-f]{6}$/i.test(h.trim()) ? '#' + h.trim().replace(/^#/, '').toLowerCase() : '')

/**
 * @param {string} src original photo URL
 * @param {string} hex target color '#rrggbb'
 * @param {{ fabricHint?: string|null, fillsFrame?: boolean, maskSrc?: string|null, priority?: number }} [opts] see the header comment
 * @returns {Promise<string>} URL of the recolored photo (blob: URL), or `src` itself when the photo has no usable T-shirt mask
 */
export function getGarmentRecoloredImage(src, hex, opts = {}) {
  const hint = normHint(opts.fabricHint)
  const frame = opts.fillsFrame === true
  const priority = Number.isFinite(opts.priority) ? opts.priority : 0
  const maskSrc = typeof opts.maskSrc === 'string' && opts.maskSrc ? opts.maskSrc : ''
  const prepKey = `${src}|${hint}|${frame ? 'frame' : ''}|${maskSrc}`
  const key = `${prepKey}|${hex.toLowerCase()}`

  if (resultCache.has(key)) {
    // already running or finished: a more urgent request (the photo just brought on screen) bumps a still-queued job
    const queued = jobsByKey.get(key)
    if (queued && queue.includes(queued) && priority > queued.priority) queued.priority = priority
    return resultCache.get(key)
  }

  // start the browser's own download now so the queue never waits on the network between jobs
  loadImage(src).catch(() => {})

  // No usable mask -> show the photo as it is. Never guess (that is what recolored artwork and backdrop before).
  const unchanged = () => src
  const promise = schedule(key, priority, async () => {
    // A prepared photo can have been dropped by the engine to save memory: prepare it again and retry (twice at most).
    for (let attempt = 0; attempt < 3; attempt++) {
      let info
      try {
        info = await ensurePrepared(src, prepKey, hint, frame, maskSrc)
      } catch {
        info = { ok: false }
      }
      if (!info.ok) return unchanged()
      // the swatch IS this photo's own shirt colour (e.g. black swatch on a black tee): nothing to recolor
      if (sameAsFabric(hex, info.fabricHex)) return unchanged()

      let rendered
      try {
        rendered = await engineRender(prepKey, hex)
      } catch (err) {
        if (err.message !== 'evicted') return unchanged()
        prepared.delete(prepKey)
        continue
      }
      return toBlobUrl(rendered.data, rendered.width, rendered.height, info.hasAlpha)
    }
    return unchanged()
  })

  resultCache.set(key, promise)
  const forget = () => jobsByKey.delete(key)
  promise.then(forget, forget)
  promise.catch(() => resultCache.delete(key))
  return promise
}

/**
 * Precomputes recolored photos in the background (first source first, every hex for it, then the next source…),
 * one at a time and at the lowest priority, so the shopper's click is just a cache hit and never waits behind it.
 * `opts` is either one options object for every photo or a function (src) => options. Returns a cancel function.
 */
export function prewarmGarmentColors(srcs, hexes, opts = {}) {
  let cancelled = false
  const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200))
  ;(async () => {
    await new Promise((r) => idle(r))
    for (const src of srcs) {
      const o = typeof opts === 'function' ? opts(src) : opts
      for (const hex of hexes) {
        if (cancelled) return
        try {
          await getGarmentRecoloredImage(src, hex, { ...o, priority: 0 })
        } catch {
          /* a failed warm-up is harmless: the real request will retry and fall back */
        }
        await new Promise((r) => idle(r))
      }
    }
  })()
  return () => {
    cancelled = true
  }
}

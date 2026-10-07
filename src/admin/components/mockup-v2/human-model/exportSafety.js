/**
 * Canvas / CORS export safety for the generation-ready garment render.
 *
 * The existing compositor (compositing/finalRender.js) draws images on a canvas and exports it with
 * canvas.toBlob. That can fail for reasons a user can't see:
 *   - a remote image (e.g. Supabase Storage) is served WITHOUT CORS headers -> `Image.onerror`, reported by
 *     the loader only as "could not be loaded ... missing, corrupted or unsupported";
 *   - an image slipped in without crossOrigin='anonymous' -> the canvas is TAINTED and toBlob throws a
 *     SecurityError, which the compositor wraps as a generic "composite could not be rendered".
 *
 * This module never renders anything. It classifies those failures, probes the cause of a failed remote
 * load, and turns everything into STRUCTURED errors ({ code, message, technical }) — a blank or partial
 * garment is never produced silently. The technical cause is always kept for developers (console + `technical`).
 */

export const EXPORT_ERROR = Object.freeze({
  CANVAS_TAINTED: 'CANVAS_TAINTED',
  CROSS_ORIGIN_BLOCKED: 'CROSS_ORIGIN_BLOCKED',
  IMAGE_LOAD_FAILED: 'IMAGE_LOAD_FAILED',
  IMAGE_DECODE_FAILED: 'IMAGE_DECODE_FAILED',
  NETWORK_UNREACHABLE: 'NETWORK_UNREACHABLE',
  ENCODE_FAILED: 'ENCODE_FAILED',
  BLANK_RENDER: 'BLANK_RENDER',
  EMPTY_BLOB: 'EMPTY_BLOB',
  UNREADABLE_BLOB: 'UNREADABLE_BLOB',
  NO_RENDER: 'NO_RENDER',
  RENDER_FAILED: 'RENDER_FAILED',
})

/** Shown to the admin when a source image can't be exported safely (CORS / tainted canvas). */
export const GARMENT_EXPORT_UNSAFE_MESSAGE =
  'Unable to prepare the garment image because one or more source images cannot be exported safely.'
/** Shown for every other garment preparation failure. */
export const GARMENT_NOT_PREPARED_MESSAGE = 'Garment image could not be prepared'

const SAFETY_CODES = new Set([EXPORT_ERROR.CANVAS_TAINTED, EXPORT_ERROR.CROSS_ORIGIN_BLOCKED])

/** The message the UI should lead with for a set of failures. */
export function headlineFor(failures = []) {
  return failures.some((f) => SAFETY_CODES.has(f.code)) ? GARMENT_EXPORT_UNSAFE_MESSAGE : GARMENT_NOT_PREPARED_MESSAGE
}

/** Structured failure thrown / collected while preparing the garment. */
export class GarmentAssetError extends Error {
  constructor(failures = [], message) {
    super(message ?? headlineFor(failures))
    this.name = 'GarmentAssetError'
    this.failures = failures // [{ view, code, message, technical, url? }]
    this.code = failures[0]?.code ?? EXPORT_ERROR.RENDER_FAILED
  }
}

/* ------------------------------------------------------------------ url kind */

/** 'blob' | 'data' | 'same-origin' | 'cross-origin' | 'invalid' — blob:/data:/same-origin never taint a canvas. */
export function classifyUrl(url, origin = typeof location !== 'undefined' ? location.origin : '') {
  if (typeof url !== 'string' || url === '') return 'invalid'
  if (url.startsWith('blob:')) return 'blob'
  if (url.startsWith('data:')) return 'data'
  try {
    const parsed = new URL(url, origin || undefined)
    return origin && parsed.origin === origin ? 'same-origin' : 'cross-origin'
  } catch {
    return 'invalid'
  }
}

/* ------------------------------------------------------------- error mapping */

const TAINT_PATTERN = /tainted|securityerror|insecure|cross-origin|may not be exported|unable to get image data/i

export function isTaintError(err) {
  return err?.name === 'SecurityError' || TAINT_PATTERN.test(String(err?.message ?? ''))
}

/**
 * Maps whatever the compositor / loader / encoder threw to a structured failure.
 * The original message is ALWAYS preserved in `technical`.
 */
export function classifyRenderError(err, { view = null } = {}) {
  // The compositor wraps unknown errors in a CompositeError and keeps the original in `.detail`.
  const root = !err?.exportCode && err?.detail ? err.detail : err
  const technical = `${root?.name ? `${root.name}: ` : ''}${root?.message || String(root)}`
  if (root?.exportCode) return { view, code: root.exportCode, message: root.message, technical: root.technical ?? technical, url: root.url ?? null }
  if (isTaintError(root) || isTaintError(err)) {
    return { view, code: EXPORT_ERROR.CANVAS_TAINTED, message: 'A source image made the canvas unsafe to export (tainted canvas). The image must be served with CORS headers or be a local file.', technical }
  }
  if (/could not encode|cannot be encoded/i.test(`${technical} ${err?.message ?? ''}`)) {
    return { view, code: EXPORT_ERROR.ENCODE_FAILED, message: 'The browser could not encode the rendered garment image.', technical }
  }
  if (/could not be loaded|decoded with no readable|is missing/i.test(technical)) {
    return { view, code: EXPORT_ERROR.IMAGE_LOAD_FAILED, message: err?.message || 'A source image could not be loaded.', technical }
  }
  return { view, code: EXPORT_ERROR.RENDER_FAILED, message: err?.message || 'The garment image could not be rendered.', technical }
}

/* ------------------------------------------------------- load failure probe */

/**
 * After an image failed to load, find out WHY (for developers). Only remote URLs are probed.
 *   fetch(cors) works            -> bytes are reachable + CORS ok, so the file itself can't be decoded
 *   fetch(cors) fails, no-cors ok -> server reachable but sends no Access-Control-Allow-Origin (CORS)
 *   both fail                    -> offline / DNS / blocked
 */
export async function diagnoseImageLoadFailure(url, { fetchImpl = typeof fetch === 'function' ? fetch : null, origin } = {}) {
  const kind = classifyUrl(url, origin)
  if (kind === 'blob' || kind === 'data') {
    return { code: EXPORT_ERROR.IMAGE_DECODE_FAILED, message: 'The local image could not be decoded (it may be corrupted or an unsupported format).', technical: `${kind}: URL failed to decode` }
  }
  if (kind === 'invalid' || !fetchImpl) {
    return { code: EXPORT_ERROR.IMAGE_LOAD_FAILED, message: 'The image URL is missing or invalid.', technical: `invalid url: ${String(url)}` }
  }
  try {
    const res = await fetchImpl(url, { method: 'HEAD', mode: 'cors', cache: 'no-store' })
    if (!res.ok) {
      return { code: EXPORT_ERROR.IMAGE_LOAD_FAILED, message: `The image server answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}.`, technical: `HTTP ${res.status} for ${url}` }
    }
    return { code: EXPORT_ERROR.IMAGE_DECODE_FAILED, message: 'The image downloaded but could not be decoded (it may be corrupted or an unsupported format).', technical: `HEAD ok, decode failed for ${url}` }
  } catch (corsErr) {
    if (kind === 'same-origin') {
      return { code: EXPORT_ERROR.NETWORK_UNREACHABLE, message: 'The image could not be fetched.', technical: `${corsErr?.message} (${url})` }
    }
    try {
      await fetchImpl(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' })
      return {
        code: EXPORT_ERROR.CROSS_ORIGIN_BLOCKED,
        message: 'The image server does not allow this site to read the image (missing CORS headers), so it cannot be drawn onto an exportable canvas.',
        technical: `CORS blocked: server reachable in no-cors mode but cors fetch failed (${corsErr?.message}) for ${url}. Fix: serve it with Access-Control-Allow-Origin (Supabase: public bucket / CORS settings).`,
        url,
      }
    } catch (netErr) {
      return { code: EXPORT_ERROR.NETWORK_UNREACHABLE, message: 'The image server could not be reached.', technical: `${netErr?.message} (${url})`, url }
    }
  }
}

/**
 * Wraps the compositor's image loader (same `(url, label) -> Promise<image>` signature it already takes).
 * Success is returned untouched. A failure is diagnosed and re-thrown as an Error that carries
 * `exportCode`, `technical` and `url`, so renderFinishedTshirt can report the real cause instead of the loader's generic text.
 */
export function createSafeImageLoader(baseLoad, { fetchImpl, origin, log = (...a) => console.error(...a) } = {}) {
  return async function safeLoad(url, label) {
    try {
      return await baseLoad(url, label)
    } catch (err) {
      const d = await diagnoseImageLoadFailure(url, { fetchImpl, origin })
      log('[garment export] image failed to load', { label, url, ...d, original: err?.message })
      const wrapped = new Error(`${label ? `${label}: ` : ''}${d.message}`)
      wrapped.exportCode = d.code
      wrapped.technical = `${d.technical} | loader said: ${err?.message}`
      wrapped.url = url
      wrapped.cause = err
      throw wrapped
    }
  }
}

/** True when any failure is a CORS / tainted-canvas problem (the "cannot be exported safely" family). */
export const hasSafetyFailure = (failures = []) => failures.some((f) => SAFETY_CODES.has(f.code))

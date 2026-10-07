/**
 * FASHN VTON 1.5 on our own Kaggle T4 GPU worker.
 *
 * Kaggle cannot receive requests, so the website and the notebook meet in a Supabase job queue (supabase/part-33-vton-jobs.sql):
 *   browser  -> uploads person + garment to the PRIVATE `vton-jobs` bucket, inserts a `vton_jobs` row (admin RLS)
 *   notebook -> claims the job through the `vton-worker` Edge Function (worker token), runs TryOnPipeline, returns the PNG
 *   browser  -> polls the row, downloads the result, and hands the Blob to the existing save flow (generated_model_mockups)
 * No Kaggle / Hugging Face / service-role secret exists in this file.
 */
import { ERROR_CODES, VtonError, asVtonError, logVtonError } from './providerErrors.js'
import { prepareGarmentForSpace, preparePersonForSpace, isDecodableImage } from './imagePrep.js'
import { PROVIDER_IDS, PROVIDER_MODES, RESULT_STATUS, NO_USAGE, createProviderResult } from './providerTypes.js'
import { validateGarmentImage, validatePersonImage } from './vtonProvider.js'

export const KAGGLE_WORKER_LABEL = 'FASHN VTON 1.5 — Kaggle T4 GPU'
/** FASHN keeps the pose of the person photo, so only views we have a matching person photo + garment render for are offered. */
export const KAGGLE_WORKER_SUPPORTED_VIEWS = Object.freeze(['front'])
export const KAGGLE_WORKER_TIMEOUT_MS = 20 * 60 * 1000
const BUCKET = 'vton-jobs'
const POLL_MS = 3000
const WORKER_ONLINE_WITHIN_MS = 90 * 1000

const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener?.('abort', () => { clearTimeout(t); resolve() }, { once: true })
})
const extFor = (blob) => (blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png')

const clip = (v, n = 180) => String(v ?? '').replace(/\s+/g, ' ').slice(0, n)

/**
 * The queue (Supabase) failed — find out WHY so the admin gets one actionable sentence instead of a generic
 * "provider unavailable". Only runs after a failure, so the happy path pays nothing. Never throws.
 * @returns {Promise<{ cause: string, hint: string }>}
 */
export async function diagnoseQueue(supabase, rawError) {
  const raw = clip(rawError?.message ?? rawError)
  try {
    if (/failed to fetch|networkerror|load failed|fetch failed/i.test(raw)) {
      return { cause: 'network', hint: 'Supabase could not be reached. Check your internet connection and VITE_SUPABASE_URL.' }
    }
    if (/maximum allowed size|payload too large|exceeded the maximum/i.test(raw)) {
      return { cause: 'too_large', hint: 'A job image is larger than the Supabase Storage file-size limit. Raise the limit (Storage > Settings) or use a smaller photo.' }
    }
    if (/mime type|not supported|invalid_mime/i.test(raw)) {
      return { cause: 'mime', hint: 'The vton-jobs bucket rejects this image type. Remove any allowed-MIME restriction on the bucket.' }
    }
    const session = (await supabase.auth.getSession())?.data?.session
    if (!session) return { cause: 'not_signed_in', hint: 'You are not signed in. Sign in to the admin panel again, then retry.' }

    const admin = await supabase.rpc('is_admin')
    if (admin.error) return { cause: 'is_admin_missing', hint: `The database function is_admin() could not be called (${clip(admin.error.message, 100)}). Run supabase/part-08b2a-admin-security.sql.` }
    if (admin.data !== true) return { cause: 'not_admin', hint: "The signed-in account is not an admin, so the private vton-jobs bucket rejects uploads. Set profiles.role = 'admin' for this user and sign in again." }

    const table = await supabase.from('vton_jobs').select('id').limit(1)
    if (table.error) {
      const missing = /42P01|PGRST205|does not exist|schema cache/i.test(`${table.error.code} ${table.error.message}`)
      return { cause: missing ? 'table_missing' : 'table_denied', hint: missing ? 'The vton_jobs table does not exist. Run supabase/part-33-vton-jobs.sql once in the Supabase SQL Editor.' : `The vton_jobs table rejected the request (${clip(table.error.message, 100)}). Re-run supabase/part-33-vton-jobs.sql.` }
    }

    const bucket = await supabase.storage.from(BUCKET).list('', { limit: 1 })
    if (bucket.error) {
      const missing = /not found|does not exist/i.test(bucket.error.message || '')
      return { cause: missing ? 'bucket_missing' : 'bucket_denied', hint: missing ? 'The private "vton-jobs" storage bucket does not exist. Run supabase/part-33-vton-jobs.sql once in the Supabase SQL Editor.' : `Storage rejected the request (${clip(bucket.error.message, 100)}). Re-run supabase/part-33-vton-jobs.sql to restore the bucket policies.` }
    }
  } catch { /* fall through to the raw reason */ }
  return { cause: 'unknown', hint: raw ? `Supabase said: "${raw}".` : 'Check the browser console for the technical details.' }
}

async function queueError(supabase, step, rawError) {
  const { cause, hint } = await diagnoseQueue(supabase, rawError)
  return new VtonError(ERROR_CODES.QUEUE_UNAVAILABLE, { technical: `${step}: [${cause}] ${rawError?.code ?? ''} ${rawError?.message ?? rawError}`, hint })
}

export function createKaggleWorkerProvider({ supabase, supabaseReady = true, pollMs = POLL_MS }) {
  async function workerOnline() {
    try {
      const { data } = await supabase.from('vton_worker_status').select('last_seen').eq('id', 'kaggle').maybeSingle()
      return !!data && Date.now() - new Date(data.last_seen).getTime() < WORKER_ONLINE_WITHIN_MS
    } catch {
      return false
    }
  }

  return {
    id: PROVIDER_IDS.KAGGLE_WORKER,
    label: KAGGLE_WORKER_LABEL,
    mode: PROVIDER_MODES.LIVE,
    supportedViews: KAGGLE_WORKER_SUPPORTED_VIEWS,
    timeoutMs: KAGGLE_WORKER_TIMEOUT_MS,
    isConfigured: () => (supabaseReady ? { ok: true, message: 'Configured (Kaggle GPU worker queue)' } : { ok: false, message: 'Supabase is not configured.' }),
    workerOnline,

    async generate({ personImage, garmentImage, garmentType = 'tops', view, metadata, options = {} }) {
      const { signal, onStatus } = options
      const base = { provider: PROVIDER_IDS.KAGGLE_WORKER }
      let jobId = null
      const folder = () => `${jobId}`
      try {
        if (!supabaseReady) throw new VtonError(ERROR_CODES.PROVIDER_NOT_CONFIGURED, { technical: 'supabase not configured' })
        validatePersonImage(personImage)
        validateGarmentImage(garmentImage)
        if (!KAGGLE_WORKER_SUPPORTED_VIEWS.includes(view)) throw new VtonError(ERROR_CODES.UNSUPPORTED_VIEW, { technical: `view ${view}` })
        if (signal?.aborted) throw new VtonError(ERROR_CODES.CANCELLED)

        onStatus?.('PREPARING')
        const [person, garment] = await Promise.all([preparePersonForSpace(personImage), prepareGarmentForSpace(garmentImage, { flattenWhite: true })])

        onStatus?.('SUBMITTING')
        jobId = crypto.randomUUID()
        const personPath = `${folder()}/person.${extFor(person)}`
        const garmentPath = `${folder()}/garment.${extFor(garment)}`
        for (const [path, blob] of [[personPath, person], [garmentPath, garment]]) {
          const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/png', upsert: true })
          if (up.error) throw await queueError(supabase, `upload ${path}`, up.error)
        }
        const ins = await supabase.from('vton_jobs').insert({ id: jobId, product_id: metadata?.productId ?? null, view, category: garmentType, person_path: personPath, garment_path: garmentPath })
        if (ins.error) {
          supabase.storage.from(BUCKET).remove([personPath, garmentPath]).catch(() => {}) // do not leave orphaned inputs behind
          throw await queueError(supabase, 'insert vton_jobs', ins.error)
        }

        const online = await workerOnline()
        onStatus?.('QUEUED', online ? 'Job queued — the Kaggle GPU worker is online.' : 'Job queued — the Kaggle worker looks offline. Start the notebook on Kaggle (it picks the job up automatically).')

        let announcedProcessing = false
        let unreadable = 0
        for (;;) {
          await sleep(pollMs, signal)
          if (signal?.aborted) throw new VtonError(ERROR_CODES.CANCELLED)
          const { data: row, error } = await supabase.from('vton_jobs').select('status,error,result_path').eq('id', jobId).maybeSingle()
          if (error || !row) {
            // A transient read failure must not fail a running job, but a job we can never read back (RLS / deleted) must not spin for 20 minutes.
            if (++unreadable >= 10) throw await queueError(supabase, 'poll vton_jobs', error ?? new Error('the job row is not readable'))
            continue
          }
          unreadable = 0
          if (row.status === 'processing' && !announcedProcessing) { announcedProcessing = true; onStatus?.('PROCESSING') }
          if (row.status === 'failed') throw new VtonError(ERROR_CODES.PROCESSING_FAILED, { technical: row.error || 'worker reported failure', hint: row.error ? `Worker: ${row.error}` : undefined })
          if (row.status === 'cancelled') throw new VtonError(ERROR_CODES.CANCELLED)
          if (row.status === 'completed' && row.result_path) {
            const dl = await supabase.storage.from(BUCKET).download(row.result_path)
            if (dl.error || !dl.data) throw new VtonError(ERROR_CODES.INVALID_RESULT_IMAGE, { technical: `download result: ${dl.error?.message}` })
            const blob = dl.data.type ? dl.data : new Blob([dl.data], { type: 'image/png' })
            if (!(await isDecodableImage(blob))) throw new VtonError(ERROR_CODES.INVALID_RESULT_IMAGE, { technical: `result type=${blob.type} size=${blob.size}` })
            supabase.storage.from(BUCKET).remove([personPath, garmentPath, row.result_path]).catch(() => {}) // best-effort cleanup
            return createProviderResult({ ...base, success: true, imageBlob: blob, jobId, status: RESULT_STATUS.COMPLETED, usage: NO_USAGE })
          }
        }
      } catch (raw) {
        const err = asVtonError(raw)
        if (jobId && (err.code === ERROR_CODES.CANCELLED || signal?.aborted)) {
          supabase.from('vton_jobs').update({ status: 'cancelled', finished_at: new Date().toISOString() }).eq('id', jobId).in('status', ['queued', 'processing']).then(() => {}, () => {})
        }
        if (err.name === 'AbortError' || err.code === ERROR_CODES.CANCELLED || signal?.aborted) {
          return createProviderResult({ ...base, jobId, success: false, status: RESULT_STATUS.CANCELLED, error: 'Generation was cancelled.', errorCode: ERROR_CODES.CANCELLED, usage: NO_USAGE })
        }
        logVtonError(`kaggle worker generate (view=${view})`, err)
        return createProviderResult({ ...base, jobId, success: false, status: RESULT_STATUS.FAILED, error: err.hint ? `${err.message} ${err.hint}` : err.message, errorCode: err.code, usage: NO_USAGE })
      }
    },
  }
}

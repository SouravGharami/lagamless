// vton-worker — the ONLY door the Kaggle GPU notebook uses. Deploy with --no-verify-jwt (auth is the worker token).
//
// Secrets (supabase secrets set …; never in the repo, never VITE_*, never in the browser):
//   VTON_WORKER_TOKEN   a long random string; the same value is stored as a Kaggle Secret
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase. The service-role key never leaves this function.
//
// POST JSON { action, workerId, ... }:
//   heartbeat                        -> { ok }
//   claim                            -> { job: null } | { job: { id, view, category, personUrl, garmentUrl } }
//   complete { jobId, imageBase64 }  -> { ok }      (uploads the result to the private bucket, marks the job completed)
//   fail     { jobId, error }        -> { ok }
import { handleOptions, jsonResponse } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const BUCKET = 'vton-jobs'
const SIGNED_URL_SECONDS = 60 * 60
const MAX_RESULT_BYTES = 12 * 1024 * 1024

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n)

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const expected = Deno.env.get('VTON_WORKER_TOKEN') ?? ''
  const given = req.headers.get('x-worker-token') ?? ''
  if (expected.length < 24 || !safeEqual(given, expected)) return jsonResponse({ error: 'Unauthorized' }, 401)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }
  const action = String(body.action ?? '')
  const workerId = clip(body.workerId || 'kaggle', 60)

  try {
    if (action === 'heartbeat') {
      await supabaseAdmin.from('vton_worker_status').upsert({ id: 'kaggle', last_seen: new Date().toISOString(), info: clip(body.info, 200) })
      return jsonResponse({ ok: true })
    }

    if (action === 'claim') {
      await supabaseAdmin.from('vton_worker_status').upsert({ id: 'kaggle', last_seen: new Date().toISOString(), info: clip(body.info, 200) })
      const { data, error } = await supabaseAdmin.rpc('claim_next_vton_job', { p_worker: workerId })
      if (error) return jsonResponse({ error: 'Could not claim a job' }, 500)
      const job = Array.isArray(data) ? data[0] : data
      if (!job) return jsonResponse({ job: null })
      const [person, garment] = await Promise.all([
        supabaseAdmin.storage.from(BUCKET).createSignedUrl(job.person_path, SIGNED_URL_SECONDS),
        supabaseAdmin.storage.from(BUCKET).createSignedUrl(job.garment_path, SIGNED_URL_SECONDS),
      ])
      if (person.error || garment.error || !person.data || !garment.data) {
        await supabaseAdmin.from('vton_jobs').update({ status: 'failed', error: 'Input images are missing from storage.', finished_at: new Date().toISOString() }).eq('id', job.id)
        return jsonResponse({ job: null })
      }
      return jsonResponse({ job: { id: job.id, view: job.view, category: job.category, personUrl: person.data.signedUrl, garmentUrl: garment.data.signedUrl } })
    }

    const jobId = String(body.jobId ?? '')
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return jsonResponse({ error: 'Invalid jobId' }, 400)
    const { data: job } = await supabaseAdmin.from('vton_jobs').select('id,status,worker_id').eq('id', jobId).maybeSingle()
    if (!job) return jsonResponse({ error: 'Job not found' }, 404)

    if (action === 'fail') {
      if (job.status === 'processing') {
        await supabaseAdmin.from('vton_jobs').update({ status: 'failed', error: clip(body.error, 300) || 'The GPU worker failed.', finished_at: new Date().toISOString() }).eq('id', jobId)
      }
      return jsonResponse({ ok: true })
    }

    if (action === 'complete') {
      if (job.status !== 'processing') return jsonResponse({ ok: false, error: `Job is ${job.status}` }, 409) // e.g. cancelled by the admin
      const b64 = String(body.imageBase64 ?? '')
      if (!b64) return jsonResponse({ error: 'imageBase64 is required' }, 400)
      const bytes = base64ToBytes(b64)
      if (bytes.length === 0 || bytes.length > MAX_RESULT_BYTES) return jsonResponse({ error: 'Result image has an invalid size' }, 400)
      const path = `${jobId}/result.png`
      const up = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/png', upsert: true })
      if (up.error) {
        await supabaseAdmin.from('vton_jobs').update({ status: 'failed', error: 'The result could not be stored.', finished_at: new Date().toISOString() }).eq('id', jobId)
        return jsonResponse({ error: 'Upload failed' }, 500)
      }
      await supabaseAdmin.from('vton_jobs').update({ status: 'completed', result_path: path, error: null, finished_at: new Date().toISOString() }).eq('id', jobId)
      return jsonResponse({ ok: true })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch {
    return jsonResponse({ error: 'Server error' }, 500)
  }
})

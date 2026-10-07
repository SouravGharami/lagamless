/**
 * Kaggle worker provider self-test. Run: node src/admin/components/mockup-v2/human-model/providers/selfTestKaggleWorker.mjs
 * Uses an in-process FAKE Supabase client. It proves our queue logic and failure diagnosis; it does NOT prove your real
 * Supabase project or Kaggle notebook are set up (see docs/kaggle-fashn-worker-setup.md).
 */
import assert from 'node:assert/strict'
import { createKaggleWorkerProvider, diagnoseQueue } from './kaggleWorkerProvider.js'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const png = () => new Blob([PNG], { type: 'image/png' })
let passed = 0
const t = async (name, fn) => { await fn(); passed += 1; console.log(`  ok  ${name}`) }

/** o: session, admin ('yes'|'no'|'missing'), table ('ok'|'missing'), bucket ('ok'|'missing'), uploadError, insertError, completeAfter */
function fakeSupabase(o = {}) {
  const log = { uploads: [], removed: [], inserts: [] }
  let polls = 0
  const res = (data, error = null) => Promise.resolve({ data, error })
  const table = (name) => ({
    select() {
      const q = {
        limit: () => (name === 'vton_jobs' && o.table === 'missing' ? res(null, { code: '42P01', message: 'relation "public.vton_jobs" does not exist' }) : res([])),
        eq: () => ({
          maybeSingle: () => {
            if (name === 'vton_worker_status') return res({ last_seen: new Date().toISOString() })
            polls += 1
            return res(polls >= (o.completeAfter ?? 2) ? { status: 'completed', result_path: 'job/result.png' } : { status: 'queued' })
          },
        }),
      }
      return q
    },
    insert(row) { log.inserts.push(row); return res(null, o.insertError ?? null) },
    update: () => ({ eq: () => ({ in: () => res(null) }) }),
  })
  return {
    log,
    auth: { getSession: () => res(o.session === false ? { session: null } : { session: { access_token: 't' } }) },
    rpc: (fn) => (fn === 'is_admin' ? (o.admin === 'missing' ? res(null, { message: 'function public.is_admin() does not exist' }) : res(o.admin !== 'no')) : res(null)),
    from: table,
    storage: {
      from: () => ({
        upload: (path, blob, opts) => { log.uploads.push({ path, type: opts?.contentType }); return res(o.uploadError ? null : { path }, o.uploadError ?? null) },
        list: () => (o.bucket === 'missing' ? res(null, { message: 'Bucket not found' }) : res([])),
        download: () => res(new Blob([PNG], { type: 'image/png' })),
        remove: (paths) => { log.removed.push(...paths); return Promise.resolve({ data: null, error: null }) },
      }),
    },
  }
}
const run = (o, extra = {}) => {
  const sb = fakeSupabase(o)
  const p = createKaggleWorkerProvider({ supabase: sb, pollMs: 1, ...extra })
  return { sb, p, go: () => p.generate({ personImage: png(), garmentImage: png(), view: 'front', options: {} }) }
}

console.log('kaggle worker provider')
await t('happy path: uploads both images, inserts a job, returns the result PNG', async () => {
  const { sb, go } = run({})
  const r = await go()
  assert.equal(r.success, true); assert.equal(r.provider, 'kaggle_worker')
  assert.equal(sb.log.uploads.length, 2); assert.equal(sb.log.inserts[0].category, 'tops'); assert.equal(sb.log.inserts[0].view, 'front')
})
await t('upload fails because the bucket is missing -> says so (not "Free GPU provider")', async () => {
  const { go } = run({ uploadError: { message: 'Bucket not found' }, bucket: 'missing' })
  const r = await go()
  assert.equal(r.success, false); assert.equal(r.errorCode, 'QUEUE_UNAVAILABLE')
  assert.match(r.error, /vton-jobs/); assert.match(r.error, /part-33/); assert.doesNotMatch(r.error, /Free GPU/)
})
await t('upload fails for a non-admin account -> names profiles.role', async () => {
  const { go } = run({ uploadError: { message: 'new row violates row-level security policy' }, admin: 'no' })
  assert.match((await go()).error, /not an admin/)
})
await t('upload fails with no session -> asks to sign in again', async () => {
  const { go } = run({ uploadError: { message: 'new row violates row-level security policy' }, session: false })
  assert.match((await go()).error, /not signed in/i)
})
await t('table missing is detected', async () => {
  const d = await diagnoseQueue(fakeSupabase({ table: 'missing' }), { message: 'whatever' })
  assert.equal(d.cause, 'table_missing')
})
await t('network failure is detected', async () => {
  assert.equal((await diagnoseQueue(fakeSupabase({}), { message: 'TypeError: Failed to fetch' })).cause, 'network')
})
await t('everything healthy but still failing -> falls back to the raw Supabase reason', async () => {
  const d = await diagnoseQueue(fakeSupabase({}), { message: 'weird storage error' })
  assert.equal(d.cause, 'unknown'); assert.match(d.hint, /weird storage error/)
})
await t('insert failure removes the already-uploaded inputs', async () => {
  const { sb, go } = run({ insertError: { code: '42501', message: 'permission denied' }, admin: 'no' })
  const r = await go()
  assert.equal(r.success, false); assert.equal(sb.log.removed.length, 2)
})
await t('only the front view is accepted', async () => {
  const { p } = run({})
  const r = await p.generate({ personImage: png(), garmentImage: png(), view: 'back', options: {} })
  assert.equal(r.errorCode, 'UNSUPPORTED_VIEW')
})
console.log(`\n${passed} passed`)

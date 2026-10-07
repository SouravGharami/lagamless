/**
 * Step 4 self-test. Run: node src/admin/components/mockup-v2/human-model/providers/selfTestStep4.mjs
 *
 * IMPORTANT: this exercises OUR code against an in-process FAKE Gradio server that speaks the real /call protocol.
 * It proves the client, parameter mapping, error handling, queue, usage rules and ZIP/manifest logic. It does NOT prove a
 * real Hugging Face Space works — that needs a live Space (see docs/free-vton-architecture.md "Verifying a real Space").
 */
import assert from 'node:assert/strict'
import { createGradioClient, parseSse, pickEndpoint, buildCallData } from './gradioClient.js'
import { createHuggingFaceZeroGpuProvider } from './huggingFaceZeroGpuProvider.js'
import { createKaggleBatchProvider } from './kaggleBatchProvider.js'
import { buildBatchManifest, buildZip, crc32, parseBatchResults } from './kaggleManifest.js'
import { parseZeroGpuQuotaMessage } from './providerUsage.js'
import { readVtonConfig, hfConfigStatus, findSecretLikeViteVars } from './providerConfig.js'
import { createVtonQueue } from '../vtonQueue.js'
import { planGenerationJobs } from '../vtonPlanning.js'

let passed = 0
const t = async (name, fn) => { await fn(); passed += 1; console.log(`  ok  ${name}`) }
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const png = () => new Blob([PNG], { type: 'image/png' })

const INFO = {
  named_endpoints: {
    '/try_on': { parameters: [
      { label: 'Person image', parameter_name: 'person_image', component: 'Image', parameter_has_default: false },
      { label: 'Garment image', parameter_name: 'garment_image', component: 'Image', parameter_has_default: false },
      { label: 'Category', parameter_name: 'category', component: 'Radio', python_type: { type: 'Literal', description: "Literal['tops', 'bottoms', 'one-pieces']" }, parameter_has_default: true, parameter_default: 'tops' },
      { label: 'Steps', parameter_name: 'steps', component: 'Slider', parameter_has_default: true, parameter_default: 30 },
    ] },
  },
}

/** Fake Space. behaviour: 'ok' | 'quota' | 'error' | 'down' */
function fakeSpace(behaviour = 'ok', log = []) {
  return async (path, init = {}) => {
    log.push({ path, method: init.method, body: init.body })
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status })
    if (behaviour === 'down') throw new TypeError('network')
    if (path === '/config') return json({ api_prefix: '/gradio_api' })
    if (path === '/gradio_api/info') return json(INFO)
    if (path === '/gradio_api/upload') return json([`/tmp/gradio/${log.length}/file.png`])
    if (path === '/gradio_api/call/try_on' && init.method === 'POST') { log.data = JSON.parse(init.body).data; return json({ event_id: 'evt1' }) }
    if (path === '/gradio_api/call/try_on/evt1') {
      if (behaviour === 'quota') return new Response('event: error\ndata: "You have exceeded your GPU quota (60s requested vs. 0s left). Try again in 1:02:03"\n\n')
      if (behaviour === 'error') return new Response('event: error\ndata: null\n\n')
      return new Response('event: heartbeat\ndata: null\n\nevent: complete\ndata: [{"path":"/tmp/gradio/out.png","url":"https://owner-space.hf.space/gradio_api/file=/tmp/gradio/out.png"}]\n\n')
    }
    if (path.startsWith('/gradio_api/file=')) return new Response(png(), { headers: { 'content-type': 'image/png' } })
    return json({ error: 'nope' }, 404)
  }
}
const config = readVtonConfig({ VITE_HF_VTON_SPACE_URL: 'https://owner-space.hf.space' })
const providerWith = (behaviour, log) => createHuggingFaceZeroGpuProvider({ config, createRequest: () => fakeSpace(behaviour, log) })

await t('SSE parsing', () => {
  const ev = parseSse('event: heartbeat\ndata: null\n\nevent: complete\ndata: [1]\n\n')
  assert.deepEqual(ev.map((e) => e.event), ['heartbeat', 'complete'])
})
await t('endpoint + param mapping is by name, never by guess', () => {
  const { apiName, endpoint } = pickEndpoint(INFO)
  assert.equal(apiName, '/try_on')
  const data = buildCallData(endpoint, { person: 'P', garment: 'G', garmentType: 'tops' })
  assert.deepEqual(data, ['P', 'G', 'tops', 30])
  const ambiguous = { parameters: [{ label: 'Image 1', component: 'Image' }, { label: 'Image 2', component: 'Image' }] }
  assert.throws(() => buildCallData(ambiguous, { person: 'P', garment: 'G', garmentType: 'tops' }), (e) => e.code === 'PROVIDER_NOT_CONFIGURED')
  const mapped = buildCallData(ambiguous, { person: 'P', garment: 'G', garmentType: 'tops', paramMap: { person: 'Image 2', garment: 'Image 1' } })
  assert.deepEqual(mapped, ['G', 'P'])
})
await t('HF provider: real protocol round trip returns a normalized image result', async () => {
  const log = []
  const r = await providerWith('ok', log).generate({ personImage: png(), garmentImage: png(), garmentType: 'tops', view: 'front' })
  assert.equal(r.success, true)
  assert.equal(r.status, 'completed')
  assert.ok(r.imageBlob instanceof Blob && r.imageBlob.size > 0)
  assert.equal(r.provider, 'huggingface_zerogpu')
  assert.equal(r.usage.available, false) // no quota number was reported, so none is claimed
  assert.equal(log.data[2], 'tops')
  assert.equal(log.filter((l) => l.path.endsWith('/upload')).length, 2)
  assert.ok(!JSON.stringify(log.map((l) => l.path)).includes('token'))
})
await t('HF provider: quota error is reported honestly', async () => {
  const r = await providerWith('quota').generate({ personImage: png(), garmentImage: png(), view: 'front' })
  assert.equal(r.success, false)
  assert.equal(r.errorCode, 'QUOTA_EXHAUSTED')
  assert.equal(r.error, 'Free GPU quota is exhausted.')
  assert.equal(r.imageBlob, null)
  assert.equal(r.usage.remaining, 0)
  assert.equal(r.usage.source, 'zerogpu-error-message')
})
await t('HF provider: Space failure never reports success', async () => {
  const r = await providerWith('error').generate({ personImage: png(), garmentImage: png(), view: 'front' })
  assert.equal(r.success, false)
  assert.equal(r.error, 'Model processing failed.')
})
await t('HF provider: unreachable Space', async () => {
  const r = await providerWith('down').generate({ personImage: png(), garmentImage: png(), view: 'front' })
  assert.equal(r.errorCode, 'PROVIDER_UNAVAILABLE')
  assert.equal(r.error, 'Free GPU provider is currently unavailable.')
})
await t('HF provider: input validation + unsupported view + missing config', async () => {
  const p = providerWith('ok')
  assert.equal((await p.generate({ personImage: new Blob([]), garmentImage: png(), view: 'front' })).error, 'Human image is invalid.')
  assert.equal((await p.generate({ personImage: png(), garmentImage: null, view: 'front' })).error, 'Finished garment image is invalid.')
  assert.equal((await p.generate({ personImage: png(), garmentImage: png(), view: 'side' })).errorCode, 'UNSUPPORTED_VIEW')
  const none = createHuggingFaceZeroGpuProvider({ config: readVtonConfig({}), createRequest: () => fakeSpace() })
  assert.equal((await none.generate({ personImage: png(), garmentImage: png(), view: 'front' })).error, 'Provider configuration is missing.')
})
await t('HF provider: invalid output image is rejected', async () => {
  const bad = async (path, init) => (path.startsWith('/gradio_api/file=') ? new Response('<html>', { headers: { 'content-type': 'text/html' } }) : fakeSpace('ok')(path, init))
  const p = createHuggingFaceZeroGpuProvider({ config, createRequest: () => bad })
  assert.equal((await p.generate({ personImage: png(), garmentImage: png(), view: 'front' })).errorCode, 'INVALID_RESULT_IMAGE')
})
await t('HF provider: cancellation', async () => {
  const ctrl = new AbortController()
  ctrl.abort()
  const r = await providerWith('ok').generate({ personImage: png(), garmentImage: png(), view: 'front', options: { signal: ctrl.signal } })
  assert.equal(r.status, 'cancelled')
})
await t('ZeroGPU quota parsing only reports figures that are in the text', () => {
  assert.equal(parseZeroGpuQuotaMessage('quota exceeded').leftSeconds, null)
  assert.equal(parseZeroGpuQuotaMessage('60s requested vs. 12s left').leftSeconds, 12)
  assert.equal(parseZeroGpuQuotaMessage('left: 0:01:30').leftSeconds, 90)
})
await t('Kaggle provider never claims an image', async () => {
  const r = await createKaggleBatchProvider().generate({ personImage: png(), garmentImage: png(), view: 'front' })
  assert.equal(r.success, false)
  assert.equal(r.status, 'batch_prepared')
  assert.equal(r.imageBlob, null)
})
await t('queue: states, no fake progress, batch jobs stay QUEUED', async () => {
  const live = { id: 'live', mode: 'live', supportedViews: ['front'], generate: async ({ options }) => { options.onStatus('SUBMITTING'); options.onStatus('PROCESSING'); return { success: true, imageBlob: png(), provider: 'live', status: 'completed', usage: {} } } }
  const batch = { id: 'batch', mode: 'batch', supportedViews: ['front'], generate: async () => ({ success: false, status: 'batch_prepared' }) }
  globalThis.URL.createObjectURL ??= () => 'blob:test'
  const seen = []
  const q = createVtonQueue({ getProvider: (id) => ({ live, batch })[id] })
  q.subscribe(() => seen.push(q.getJobs().map((j) => j.status).join(',')))
  const a = q.enqueue({ providerId: 'live', view: 'front', personBlob: png(), garmentBlob: png() })
  const b = q.enqueue({ providerId: 'batch', view: 'front', personBlob: png(), garmentBlob: png() })
  await new Promise((r) => setTimeout(r, 20))
  const jobs = q.getJobs()
  assert.equal(jobs.find((j) => j.jobId === a.jobId).status, 'COMPLETED')
  assert.equal(jobs.find((j) => j.jobId === b.jobId).status, 'QUEUED')
  assert.ok(seen.some((s) => s.includes('PROCESSING')))
  assert.ok(!JSON.stringify(jobs.map((j) => Object.keys(j))).includes('progress'))
})
await t('planning: unsupported views are reported, not generated', () => {
  const assets = {
    requestedViews: [{ type: 'front' }, { type: 'side' }, { type: 'back' }],
    humanModel: { blob: png(), id: 'm1', fileName: 'm.png', width: 1, height: 1 },
    garment: { views: { FRONT: { blob: png(), width: 1, height: 1 } } },
    composition: { compositionId: 'c1', snapshotId: 's1', artworkLayers: [], counts: {}, tshirtMetadata: {} },
  }
  const { specs, skipped } = planGenerationJobs({ assets, provider: { id: 'huggingface_zerogpu', supportedViews: ['front', 'back'] }, productId: 'p1' })
  assert.deepEqual(specs.map((s) => s.view), ['front'])
  assert.equal(skipped.find((s) => s.view === 'side').reason, 'This provider does not explicitly support this view.')
  assert.match(skipped.find((s) => s.view === 'back').reason, /no render/)
})
await t('ZIP writer + manifest + result import', async () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
  const { manifest, files } = buildBatchManifest([{ jobId: 'j1', productId: 'p1', view: 'front', personBlob: png(), garmentBlob: png(), metadata: { color: 'Black' } }])
  assert.equal(manifest.jobs[0].personImage, 'images/j1_person.png')
  assert.equal(files.length, 2)
  assert.ok(!JSON.stringify(manifest).match(/service_role|token|apikey/i))
  const zip = buildZip([{ name: 'a.txt', data: new TextEncoder().encode('hi') }])
  const head = new Uint8Array(await zip.arrayBuffer())
  assert.deepEqual([...head.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04])
  const results = new File([JSON.stringify({ format: 'lagamless-vton-results', results: [{ jobId: 'j1', success: true, image: 'j1.png', productId: 'p1', view: 'front' }, { jobId: 'j2', success: false }] })], 'results.json')
  const img = new File([PNG], 'j1.png', { type: 'image/png' })
  const out = await parseBatchResults([results, img])
  assert.equal(out.items.length, 1)
  assert.equal(out.items[0].jobId, 'j1')
  assert.equal(out.problems.length, 1)
})
await t('config: no secret can be configured; secret-looking VITE vars are flagged', () => {
  assert.equal(hfConfigStatus(readVtonConfig({})).ok, false)
  assert.equal(hfConfigStatus(readVtonConfig({ VITE_HF_VTON_SPACE_URL: 'https://a.hf.space' })).ok, true)
  assert.deepEqual(findSecretLikeViteVars({ VITE_HF_TOKEN: 'x', VITE_OK: 'y' }), ['VITE_HF_TOKEN'])
  assert.equal(readVtonConfig({ VITE_KAGGLE_WEEKLY_GPU_HOURS: '30' }).kaggle.weeklyAllowanceHours, 30)
})

console.log(`\nStep 4 self-test: ${passed} groups passed`)

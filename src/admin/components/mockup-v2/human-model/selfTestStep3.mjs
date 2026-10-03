// Step 3 self-test (human model asset, validation, quality, garment assets, CORS safety, readiness, provider stub).
// Needs NO canvas and NO browser:  node src/admin/components/mockup-v2/human-model/selfTestStep3.mjs
import assert from 'node:assert/strict'
import { createInitialState, mockupReducer as R } from '../mockupStudioState.js'
import { renderFinishedTshirt, buildFinishedTshirtSnapshot, FinishedTshirtError } from '../finishedTshirtSnapshot.js'
import { toCompositeError } from '../compositing/compositeErrors.js'
import { validateHumanModelFile, validateHumanModelDimensions, HUMAN_MODEL_LIMITS } from './humanModelValidation.js'
import { analyzeHumanModelQuality, summarizePixels, QUALITY_CODE } from './humanModelQuality.js'
import { createHumanModelAsset, releaseHumanModelAsset, humanModelAssetUrls, isHumanModelAssetUsable } from './humanModelAsset.js'
import { EXPORT_ERROR, GARMENT_EXPORT_UNSAFE_MESSAGE, GARMENT_NOT_PREPARED_MESSAGE, classifyRenderError, classifyUrl, createSafeImageLoader, diagnoseImageLoadFailure, headlineFor } from './exportSafety.js'
import { prepareGarmentAssets } from './garmentAssets.js'
import { assembleGenerationAssets, buildGenerationAssets } from './buildGenerationAssets.js'
import { evaluateFitReadiness, buildReadyChecklist } from './fitReadiness.js'
import { ASSET_FORMAT, listGenerationImages, resolveImage, resolveAllImages } from './assetAdapters.js'
import { generateHumanModelMockups, HUMAN_MODEL_GENERATION_STATUS, registerHumanModelProvider, resetHumanModelProvider } from './generateHumanModelMockups.js'

let n = 0
const ok = (m) => console.log(`ok ${++n} - ${m}`)
const realError = console.error
console.error = () => {} // the code under test logs developer diagnostics on purpose

/* ---------------------------------------------------------------- fixtures */
const W = 600, H = 750
const goodPixels = { hasAlpha: false, fullyTransparent: false, transparentShare: 0, uniform: false }
const inspectOk = async () => ({ width: W, height: H, pixels: goodPixels })
const png = (bytes = 64) => new Blob([new Uint8Array(bytes).fill(7)], { type: 'image/png' })
const asset = (url) => ({ url, name: url.slice(5), width: 300, height: 200 })
const photo = (url, name) => ({ url, name, width: W, height: H })
const loadOk = async () => ({})
const fakeRender = async (job) => ({ blob: png(), width: W, height: H, sourceWidth: W, sourceHeight: H, downscaled: false, sourceAsset: 'original', backgroundMode: 'original', customBackground: false, view: job.view })

function buildState({ back = true, sleeve = true } = {}) {
  let s = createInitialState()
  const views = back ? [['FRONT', 'blob:front'], ['BACK', 'blob:back']] : [['FRONT', 'blob:front']]
  for (const [v, p] of views) {
    s = R(s, { type: 'SET_VIEW', view: v }); s = R(s, { type: 'SET_TSHIRT', asset: photo(p, v) })
    s = R(s, { type: 'SET_MASK', kind: 'tshirt', asset: { url: 'blob:mask', name: 'm', width: W, height: H } })
  }
  const add = (view, surface, url, patch) => { s = R(s, { type: 'SET_VIEW', view }); s = R(s, { type: 'SET_SURFACE', surface }); s = R(s, { type: 'ADD_ARTWORK', asset: asset(url) }); s = R(s, { type: 'UPDATE_ARTWORK', id: s.composition.selectedArtworkId, patch, keepRatio: false }) }
  add('FRONT', 'front', 'blob:a1', { x: 20, y: 22, width: 55, height: 36 })
  add('FRONT', 'front', 'blob:a2', { x: 60, y: 10, width: 12, height: 8, rotation: 25 })
  if (sleeve) add('FRONT', 'leftSleeve', 'blob:a4', { x: 5, y: 20, width: 14, height: 9 })
  if (back) add('BACK', 'back', 'blob:a5', { x: 18, y: 18, width: 60, height: 40 })
  return R(s, { type: 'SET_VIEW', view: 'FRONT' })
}
async function snapshotFor(state) {
  return renderFinishedTshirt(state, buildFinishedTshirtSnapshot(state), { loadImage: loadOk, renderView: fakeRender })
}
const model = (over = {}) => {
  const file = new File([new Uint8Array(2000)], 'model.jpg', { type: 'image/jpeg' })
  const validation = { ok: true, errors: [], warnings: [] }
  const quality = analyzeHumanModelQuality({ width: 1200, height: 1600, fileSize: 2000, mimeType: 'image/jpeg' })
  return { ...createHumanModelAsset({ file, url: 'blob:model-url', mimeType: 'image/jpeg', width: 1200, height: 1600, validation, quality }), ...over }
}

/* ---------------------------------------------------- 1. validation (T1-T3) */
const f = (name, type, size) => ({ name, type, size })
for (const [name, type] of [['a.jpg', 'image/jpeg'], ['a.jpeg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp']]) assert.equal(validateHumanModelFile(f(name, type, 5000)).ok, true, name)
assert.equal(validateHumanModelFile(f('a.jpg', '', 5000)).ok, true) // extension fallback when the browser leaves type empty
assert.equal(validateHumanModelFile(null).errors[0].code, 'NO_FILE')
assert.equal(validateHumanModelFile(f('a.gif', 'image/gif', 5000)).errors[0].code, 'UNSUPPORTED_TYPE')
assert.equal(validateHumanModelFile(f('a.png', 'image/png', 0)).errors[0].code, 'EMPTY_FILE')
assert.equal(validateHumanModelFile(f('a.png', 'image/png', HUMAN_MODEL_LIMITS.maxBytes + 1)).errors[0].code, 'FILE_TOO_LARGE')
assert.equal(validateHumanModelFile(f('big.png', 'image/png', 29 * 1024 * 1024)).ok, true) // high-quality files are not rejected
assert.equal(validateHumanModelDimensions({ width: 0, height: 10 }).errors[0].code, 'ZERO_DIMENSIONS')
assert.equal(validateHumanModelDimensions({ width: 40, height: 4000 }).errors[0].code, 'RESOLUTION_TOO_LOW')
assert.equal(validateHumanModelDimensions({ width: 9000, height: 11000 }).ok, true)
assert.equal(validateHumanModelDimensions({ width: 13000, height: 3000 }).errors[0].code, 'RESOLUTION_TOO_HIGH')
ok('file + dimension validation: JPG/JPEG/PNG/WEBP accepted; missing / empty / wrong type / too large / zero / absurd sizes rejected with codes')

/* ------------------------------------------------ 2. quality = warnings only */
const small = validateHumanModelDimensions({ width: 200, height: 300 })
assert.equal(small.ok, true, 'a small image is still usable')
assert.equal(analyzeHumanModelQuality({ width: 200, height: 300 }).warnings[0].code, QUALITY_CODE.VERY_SMALL)
assert.equal(analyzeHumanModelQuality({ width: 800, height: 900 }).warnings[0].code, QUALITY_CODE.LOW_RESOLUTION)
assert.ok(analyzeHumanModelQuality({ width: 4000, height: 1200 }).warnings.some((w) => w.code === QUALITY_CODE.VERY_WIDE))
assert.ok(analyzeHumanModelQuality({ width: 1200, height: 4000 }).warnings.some((w) => w.code === QUALITY_CODE.VERY_TALL))
assert.equal(analyzeHumanModelQuality({ width: 1200, height: 1600 }).level, 'good')
const half = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 10, 20, 30, 128, 255, 0, 0, 255])
assert.equal(summarizePixels(half).hasAlpha, true)
assert.ok(analyzeHumanModelQuality({ width: 1200, height: 1600, pixels: summarizePixels(half) }).warnings.some((w) => w.code === QUALITY_CODE.HAS_TRANSPARENCY))
assert.ok(analyzeHumanModelQuality({ width: 1200, height: 1600, pixels: summarizePixels(new Uint8ClampedArray(64)) }).warnings.some((w) => w.code === QUALITY_CODE.MOSTLY_TRANSPARENT))
assert.equal(summarizePixels(new Uint8ClampedArray([1, 2, 3, 255, 1, 2, 3, 255])).uniform, true)
ok('quality layer warns (low resolution, very small, very wide/tall, transparency, flat image) and never blocks')

/* -------------------------------------------- 3. asset + object URL cleanup (T4, T5) */
const revoked = []
const origRevoke = URL.revokeObjectURL
URL.revokeObjectURL = (u) => { revoked.push(u) }
const a1 = model()
assert.equal(a1.sourceType, 'uploaded'); assert.equal(a1.fileName, 'model.jpg'); assert.equal(a1.fileSize, 2000)
assert.ok(a1.file instanceof File, 'original File kept (no base64)'); assert.ok(!JSON.stringify(a1).includes('base64'))
assert.deepEqual(humanModelAssetUrls(a1), ['blob:model-url'], 'previewUrl and sourceUrl are one URL, listed once')
assert.equal(isHumanModelAssetUsable(a1), true)
releaseHumanModelAsset(a1); assert.deepEqual(revoked, ['blob:model-url'], 'revoked exactly once')
releaseHumanModelAsset(null); releaseHumanModelAsset({}); assert.equal(revoked.length, 1)
URL.revokeObjectURL = origRevoke
assert.equal(isHumanModelAssetUsable(model({ validation: { ok: false, errors: [{}], warnings: [] } })), false)
ok('human model asset has the stable shape, keeps the File (no base64) and revokes its object URL exactly once')

/* --------------------------------------------- 4. garment assets (T6-T9, T14) */
const stateFull = buildState()
const beforeJson = JSON.stringify(stateFull)
const snap = await snapshotFor(stateFull)
for (const v of ['FRONT', 'BACK']) { assert.ok(snap.renderedComposition[v].blob instanceof Blob, `${v} keeps its Blob`); assert.ok(snap.renderedComposition[v].url) }
const gres = await prepareGarmentAssets(snap, { inspect: inspectOk })
assert.equal(gres.ok, true); assert.equal(gres.artworkPreserved, true)
const g = gres.garment
assert.ok(g.front.blob instanceof Blob && g.back.blob instanceof Blob)
assert.deepEqual([g.front.width, g.front.height, g.front.mimeType], [W, H, 'image/png'])
assert.deepEqual(Object.keys(g.views).sort(), ['BACK', 'FRONT'])
assert.equal(g.leftSleeve.kind, 'embedded_in_view'); assert.equal(g.leftSleeve.view, 'FRONT'); assert.equal(g.leftSleeve.layerCount, 1)
assert.ok(!('rightSleeve' in g), 'surfaces without artwork are not invented')
assert.deepEqual(g.front.surfaces.sort(), ['front', 'leftSleeve']); assert.deepEqual(g.back.surfaces, ['back'])
ok('garment front + back are verified Blobs; sleeve artwork is a reference to the render that contains it; absent surfaces are absent')

const frontOnly = await prepareGarmentAssets(await snapshotFor(buildState({ back: false, sleeve: false })), { inspect: inspectOk })
assert.ok(frontOnly.ok && frontOnly.garment.front && !frontOnly.garment.back && !frontOnly.garment.leftSleeve)
ok('a front-only single-artwork design has no back / sleeve entries')

const blank = await prepareGarmentAssets(snap, { inspect: async () => ({ width: W, height: H, pixels: { ...goodPixels, uniform: true } }) })
assert.equal(blank.ok, false); assert.equal(blank.garment, null); assert.equal(blank.failures[0].code, EXPORT_ERROR.BLANK_RENDER)
const transparent = await prepareGarmentAssets(snap, { inspect: async () => ({ width: W, height: H, pixels: { ...goodPixels, fullyTransparent: true } }) })
assert.equal(transparent.failures[0].code, EXPORT_ERROR.BLANK_RENDER)
const wrongSize = await prepareGarmentAssets(snap, { inspect: async () => ({ width: 10, height: 10, pixels: goodPixels }) })
assert.equal(wrongSize.ok, false)
const unreadable = await prepareGarmentAssets(snap, { inspect: async () => { throw new Error('decode failed') } })
assert.equal(unreadable.failures[0].code, EXPORT_ERROR.UNREADABLE_BLOB)
const emptySnap = { ...snap, renderedComposition: { ...snap.renderedComposition, FRONT: { ...snap.renderedComposition.FRONT, blob: new Blob([]) } } }
assert.equal((await prepareGarmentAssets(emptySnap, { inspect: inspectOk })).failures[0].code, EXPORT_ERROR.EMPTY_BLOB)
assert.equal((await prepareGarmentAssets({ ...snap, renderedComposition: {} })).failures[0].code, EXPORT_ERROR.NO_RENDER)
ok('a blank / fully transparent / empty / unreadable / wrong-size render is reported, never handed over as a garment')

/* ------------------------------------------------- 5. CORS / canvas safety (T10, T15) */
assert.equal(classifyUrl('blob:abc', 'https://app.test'), 'blob'); assert.equal(classifyUrl('data:image/png;base64,AA', 'https://app.test'), 'data')
assert.equal(classifyUrl('https://app.test/x.png', 'https://app.test'), 'same-origin'); assert.equal(classifyUrl('https://abc.supabase.co/x.png', 'https://app.test'), 'cross-origin')
assert.equal(classifyUrl('', 'https://app.test'), 'invalid')
const SUPA = 'https://abc.supabase.co/storage/v1/object/public/p/t.png'
const corsBlocked = async (url, init) => { if (init.mode === 'cors') throw new TypeError('Failed to fetch'); return { ok: true, type: 'opaque' } }
const d1 = await diagnoseImageLoadFailure(SUPA, { fetchImpl: corsBlocked, origin: 'https://app.test' })
assert.equal(d1.code, EXPORT_ERROR.CROSS_ORIGIN_BLOCKED); assert.match(d1.technical, /Access-Control-Allow-Origin/)
const d2 = await diagnoseImageLoadFailure(SUPA, { fetchImpl: async () => ({ ok: false, status: 404, statusText: 'Not Found' }), origin: 'https://app.test' })
assert.equal(d2.code, EXPORT_ERROR.IMAGE_LOAD_FAILED); assert.match(d2.message, /404/)
const d3 = await diagnoseImageLoadFailure(SUPA, { fetchImpl: async () => ({ ok: true }), origin: 'https://app.test' })
assert.equal(d3.code, EXPORT_ERROR.IMAGE_DECODE_FAILED)
const d4 = await diagnoseImageLoadFailure(SUPA, { fetchImpl: async () => { throw new TypeError('offline') }, origin: 'https://app.test' })
assert.equal(d4.code, EXPORT_ERROR.NETWORK_UNREACHABLE)
assert.equal((await diagnoseImageLoadFailure('blob:x', { origin: 'https://app.test' })).code, EXPORT_ERROR.IMAGE_DECODE_FAILED)
ok('a failed remote (Supabase) image is diagnosed: CORS blocked vs HTTP error vs undecodable vs offline — with a developer hint')

const safe = createSafeImageLoader(async () => { throw new Error('The T-shirt photo could not be loaded. It may be missing, corrupted or in an unsupported format.') }, { fetchImpl: corsBlocked, origin: 'https://app.test', log: () => {} })
await assert.rejects(() => safe(SUPA, 'T-shirt photo'), (e) => e.exportCode === EXPORT_ERROR.CROSS_ORIGIN_BLOCKED && /CORS/.test(e.technical) && e.url === SUPA)
ok('the safe loader replaces the compositor\'s generic "could not be loaded" with the real cause and keeps the original')

// CORS failure through the REAL renderFinishedTshirt path (loader throws, renderView uses the loader like the compositor does)
const stateRemote = buildState()
const snapRemote = buildFinishedTshirtSnapshot(stateRemote)
const loaderFails = async () => { throw new Error('The T-shirt photo could not be loaded. It may be missing, corrupted or in an unsupported format.') }
const renderViaLoader = async (job, { loadImage }) => { await loadImage('blob:front', 'T-shirt photo'); return fakeRender(job) }
await assert.rejects(() => renderFinishedTshirt(stateRemote, snapRemote, { loadImage: loaderFails, renderView: renderViaLoader }), (e) => {
  assert.ok(e instanceof FinishedTshirtError); assert.ok(e.failures.length >= 1); assert.equal(e.failures[0].code, EXPORT_ERROR.IMAGE_DECODE_FAILED); assert.ok(e.details.length >= 1); return true
})
ok('renderFinishedTshirt fails ALL-OR-NOTHING with structured failures (code, message, technical) instead of returning a blank garment')

// tainted canvas: toBlob throws a SecurityError, which the compositor wraps with toCompositeError
const taint = new DOMException('Failed to execute \'toBlob\' on \'HTMLCanvasElement\': Tainted canvases may not be exported.', 'SecurityError')
const c = classifyRenderError(toCompositeError(taint), { view: 'FRONT' })
assert.equal(c.code, EXPORT_ERROR.CANVAS_TAINTED); assert.match(c.technical, /Tainted canvases/); assert.equal(headlineFor([c]), GARMENT_EXPORT_UNSAFE_MESSAGE)
assert.equal(GARMENT_EXPORT_UNSAFE_MESSAGE, 'Unable to prepare the garment image because one or more source images cannot be exported safely.')
await assert.rejects(() => renderFinishedTshirt(stateRemote, snapRemote, { loadImage: loadOk, renderView: async () => { throw toCompositeError(taint) } }), (e) => e.failures.every((x) => x.code === EXPORT_ERROR.CANVAS_TAINTED))
assert.equal(classifyRenderError(new Error('The browser could not encode the PNG.')).code, EXPORT_ERROR.ENCODE_FAILED)
assert.equal(headlineFor([{ code: EXPORT_ERROR.BLANK_RENDER }]), GARMENT_NOT_PREPARED_MESSAGE)
ok('a tainted canvas (SecurityError from toBlob) is classified as CANVAS_TAINTED with the original message preserved for developers')

/* ------------------------------------------------ 6. readiness (T11-T13) */
const okGarmentState = { status: 'ready', snapshotId: snap.id, result: gres }
const base = { modelImage: a1, snapshot: snap, stale: false, snapshotStatus: 'ready', garmentState: okGarmentState, requestedViews: ['front', 'back'] }
assert.equal(evaluateFitReadiness(base).ready, true)
let r = evaluateFitReadiness({ ...base, modelImage: null }); assert.equal(r.ready, false); assert.deepEqual(r.blockers.map((b) => b.message), ['Human model required'])
r = evaluateFitReadiness({ ...base, snapshot: null, garmentState: null }); assert.equal(r.ready, false); assert.deepEqual(r.blockers.map((b) => b.message), ['Finished T-shirt required'])
r = evaluateFitReadiness({ ...base, modelImage: null, snapshot: null, garmentState: null }); assert.deepEqual(r.blockers.map((b) => b.message), ['Human model required', 'Finished T-shirt required'])
r = evaluateFitReadiness({ ...base, garmentState: { status: 'failed', snapshotId: snap.id, result: blank } }); assert.equal(r.ready, false); assert.equal(r.blockers[0].message, 'Garment image could not be prepared')
r = evaluateFitReadiness({ ...base, garmentState: { status: 'checking', snapshotId: snap.id, result: null } }); assert.equal(r.ready, false); assert.equal(r.pending, true)
r = evaluateFitReadiness({ ...base, garmentState: { status: 'ready', snapshotId: 'some-older-snapshot', result: gres } }); assert.equal(r.ready, false, 'a result for another snapshot never counts')
r = evaluateFitReadiness({ ...base, stale: true }); assert.equal(r.ready, false); assert.equal(r.blockers[0].code, 'TSHIRT_STALE')
r = evaluateFitReadiness({ ...base, requestedViews: [] }); assert.equal(r.ready, false)
r = evaluateFitReadiness({ ...base, modelImage: { ...a1, validation: { ok: false, errors: [{}], warnings: [] } } }); assert.equal(r.ready, false)
const labels = buildReadyChecklist({ garment: g, artworkPreserved: true }).map((x) => x.label)
assert.deepEqual(labels.slice(0, 5), ['Human model ready', 'Finished T-shirt ready', 'Artwork preserved', 'Front garment prepared', 'Back garment prepared'])
assert.ok(!buildReadyChecklist({ garment: frontOnly.garment, artworkPreserved: true }).some((x) => x.id === 'back'))
assert.ok(!buildReadyChecklist({ garment: g, artworkPreserved: false }).some((x) => x.id === 'artwork'))
ok('FIT is enabled only when model + current T-shirt + verified garment all exist; every blocker is named; checklist shows only true rows')

/* --------------------------------------- 7. buildGenerationAssets + artwork exactness */
const built = assembleGenerationAssets({ humanModel: a1, snapshot: snap, garmentResult: gres, requestedViews: ['front', 'three_quarter_front', 'back'] })
assert.equal(built.ok, true)
const A = built.assets
assert.deepEqual(Object.keys(A).sort(), ['composition', 'garment', 'humanModel', 'requestedViews', 'schemaVersion'])
assert.ok(A.humanModel.blob instanceof File); assert.equal(A.humanModel.width, 1200)
assert.ok(A.garment.front.blob instanceof Blob)
assert.equal(A.requestedViews.length, 3); assert.equal(A.requestedViews[1].angle, 'THREE_QUARTER_FRONT')
assert.equal(A.composition.artworkLayers.length, 4); assert.equal(A.composition.artworkPreserved, true)
const srcLayers = Object.values(stateFull.composition.surfaces).flatMap((x) => x.artworks)
for (const layer of srcLayers) { const copy = A.composition.artworkLayers.find((l) => l.id === layer.id); assert.ok(copy); for (const [k, v] of Object.entries(layer)) assert.deepEqual(copy[k], v, `${layer.id}.${k}`) }
assert.equal(JSON.stringify(stateFull), beforeJson, 'Mockup Studio state untouched')
const serialized = JSON.stringify(A)
assert.ok(!serialized.includes('data:image') && !/base64/i.test(serialized) && !/apikey|api_key|secret/i.test(serialized))
const viaAsync = await buildGenerationAssets({ humanModel: a1, snapshot: snap, requestedViews: ['front'], inspect: inspectOk })
assert.equal(viaAsync.ok, true)
assert.equal(assembleGenerationAssets({ humanModel: null, snapshot: snap, garmentResult: gres, requestedViews: ['front'] }).problems[0].message, 'Human model required')
assert.equal(assembleGenerationAssets({ humanModel: a1, snapshot: null, garmentResult: null, requestedViews: ['front'] }).problems[0].message, 'Finished T-shirt required')
assert.equal(assembleGenerationAssets({ humanModel: a1, snapshot: snap, garmentResult: blank, requestedViews: ['front'] }).problems[0].message, 'Garment image could not be prepared')
ok('buildGenerationAssets returns {humanModel, garment, composition, requestedViews}; every artwork layer is field-for-field identical to the studio; no base64 / secrets')

/* ------------------------------------------------------ 8. adapters */
const imgs = listGenerationImages(A)
assert.deepEqual(imgs.map((i) => i.role), ['human_model', 'garment_front', 'garment_back'])
assert.equal(await resolveImage(imgs[1], ASSET_FORMAT.BLOB), imgs[1].blob)
const file = await resolveImage(imgs[1], ASSET_FORMAT.FILE); assert.ok(file instanceof File); assert.equal(file.type, 'image/png')
assert.equal((await resolveImage(imgs[1], ASSET_FORMAT.OBJECT_URL)).startsWith('blob:'), true)
await assert.rejects(() => resolveImage(imgs[1], ASSET_FORMAT.REMOTE_URL), (e) => e.code === 'UPLOADER_REQUIRED')
const urls = await resolveAllImages(A, ASSET_FORMAT.REMOTE_URL, { uploader: async (blob, meta) => { assert.ok(blob.size > 0); return `https://storage.test/${meta.role}` } })
assert.equal(urls.garment_back, 'https://storage.test/garment_back')
await assert.rejects(() => resolveImage(imgs[0], 'nope'), (e) => e.code === 'UNKNOWN_FORMAT')
ok('adapter layer converts on demand (Blob / File / object URL / injected uploader); no vendor code, base64 only if explicitly asked')

/* ------------------------------------------------- 9. provider stub */
let out = await generateHumanModelMockups(A)
assert.equal(out.status, HUMAN_MODEL_GENERATION_STATUS.PROVIDER_NOT_CONNECTED); assert.deepEqual(out.results, [])
assert.ok(!('imageUrl' in out) && !('outputImage' in out))
out = await generateHumanModelMockups({ ...A, humanModel: { ...A.humanModel, blob: null } })
assert.equal(out.status, HUMAN_MODEL_GENERATION_STATUS.INVALID_INPUT)
let called = 0
registerHumanModelProvider({ id: 'fake', label: 'Fake', available: true, async generate(assets) { called += 1; assert.ok(assets.garment.front); return { status: 'completed', results: [{ viewType: 'front' }] } } })
out = await generateHumanModelMockups(A); assert.equal(called, 1); assert.equal(out.status, 'completed'); assert.equal(out.provider.id, 'fake')
registerHumanModelProvider({ id: 'boom', label: 'Boom', available: true, async generate() { throw new Error('upstream 500') } })
out = await generateHumanModelMockups(A); assert.equal(out.status, HUMAN_MODEL_GENERATION_STATUS.PROVIDER_ERROR)
resetHumanModelProvider()
assert.equal((await generateHumanModelMockups(A)).status, 'provider_not_connected')
ok('generateHumanModelMockups returns provider_not_connected without inventing a result; a registered provider plugs in with no Studio change')

console.error = realError
console.log(`\n${n} passed`)

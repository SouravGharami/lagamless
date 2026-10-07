// Step 2 self-test (finished T-shirt snapshot + handoff). Run:  CANVAS_FROM=<dir>/package.json node selfTestStep2.mjs
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { createInitialState, mockupReducer as R, allArtworks } from '../mockupStudioState.js'
import { snapshotView, renderFinalView } from '../compositing/index.js'
import { buildFinishedTshirtSnapshot, prepareFinishedTshirt, summarizeSnapshot, computeCompositionSignature, isSnapshotStale, hasFinishedTshirt, FinishedTshirtError, FINISHED_TSHIRT_ERROR_MESSAGE } from '../finishedTshirtSnapshot.js'
import { buildHumanModelGenerationInput } from './buildHumanModelGenerationInput.js'
import { createInitialHumanModelState, humanModelReducer as HR, FIT_READY_MESSAGE } from './humanModelState.js'
const require = createRequire(process.env.CANVAS_FROM || import.meta.url)
const { createCanvas } = require('@napi-rs/canvas')
const env = { createCanvas: (w, h) => createCanvas(w, h) }
let n = 0; const ok = (m) => console.log(`ok ${++n} - ${m}`)
const solid = (w, h, c) => { const k = createCanvas(w, h); const g = k.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, w, h); return k }
const W = 600, H = 750
const images = { 'blob:front': solid(W, H, '#e8e4dc'), 'blob:back': solid(W, H, '#c9c4b8'), 'blob:mask': solid(W, H, '#fff'),
  'blob:a1': solid(300, 200, '#d01818'), 'blob:a2': solid(300, 200, '#1040d0'), 'blob:a3': solid(300, 200, '#18a030'), 'blob:a4': solid(300, 200, '#f0d020'), 'blob:a5': solid(300, 200, '#000') }
const load = async (u, label) => { if (!images[u]) throw new Error(`no ${u} (${label})`); return images[u] }
const asset = (url) => ({ url, name: url.slice(5), width: 300, height: 200 })
const photo = (url, name) => ({ url, name, width: W, height: H })

function build() {
  let s = createInitialState()
  for (const [v, p] of [['FRONT', 'blob:front'], ['BACK', 'blob:back']]) {
    s = R(s, { type: 'SET_VIEW', view: v }); s = R(s, { type: 'SET_TSHIRT', asset: photo(p, v) })
    s = R(s, { type: 'SET_MASK', kind: 'tshirt', asset: { url: 'blob:mask', name: 'm', width: W, height: H } })
  }
  const add = (view, surface, url, patch) => { s = R(s, { type: 'SET_VIEW', view }); s = R(s, { type: 'SET_SURFACE', surface }); s = R(s, { type: 'ADD_ARTWORK', asset: asset(url) }); s = R(s, { type: 'UPDATE_ARTWORK', id: s.composition.selectedArtworkId, patch, keepRatio: false }); return s.composition.selectedArtworkId }
  const ids = {}
  ids.chest = add('FRONT', 'front', 'blob:a1', { x: 20, y: 22, width: 55, height: 36 })
  ids.logo = add('FRONT', 'front', 'blob:a2', { x: 60, y: 10, width: 12, height: 8, rotation: 25 })
  ids.text = add('FRONT', 'front', 'blob:a3', { x: 25, y: 62, width: 40, height: 10, opacity: 0.8 })
  ids.sleeve = add('FRONT', 'leftSleeve', 'blob:a4', { x: 5, y: 20, width: 14, height: 9 })
  ids.back = add('BACK', 'back', 'blob:a5', { x: 18, y: 18, width: 60, height: 40, warp: 70 })
  // the studio lets a placement be assigned to a view that has no photo yet (ADD_ARTWORK itself requires a photo)
  s = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id: ids.chest, view: 'SIDE' })
  ids.orphan = allArtworks(s.composition).find((a) => a.view === 'SIDE').id
  s = R(s, { type: 'SET_VIEW', view: 'FRONT' })
  return { s, ids }
}

const { s, ids } = build()
const before = JSON.stringify(s)

// 1. finished-by-studio rule
assert.equal(hasFinishedTshirt(s), true); assert.equal(hasFinishedTshirt(createInitialState()), false)
ok('hasFinishedTshirt follows the studio rule (photo + visible artwork)')

// 2. every layer preserved with every editor field
const snap = buildFinishedTshirtSnapshot(s)
const src = allArtworks(s.composition)
const got = Object.values(snap.surfaces).flatMap((x) => x.artworkLayers)
assert.equal(got.length, src.length); assert.equal(src.length, 6)
for (const layer of src) { const copy = got.find((l) => l.id === layer.id); assert.ok(copy, layer.id); for (const [k, v] of Object.entries(layer)) assert.deepEqual(copy[k], v, `${layer.id}.${k}`) }
assert.equal(snap.surfaces.front.artworkLayers.filter((l) => l.view === 'FRONT').length, 3)
assert.equal(snap.surfaces.leftSleeve.artworkLayers.length, 1); assert.equal(snap.surfaces.back.artworkLayers.length, 1); assert.equal(snap.surfaces.rightSleeve.artworkLayers.length, 0)
assert.equal(got.find((l) => l.id === ids.logo).rotation, 25)
ok('all 6 layers preserved field-for-field (3 front, 1 sleeve, 1 back, 1 in a photo-less view); rotation/opacity/warp intact')

// 3. inRender / renderOrder / warnings / views
assert.equal(got.find((l) => l.id === ids.orphan).inRender, false); assert.equal(snap.warnings.length, 1)
assert.deepEqual(Object.keys(snap.views).sort(), ['BACK', 'FRONT']); assert.ok(!snap.views.SIDE)
assert.deepEqual(snap.views.FRONT.layerIds.length, 4); assert.equal(snap.views.BACK.layerIds.length, 1)
const order = snap.views.FRONT.layerIds.map((id) => got.find((l) => l.id === id).renderOrder); assert.deepEqual(order, [0, 1, 2, 3])
const sum = summarizeSnapshot(snap); assert.equal(sum.bySurface.front.rendered, 3); assert.equal(sum.bySurface.front.placed, 4); assert.equal(sum.bySurface.leftSleeve.rendered, 1)
ok('views only exist where a photo exists; stacking order follows the compositor; the photo-less layer is flagged, not dropped or invented')

// 4. rendering reuses the existing renderer: identical bytes to Download PNG path
const full = await prepareFinishedTshirt(s, { loadImage: load, env })
assert.deepEqual(summarizeSnapshot(full).renderedViews.sort(), ['BACK', 'FRONT'])
for (const view of ['FRONT', 'BACK']) {
  const direct = await renderFinalView(snapshotView(s, view), { loadImage: load, env })
  const mine = Buffer.from(await (await fetch(full.renderedComposition[view].url)).arrayBuffer())
  const theirs = Buffer.from(await direct.blob.arrayBuffer ? await direct.blob.arrayBuffer() : direct.blob)
  assert.ok(mine.equals(theirs), `${view} render is byte-identical to renderFinalView`)
  assert.equal(full.renderedComposition[view].width, direct.width)
}
ok('FRONT and BACK renders are byte-identical to the studio\'s own renderFinalView output (no second compositor)')

// 5. editor state untouched
assert.equal(JSON.stringify(s), before); ok('Mockup Studio state was not mutated')

// 6. signature: stable, and changes on move / resize / rotate / background / photo
const sig = computeCompositionSignature(s); assert.equal(computeCompositionSignature(s), sig); assert.equal(isSnapshotStale(full, s), false)
const moved = R(s, { type: 'UPDATE_ARTWORK', id: ids.chest, patch: { x: 30 } })
const rot = R(s, { type: 'UPDATE_ARTWORK', id: ids.text, patch: { rotation: 10 } })
const size = R(s, { type: 'UPDATE_ARTWORK', id: ids.logo, patch: { width: 20, height: 14 }, keepRatio: false })
const bg = R(s, { type: 'SET_BACKGROUND_COLOR', color: '#223344' }); const bg2 = R(bg, { type: 'SET_BACKGROUND_MODE', mode: 'color' })
for (const [name, st] of [['move', moved], ['rotate', rot], ['resize', size], ['background', bg2]]) assert.equal(isSnapshotStale(full, st), true, name)
const sel = R(s, { type: 'SELECT_ARTWORK', id: ids.logo }); assert.equal(isSnapshotStale(full, sel), false, 'selecting a layer is not a change')
ok('snapshot is flagged stale after move / rotate / resize / background change, but not after a mere selection')

// 7. updated composition is handed over again
const again = await prepareFinishedTshirt(moved, { loadImage: load, env })
assert.equal(again.surfaces.front.artworkLayers.find((l) => l.id === ids.chest).x, 30); assert.equal(isSnapshotStale(again, moved), false)
ok('re-running the handoff after an edit carries the updated placement')

// 8. no-artwork / error paths
await assert.rejects(() => prepareFinishedTshirt(createInitialState(), { loadImage: load, env }), (e) => e instanceof FinishedTshirtError && e.message === FINISHED_TSHIRT_ERROR_MESSAGE)
const broken = R(s, { type: 'SET_TSHIRT', asset: photo('blob:missing', 'x') })
await assert.rejects(() => prepareFinishedTshirt(broken, { loadImage: load, env }), (e) => e instanceof FinishedTshirtError && e.details.length >= 1)
ok('missing photo / failed render -> FinishedTshirtError with the required message, nothing half-handed-over')

// 9. provider-neutral input + FIT behaviour
const model = { id: 'm1', fileName: 'model.jpg', mimeType: 'image/jpeg', fileSize: 1000, width: 1200, height: 1600, sourceUrl: 'blob:model', previewUrl: 'blob:model' }
const views = ['front', 'three_quarter_front', 'back']
assert.equal(buildHumanModelGenerationInput({ modelImage: null, snapshot: full, requestedViews: views }).ok, false)
assert.equal(buildHumanModelGenerationInput({ modelImage: model, snapshot: null, requestedViews: views }).ok, false)
const built = buildHumanModelGenerationInput({ modelImage: model, snapshot: full, requestedViews: views })
assert.equal(built.ok, true); const inp = built.input
assert.equal(inp.composition.artworkLayers.length, 6); assert.ok(inp.garment.frontImage.url && inp.garment.backImage.url)
assert.equal(inp.garment.sleeveImages.length, 1); assert.equal(inp.garment.sleeveImages[0].view, 'FRONT')
assert.equal(inp.requestedViews.length, 3); assert.ok(!JSON.stringify(inp).toLowerCase().includes('apikey'))
let hs = createInitialHumanModelState(); hs = HR(hs, { type: 'FIT_REQUESTED', ok: true, summary: 'x' }); assert.equal(hs.notice, FIT_READY_MESSAGE)
ok('generation input is assembled locally (model + renders + all layers + requested views); FIT only sets the ready message')

console.log(`\n${n} passed`)

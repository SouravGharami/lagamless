// Step 5-3C self-test (multi-view artwork consistency). Pure reducer / data logic — no DOM, no canvas, no network:
//   node src/admin/components/mockup-v2/compositing/selfTest53c.mjs
import assert from 'node:assert/strict'
import { createInitialState, mockupReducer as R, layersForSurface, placementsOfArtwork, placementsInView, surfaceCounts, viewCounts, serializeComposition, findArtwork, allArtworks } from '../mockupStudioState.js'
import { collectViewJobs, renderViewJobs, viewsWithoutPhoto } from './multiView.js'
import { buildMockupProject } from '../generation/mockupProject.js'
let n = 0; const ok = (name) => console.log(`ok ${++n} - ${name}`)

const photo = (name, w = 900, h = 1100) => ({ url: `blob:${name}`, name, width: w, height: h })
const mask = (name, w, h) => ({ url: `blob:mask-${name}`, name, width: w, height: h })
const art = (name, w = 600, h = 300) => ({ url: `blob:${name}`, name, width: w, height: h })
const VIEWS = ['FRONT', 'THREE_QUARTER_FRONT', 'SIDE', 'BACK', 'THREE_QUARTER_BACK', 'DETAIL']
const SIZES = { FRONT: [900, 1100], THREE_QUARTER_FRONT: [1000, 1100], SIDE: [800, 1100], BACK: [900, 1100], THREE_QUARTER_BACK: [1000, 1100], DETAIL: [1200, 1200] }

// ---- setup: six views, each with its own photo + mask
let s = createInitialState()
for (const v of VIEWS) {
  s = R(s, { type: 'SET_VIEW', view: v })
  s = R(s, { type: 'SET_TSHIRT', asset: photo(v, ...SIZES[v]) })
  s = R(s, { type: 'SET_MASK', kind: 'tshirt', asset: mask(v, ...SIZES[v]) })
}
s = R(s, { type: 'SET_VIEW', view: 'FRONT' })
const layerIn = (view, groupId) => allArtworks(s.composition).find((a) => a.view === view && a.groupId === groupId)

// Artwork 1 (small chest logo) -> Front + 3/4 Front + Detail
s = R(s, { type: 'ADD_ARTWORK', asset: art('logo', 400, 400) })
const a1 = s.composition.selectedArtworkId; const g1 = findArtwork(s.composition, a1).groupId
s = R(s, { type: 'UPDATE_ARTWORK', id: a1, patch: { width: 12, height: 10, x: 40, y: 25 }, keepRatio: false })
for (const v of ['THREE_QUARTER_FRONT', 'DETAIL']) s = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id: a1, view: v })
// Artwork 2 (large back graphic) -> Back + 3/4 Back
s = R(s, { type: 'SET_VIEW', view: 'BACK' }); s = R(s, { type: 'SET_SURFACE', surface: 'back' })
s = R(s, { type: 'ADD_ARTWORK', asset: art('bigback', 800, 900) })
const a2 = s.composition.selectedArtworkId; const g2 = findArtwork(s.composition, a2).groupId
s = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id: a2, view: 'THREE_QUARTER_BACK' })
// Artwork 3 (sleeve graphic) -> Side + Detail
s = R(s, { type: 'SET_VIEW', view: 'SIDE' }); s = R(s, { type: 'SET_SURFACE', surface: 'leftSleeve' })
s = R(s, { type: 'ADD_ARTWORK', asset: art('sleeve', 300, 300) })
const a3 = s.composition.selectedArtworkId; const g3 = findArtwork(s.composition, a3).groupId
s = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id: a3, view: 'DETAIL' })

// ---- structure
assert.deepEqual(viewCounts(s.composition), { FRONT: 1, THREE_QUARTER_FRONT: 1, SIDE: 1, BACK: 1, THREE_QUARTER_BACK: 1, DETAIL: 2 })
assert.equal(new Set(allArtworks(s.composition).map((a) => a.id)).size, allArtworks(s.composition).length, 'unique ids')
assert.equal(new Set(s.sourceAssets.artworkSources.map((x) => x.id)).size, 3, 'three sources, never duplicated')
assert.ok(allArtworks(s.composition).every((a) => s.sourceAssets.artworkSources.some((x) => x.id === a.sourceId)))
assert.deepEqual(Object.keys(placementsOfArtwork(s.composition, layerIn('FRONT', g1))).sort(), ['DETAIL', 'FRONT', 'THREE_QUARTER_FRONT'])
ok('three artworks assigned to their views; placements share one source and one groupId, each has its own id')

// ---- view switching restores photos, masks and placements exactly
s = R(s, { type: 'SET_VIEW', view: 'BACK' })
assert.equal(s.sourceAssets.tshirt.name, 'BACK'); assert.equal(s.sourceAssets.tshirtMask.name, 'BACK'); assert.equal(s.generation.angle, 'BACK')
assert.deepEqual(layersForSurface(s, 'back').map((l) => l.id), [a2]); assert.deepEqual(layersForSurface(s, 'front'), [])
s = R(s, { type: 'SET_VIEW', view: 'FRONT' })
assert.equal(s.sourceAssets.tshirt.name, 'FRONT'); assert.equal(s.composition.selectedArtworkId, null)
assert.deepEqual(layersForSurface(s, 'front').map((l) => l.id), [a1]); assert.equal(Object.keys(s.sourceAssets.viewPhotos).length, 5)
assert.equal(R(s, { type: 'SET_VIEW', view: 'FRONT' }), s); assert.equal(R(s, { type: 'SET_VIEW', view: 'nope' }), s)
ok('switching views loads that view\'s own photo, mask and placements; switching back restores Front unchanged')

// ---- Test A: move artwork 1 on Front -> only Front changes
const snap = (view, g) => JSON.stringify(layerIn(view, g))
const before = { tq: snap('THREE_QUARTER_FRONT', g1), det: snap('DETAIL', g1), b: snap('BACK', g2), sl: snap('SIDE', g3) }
s = R(s, { type: 'UPDATE_ARTWORK', id: a1, patch: { x: 30, y: 33, rotation: 15 }, keepRatio: false })
assert.equal(layerIn('FRONT', g1).x, 30); assert.equal(snap('THREE_QUARTER_FRONT', g1), before.tq); assert.equal(snap('DETAIL', g1), before.det); assert.equal(snap('BACK', g2), before.b)
ok('Test A: moving artwork 1 on Front changes only the Front placement')

// ---- Test B / C: 3/4 Front has its own placement; moving it leaves Front alone
s = R(s, { type: 'SET_VIEW', view: 'THREE_QUARTER_FRONT' })
const tq = layersForSurface(s, 'front')[0]; assert.notEqual(tq.id, a1); assert.equal(tq.x, 40) // the copy made at assignment time
ok('Test B: 3/4 Front shows its own placement')
const frontBefore = snap('FRONT', g1)
s = R(s, { type: 'UPDATE_ARTWORK', id: tq.id, patch: { x: 55, y: 20, rotation: -8 }, keepRatio: false })
assert.equal(snap('FRONT', g1), frontBefore); assert.equal(layerIn('THREE_QUARTER_FRONT', g1).x, 55)
ok('Test C: moving artwork 1 on 3/4 Front leaves Front unchanged')

// ---- Test D: delete artwork 2 from Back -> only that placement goes; 3/4 Back, other artwork and the source remain
s = R(s, { type: 'SET_VIEW', view: 'BACK' }); const tqbBefore = snap('THREE_QUARTER_BACK', g2)
s = R(s, { type: 'DELETE_ARTWORK', id: a2 })
assert.equal(layerIn('BACK', g2), undefined); assert.equal(snap('THREE_QUARTER_BACK', g2), tqbBefore); assert.ok(layerIn('FRONT', g1) && layerIn('SIDE', g3))
assert.ok(s.sourceAssets.artworkSources.some((x) => x.id === layerIn('THREE_QUARTER_BACK', g2).sourceId), 'source kept while another view uses it')
ok('Test D: deleting from Back removes only the Back placement (other views, other artwork and the source stay)')
s = R(s, { type: 'SET_VIEW', view: 'THREE_QUARTER_BACK' }); s = R(s, { type: 'DELETE_ARTWORK', id: layerIn('THREE_QUARTER_BACK', g2).id })
assert.equal(s.sourceAssets.artworkSources.length, 2, 'the source is dropped only when no placement uses it (existing rule)')
ok('the source image goes away only after its last placement is deleted')
// restore artwork 2 for the remaining tests
s = R(s, { type: 'SET_VIEW', view: 'BACK' }); s = R(s, { type: 'SET_SURFACE', surface: 'back' }); s = R(s, { type: 'ADD_ARTWORK', asset: art('bigback', 800, 900) })
const a2b = s.composition.selectedArtworkId; const g2b = findArtwork(s.composition, a2b).groupId

// ---- Test E: reset Front -> only Front resets
s = R(s, { type: 'SET_VIEW', view: 'FRONT' })
const others = { tq: snap('THREE_QUARTER_FRONT', g1), det: snap('DETAIL', g1), bk: snap('BACK', g2b) }
const bgBefore = JSON.stringify(s.composition.background); const photoBefore = s.sourceAssets.tshirt
s = R(s, { type: 'RESET_ARTWORK', id: a1 })
assert.notEqual(layerIn('FRONT', g1).x, 30); assert.equal(snap('THREE_QUARTER_FRONT', g1), others.tq); assert.equal(snap('DETAIL', g1), others.det); assert.equal(snap('BACK', g2b), others.bk)
assert.equal(JSON.stringify(s.composition.background), bgBefore); assert.equal(s.sourceAssets.tshirt, photoBefore)
ok('Test E: Reset transform affects only that placement on the current view (other views, background and photo untouched)')

// ---- Test F: fabric integration on Back -> Front unchanged
s = R(s, { type: 'SET_VIEW', view: 'BACK' })
const frontSnap = snap('FRONT', g1)
s = R(s, { type: 'UPDATE_ARTWORK', id: a2b, patch: { realism: 90 } })
assert.equal(layerIn('BACK', g2b).realism, 90); assert.equal(snap('FRONT', g1), frontSnap); assert.equal(layerIn('FRONT', g1).realism, 50)
ok('Test F: changing fabric integration on Back leaves Front unchanged')

// ---- Test G: warp on Side -> others unchanged
s = R(s, { type: 'SET_VIEW', view: 'SIDE' }); s = R(s, { type: 'SET_SURFACE', surface: 'leftSleeve' })
const detSnap = snap('DETAIL', g3), fr = snap('FRONT', g1), bk = snap('BACK', g2b)
s = R(s, { type: 'UPDATE_ARTWORK', id: a3, patch: { warp: 80 } })
assert.equal(layerIn('SIDE', g3).warp, 80); assert.equal(snap('DETAIL', g3), detSnap); assert.equal(snap('FRONT', g1), fr); assert.equal(snap('BACK', g2b), bk); assert.equal(layerIn('DETAIL', g3).warp, 35)
ok('Test G: changing surface warp on Side leaves every other view unchanged')

// ---- independent visibility / lock
s = R(s, { type: 'SET_VIEW', view: 'FRONT' })
s = R(s, { type: 'TOGGLE_VISIBLE', id: a1 })
assert.equal(layerIn('FRONT', g1).visible, false); assert.equal(layerIn('THREE_QUARTER_FRONT', g1).visible, true); assert.equal(layerIn('DETAIL', g1).visible, true)
s = R(s, { type: 'TOGGLE_VISIBLE', id: a1 })
ok('visibility is per view')

// ---- copy placement: overwrites destination values, keeps destination id/visibility, stays independent afterwards
s = R(s, { type: 'UPDATE_ARTWORK', id: a1, patch: { x: 10, y: 12, rotation: 5, warp: 70, realism: 20, opacity: 0.8 }, keepRatio: false })
const destId = layerIn('THREE_QUARTER_FRONT', g1).id
s = R(s, { type: 'TOGGLE_LOCK', id: destId }); const locked = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id: a1, view: 'THREE_QUARTER_FRONT' }); assert.equal(locked, s, 'a locked destination is not overwritten')
s = R(s, { type: 'TOGGLE_LOCK', id: destId })
s = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id: a1, view: 'THREE_QUARTER_FRONT' })
const dest = layerIn('THREE_QUARTER_FRONT', g1)
assert.equal(dest.id, destId); assert.equal(dest.x, 10); assert.equal(dest.rotation, 5); assert.equal(dest.warp, 70); assert.equal(dest.realism, 20); assert.equal(dest.opacity, 0.8)
assert.ok(Math.abs(dest.height - layerIn('FRONT', g1).height * (1000 / 1100) / (900 / 1100)) < 0.02, 'height rescaled for the other photo aspect')
s = R(s, { type: 'SET_VIEW', view: 'THREE_QUARTER_FRONT' }); s = R(s, { type: 'UPDATE_ARTWORK', id: destId, patch: { x: 77 } })
assert.equal(layerIn('FRONT', g1).x, 10); assert.equal(R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id: destId, view: 'THREE_QUARTER_FRONT' }), s)
ok('Copy placement: position, scale, rotation, warp and fabric settings copied; destination stays independent afterwards')

// ---- per-view stacking; duplicate is a new artwork
s = R(s, { type: 'SET_VIEW', view: 'DETAIL' }); s = R(s, { type: 'SET_SURFACE', surface: 'front' })
const detFront = layersForSurface(s, 'front')[0]
s = R(s, { type: 'ADD_ARTWORK', asset: art('second', 300, 300) }); const second = s.composition.selectedArtworkId
s = R(s, { type: 'SET_VIEW', view: 'FRONT' }); s = R(s, { type: 'ADD_ARTWORK', asset: art('third', 300, 300) }); const third = s.composition.selectedArtworkId
s = R(s, { type: 'SET_VIEW', view: 'DETAIL' }); s = R(s, { type: 'SET_SURFACE', surface: 'front' })
s = R(s, { type: 'ORDER_ARTWORK', id: detFront.id, op: 'front' }); assert.deepEqual(layersForSurface(s, 'front').map((l) => l.id), [second, detFront.id])
assert.ok(findArtwork(s.composition, third)); assert.equal(layersForSurface(s, 'front').length, 2)
s = R(s, { type: 'DUPLICATE_ARTWORK', id: second }); const dup = findArtwork(s.composition, s.composition.selectedArtworkId)
assert.notEqual(dup.groupId, findArtwork(s.composition, second).groupId); assert.equal(dup.view, 'DETAIL')
ok('stacking order is per view; a duplicate is a new artwork (not another view of the same one)')

// ---- a view without a photo: empty state, nothing invented, no artwork can be added
s = R(createInitialState(), { type: 'SET_TSHIRT', asset: photo('only-front') })
s = R(s, { type: 'ADD_ARTWORK', asset: art('x') }); const only = s.composition.selectedArtworkId
s = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id: only, view: 'BACK' })
assert.equal(collectViewJobs(s).length, 1); assert.deepEqual(viewsWithoutPhoto(s), ['BACK'])
s = R(s, { type: 'SET_VIEW', view: 'BACK' }); assert.equal(s.sourceAssets.tshirt, null); assert.equal(s.sourceAssets.tshirtMask, null)
assert.equal(R(s, { type: 'ADD_ARTWORK', asset: art('y') }), s)
ok('a view with no photo shows the empty state; nothing is invented and it is reported as skipped')

// ---- photo edits are per view (mask / clear / reset only touch the active view)
let p = createInitialState()
for (const v of ['FRONT', 'BACK']) { p = R(p, { type: 'SET_VIEW', view: v }); p = R(p, { type: 'SET_TSHIRT', asset: photo(v) }); p = R(p, { type: 'SET_MASK', kind: 'tshirt', asset: mask(v, 900, 1100) }) }
p = R(p, { type: 'CLEAR_MASK', kind: 'tshirt' }); p = R(p, { type: 'SET_VIEW', view: 'FRONT' })
assert.equal(p.sourceAssets.tshirtMask.name, 'FRONT'); p = R(p, { type: 'RESET_TSHIRT' }); p = R(p, { type: 'SET_VIEW', view: 'BACK' }); assert.equal(p.sourceAssets.tshirt.name, 'BACK')
ok('photo, mask, clear and reset only affect the view being edited')

// ---- surfaces/regions/counts are scoped to the active view
let m = createInitialState(); m = R(m, { type: 'SET_TSHIRT', asset: photo('f') }); m = R(m, { type: 'ADD_ARTWORK', asset: art('a') })
const ma = m.composition.selectedArtworkId; m = R(m, { type: 'COPY_PLACEMENT_TO_VIEW', id: ma, view: 'BACK' })
assert.equal(surfaceCounts(m.composition).front, 1); assert.equal(buildMockupProject(m).artwork.FRONT.length, 1)
m = R(m, { type: 'SET_VIEW', view: 'SIDE' }); assert.equal(surfaceCounts(m.composition).front, 0); assert.equal(buildMockupProject(m).artwork.FRONT.length, 0)
ok('surface counts and the generation project describe the active view only')

// ---- serialisation + migration
const ser = serializeComposition(s); assert.ok(ser.surfaces.front.artworks.every((a) => a.view && a.groupId)); assert.equal(ser.activeView, 'BACK')
const legacy = R(createInitialState(), { type: 'LOAD_COMPOSITION', composition: { artworks: [{ id: 'old', surface: 'front', x: 1, y: 1, width: 5, height: 5, visible: true }] } })
assert.equal(legacy.composition.surfaces.front.artworks[0].view, 'FRONT'); assert.equal(legacy.composition.surfaces.front.artworks[0].groupId, 'old')
assert.equal(placementsInView(legacy.composition, 'FRONT').length, 1)
ok('older compositions migrate to view FRONT; serialisation carries view + groupId')

// ---- Test H: export jobs — each view renders with its OWN photo, masks and placements
let e = createInitialState()
for (const v of ['FRONT', 'BACK']) { e = R(e, { type: 'SET_VIEW', view: v }); e = R(e, { type: 'SET_TSHIRT', asset: photo(v) }); e = R(e, { type: 'SET_MASK', kind: 'tshirt', asset: mask(v, 900, 1100) }) }
e = R(e, { type: 'SET_VIEW', view: 'FRONT' }); e = R(e, { type: 'ADD_ARTWORK', asset: art('chest', 400, 400) }); const ec = e.composition.selectedArtworkId
e = R(e, { type: 'UPDATE_ARTWORK', id: ec, patch: { warp: 10, realism: 20 } })
e = R(e, { type: 'SET_VIEW', view: 'BACK' }); e = R(e, { type: 'SET_SURFACE', surface: 'back' }); e = R(e, { type: 'ADD_ARTWORK', asset: art('big', 800, 900) }); const eb = e.composition.selectedArtworkId
e = R(e, { type: 'UPDATE_ARTWORK', id: eb, patch: { warp: 90, realism: 70 } })
e = R(e, { type: 'SET_VIEW', view: 'FRONT' })
const jobs = collectViewJobs(e)
assert.deepEqual(jobs.map((j) => j.view), ['FRONT', 'BACK']); assert.deepEqual(jobs.map((j) => j.photoUrl), ['blob:FRONT', 'blob:BACK']); assert.deepEqual(jobs.map((j) => j.tshirtMaskUrl), ['blob:mask-FRONT', 'blob:mask-BACK'])
assert.deepEqual(jobs[0].layers.map((l) => [l.sourceUrl, l.warp, l.realism]), [['blob:chest', 10, 20]]); assert.deepEqual(jobs[1].layers.map((l) => [l.sourceUrl, l.warp, l.realism]), [['blob:big', 90, 70]])
const hidden = R(e, { type: 'TOGGLE_VISIBLE', id: ec }); assert.equal(collectViewJobs(hidden)[0].layers.length, 0)
const calls = []
const images = new Map(); const load = async (url) => { if (!images.has(url)) images.set(url, { url, width: 900, height: 1100 }); return images.get(url) }
const fakeEnv = { createCanvas: (w, h) => ({ width: w, height: h, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(900 * 1100 * 4).fill(255) }), createImageData: () => ({ data: new Uint8ClampedArray(900 * 1100 * 4) }), putImageData() {} }) }) }
const rendered = await renderViewJobs(jobs, { loadImage: load, env: fakeEnv, renderer: (input, target) => { calls.push({ photo: input.photo.url, mask: input.tshirtMask.url, artworks: input.artworks.map((a) => [a.image.url, a.placement.warp, a.placement.realism]) }); return { width: 900, height: 1100 } } })
assert.deepEqual(calls, [{ photo: 'blob:FRONT', mask: 'blob:mask-FRONT', artworks: [['blob:chest', 10, 20]] }, { photo: 'blob:BACK', mask: 'blob:mask-BACK', artworks: [['blob:big', 90, 70]] }])
assert.deepEqual(rendered.map((r) => r.view), ['FRONT', 'BACK'])
ok('Test H: every view renders with its own photo, mask, placements, warp and fabric settings (never the Front configuration)')

console.log(`\n${n} checks passed`)

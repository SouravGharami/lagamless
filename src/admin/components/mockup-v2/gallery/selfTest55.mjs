// Step 5-5 self-test (pure gallery logic). Run:  node selfTest55.mjs
import assert from 'node:assert/strict'
import {
  VIEW_ORDER, sortMockups, planInsertOrder, moveId, nextMainAfterRemoval, mockupImagePath, mockupSourcePath, isOwnedMockupPath,
  validateImageFile, validateDimensions, buildRenderConfig, configSourcePaths, resolveRenderJob, isRegenerable, viewSlug, viewLabel,
} from './galleryModel.js'

let n = 0; const ok = (name) => console.log(`ok ${++n} - ${name}`)
const m = (id, viewType, sortOrder = 0, isMain = false) => ({ id, viewType, sortOrder, isMain })

assert.deepEqual(VIEW_ORDER, ['FRONT', 'THREE_QUARTER_FRONT', 'SIDE', 'BACK', 'THREE_QUARTER_BACK', 'DETAIL'])
assert.deepEqual(sortMockups([m('b', 'BACK'), m('f', 'FRONT'), m('s', 'SIDE')]).map((x) => x.id), ['f', 's', 'b'])
assert.deepEqual(sortMockups([m('b', 'BACK', 0), m('f', 'FRONT', 1)]).map((x) => x.id), ['b', 'f'], 'stored sort_order wins')
ok('view order is fixed (Front, 3/4 Front, Side, Back, 3/4 Back, Detail); sort_order overrides; no timestamps involved')

const existing = [m('f', 'FRONT', 0), m('b', 'BACK', 1)]
assert.deepEqual(planInsertOrder(existing, m('s', 'SIDE')), ['f', 's', 'b'])
assert.deepEqual(planInsertOrder(existing, m('d', 'DETAIL')), ['f', 'b', 'd'])
assert.deepEqual(planInsertOrder([], m('f', 'FRONT')), ['f'])
ok('a new mockup lands in view order relative to existing ones')

assert.deepEqual(moveId(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b'])
assert.equal(moveId(['a', 'b', 'c'], 'a', -1), null)
assert.equal(moveId(['a', 'b'], 'zz', 1), null)
ok('move: swaps, clamps, ignores unknown ids')

const list = [m('f', 'FRONT', 0, false), m('b', 'BACK', 1, true), m('s', 'SIDE', 2)]
assert.equal(nextMainAfterRemoval(list, 'b'), 'f')
assert.equal(nextMainAfterRemoval(list, 's'), null, 'removing a non-main mockup never changes main')
assert.equal(nextMainAfterRemoval([m('b', 'BACK', 0, true)], 'b'), null, 'last mockup: nothing to promote')
ok('removing MAIN promotes the next mockup in gallery order; non-main removal leaves main alone')

assert.equal(mockupImagePath('p1', 'THREE_QUARTER_BACK', 'png', 5), 'mockups/p1/3-4-back/5.png')
assert.equal(mockupSourcePath('p1', 'abc', 'jpg'), 'mockups/p1/sources/abc.jpg')
assert.ok(isOwnedMockupPath('p1', 'mockups/p1/front/1.png'))
assert.ok(!isOwnedMockupPath('p1', 'mockups/p2/front/1.png'), 'another product\'s file is never deletable')
assert.ok(!isOwnedMockupPath('p1', 'p1/main-1.jpg'), 'regular product images are never deletable by the gallery')
assert.ok(!isOwnedMockupPath('p1', 'mockups/p1/../p2/x.png'))
assert.ok(!isOwnedMockupPath('p1', 'mockup-templates/x.png'), 'template photos are never deletable by the gallery')
ok('storage paths: per product + per view; deletion guard limits the gallery to its own folder')

assert.ok(validateImageFile({ type: 'image/png', size: 100 }) === null)
assert.match(validateImageFile({ type: 'image/gif', size: 100 }), /PNG, JPEG or WebP/)
assert.match(validateImageFile({ type: 'image/png', size: 0 }), /empty/)
assert.match(validateImageFile({ type: 'image/png', size: 61 * 1048576 }), /limit/)
assert.ok(validateImageFile({ type: 'image/png', size: 30 * 1048576 }) === null, 'large high-quality renders are accepted')
assert.ok(validateDimensions(4000, 5000) === null)
assert.match(validateDimensions(100, 5000), /at least/)
assert.match(validateDimensions(0, 0), /corrupted/)
ok('upload validation: type, empty, size limit, decoded dimensions')

const job = {
  view: 'BACK', label: 'Back', photoUrl: 'blob:photo', photo: { width: 4000, height: 5000 }, tshirtMaskUrl: 'blob:mask', designMaskUrl: null,
  layers: [{ id: 'l1', name: 'Logo', sourceUrl: 'blob:art', x: 10, y: 12, width: 30, height: 20, rotation: 5, scale: 1.1, opacity: 0.9, realism: 60, warp: 40, visible: true }],
}
const map = { 'blob:photo': 'mockups/p/sources/a.png', 'blob:mask': 'mockups/p/sources/b.png', 'blob:art': 'mockups/p/sources/c.png' }
const cfg = buildRenderConfig(job, (u) => map[u])
assert.deepEqual(cfg.layers[0], { name: 'Logo', x: 10, y: 12, width: 30, height: 20, rotation: 5, scale: 1.1, opacity: 0.9, realism: 60, warp: 40, sourcePath: 'mockups/p/sources/c.png' })
assert.ok(!JSON.stringify(cfg).includes('blob:'), 'no session-only blob URLs are stored')
assert.deepEqual(configSourcePaths(cfg).sort(), ['mockups/p/sources/a.png', 'mockups/p/sources/b.png', 'mockups/p/sources/c.png'])
assert.throws(() => buildRenderConfig(job, () => null), /not stored/)
const back = resolveRenderJob(cfg, (p) => `https://cdn/${p}`)
assert.equal(back.view, 'BACK'); assert.equal(back.photoUrl, 'https://cdn/mockups/p/sources/a.png'); assert.equal(back.designMaskUrl, null)
assert.deepEqual(back.layers[0], { name: 'Logo', x: 10, y: 12, width: 30, height: 20, rotation: 5, scale: 1.1, opacity: 0.9, realism: 60, warp: 40, sourceUrl: 'https://cdn/mockups/p/sources/c.png', visible: true, locked: false })
assert.ok(isRegenerable({ renderConfig: cfg }) && !isRegenerable({ renderConfig: null }) && !isRegenerable({}))
ok('render config round-trips: studio job -> stored paths -> renderable job with identical transform / realism / warp values')

assert.equal(viewSlug('THREE_QUARTER_FRONT'), '3-4-front'); assert.equal(viewLabel('DETAIL'), 'Detail / Sleeve')
ok('labels and slugs')

// ---- optional canvas check (needs @napi-rs/canvas: CANVAS_FROM=<dir>/package.json). Proves Regenerate == the original render.
if (process.env.CANVAS_FROM) {
  const { createRequire } = await import('node:module')
  const { createCanvas } = createRequire(process.env.CANVAS_FROM)('@napi-rs/canvas')
  const { renderFinalView } = await import('../compositing/finalRender.js')
  const env = { createCanvas: (w, h) => createCanvas(w, h) }
  const paint = (w, h, fn) => { const c = createCanvas(w, h); fn(c.getContext('2d')); return c }
  const images = {
    'blob:photo': paint(400, 500, (g) => { const grad = g.createLinearGradient(0, 0, 400, 500); grad.addColorStop(0, '#ddd'); grad.addColorStop(1, '#888'); g.fillStyle = grad; g.fillRect(0, 0, 400, 500) }),
    'blob:mask': paint(400, 500, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 400, 500) }),
    'blob:art': paint(100, 100, (g) => { g.fillStyle = '#c00'; g.fillRect(0, 0, 100, 100); g.fillStyle = '#fff'; g.fillRect(20, 20, 60, 60) }),
  }
  const original = { view: 'FRONT', label: 'Front', photoUrl: 'blob:photo', photo: { width: 400, height: 500 }, tshirtMaskUrl: 'blob:mask', designMaskUrl: null,
    layers: [{ id: 'l', name: 'Logo', sourceUrl: 'blob:art', x: 30, y: 25, width: 40, height: 32, rotation: 8, scale: 1, opacity: 1, realism: 60, warp: 50, visible: true, locked: false }] }
  const stored = new Map([['blob:photo', 'mockups/p/sources/photo.png'], ['blob:art', 'mockups/p/sources/art.png'], ['blob:mask', 'mockups/p/sources/mask.png']])
  const config = JSON.parse(JSON.stringify(buildRenderConfig(original, (u) => stored.get(u))))
  const byPath = { 'mockups/p/sources/photo.png': images['blob:photo'], 'mockups/p/sources/art.png': images['blob:art'], 'mockups/p/sources/mask.png': images['blob:mask'] }
  const a = await renderFinalView(original, { loadImage: async (u) => images[u], env, encode: async (c) => c.toBuffer('image/png') })
  const b = await renderFinalView(resolveRenderJob(config, (p) => p), { loadImage: async (u) => byPath[u], env, encode: async (c) => c.toBuffer('image/png') })
  assert.equal(a.width, b.width); assert.equal(a.height, b.height)
  assert.ok(Buffer.compare(a.blob, b.blob) === 0, 'regenerated pixels are identical to the original render')
  ok('regenerate: a job rebuilt from the stored config renders byte-identical to the original studio job (same renderer)')
}

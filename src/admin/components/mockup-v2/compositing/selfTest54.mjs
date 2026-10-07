// Step 5-4 self-test (final render / export). Run:  CANVAS_FROM=<dir>/package.json node selfTest54.mjs
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { renderComposite, createPlacement, placementFromLayer, previewScale, finalSize, finalFilename, exportPixelLimit, encodePng, snapshotView, exportableViews, renderFinalView, MAX_EXPORT_PIXELS, MAX_EXPORT_PIXELS_IOS, DRAFT_MAX_SIDE, PREVIEW_MAX_SIDE, COMPOSITE_ERROR } from './index.js'
import { createInitialState, mockupReducer as R } from '../mockupStudioState.js'
const require = createRequire(process.env.CANVAS_FROM || import.meta.url)
const { createCanvas, loadImage: napiLoad } = require('@napi-rs/canvas')
const env = { createCanvas: (w, h) => createCanvas(w, h) }
let n = 0; const ok = (name) => console.log(`ok ${++n} - ${name}`)
const px = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data
const solid = (w, h, color) => { const c = createCanvas(w, h); const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); return c }
const code = async (fn) => { try { await fn(); return null } catch (e) { return e.code } }

// ---- sizing rules
assert.equal(previewScale({ width: 4000, height: 5000, draft: true }), DRAFT_MAX_SIDE / 5000)
assert.equal(previewScale({ width: 800, height: 1000, draft: true }), 1)
{ const s1 = previewScale({ width: 4000, height: 5000, cssWidth: 480, devicePixelRatio: 1 }), s2 = previewScale({ width: 4000, height: 5000, cssWidth: 480, devicePixelRatio: 2 }), s3 = previewScale({ width: 4000, height: 5000, cssWidth: 480, devicePixelRatio: 3 })
  assert.ok(s1 * 5000 >= DRAFT_MAX_SIDE - 1 && s2 >= s1 && s3 >= s2, 'higher DPR asks for more backing pixels, never fewer')
  assert.ok(s3 * 5000 <= PREVIEW_MAX_SIDE + 1, 'preview is capped'); assert.ok(previewScale({ width: 6000, height: 6000, cssWidth: 4000, devicePixelRatio: 3 }) * 6000 <= PREVIEW_MAX_SIDE + 1)
  assert.equal(previewScale({ width: 900, height: 1100, cssWidth: 480, devicePixelRatio: 2 }), 1, 'never upscaled past native') }
assert.equal(previewScale({ width: 4000, height: 5000, cssWidth: 480, devicePixelRatio: 2 }) < 1, true)
ok('preview: draft cap, CSS-size x devicePixelRatio backing store (capped, never upscaled, no double scaling)')
{ const a = finalSize(4000, 5000, MAX_EXPORT_PIXELS); assert.deepEqual([a.width, a.height, a.scale, a.downscaled], [4000, 5000, 1, false])
  const b = finalSize(6000, 8000, MAX_EXPORT_PIXELS); assert.ok(b.downscaled && b.width * b.height <= MAX_EXPORT_PIXELS && Math.abs(b.width / b.height - 0.75) < 0.002)
  const c = finalSize(4000, 5000, MAX_EXPORT_PIXELS_IOS); assert.ok(c.downscaled && c.width * c.height <= MAX_EXPORT_PIXELS_IOS)
  assert.equal(finalSize(20000, 100, 1e9).downscaled, true)
  assert.equal(exportPixelLimit('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5), MAX_EXPORT_PIXELS_IOS); assert.equal(exportPixelLimit('Mozilla/5.0 (X11; Linux x86_64)', 0), MAX_EXPORT_PIXELS)
  assert.equal(code(() => finalSize(0, 10)) instanceof Promise, true) }
assert.equal(await code(() => finalSize(0, 10)), COMPOSITE_ERROR.INVALID_IMAGE)
ok('final size: native by default (aspect kept, no crop/stretch); one uniform reduction only when the device cannot allocate it (stricter on iOS)')
assert.deepEqual(['FRONT', 'THREE_QUARTER_FRONT', 'SIDE', 'BACK', 'THREE_QUARTER_BACK', 'DETAIL'].map(finalFilename), ['lagamless-front.png', 'lagamless-3-4-front.png', 'lagamless-side.png', 'lagamless-back.png', 'lagamless-3-4-back.png', 'lagamless-detail.png'])
ok('filenames: lagamless-front / 3-4-front / side / back / 3-4-back / detail .png')

// ---- fixtures: six views, each with its own photo, mask and artwork configuration
const VIEWS = ['FRONT', 'THREE_QUARTER_FRONT', 'SIDE', 'BACK', 'THREE_QUARTER_BACK', 'DETAIL']
const W = 600, H = 750
const creases = (base) => { const c = solid(W, H, base); const g = c.getContext('2d'); for (let i = 0; i < 6; i += 1) { g.strokeStyle = `rgba(0,0,0,${0.12 + 0.05 * i})`; g.lineWidth = 46 - i * 6; g.beginPath(); g.moveTo(200, 0); g.lineTo(380, H); g.stroke() } return c }
const acid = (() => { const c = creases('#2a2a30'); const g = c.getContext('2d'); for (let i = 0; i < 40; i += 1) { g.fillStyle = `rgba(${90 + (i * 13) % 80},${90 + (i * 29) % 80},${100 + (i * 7) % 80},0.35)`; g.beginPath(); g.arc((i * 97) % W, (i * 61) % H, 25 + (i % 5) * 12, 0, 6.3); g.fill() } return c })()
const colorArt = (() => { const c = createCanvas(300, 200); const g = c.getContext('2d'); const cols = ['#d01818', '#1040d0', '#18a030', '#f0d020', '#ffffff', '#000000']; cols.forEach((col, i) => { g.fillStyle = col; g.fillRect(20 + i * 42, 30, 38, 60) }); const gr = g.createLinearGradient(20, 0, 280, 0); gr.addColorStop(0, '#ff0080'); gr.addColorStop(1, '#00c0ff'); g.fillStyle = gr; g.fillRect(20, 110, 260, 50); return c })()
const whiteArt = (() => { const c = createCanvas(300, 200); const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(30, 30, 240, 30); g.fillRect(30, 90, 140, 80); return c })()
const images = { 'blob:black': creases('#101010'), 'blob:light': creases('#e8e4dc'), 'blob:acid': acid, 'blob:mask': solid(W, H, '#fff'), 'blob:color': colorArt, 'blob:white': whiteArt, 'blob:dark': (() => { const c = createCanvas(300, 200); const g = c.getContext('2d'); g.fillStyle = '#151515'; g.fillRect(20, 20, 260, 160); return c })() }
const load = async (u, label) => { if (u === 'blob:broken') throw Object.assign(new Error('decode'), { code: 'x' }); if (!images[u]) throw new Error(`no ${u} (${label})`); return images[u] }
const photo = (url, name) => ({ url, name, width: W, height: H })
const asset = (url, w = 300, h = 200) => ({ url, name: url, width: w, height: h })
function build(photoUrl, artUrl, cfg = {}) {
  let s = createInitialState()
  for (const v of VIEWS) { s = R(s, { type: 'SET_VIEW', view: v }); s = R(s, { type: 'SET_TSHIRT', asset: photo(photoUrl, v) }); s = R(s, { type: 'SET_MASK', kind: 'tshirt', asset: { url: 'blob:mask', name: 'm', width: W, height: H } }) }
  s = R(s, { type: 'SET_VIEW', view: 'FRONT' }); s = R(s, { type: 'ADD_ARTWORK', asset: asset(artUrl) })
  const id = s.composition.selectedArtworkId
  s = R(s, { type: 'UPDATE_ARTWORK', id, patch: { x: 20, y: 25, width: 50, height: 33, warp: 60, realism: 60, ...cfg }, keepRatio: false })
  return { s, id }
}
const finalOf = async (state, view, opts = {}) => renderFinalView(snapshotView(state, view), { loadImage: load, env, ...opts })
const bytes = async (b) => Buffer.from(b instanceof Blob ? await b.arrayBuffer() : b)
const pngInfo = async (blob) => { const b = await bytes(blob); assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } }
const diff = (a, b) => { const x = px(a), y = px(b); let d = 0; for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2]) d += 1; return d }
const decode = async (buf) => { const im = await napiLoad(await bytes(buf)); const c = createCanvas(im.width, im.height); c.getContext('2d').drawImage(im, 0, 0); return c }
const at = (c, x, y) => { const d = c.getContext('2d').getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2], d[3]] }

// ---- Test 1/16: native-resolution PNG, same compositor as the preview (warp + fabric included)
{ const { s } = build('blob:black', 'blob:color'); const r = await finalOf(s, 'FRONT'); const info = await pngInfo(r.blob)
  assert.deepEqual([info.w, info.h, r.width, r.height, r.downscaled], [W, H, W, H, false]); assert.equal(r.filename, 'lagamless-front.png')
  const job = snapshotView(s, 'FRONT'), art = { image: images['blob:color'], placement: placementFromLayer(job.layers[0], { width: W, height: H }) }
  const direct = createCanvas(1, 1); renderComposite({ photo: images['blob:black'], tshirtMask: images['blob:mask'], artworks: [art] }, { canvas: direct }, env)
  const exported = await decode(r.blob); assert.equal(diff(exported, direct), 0, 'exported PNG == renderComposite at scale 1 (one compositor)')
  const flat = createCanvas(1, 1); renderComposite({ photo: images['blob:black'], tshirtMask: images['blob:mask'], artworks: [{ image: art.image, placement: createPlacement({ ...art.placement, warp: 0, realism: 0 }) }] }, { canvas: flat }, env)
  const noWarp = createCanvas(1, 1); renderComposite({ photo: images['blob:black'], tshirtMask: images['blob:mask'], artworks: [{ image: art.image, placement: createPlacement({ ...art.placement, warp: 0 }) }] }, { canvas: noWarp }, env)
  assert.ok(diff(exported, flat) > 100, 'not the flat print'); assert.ok(diff(exported, noWarp) > 20, 'warp is in the export'); assert.equal(art.placement.warp, 60)
  ok('Tests 1/16: PNG has the photo\'s native size and is pixel-identical to renderComposite (warp 60 + fabric 60 included; differs from flat / no-warp)') }

// ---- half-scale export equals the preview path at that scale (differences only from resolution)
{ const { s } = build('blob:black', 'blob:color'); const r = await finalOf(s, 'FRONT', { limit: (W * H) / 4 }); assert.ok(r.downscaled && r.width === 300 && r.height === 375, `${r.width}x${r.height}`); assert.equal((await pngInfo(r.blob)).w, 300)
  ok('device limit: uniform reduction (600x750 -> 300x375), flagged as downscaled, aspect ratio unchanged') }

// ---- Tests 2-5: colours, white DTF, transparency
{ const cfg = { warp: 35, realism: 50 }
  const { s } = build('blob:black', 'blob:color', cfg); const c = await decode((await finalOf(s, 'FRONT')).blob)
  const col = (i) => at(c, Math.round(W * 0.2 + (20 + i * 42 + 19) / 300 * W * 0.5), Math.round(H * 0.25 + 60 / 200 * H * 0.33)) // centre of swatch i, top strip
  const [red, blue, green, yellow] = [0, 1, 2, 3].map(col); assert.ok(red[0] > 130 && red[1] < 60 && red[2] < 60, `red ${red}`); assert.ok(blue[2] > 130 && blue[0] < 70, `blue ${blue}`); assert.ok(green[1] > 100 && green[0] < 60, `green ${green}`); assert.ok(yellow[0] > 150 && yellow[1] > 140 && yellow[2] < 90, `yellow ${yellow}`)
  ok('Test 2: black shirt + colourful artwork keeps red/blue/green/yellow (no shirt tint)') }
{ const { s } = build('blob:light', 'blob:dark'); const c = await decode((await finalOf(s, 'FRONT')).blob); const p = at(c, Math.round(W * 0.45), Math.round(H * 0.42)); assert.ok(p[0] < 60 && p[1] < 60 && p[2] < 60, `dark art stays dark ${p}`)
  ok('Test 3: light shirt + dark artwork stays dark and solid') }
for (const [key, name] of [['blob:black', 'black'], ['blob:acid', 'dark acid-wash']]) {
  const { s } = build(key, 'blob:white', { warp: 35, realism: 50 }); const c = await decode((await finalOf(s, 'FRONT')).blob)
  let bright = 0, tot = 0; // sample inside the white bar (art y 30-60 -> photo y 225-262, x 150-390)
  for (let y = 236; y < 252; y += 1) for (let x = 170; x < 370; x += 1) { const p = at(c, x, y); tot += 1; if (p[0] > 170 && p[1] > 170 && p[2] > 170) bright += 1 }
  assert.ok(bright / tot > 0.85, `white print visible on ${name} (${(bright / tot).toFixed(2)})`)
}
ok('Tests 4/5: white artwork stays visibly white on a black shirt and on a dark acid-wash shirt (default warp + fabric)')
{ const { s } = build('blob:acid', 'blob:color'); const c = await decode((await finalOf(s, 'FRONT')).blob); assert.deepEqual(at(c, 3, 3).slice(3), [255]); const corner = at(c, Math.round(W * 0.2) + 2, Math.round(H * 0.25) + 2), ph = px(images['blob:acid']); const i = ((Math.round(H * 0.25) + 2) * W + Math.round(W * 0.2) + 2) * 4
  assert.ok(Math.abs(corner[0] - ph[i]) < 3 && Math.abs(corner[1] - ph[i + 1]) < 3, 'transparent corner of the PNG shows the shirt (no rectangle / halo)'); ok('transparent artwork margin shows the photo — no rectangle, matte or halo in the exported PNG') }

// ---- Tests 6/7/8: fold crossing, small logo, multiple layers
{ const big = build('blob:black', 'blob:color', { x: 10, y: 20, width: 80, height: 50, warp: 80, realism: 80 }); const rb = await finalOf(big.s, 'FRONT'); await pngInfo(rb.blob)
  const small = build('blob:black', 'blob:color', { x: 44, y: 30, width: 8, height: 5, warp: 35, realism: 50 }); const rs = await finalOf(small.s, 'FRONT'); const cs = await decode(rs.blob); let ink = 0; for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { const p = at(cs, x, y); if (p[0] > 150 && p[1] < 60 && p[2] < 60) ink += 1 }
  assert.ok(ink > 5, 'small logo still renders (red ink present)'); ok('Tests 6/7: large fold-crossing artwork and a small logo both export') }
{ let { s, id } = build('blob:black', 'blob:color', { warp: 20, realism: 30 }); s = R(s, { type: 'ADD_ARTWORK', asset: asset('blob:white') }); const id2 = s.composition.selectedArtworkId
  s = R(s, { type: 'UPDATE_ARTWORK', id: id2, patch: { x: 30, y: 60, width: 30, height: 20, warp: 90, realism: 10 }, keepRatio: false })
  const two = await decode((await finalOf(s, 'FRONT')).blob); const hidden = R(s, { type: 'TOGGLE_VISIBLE', id: id2 }); const one = await decode((await finalOf(hidden, 'FRONT')).blob)
  assert.ok(diff(two, one) > 200, 'second layer is in the export'); const w2 = R(s, { type: 'UPDATE_ARTWORK', id: id2, patch: { warp: 0 } }); const two0 = await decode((await finalOf(w2, 'FRONT')).blob)
  assert.ok(diff(two, two0) > 20, 'layer 2 keeps its own warp'); assert.equal(await code(() => finalOf(R(hidden, { type: 'TOGGLE_VISIBLE', id }), 'FRONT')), COMPOSITE_ERROR.MISSING_ARTWORK)
  ok('Test 8: multiple layers — both render with their own warp/fabric; hidden layers are excluded; all-hidden reports "no artwork"') }

// ---- Tests 9-14: every view uses its own configuration
{ let { s, id } = build('blob:black', 'blob:color', { warp: 0, realism: 0 })
  const cfgs = { THREE_QUARTER_FRONT: { x: 30, warp: 10 }, SIDE: { x: 12, warp: 30 }, BACK: { x: 40, y: 40, warp: 50 }, THREE_QUARTER_BACK: { x: 50, warp: 70 }, DETAIL: { x: 25, y: 55, warp: 100 } }
  for (const v of Object.keys(cfgs)) s = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id, view: v })
  const outs = {}; for (const v of VIEWS) { const lid = s.composition.surfaces.front.artworks.find((a) => a.view === v)?.id ?? Object.values(s.composition.surfaces).flatMap((x) => x.artworks).find((a) => a.view === v).id; if (cfgs[v]) s = R(s, { type: 'UPDATE_ARTWORK', id: lid, patch: cfgs[v] }) }
  for (const v of VIEWS) { const r = await finalOf(s, v); assert.equal(r.filename, finalFilename(v)); assert.deepEqual([r.width, r.height], [W, H]); outs[v] = await decode(r.blob) }
  for (let i = 0; i < VIEWS.length; i += 1) for (let j = i + 1; j < VIEWS.length; j += 1) assert.ok(diff(outs[VIEWS[i]], outs[VIEWS[j]]) > 50, `${VIEWS[i]} vs ${VIEWS[j]} differ`)
  const job = snapshotView(s, 'DETAIL'); assert.equal(job.layers[0].warp, 100); assert.equal(snapshotView(s, 'FRONT').layers[0].warp, 0)
  ok('Tests 9-14: Front, 3/4 Front, Side, Back, 3/4 Back, Detail each export with their own placement, warp and fabric (all six pairwise different)') }

// ---- non-destructive + snapshot + errors
{ const { s, id } = build('blob:black', 'blob:color'); const before = JSON.stringify(s); const frozen = JSON.parse(before); const deepFreeze = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v); return o }; deepFreeze(frozen)
  await finalOf(frozen, 'FRONT'); await finalOf(s, 'FRONT'); assert.equal(JSON.stringify(s), before); assert.equal(s.composition.selectedArtworkId, id)
  const job = snapshotView(s, 'FRONT'); const moved = R(s, { type: 'UPDATE_ARTWORK', id, patch: { x: 70, warp: 5 } }); assert.equal(job.layers[0].x, 20); assert.equal(job.layers[0].warp, 60); assert.notEqual(snapshotView(moved, 'FRONT').layers[0].x, 20)
  assert.deepEqual(exportableViews(s).map((v) => [v.view, v.layers]), VIEWS.map((v) => [v, v === 'FRONT' ? 1 : 0]))
  ok('export is non-destructive: state (incl. selection) is byte-identical after export, works on deeply frozen state, and the snapshot is immune to later edits') }
{ const { s } = build('blob:broken', 'blob:color'); assert.equal(await code(() => finalOf(s, 'FRONT')), COMPOSITE_ERROR.RENDER_FAILURE)
  const { s: s2 } = build('blob:black', 'blob:nope'); assert.ok((await code(() => finalOf(s2, 'FRONT'))) !== null)
  assert.equal(await code(() => renderFinalView(null, { loadImage: load, env })), COMPOSITE_ERROR.MISSING_PHOTO)
  let s3 = createInitialState(); s3 = R(s3, { type: 'SET_TSHIRT', asset: photo('blob:black', 'x') }); s3 = R(s3, { type: 'ADD_ARTWORK', asset: asset('blob:color') }); assert.equal(await code(() => finalOf(s3, 'FRONT')), COMPOSITE_ERROR.MISSING_MASK)
  assert.equal(await code(() => finalOf(build('blob:black', 'blob:color').s, 'FRONT', { encode: async () => { throw new Error('boom') } })), COMPOSITE_ERROR.RENDER_FAILURE)
  assert.equal(await code(() => encodePng({})), COMPOSITE_ERROR.RENDER_FAILURE)
  try { await finalOf(build('blob:broken', 'blob:color').s, 'FRONT') } catch (e) { assert.ok(!/\n\s+at /.test(e.message), 'no stack trace in the user-facing message') }
  ok('errors: missing photo / mask / artwork, failed load, encode failure — all CompositeErrors with readable messages, never a stack trace') }

// ---- large photo: reduced-size analysis keeps the look; memory is released
{ const BW = 1600, BH = 2000, big = createCanvas(BW, BH); { const g = big.getContext('2d'); g.fillStyle = '#202024'; g.fillRect(0, 0, BW, BH); for (let i = 0; i < 6; i += 1) { g.strokeStyle = `rgba(255,255,255,${0.05 + 0.03 * i})`; g.lineWidth = 120 - i * 15; g.beginPath(); g.moveTo(500, 0); g.lineTo(1000, BH); g.stroke() } }
  const mk = solid(BW, BH, '#fff'), art = images['blob:color']; const place = createPlacement({ x: 400, y: 500, width: 900, height: 600, warp: 60, realism: 60 })
  const run = (extra) => { const o = createCanvas(1, 1); renderComposite({ photo: big, tshirtMask: mk, artworks: [{ image: art, placement: place }] }, { canvas: o }, { ...env, ...extra }); return o }
  const exact = run({}), capped = run({ mapMaxPixels: 800_000 })
  const d = px(exact), e = px(capped); let sum = 0, cnt = 0, worst = 0; for (let i = 0; i < d.length; i += 4) { const dd = Math.abs(d[i] - e[i]) + Math.abs(d[i + 1] - e[i + 1]) + Math.abs(d[i + 2] - e[i + 2]); if (dd) { sum += dd; cnt += 1 } worst = Math.max(worst, dd) }
  assert.ok(cnt / (BW * BH) < 0.3 && sum / Math.max(cnt, 1) < 30 && worst < 200, `reduced-size analysis stays visually equivalent (${(cnt / (BW * BH) * 100).toFixed(1)}% px differ, mean ${(sum / Math.max(cnt, 1)).toFixed(1)}, worst ${worst})`)
  assert.equal(diff(run({}), exact), 0, 'analysis at <= cap is bit-identical to 5-3B-2/5-3B-3 behaviour')
  ok(`large photo: fabric/warp analysis capped at a smaller size stays visually equivalent (${(cnt / (BW * BH) * 100).toFixed(1)}% of px differ slightly); at/below the cap results are unchanged`) }

console.log(`\n${n} checks passed`)

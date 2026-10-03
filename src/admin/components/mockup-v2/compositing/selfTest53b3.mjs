// Step 5-3B-3 self-test (surface warp reaches the real renderer). Run:
//   CANVAS_FROM=<dir>/package.json node selfTest53b3.mjs      (needs @napi-rs/canvas; same as the other renderer self-tests)
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { renderComposite, createPlacement, placementFromLayer, applyWarp, warpPadding, maxShiftPx, DEFAULT_WARP, buildFabricMap } from './index.js'
import { createInitialState, mockupReducer as R } from '../mockupStudioState.js'
import { collectViewJobs, renderViewJobs } from './multiView.js'
const require = createRequire(process.env.CANVAS_FROM || import.meta.url)
const { createCanvas } = require('@napi-rs/canvas')
const env = { createCanvas: (w, h) => createCanvas(w, h) }
let n = 0; const ok = (name) => console.log(`ok ${++n} - ${name}`)

const W = 400, H = 500
const px = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data
const solid = (w, h, color) => { const c = createCanvas(w, h); const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); return c }
// Shirt with a soft dark diagonal crease (folds => a fold-band gradient across the print), or flat when creased=false.
const shirt = (creased) => {
  const c = solid(W, H, '#8a8a8a'); if (!creased) return c
  const g = c.getContext('2d')
  for (let i = 0; i < 6; i += 1) { g.strokeStyle = `rgba(0,0,0,${0.12 + 0.05 * i})`; g.lineWidth = 34 - i * 5; g.beginPath(); g.moveTo(140, 0); g.lineTo(260, H); g.stroke() }
  return c
}
const mask = solid(W, H, '#fff')
// Artwork: opaque red square with a white bar and a fully TRANSPARENT 20 px margin all round.
const ART = 240
const art = (() => { const c = createCanvas(ART, ART); const g = c.getContext('2d'); g.fillStyle = '#d01818'; g.fillRect(20, 20, ART - 40, ART - 40); g.fillStyle = '#fff'; g.fillRect(30, 100, ART - 60, 22); g.fillStyle = '#1040d0'; g.fillRect(100, 30, 18, ART - 60); return c })()
const place = (o = {}) => createPlacement({ x: 80, y: 120, width: ART, height: ART, ...o })
const render = (photo, artworks, extra = {}) => { const out = createCanvas(1, 1); renderComposite({ photo, tshirtMask: mask, artworks, ...extra }, { canvas: out }, env); return out }
const diff = (a, b) => { const x = px(a), y = px(b); let d = 0; for (let i = 0; i < x.length; i += 4) if (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2] || x[i + 3] !== y[i + 3]) d += 1; return d }
const opaque = (c, x0, y0, x1, y1) => { const d = px(c); let n2 = 0; for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const i = (y * c.width + x) * 4; if (Math.abs(d[i] - 0x8a) + Math.abs(d[i + 1] - 0x8a) + Math.abs(d[i + 2] - 0x8a) > 60) n2 += 1 } return n2 }

const creased = shirt(true), flat = shirt(false)
const wr = (warp, o = {}, photo = creased) => render(photo, [{ image: art, placement: place({ warp, ...o }) }])

// ---- pure module
{ const map = buildFabricMap(px(creased), W, H, null)
  const d = new Uint8ClampedArray(60 * 60 * 4).fill(255); assert.equal(applyWarp(d, 60, 60, 0, 0, map, 0, 60), false); assert.ok(d.every((v) => v === 255))
  assert.equal(warpPadding(100, 0), 0); assert.ok(warpPadding(100, 100) > warpPadding(100, 30)); assert.ok(maxShiftPx(100, 100) <= 0.05 * 100 + 1e-9); assert.equal(DEFAULT_WARP, 35)
  assert.equal(createPlacement({}).warp, 0); assert.equal(createPlacement({ warp: 999 }).warp, 100); assert.equal(placementFromLayer({ x: 1, y: 1, width: 2, height: 2, rotation: 0, opacity: 1 }, { width: 100, height: 100 }).warp, DEFAULT_WARP); assert.equal(placementFromLayer({ x: 1, y: 1, width: 2, height: 2, rotation: 0, opacity: 1, warp: 80 }, { width: 100, height: 100 }).warp, 80)
  ok('surfaceWarp module: strength 0 is a no-op; padding/cap scale with strength; placement carries warp (layer default 35, plain placement 0)') }

// ---- A: warp 0 is the plain composite
const plain = render(creased, [{ image: art, placement: createPlacement({ x: 80, y: 120, width: ART, height: ART }) }])
assert.equal(diff(wr(0), plain), 0); ok('Test A: warp 0 renders exactly the flat (5-3A) artwork')

// ---- B: warp > 0 changes the render, controlled, monotone-ish, artwork still there
const w30 = wr(30), w60 = wr(60), w100 = wr(100)
const d30 = diff(w30, plain), d60 = diff(w60, plain), d100 = diff(w100, plain)
assert.ok(d30 > 50, `warp 30 must change pixels (${d30})`); assert.ok(d60 >= d30 && d100 >= d60, `more warp, more change (${d30}/${d60}/${d100})`)
assert.ok(d100 < 0.35 * ART * ART, `warp stays controlled (${d100} px changed of ${ART * ART})`)
const base = opaque(plain, 60, 100, 340, 380), after = opaque(w100, 60, 100, 340, 380)
assert.ok(after > 0.9 * base && after < 1.1 * base, `artwork not removed or inflated (${after} vs ${base})`)
ok(`Test B: warp changes the artwork (${d30}/${d60}/${d100} px at 30/60/100), stays controlled, keeps its area (${after}/${base})`)

// ---- transparency: margin of the PNG stays transparent (photo shows through), nothing painted outside the artwork's reach
{ const p = px(w100), q = px(creased); const cap = Math.ceil(maxShiftPx(ART, 100)) + 2
  let bad = 0; for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { if (x >= 80 - cap && x < 80 + ART + cap && y >= 120 - cap && y < 120 + ART + cap) continue; const i = (y * W + x) * 4; if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) bad += 1 }
  assert.equal(bad, 0, 'nothing drawn outside artwork + warp cap')
  // Halo check: no pixel in the artwork box is a dark/black fringe (artwork colours are red/white/blue over grey; black would be a matte).
  let dark = 0; for (let y = 100; y < 380; y += 1) for (let x = 60; x < 340; x += 1) { const i = (y * W + x) * 4; if (p[i] < 25 && p[i + 1] < 25 && p[i + 2] < 25) dark += 1 }
  // the crease itself is at most ~rgba(0,0,0,.4) over #8a => >= 0x52, so anything <25 would be a halo
  assert.equal(dark, 0, 'no black halo at warped alpha edges')
  ok('Test: transparent PNG stays transparent — nothing outside the warp cap, no dark matte fringe') }

// ---- flat cloth: no folds => no displacement
assert.equal(diff(wr(100, {}, flat), render(flat, [{ image: art, placement: place({ warp: 0 }) }])), 0); ok('Test: a photo with no folds leaves the print undistorted at any warp')

// ---- C/D/E: transform still works with warp on (move, resize, rotate) — measure the red centroid
const centroid = (c) => { const d = px(c); let sx = 0, sy = 0, m = 0; for (let y = 0; y < c.height; y += 1) for (let x = 0; x < c.width; x += 1) { const i = (y * c.width + x) * 4; if (d[i] > 170 && d[i + 1] < 80 && d[i + 2] < 80) { sx += x; sy += y; m += 1 } } return { x: sx / m, y: sy / m, m } }
const c0 = centroid(wr(60)), cm = centroid(wr(60, { x: 130, y: 90 }))
assert.ok(Math.abs(cm.x - c0.x - 50) < 8 && Math.abs(cm.y - c0.y + 30) < 8, `move (${cm.x - c0.x}, ${cm.y - c0.y})`); ok('Test C: move — warped artwork follows X/Y')
const cs = centroid(wr(60, { scale: 0.5 })); assert.ok(cs.m < 0.35 * c0.m && cs.m > 0.15 * c0.m, `scale area ratio ${cs.m / c0.m}`); assert.ok(Math.abs(cs.x - (80 + ART / 2)) < 12 && Math.abs(cs.y - (120 + ART / 2)) < 12, 'scale pivots on centre'); ok('Test D: resize/scale — warped artwork scales about its centre')
const cr = render(creased, [{ image: art, placement: place({ warp: 60, rotation: 90, x: 80, y: 120, width: ART, height: ART * 0.5 }) }]), cr0 = render(creased, [{ image: art, placement: place({ warp: 60, rotation: 0, x: 80, y: 120, width: ART, height: ART * 0.5 }) }])
const spread = (c) => { const d = px(c); let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) { const i = (y * W + x) * 4; if (d[i] > 170 && d[i + 1] < 80 && d[i + 2] < 80) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) } } return { w: x1 - x0, h: y1 - y0 } }
const s0 = spread(cr0), s1 = spread(cr); assert.ok(s0.w > s0.h * 1.5 && s1.h > s1.w * 1.5, `rotation swaps extents (${JSON.stringify(s0)} -> ${JSON.stringify(s1)})`); ok('Test E: rotate — warped artwork rotates (extents swap at 90°)')

// ---- F: fabric integration together with warp
const fabOnly = wr(0, { realism: 80 }), both = wr(60, { realism: 80 }), warpOnly = wr(60, { realism: 0 })
assert.ok(diff(both, warpOnly) > 50, 'fabric changes the warped print'); assert.ok(diff(both, fabOnly) > 50, 'warp changes the fabric-shaded print'); assert.ok(diff(fabOnly, plain) > 50, 'fabric alone still works')
ok('Test F: fabric integration and warp compose (each still changes the result)')

// ---- G: independent layers
const two = (wa, wb) => render(creased, [{ image: art, placement: createPlacement({ x: 20, y: 40, width: 150, height: 150, warp: wa }) }, { image: art, placement: createPlacement({ x: 220, y: 300, width: 150, height: 150, warp: wb }) }])
const t00 = two(0, 0), t80 = two(80, 0), t08 = two(0, 80)
const regionDiff = (a, b, x0, y0, x1, y1) => { const p = px(a), q = px(b); let d = 0; for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const i = (y * W + x) * 4; if (p[i] !== q[i] || p[i + 1] !== q[i + 1] || p[i + 2] !== q[i + 2]) d += 1 } return d }
assert.ok(regionDiff(t80, t00, 10, 30, 185, 205) > 0); assert.equal(regionDiff(t80, t00, 205, 285, 390, 470), 0); assert.ok(regionDiff(t08, t00, 205, 285, 390, 470) > 0); assert.equal(regionDiff(t08, t00, 10, 30, 185, 205), 0)
ok('Test G: two artworks warp independently — changing one leaves the other pixel-identical')

// ---- H: views keep their own warp, through the real renderer
{ let s = createInitialState()
  for (const v of ['FRONT', 'BACK']) { s = R(s, { type: 'SET_VIEW', view: v }); s = R(s, { type: 'SET_TSHIRT', asset: { url: 'blob:shirt', name: v, width: W, height: H } }); s = R(s, { type: 'SET_MASK', kind: 'tshirt', asset: { url: 'blob:mask', name: 'm', width: W, height: H } }) }
  s = R(s, { type: 'SET_VIEW', view: 'FRONT' }); s = R(s, { type: 'ADD_ARTWORK', asset: { url: 'blob:art', name: 'a', width: ART, height: ART } })
  const id = s.composition.selectedArtworkId
  s = R(s, { type: 'UPDATE_ARTWORK', id, patch: { x: 20, y: 24, width: 60, height: 48, warp: 0, realism: 0 }, keepRatio: false }); s = R(s, { type: 'COPY_PLACEMENT_TO_VIEW', id, view: 'BACK' })
  s = R(s, { type: 'SET_VIEW', view: 'BACK' }); const bid = s.composition.surfaces.front.artworks.find((a) => a.view === 'BACK').id
  s = R(s, { type: 'UPDATE_ARTWORK', id: bid, patch: { warp: 90 } }); s = R(s, { type: 'SET_VIEW', view: 'FRONT' })
  const jobs = collectViewJobs(s); assert.deepEqual(jobs.map((j) => j.layers[0].warp), [0, 90])
  const imgs = { 'blob:shirt': creased, 'blob:mask': mask, 'blob:art': art }
  const res = await renderViewJobs(jobs, { loadImage: async (u) => imgs[u], env })
  const frontFlat = render(creased, [{ image: art, placement: placementFromLayer({ ...jobs[0].layers[0], warp: 0, realism: 0 }, { width: W, height: H }) }])
  assert.equal(diff(res[0].canvas, frontFlat), 0, 'Front stays flat'); assert.ok(diff(res[1].canvas, res[0].canvas) > 50, 'Back is warped'); assert.equal(res[0].width, W)
  ok('Test H: per-view export jobs — Front (warp 0) and Back (warp 90) render differently through the real renderComposite') }

console.log(`\n${n} checks passed`)

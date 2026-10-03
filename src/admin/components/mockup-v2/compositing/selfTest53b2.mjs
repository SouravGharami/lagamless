// Step 5-3B-2 self-test (fabric integration).
//   CANVAS_FROM=<dir/x.js containing @napi-rs/canvas> node src/admin/components/mockup-v2/compositing/selfTest53b2.mjs
// Synthetic photographs with known folds / wash patches / weave; no DOM, no network.
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { renderComposite, buildPrintableRegion, createPlacement, buildFabricMap, applyFabric, boxBlur } from './index.js'
const require = createRequire(process.env.CANVAS_FROM || import.meta.url)
const { createCanvas } = require('@napi-rs/canvas')
const env = { createCanvas: (w, h) => createCanvas(w, h) }
let n = 0; const ok = (name) => console.log(`ok ${++n} - ${name}`)

// deterministic noise
let seed = 12345
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

const W = 400, H = 500
const gauss = (d, w) => Math.exp(-((d / w) ** 2))
/** Builds a "photograph": base colour x (weave + fold band + optional acid-wash blotches). fold: dark band with a highlight beside it. */
function makePhoto({ base, weave = 0.03, fold = true, wash = 0, w = W, h = H }) {
  const c = createCanvas(w, h); const g = c.getContext('2d'); const img = g.createImageData(w, h)
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = (y * w + x) * 4
    const d = (x - w * 0.5) + (y - h * 0.5) * 0.35 // distance from a diagonal fold line through the middle
    let m = 1 + (rnd() - 0.5) * 2 * weave
    if (fold) m *= 1 - 0.38 * gauss(d, w * 0.05) + 0.16 * gauss(d - w * 0.09, w * 0.04)
    if (wash) m *= 1 + wash * (Math.sin(x * 0.045) * Math.cos(y * 0.037) + 0.5 * Math.sin((x + y) * 0.11))
    for (let k = 0; k < 3; k += 1) img.data[i + k] = Math.max(0, Math.min(255, base[k] * m))
    img.data[i + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}
const solid = (w, h, color) => { const c = createCanvas(w, h); const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); return c }
const art = (w, h, draw) => { const c = createCanvas(w, h); draw(c.getContext('2d'), w, h); return c }
const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data)
const data = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data
const mask = solid(W, H, '#fff')
// artwork placed at photo px
const place = (x, y, w, h, extra = {}) => createPlacement({ x, y, width: w, height: h, ...extra })
const render = (photo, artworks, extra = {}) => { const out = createCanvas(1, 1); const r = renderComposite({ photo, tshirtMask: mask, artworks, ...extra }, { canvas: out }, env); return { out, r } }
const meanDiff = (a, b) => { const da = data(a), db = data(b); let s = 0, c = 0; for (let i = 0; i < da.length; i += 4) { s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); c += 3 } return s / c }

const whiteArt = art(200, 200, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 200, 200) })
const colorArt = art(200, 200, (g) => { g.fillStyle = '#ff2a2a'; g.fillRect(0, 0, 100, 200); g.fillStyle = '#22cc44'; g.fillRect(100, 0, 100, 200) })
// fold line: x - 200 + (y - 250)*0.35 = 0  -> at y=250, x=200 (dark band centre); highlight ~ +36 px to the right
const onFold = (y) => Math.round(200 - (y - 250) * 0.35)

// ---- 1. backwards compatibility: realism 0 == the plain 5-3A composite, bit for bit
const blackShirt = makePhoto({ base: [24, 24, 26] })
const flat = render(blackShirt, [{ image: colorArt, placement: place(100, 150, 200, 200) }]).out
const zero = render(blackShirt, [{ image: colorArt, placement: place(100, 150, 200, 200, { realism: 0 }) }]).out
assert.equal(Buffer.compare(Buffer.from(data(flat)), Buffer.from(data(zero))), 0); ok('realism 0 is identical to the existing 5-3A composite')

// ---- 2. map is relative & colour-independent: same fold on a black and a white shirt has the same sign, weaker (never inverted) on black
const mapFor = (photo) => buildFabricMap(data(photo), W, H)
const mBlack = mapFor(makePhoto({ base: [24, 24, 26], weave: 0 })); const mWhite = mapFor(makePhoto({ base: [235, 232, 225], weave: 0 }))
const at = (m, x, y) => m.fold[y * W + x]
assert.ok(at(mWhite, onFold(250), 250) < -20 && at(mBlack, onFold(250), 250) < 0, 'fold band is negative in the shadow on both')
assert.ok(at(mWhite, onFold(250) + 36, 250) > 0 && at(mBlack, onFold(250) + 36, 250) >= 0, 'highlight beside the fold is positive')
assert.ok(Math.abs(at(mWhite, onFold(250), 250)) > Math.abs(at(mBlack, onFold(250), 250)), 'near-black shirts are damped (no amplified noise)')
assert.ok(Math.abs(at(mWhite, 30, 30)) < 6 && Math.abs(at(mWhite, W - 30, H - 30)) < 6, 'evenly lit fabric away from the fold has ~zero fold band')
ok('fold/highlight detected on black and white cotton with the same rule (no colour-specific logic)')

// ---- 3. white artwork on an evenly lit dark shirt stays white; colours unchanged
const evenBlack = makePhoto({ base: [22, 22, 24], fold: false, weave: 0.03 })
const w1 = render(evenBlack, [{ image: whiteArt, placement: place(100, 150, 200, 200, { realism: 100 }) }]).out
let minW = 255; { const d = data(w1); for (let y = 160; y < 340; y += 4) for (let x = 110; x < 290; x += 4) { const i = (y * W + x) * 4; minW = Math.min(minW, d[i], d[i + 1], d[i + 2]) } }
assert.ok(minW >= 215, `white stays white on even fabric (min ${minW})`); ok('white DTF ink stays white on a dark shirt (no blanket multiply)')

// ---- 4. fold crossing a white print: shadow darkens it (subtly, still readable), highlight does not erase it, the photo is not touched
const white = render(blackShirt, [{ image: whiteArt, placement: place(100, 150, 200, 200, { realism: 100 }) }]).out
const shadowPx = px(white, onFold(250), 250), litPx = px(white, 130, 250), hiPx = px(white, onFold(250) + 36, 250)
assert.ok(shadowPx[0] < litPx[0] - 12, `print darker in the fold (${shadowPx[0]} vs ${litPx[0]})`)
assert.ok(shadowPx[0] > 150, 'but still clearly readable white/grey')
assert.ok(hiPx[0] >= litPx[0] - 2, 'highlight is not darkened')
ok('a fold crossing the artwork produces a subtle, readable variation')

// ---- 5. hue preserved: red stays red, no tint from the shirt colour
const olive = makePhoto({ base: [88, 92, 52], fold: true })
const red = art(200, 200, (g) => { g.fillStyle = '#ff0000'; g.fillRect(0, 0, 200, 200) })
const r1 = render(olive, [{ image: red, placement: place(100, 150, 200, 200, { realism: 100 }) }]).out
for (const [x, y] of [[onFold(250), 250], [130, 250], [onFold(250) + 36, 250]]) { const p = px(r1, x, y); assert.ok(p[0] > 120 && p[0] > p[1] * 1.6 && p[0] > p[2] * 1.6, `red dominant ${p}`) }
ok('artwork hue is preserved on an olive shirt (no shirt-colour tint)')

// ---- 6. alpha untouched, transparent pixels untouched (clean edges, no halos)
const rgba = new Uint8ClampedArray(20 * 20 * 4); for (let i = 0; i < 400; i += 1) { rgba.set([200, 120, 40, i % 5 === 0 ? 0 : (i * 7) % 256], i * 4) }
const before = Uint8ClampedArray.from(rgba)
applyFabric(rgba, 20, 20, onFold(250) - 10, 245, buildFabricMap(data(blackShirt), W, H), 100)
let alphaSame = true, transparentSame = true, changed = false
for (let i = 0; i < 400; i += 1) { if (rgba[i * 4 + 3] !== before[i * 4 + 3]) alphaSame = false; if (before[i * 4 + 3] === 0 && (rgba[i * 4] !== before[i * 4] || rgba[i * 4 + 1] !== before[i * 4 + 1])) transparentSame = false; if (rgba[i * 4] !== before[i * 4]) changed = true }
assert.ok(alphaSame && transparentSame && changed); ok('alpha channel is never modified; fully transparent pixels stay untouched')
// and through the renderer: transparent corners of a circular PNG still show the bare shirt
const circle = art(200, 200, (g) => { g.fillStyle = '#ff8800'; g.beginPath(); g.arc(100, 100, 90, 0, 7); g.fill() })
const c1 = render(blackShirt, [{ image: circle, placement: place(100, 150, 200, 200, { realism: 100 }) }]).out
const bare = render(blackShirt, []).out
assert.deepEqual(px(c1, 102, 152), px(bare, 102, 152)); ok('transparent PNG corners stay transparent in the composite (no rectangle)')

// ---- 7. acid wash: readable, not tinted by the wash
const acid = makePhoto({ base: [70, 78, 92], fold: false, wash: 0.7, weave: 0.08 })
const a1 = render(acid, [{ image: colorArt, placement: place(100, 150, 200, 200, { realism: 50 }) }]).out
const a0 = render(acid, [{ image: colorArt, placement: place(100, 150, 200, 200, { realism: 0 }) }]).out
{ const d1 = data(a1), d0 = data(a0); let sr = 0, sg = 0, dev = 0, cnt = 0
  for (let y = 160; y < 340; y += 3) for (let x = 110; x < 290; x += 3) { const i = (y * W + x) * 4; const left = x < 200; if (left) { sr += d1[i] } else { sg += d1[i + 1] }; dev += Math.abs(d1[i] - d0[i]) + Math.abs(d1[i + 1] - d0[i + 1]); cnt += 1 }
  const nl = cnt / 2; assert.ok(sr / nl > 170 && sg / nl > 130, `colours still strong (${(sr / nl).toFixed(0)}, ${(sg / nl).toFixed(0)})`); assert.ok(dev / cnt < 40, `mean shift ${(dev / cnt).toFixed(1)}`) }
ok('acid-wash fabric: artwork stays vivid and readable, modulated not tinted')

// ---- 8. black cotton + colourful artwork at the default strength: strong colours, small average change
const d50 = render(blackShirt, [{ image: colorArt, placement: place(100, 150, 200, 200, { realism: 50 }) }]).out
assert.ok(meanDiff(d50, flat) < 14, `default strength is subtle (${meanDiff(d50, flat).toFixed(2)})`); assert.ok(px(d50, 130, 250)[0] > 200)
ok('default strength is subtle on black cotton; colours remain strong')

// ---- 9. light shirt + dark artwork
const light = makePhoto({ base: [232, 228, 218] })
const darkArt = art(200, 200, (g) => { g.fillStyle = '#111111'; g.fillRect(0, 0, 200, 200) })
const l1 = render(light, [{ image: darkArt, placement: place(100, 150, 200, 200, { realism: 100 }) }]).out
assert.ok(px(l1, 130, 250)[0] < 60 && px(l1, onFold(250), 250)[0] < 60); ok('dark artwork on a light shirt remains dark and solid')

// ---- 10. multiple artworks are shaded independently
const twoA = render(blackShirt, [{ image: colorArt, placement: place(20, 150, 150, 150, { realism: 0 }) }, { image: whiteArt, placement: place(240, 150, 150, 150, { realism: 100 }) }]).out
const twoB = render(blackShirt, [{ image: colorArt, placement: place(20, 150, 150, 150, { realism: 0 }) }, { image: whiteArt, placement: place(240, 150, 150, 150, { realism: 0 }) }]).out
const leftOnly = (c) => { const g = c.getContext('2d').getImageData(0, 140, 190, 170).data; return Buffer.from(g) }
assert.equal(Buffer.compare(leftOnly(twoA), leftOnly(twoB)), 0, 'layer with realism 0 unchanged by its neighbour')
assert.ok(meanDiff(twoA, twoB) > 0.05, 'the neighbour with realism 100 did change')
ok('multiple layers: each has its own fabric integration; one never alters another')

// ---- 11. transform: shading follows the artwork wherever it is moved / rotated / scaled
const smallWhite = (x, y, extra) => render(blackShirt, [{ image: whiteArt, placement: place(x, y, 40, 40, { realism: 100, ...extra }) }]).out
const onTheFold = smallWhite(onFold(250) - 20, 230), offTheFold = smallWhite(40, 230)
const centre = (c, cx) => px(c, cx, 250)[0]
assert.ok(centre(onTheFold, onFold(250)) < centre(offTheFold, 60) - 12); ok('moving the artwork onto the fold changes its shading accordingly')
const rot = smallWhite(onFold(250) - 20, 230, { rotation: 37, scale: 1.5 })
assert.ok(px(rot, onFold(250), 250)[0] < 240 && px(rot, onFold(250), 250)[0] > 100); ok('rotated + scaled artwork is shaded in place (position/size unaffected)')
// geometry unaffected by fabric: same alpha footprint with and without realism
const foot = (r) => { const p = render(solid(W, H, '#000'), [{ image: circle, placement: place(100, 150, 200, 200, { realism: r, rotation: 20 }) }]).out; const d = data(p); let c = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) c += 1; return c }
assert.equal(foot(0), foot(100)); ok('artwork footprint identical with fabric integration on/off')

// ---- 12. photograph and inputs are never modified
const p0 = Buffer.from(data(blackShirt)); const a0d = Buffer.from(data(colorArt))
const withArt = render(blackShirt, [{ image: colorArt, placement: place(100, 150, 200, 200, { realism: 100 }) }]).out
assert.equal(Buffer.compare(p0, Buffer.from(data(blackShirt))), 0); assert.equal(Buffer.compare(a0d, Buffer.from(data(colorArt))), 0)
assert.deepEqual(px(withArt, 20, 20), px(blackShirt, 20, 20)); assert.deepEqual(px(withArt, 380, 480), px(blackShirt, 380, 480))
ok('source photo, artwork and pixels outside the print are untouched')

// ---- 13. the mask still gates everything
const halfMask = art(W, H, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(0, 0, W, 250) })
const outM = createCanvas(1, 1); renderComposite({ photo: blackShirt, tshirtMask: halfMask, artworks: [{ image: whiteArt, placement: place(100, 150, 200, 200, { realism: 100 }) }] }, { canvas: outM }, env)
assert.deepEqual(px(outM, 200, 300), px(blackShirt, 200, 300)); assert.ok(px(outM, 130, 200)[0] > 100); ok('masked areas stay protected with fabric integration on')

// ---- 14. masked blur: bright background cannot bleed into the shirt
const bleed = createCanvas(W, H); { const g = bleed.getContext('2d'); g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, W, H); g.fillStyle = '#181818'; g.fillRect(100, 0, 300, H) }
const allow = new Uint8ClampedArray(W * H); for (let y = 0; y < H; y += 1) for (let x = 100; x < W; x += 1) allow[y * W + x] = 255
const mMasked = buildFabricMap(data(bleed), W, H, allow), mPlain = buildFabricMap(data(bleed), W, H, null)
assert.ok(Math.abs(mMasked.fold[250 * W + 110]) <= 2, `masked edge fold ${mMasked.fold[250 * W + 110]}`); assert.ok(Math.abs(mPlain.fold[250 * W + 110]) > 10)
ok('background/skin outside the mask cannot create fake folds at the shirt edge')

// ---- 15. blur sanity
const impulse = new Float32Array(9 * 9); impulse[40] = 81; const b = boxBlur(impulse, 9, 9, 1); assert.ok(Math.abs(b.reduce((a, v) => a + v, 0) - 81) < 1e-3 && Math.abs(b[40] - 9) < 1e-3)
ok('box blur conserves energy')

// ---- 16. draft renders: smaller canvas, same picture
const full = render(blackShirt, [{ image: colorArt, placement: place(100, 150, 200, 200, { realism: 60 }) }])
const draft = render(blackShirt, [{ image: colorArt, placement: place(100, 150, 200, 200, { realism: 60 }) }], { scale: 0.5 })
assert.equal(draft.r.renderWidth, 200); assert.equal(draft.r.renderHeight, 250); assert.equal(draft.r.width, W); assert.equal(full.r.renderWidth, W)
const shrunk = createCanvas(200, 250); { const g = shrunk.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(full.out, 0, 0, 200, 250) }
assert.ok(meanDiff(shrunk, draft.out) < 9, `draft ~ full (${meanDiff(shrunk, draft.out).toFixed(2)})`); ok('draft render is the same picture at reduced size')

// ---- 17. performance (informational limits, generous)
{ const BW = 2000, BH = 2500; const big = createCanvas(BW, BH); { const g = big.getContext('2d'); g.fillStyle = '#202024'; g.fillRect(0, 0, BW, BH) }
  const bigMask = solid(BW, BH, '#fff'); const bigArt = art(800, 800, (g) => { g.fillStyle = '#e33'; g.beginPath(); g.arc(400, 400, 380, 0, 7); g.fill() })
  const t0 = performance.now(); const o = createCanvas(1, 1)
  const region = buildPrintableRegion({ photo: big, tshirtMask: bigMask }, env) // the preview caches the region exactly like this
  const inp = { photo: big, tshirtMask: bigMask, region, artworks: [{ image: bigArt, placement: createPlacement({ x: 500, y: 600, width: 900, height: 900, realism: 50, rotation: 12 }) }] }
  renderComposite({ ...inp, scale: 1100 / 2500 }, { canvas: o }, env); const tDraftFirst = performance.now() - t0
  const t1 = performance.now(); renderComposite({ ...inp, scale: 1100 / 2500 }, { canvas: o }, env); const tDraft = performance.now() - t1
  const t2 = performance.now(); renderComposite(inp, { canvas: o }, env); const tFullFirst = performance.now() - t2
  const t3 = performance.now(); renderComposite(inp, { canvas: o }, env); const tFull = performance.now() - t3
  console.log(`   timing 2000x2500: draft first ${tDraftFirst.toFixed(0)} ms, draft cached ${tDraft.toFixed(0)} ms, full first ${tFullFirst.toFixed(0)} ms, full cached ${tFull.toFixed(0)} ms`)
  assert.ok(tDraft < 600 && tFull < 2500 && tFullFirst < 6000) }
ok('performance: drafts stay interactive; full render is cached after the first map build')
console.log(`\n${n} checks passed`)

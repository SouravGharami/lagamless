// Step 5-3A self-test. Run:  NODE_PATH=<dir with @napi-rs/canvas> node selfTest53a.mjs
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import { renderComposite, buildPrintableRegion, createPlacement, placementFromLayer, COMPOSITE_ERROR, allowanceFromRgba, combineAllowance } from './index.js'
const require = createRequire(process.env.CANVAS_FROM || import.meta.url)
const { createCanvas } = require('@napi-rs/canvas')
const env = { createCanvas: (w, h) => createCanvas(w, h) }

const W = 200, H = 250
const fill = (w, h, draw) => { const c = createCanvas(w, h); draw(c.getContext('2d')); return c }
// "photo": grey background, skin-coloured arm strip on the left, shirt area in the middle
const photo = fill(W, H, (g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, W, H); g.fillStyle = '#d2a679'; g.fillRect(0, 0, 40, H); g.fillStyle = '#2244aa'; g.fillRect(60, 20, 120, 210) })
const photoBefore = Buffer.from(photo.getContext('2d').getImageData(0, 0, W, H).data)
// mask: white over the shirt, black elsewhere
const shirtMask = fill(W, H, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(60, 20, 120, 210) })
// design mask: only the upper half of the shirt printable
const designMask = fill(W, H, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(60, 20, 120, 100) })
// artwork: transparent PNG, irregular (red circle), 100x100
const artwork = fill(100, 100, (g) => { g.fillStyle = '#ff0000'; g.beginPath(); g.arc(50, 50, 45, 0, Math.PI * 2); g.fill() })
const artBefore = Buffer.from(artwork.getContext('2d').getImageData(0, 0, 100, 100).data)

const px = (c, x, y) => Array.from(c.getContext('2d').getImageData(x, y, 1, 1).data)
const run = (input) => { const out = createCanvas(1, 1); const r = renderComposite(input, { canvas: out }, env); return { out, r } }
let n = 0; const ok = (name) => console.log(`ok ${++n} - ${name}`)

// artwork centred at (100,70): spills left over the arm (x<60) and up (y<20) beyond the shirt
const placement = createPlacement({ x: 30, y: 20, width: 140, height: 100 }) // wide box: circle drawn stretched -> covers x30..170
const input = { photo, tshirtMask: shirtMask, artworks: [{ image: artwork, placement: createPlacement({ x: 20, y: 0, width: 160, height: 160 }) }] }
let { out, r } = run(input)
assert.equal(r.width, W); assert.equal(r.height, H); ok('output has photo native size')
assert.deepEqual(px(out, 100, 80), [255, 0, 0, 255]); ok('artwork visible over shirt with original colour')
assert.deepEqual(px(out, 30, 80), [0xd2, 0xa6, 0x79, 255]); ok('skin/arm region untouched although artwork overlaps it')
assert.deepEqual(px(out, 100, 10), [0x80, 0x80, 0x80, 255]); ok('background above shirt untouched')
assert.deepEqual(px(out, 25, 25), [0xd2, 0xa6, 0x79, 255]); ok('corner of artwork box (transparent) leaves photo visible')
// transparency: artwork bbox corner inside shirt but circle-transparent
assert.deepEqual(px(out, 176, 24), [0x22, 0x44, 0xaa, 255]); ok('transparent artwork pixels show the shirt (no rectangular background)')

// design mask limits printable region
;({ out } = run({ ...input, designMask }))
assert.deepEqual(px(out, 100, 80), [255, 0, 0, 255])
assert.deepEqual(px(out, 100, 140), [0x22, 0x44, 0xaa, 255]); ok('design mask restricts printable region inside shirt mask')

// opacity + rotation
;({ out } = run({ ...input, artworks: [{ image: artwork, placement: createPlacement({ x: 20, y: 0, width: 160, height: 160, opacity: 0.5 }) }] }))
const half = px(out, 100, 80); assert.ok(half[0] > 130 && half[0] < 200 && half[2] > 50 && half[2] < 120, `half opacity blend ${half}`); ok('opacity applied')
;({ out } = run({ ...input, artworks: [{ image: artwork, placement: createPlacement({ x: 60, y: 60, width: 100, height: 40, rotation: 90 }) }] }))
assert.notDeepEqual(px(out, 110, 60), px(out, 110, 200)); ok('rotation pivots on box centre')
;({ out } = run({ ...input, artworks: [{ image: artwork, placement: createPlacement({ x: 60, y: 60, width: 50, height: 50, scale: 2 }) }] }))
assert.deepEqual(px(out, 60 + 25 + 40, 60 + 25), [255, 0, 0, 255]); ok('scale grows about centre')

// non-destructive
assert.ok(photoBefore.equals(Buffer.from(photo.getContext('2d').getImageData(0, 0, W, H).data))); ok('source photo unchanged')
assert.ok(artBefore.equals(Buffer.from(artwork.getContext('2d').getImageData(0, 0, 100, 100).data))); ok('source artwork unchanged')

// errors
const code = (fn) => { try { fn(); } catch (e) { return e.code } }
assert.equal(code(() => run({ photo: null, tshirtMask: shirtMask, artworks: [] })), COMPOSITE_ERROR.MISSING_PHOTO); ok('missing photo')
assert.equal(code(() => run({ photo, tshirtMask: null, artworks: input.artworks })), COMPOSITE_ERROR.MISSING_MASK); ok('missing mask fails closed')
assert.equal(code(() => run({ photo, tshirtMask: shirtMask, artworks: [{ image: null, placement }] })), COMPOSITE_ERROR.MISSING_ARTWORK); ok('missing artwork')
assert.equal(code(() => run({ photo, tshirtMask: createCanvas(100, 125), artworks: input.artworks })), COMPOSITE_ERROR.DIMENSION_MISMATCH); ok('dimension mismatch (no stretching)')
assert.equal(code(() => run({ photo, tshirtMask: shirtMask, designMask: createCanvas(W, H + 1), artworks: input.artworks })), COMPOSITE_ERROR.DIMENSION_MISMATCH); ok('design mask mismatch')
assert.equal(code(() => run({ photo: { width: 0, height: 0 }, tshirtMask: shirtMask, artworks: [] })), COMPOSITE_ERROR.INVALID_IMAGE); ok('invalid image')
assert.equal(code(() => renderComposite({ photo, tshirtMask: shirtMask, artworks: input.artworks }, { canvas: null }, env)), COMPOSITE_ERROR.RENDER_FAILURE); ok('render failure wrapped')

// pure math
assert.deepEqual(Array.from(allowanceFromRgba(new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 255,255,255,0]))), [255, 0, 0]); ok('white=allowed, black=protected, transparent=protected')
assert.deepEqual(Array.from(combineAllowance(new Uint8ClampedArray([255,255,0]), new Uint8ClampedArray([255,0,255]))), [255, 0, 0]); ok('shirt AND design')
const pl = placementFromLayer({ x: 10, y: 20, width: 50, height: 25, rotation: 15, opacity: 0.8 }, { width: 2000, height: 2500 })
assert.deepEqual([pl.x, pl.y, pl.width, pl.height, pl.rotation, pl.scale, pl.opacity, pl.deformation], [200, 500, 1000, 625, 15, 1, 0.8, null]); ok('placement from studio layer')
console.log(`\n${n} checks passed`)

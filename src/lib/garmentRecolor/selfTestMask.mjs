// Run: node src/lib/garmentRecolor/selfTestMask.mjs
// With a photo's OWN saved mask, recoloring must change the T-shirt fabric only: artwork, backdrop, skin, jeans and
// alpha stay byte-identical, and folds/shading survive. Covers front (flat), on-model, back-like and close-up photos.
import assert from 'node:assert/strict'
import { prepareGarment, renderRecolor, hexToRgb } from './core.js'
import { garmentMaskPathFor, garmentMaskUrlFor, storagePathFromPublicUrl } from './maskPaths.js'

const W = 700, H = 900
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const shade = (c, s) => Math.round(255 * Math.pow(Math.min(1, Math.pow(c / 255, 2.2) * s), 1 / 2.2))

/** truth: 1 shirt fabric, 2 print, 3 skin/jeans/hair, 0 backdrop */
function scene(kind, shirt, { whitePrint = false } = {}) {
  const data = new Uint8ClampedArray(W * H * 4)
  const truth = new Uint8Array(W * H)
  const [sr, sg, sb] = hexToRgb(shirt)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    const base = 0.7 + 0.3 * Math.sin(x * 0.04 + Math.sin(y * 0.02) * 2) * Math.cos(y * 0.03)
    const s = Math.max(0.3, base * (1 + (rnd() - 0.5) * 0.05))
    let rgb, t = 0
    const tee = kind === 'closeup' || (x > 200 && x < 500 && y > 230 && y < 560) ||
      (x > 130 && x < 200 && y > 230 && y < 330 && y < 230 + (200 - x) * 1.3 + 60) || (x > 500 && x < 570 && y > 230 && y < 330 && y < 230 + (x - 500) * 1.3 + 60)
    if (tee) {
      rgb = [shade(sr, s), shade(sg, s), shade(sb, s)]; t = 1
      const pr = kind === 'closeup' ? [350, 450, 120] : [350, 400, 70]
      if ((x - pr[0]) ** 2 + (y - pr[1]) ** 2 < pr[2] ** 2) { rgb = whitePrint ? [245, 245, 245] : [190, 40, 50]; t = 2 }
    } else if (kind === 'model') {
      const head = (x - 350) ** 2 + (y - 140) ** 2 < 70 ** 2
      const arm = (x > 110 && x <= 200 && y >= 330 && y < 520) || (x >= 500 && x < 590 && y >= 330 && y < 520)
      const jeans = x > 205 && x < 495 && y >= 560
      if (head || arm) { rgb = [shade(224, s), shade(172, s), shade(140, s)]; t = 3 }
      else if (jeans) { rgb = [shade(40, s), shade(70, s), shade(130, s)]; t = 3 }
      else { const v = 225 - y * 0.03; rgb = [v, v, v] }
    } else { rgb = [228, 228, 228] }
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; truth[p] = t
  }
  return { data, truth }
}

/** The mask an admin-side detector would save: the garment INCLUDING its printed graphic. */
const garmentMask = (truth) => Uint8Array.from(truth, (t) => (t === 1 || t === 2 ? 255 : 0))

function run(kind, shirt, target, opts = {}) {
  seed = 11
  const { data, truth } = scene(kind, shirt, opts)
  const prep = prepareGarment({ width: W, height: H, data }, { mask: garmentMask(truth), fabricHint: shirt })
  assert.ok(prep.ok, `${kind} ${shirt}: ${prep.reason}`)
  assert.equal(prep.source, 'mask', 'must use the supplied mask, not detection')
  const out = renderRecolor(prep, target)
  const n = [0, 0, 0, 0], ch = [0, 0, 0, 0]
  for (let p = 0; p < W * H; p++) {
    n[truth[p]]++
    const i = p * 4
    if (out[i] !== data[i] || out[i + 1] !== data[i + 1] || out[i + 2] !== data[i + 2]) ch[truth[p]]++
    assert.equal(out[i + 3], data[i + 3], 'alpha untouched')
  }
  const pct = (k) => (n[k] ? (100 * ch[k]) / n[k] : 0)
  return { shirt: pct(1), print: pct(2), other: pct(3), backdrop: pct(0), out, data, truth, prep }
}
const log = (name, r) => console.log(`${name}: shirt ${r.shirt.toFixed(1)}% | print ${r.print.toFixed(1)}% | skin/jeans ${r.other.toFixed(1)}% | backdrop ${r.backdrop.toFixed(1)}%`)

for (const [kind, shirt] of [['flat', '#b7ab95'], ['flat', '#111111'], ['model', '#111111'], ['model', '#e8e2d3'], ['closeup', '#565a3f']]) {
  for (const target of ['#2f4b9c', '#ffffff', '#000000', '#e03030']) {
    const r = run(kind, shirt, target)
    log(`${kind} ${shirt} -> ${target}`, r)
    assert.ok(r.shirt > 90, 'the T-shirt fabric must be recolored')
    assert.equal(r.print, 0, 'artwork must be untouched')
    assert.equal(r.other, 0, 'skin / jeans must be untouched')
    assert.equal(r.backdrop, 0, 'backdrop must be byte-identical')
  }
}

// a white print on a black tee: lightness test keeps it
{
  const r = run('flat', '#111111', '#2f4b9c', { whitePrint: true })
  log('white print on black', r)
  assert.equal(r.print, 0)
}

// the exact selected colour: the fabric median lands on the target hex
{
  const r = run('flat', '#b7ab95', '#2f4b9c')
  const [tr, tg, tb] = hexToRgb('#2f4b9c')
  const px = []
  for (let p = 0; p < W * H; p++) if (r.truth[p] === 1 && r.out[p * 4] !== r.data[p * 4]) px.push([r.out[p * 4], r.out[p * 4 + 1], r.out[p * 4 + 2]])
  const med = (k) => px.map((c) => c[k]).sort((a, b) => a - b)[px.length >> 1]
  console.log(`median recolored pixel rgb(${med(0)},${med(1)},${med(2)}) vs target rgb(${tr},${tg},${tb})`)
  assert.ok(Math.abs(med(0) - tr) < 14 && Math.abs(med(1) - tg) < 14 && Math.abs(med(2) - tb) < 14)
  // folds survive: recolored fabric still has tonal variation
  const ls = px.map((c) => c[0] + c[1] + c[2])
  assert.ok(Math.max(...ls) - Math.min(...ls) > 60, 'shading must be preserved')
}

// a mask that does not match any shirt pixels must not recolor the photo
{
  seed = 11
  const { data, truth } = scene('flat', '#b7ab95')
  const wrong = new Uint8Array(W * H); wrong.fill(0)
  const prep = prepareGarment({ width: W, height: H, data }, { mask: wrong, fabricHint: '#b7ab95' })
  assert.equal(prep.ok, false)
  void truth
}

// storage naming
assert.equal(garmentMaskPathFor('abc/front-170.jpg'), 'abc/front-170.garment-mask-v2.png')
assert.equal(garmentMaskUrlFor('https://x.supabase.co/storage/v1/object/public/product-images/abc/back-1.webp?v=2'), 'https://x.supabase.co/storage/v1/object/public/product-images/abc/back-1.garment-mask-v2.png')
assert.equal(garmentMaskUrlFor('blob:http://localhost/1234'), null)
assert.equal(storagePathFromPublicUrl('https://x.supabase.co/storage/v1/object/public/product-images/abc/back-1.webp'), 'abc/back-1.webp')

console.log('garmentRecolor per-photo mask self-test passed')

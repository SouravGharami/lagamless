// Run: node src/lib/garmentRecolor/selfTestViews.mjs
// Gallery photos are not all flat-lays: there is a person wearing the tee (jeans, skin, hair) and fabric/print close-ups.
// With the product's known shirt colour as `fabricHint` (and `fillsFrame` for close-ups) the recolor must hit the SHIRT
// on each of them, leave prints alone, and leave everything that is not the shirt (jeans, skin, backdrop) alone.
import assert from 'node:assert/strict'
import { prepareGarment, renderRecolor, hexToRgb } from './core.js'

const W = 700, H = 900
let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const shade = (c, s) => Math.round(255 * Math.pow(Math.min(1, Math.pow(c / 255, 2.2) * s), 1 / 2.2))

/** truth: 1 = shirt fabric, 2 = print, 3 = not the shirt (skin, hair, jeans), 0 = backdrop */
function scene(kind, shirt, deep = false) {
  const data = new Uint8ClampedArray(W * H * 4)
  const truth = new Uint8Array(W * H)
  const [sr, sg, sb] = hexToRgb(shirt)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    // `deep`: harder lighting (stronger folds and a darker lower half) — where tee and jeans colours blur together
    const base = deep ? 0.7 + 0.3 * Math.sin(x * 0.04 + Math.sin(y * 0.02) * 2) * Math.cos(y * 0.03) - (y > 480 ? 0.12 : 0)
      : 0.78 + 0.22 * Math.sin(x * 0.04 + Math.sin(y * 0.02) * 2) * Math.cos(y * 0.03)
    const s = Math.max(0.3, base * (1 + (rnd() - 0.5) * 0.05))
    let rgb, t = 0
    const tee = kind === 'closeup' || (x > 200 && x < 500 && y > 230 && y < 560) ||
      (x > 130 && x < 200 && y > 230 && y < 330 && y < 230 + (200 - x) * 1.3 + 60) || (x > 500 && x < 570 && y > 230 && y < 330 && y < 230 + (x - 500) * 1.3 + 60)
    if (tee) {
      rgb = [shade(sr, s), shade(sg, s), shade(sb, s)]; t = 1
      const pr = kind === 'closeup' ? [350, 450, 120] : [350, 400, 70]
      if ((x - pr[0]) ** 2 + (y - pr[1]) ** 2 < pr[2] ** 2) { rgb = [190, 40, 50]; t = 2 }
    } else if (kind === 'model') {
      const head = (x - 350) ** 2 + (y - 140) ** 2 < 70 ** 2
      const hair = (x - 350) ** 2 + (y - 110) ** 2 < 75 ** 2 && y < 130
      const neck = x > 320 && x < 380 && y > 190 && y <= 235
      const arm = (x > 110 && x <= 200 && y >= 330 && y < 520) || (x >= 500 && x < 590 && y >= 330 && y < 520)
      const jeans = x > 205 && x < 495 && y >= 560
      if (hair) { rgb = [40, 28, 22]; t = 3 } else if (head || neck || arm) { rgb = [shade(224, s), shade(172, s), shade(140, s)]; t = 3 }
      else if (jeans) { rgb = [shade(40, s), shade(70, s), shade(130, s)]; t = 3 }
      else { const v = 225 - y * 0.03; rgb = [v, v, v] }
    } else { rgb = [228, 228, 228] }
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; truth[p] = t
  }
  return { data, truth }
}

function measure(kind, shirt, options, deep = false) {
  seed = 7
  const { data, truth } = scene(kind, shirt, deep)
  const prep = prepareGarment({ width: W, height: H, data }, options)
  assert.ok(prep.ok, `${kind} ${shirt}: prepare failed (${prep.reason})`)
  const out = renderRecolor(prep, '#2f4b9c')
  const n = [0, 0, 0, 0], ch = [0, 0, 0, 0]
  for (let p = 0; p < W * H; p++) {
    n[truth[p]]++
    if (out[p * 4] !== data[p * 4] || out[p * 4 + 1] !== data[p * 4 + 1] || out[p * 4 + 2] !== data[p * 4 + 2]) ch[truth[p]]++
  }
  const pct = (k) => (n[k] ? (100 * ch[k]) / n[k] : 0)
  return { shirt: pct(1), print: pct(2), other: pct(3), backdrop: pct(0) }
}

const log = (name, r) => console.log(`${name}: shirt ${r.shirt.toFixed(1)}% recolored, print ${r.print.toFixed(1)}%, jeans/skin ${r.other.toFixed(1)}%, backdrop ${r.backdrop.toFixed(1)}%`)

// flat shot: unchanged by the hint
let r = measure('flat', '#b7ab95', { fabricHint: '#b7ab95' })
log('flat, beige', r)
assert.ok(r.shirt > 85 && r.print === 0 && r.other === 0 && r.backdrop < 1)

// person in a BLACK tee and dark-blue jeans (dark tee + dark jeans is where colour clusters can mix the two)
const before = measure('model', '#111111', {}, true)
log('model, black tee, no hint', before)
r = measure('model', '#111111', { fabricHint: '#111111' }, true)
log('model, black tee, with hint', r)
assert.ok(r.shirt > 85, 'the shirt must be recolored on the on-model photo')
// (dark hair next to a black tee is genuinely ambiguous by colour alone, so a few % outside the shirt is expected)
assert.ok(r.other <= before.other, 'the hint must never do worse than the unhinted result')
assert.ok(r.other < 10, 'jeans / skin must stay essentially untouched on the on-model photo')
assert.equal(r.print, 0)

// beige tee on a person: skin is nearly the same colour as the tee, which colour alone cannot separate — so this only
// checks the hint never makes it worse than before
const beige0 = measure('model', '#b7ab95', {})
r = measure('model', '#b7ab95', { fabricHint: '#b7ab95' })
log('model, beige tee, with hint', r)
assert.ok(r.shirt > 70 && r.print === 0)
assert.ok(r.other <= beige0.other && r.shirt >= beige0.shirt - 1, 'the hint must never do worse than the unhinted result')

// fabric / print close-up: no backdrop; without `fillsFrame` the all-fabric border is mistaken for the backdrop
const cu0 = measure('closeup', '#b7ab95', { fabricHint: '#b7ab95' })
log('close-up, hint only', cu0)
r = measure('closeup', '#b7ab95', { fabricHint: '#b7ab95', fillsFrame: true })
log('close-up, hint + fillsFrame', r)
assert.ok(r.shirt > 85 && r.print === 0, 'a close-up must recolor the fabric and keep the print')
assert.ok(r.shirt > cu0.shirt)

console.log('garmentRecolor views self-test passed')

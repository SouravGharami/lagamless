// Run: node src/lib/garmentRecolor/selfTestPrintNearFabricTone.mjs
// Real-world bug ("the T-shirt colour came into the DTF design"): on a black tee, the artwork contains DARK / MUTED tones
// (deep steel-blue, dark teal hakama, black ink outlines, near-black robe) whose colour is statistically close to the
// shirt's own dye. A pure per-pixel colour test then counts them as fabric and the colour switch repaints them (e.g. teal).
// Rule under test: ONLY fabric connected to the shirt's outer silhouette is recoloured. Artwork pixels - however similar
// in colour to the fabric - must stay byte-identical, and the fabric itself must still be recoloured with no speckle.
import assert from 'node:assert/strict'
import { prepareGarment, renderRecolor, hexToRgb } from './core.js'

const W = 600, H = 700
let seed = 5
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c } return c }

function scene(fabricRgb = [8, 8, 8], printScale = 1) {
  const data = new Uint8ClampedArray(W * H * 4)
  const truth = new Uint8Array(W * H) // 0 backdrop, 1 fabric, 2 print
  const cape = [[210, 150], [390, 150], [430, 420], [300, 470], [170, 420]]
  const hakama = [[200, 440], [400, 440], [430, 560], [170, 560]]          // dark teal, ends 40px above the hem
  const robeBlack = [[250, 200], [350, 200], [340, 330], [260, 330]]       // black ink region inside the cape
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    let rgb = fabricRgb[0] > 100 ? [96 - y * 0.02, 118 - y * 0.02, 140 - y * 0.02] : [214 - y * 0.02, 203 - y * 0.02, 185 - y * 0.02], t = 0
    const body = x > 130 && x < 470 && y > 60 && y < 600
    const sleeveL = x > 40 && x <= 130 && y > 60 && y < 250 && y > 60 + (130 - x) * 0.3
    const sleeveR = x >= 470 && x < 560 && y > 60 && y < 250 && y > 60 + (x - 470) * 0.3
    if (body || sleeveL || sleeveR) {
      const s = 0.5 + 0.5 * Math.abs(Math.sin(x * 0.04 + Math.sin(y * 0.03) * 2))
      const f = fabricRgb[0] > 100 ? (0.8 + 0.2 * s) : s
      const v = fabricRgb[0] > 100 ? fabricRgb[0] * f + (rnd() - 0.5) * 3 : Math.max(3, fabricRgb[0] * s + (rnd() - 0.5) * 2.5)
      rgb = fabricRgb[0] > 100 ? [v, v * 0.93, v * 0.8] : [v, v, v + 0.5]; t = 1
      const n = (rnd() - 0.5) * 3
      if (inPoly(x, y, cape)) { rgb = fabricRgb[0] > 100 ? [170 + n, 172 + n, 140 + n] : [20 + n, 30 + n, 44 + n]; t = 2 }                    // deep steel-blue cape
      if (inPoly(x, y, robeBlack)) { rgb = fabricRgb[0] > 100 ? [128 + n, 112 + n, 96 + n] : [4 + n, 4 + n, 5 + n]; t = 2 }                  // black ink, same as the fabric
      if (inPoly(x, y, hakama)) { rgb = fabricRgb[0] > 100 ? [146 + n, 168 + n, 160 + n] : [22 + n, 52 + n, 60 + n]; t = 2 }                  // dark teal
      if (Math.hypot(x - 300, y - 180) < 26) { rgb = [225, 165, 30]; t = 2 }               // gold crest
      if (x > 215 && x < 245 && y > 360 && y < 420) { rgb = fabricRgb[0] > 100 ? [170 + n, 150 + n, 152 + n] : [28 + n, 36 + n, 40 + n]; t = 2 } // dark slate patch
    }
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; truth[p] = t
  }
  return { data, truth }
}

let failures = 0
const cases = [
  ['black tee, detector path', [8, 8, 8], '#111111', false],
  ['black tee, saved-mask path', [8, 8, 8], '#111111', true],
  // (no 'sand tee, detector path' case: on that synthetic scene the legacy detector itself picks the big olive artwork as the
  //  shirt - a separate, pre-existing limitation of photos WITHOUT a saved mask; saved masks are the default path)
  ['sand tee, saved-mask path', [200, 190, 172], '#c8bea8', true],
]
for (const [label, fabricRgb, hint, useMask] of cases) for (const target of ['#1f7a8c', '#e79ab0', '#ffffff']) {
  seed = 5
  const { data, truth } = scene(fabricRgb)
  let mask = null
  if (useMask) { mask = new Uint8Array(W * H); for (let p = 0; p < W * H; p++) mask[p] = truth[p] ? 255 : 0 } // like the saved masks: print INCLUDED
  const prep = prepareGarment({ width: W, height: H, data }, { fabricHint: hint, mask })
  assert.ok(prep.ok, label + ' prepare failed: ' + prep.reason)
  const out = renderRecolor(prep, target)
  let fabric = 0, fabricChanged = 0, print = 0, printChanged = 0, bg = 0, bgChanged = 0
  for (let p = 0; p < W * H; p++) {
    const i = p * 4
    const ch = out[i] !== data[i] || out[i + 1] !== data[i + 1] || out[i + 2] !== data[i + 2]
    if (truth[p] === 1) { fabric++; if (ch) fabricChanged++ }
    else if (truth[p] === 2) { print++; if (ch) printChanged++ }
    else { bg++; if (ch) bgChanged++ }
  }
  const fabricPct = (100 * fabricChanged) / fabric, printPct = (100 * printChanged) / print
  const ok = printPct < 0.5 && bgChanged === 0 && fabricPct > 98.5
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} -> ${target}: fabric recoloured ${fabricPct.toFixed(2)}% | print repainted ${printPct.toFixed(2)}% | backdrop changed ${bgChanged}`)
}
if (failures) { console.error(`${failures} case(s) failed`); process.exit(1) }
console.log('garmentRecolor print-near-fabric-tone self-test passed')

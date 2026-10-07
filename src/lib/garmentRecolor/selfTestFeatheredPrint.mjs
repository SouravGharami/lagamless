// Run: node src/lib/garmentRecolor/selfTestFeatheredPrint.mjs
// Real-world bug: "the T-shirt colour mixed into the DTF design". A DTF print is not only hard-edged ink: it has soft,
// feathered edges (smoke / glow / fade-outs) and pale areas whose colour is close to the shirt's own. Blending those pixels
// toward the new shirt colour (instead of shifting only their fabric share) tints the artwork.
// Rule under test: artwork pixels - including the pale ones and the ones inside a feathered edge - keep the PRINT's colour;
// only the fabric share of a half-ink pixel moves to the new shirt colour (judged against the ideal alpha-blend of print + new fabric).
import assert from 'node:assert/strict'
import { prepareGarment, renderRecolor, hexToRgb } from './core.js'

const W = 600, H = 700
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

function scene(fabric) {
  const data = new Uint8ClampedArray(W * H * 4)
  const alpha = new Float32Array(W * H) // print coverage 0..1 (ground truth)
  const inkAt = (x, y) => {
    const dark = Math.hypot((x - 300) / 95, (y - 300) / 150) < 1 ? 1 : 0                        // dark figure
    const gold = Math.hypot(x - 300, y - 210) < 24 ? 1 : 0                                       // gold crest
    // pale "mist" under the figure: fades out softly over ~50 px into the fabric (feathered edge)
    const mist = (1 - smooth(0, 1, Math.hypot((x - 300) / 140, (y - 470) / 70) - 0.55)) * 0.9
    return { dark, gold, mist }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    const body = x > 130 && x < 470 && y > 60 && y < 600
    let rgb = [30, 30, 30]
    if (body) {
      const s = 0.93 + 0.07 * Math.sin(x * 0.04 + Math.sin(y * 0.03) * 2)
      const n = (rnd() - 0.5) * 2
      rgb = [fabric[0] * s + n, fabric[1] * s + n, fabric[2] * s + n]
      const k = inkAt(x, y)
      let a = 0
      const put = (c, cov) => { rgb = rgb.map((v, j) => v * (1 - cov) + c[j] * cov); a = Math.max(a, cov) }
      if (k.mist > 0) put([236, 228, 212], k.mist)   // pale cream mist, very close to a light tee
      if (k.dark) put([22, 26, 34], 1)
      if (k.gold) put([225, 165, 30], 1)
      alpha[p] = a
    }
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255
  }
  return { data, alpha }
}

// Ideal result for a pixel that is `a` print and (1 - a) fabric: the print's own share stays as photographed and ONLY the
// fabric share takes the new shirt colour - i.e. a*print + (1-a)*(what bare fabric becomes at that spot). The bare-fabric
// result comes from the same scene rendered without any print. error/naive = how far from that ideal we are, relative to
// simply leaving the pixel as photographed (0 = perfect, 1 = no better than not recoloring the fabric share at all).
function sceneNoPrint(fabric) {
  seed = 11
  const { data } = scene(fabric)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    const body = x > 130 && x < 470 && y > 60 && y < 600
    if (!body) continue
    const s = 0.93 + 0.07 * Math.sin(x * 0.04 + Math.sin(y * 0.03) * 2)
    const n = (rnd() - 0.5) * 2
    data[i] = fabric[0] * s + n; data[i + 1] = fabric[1] * s + n; data[i + 2] = fabric[2] * s + n
  }
  return data
}

let failures = 0
for (const [label, fabric, hint] of [['white tee', [243, 241, 238], '#f3f1ee'], ['light grey tee', [214, 214, 216], '#d6d6d8']]) {
  for (const target of ['#e79ab0', '#1f7a8c', '#202020']) {
    seed = 11
    const { data, alpha } = scene(fabric)
    const mask = new Uint8Array(W * H)
    for (let p = 0; p < W * H; p++) mask[p] = data[p * 4] !== 30 || data[p * 4 + 1] !== 30 ? 255 : 0
    const prep = prepareGarment({ width: W, height: H, data }, { fabricHint: hint, mask })
    assert.ok(prep.ok, label + ' prepare failed: ' + prep.reason)
    const out = renderRecolor(prep, target)

    const clean = sceneNoPrint(fabric)
    const cleanPrep = prepareGarment({ width: W, height: H, data: clean }, { fabricHint: hint, mask })
    const cleanOut = renderRecolor(cleanPrep, target)

    let solid = 0, solidMoved = 0, feather = 0, errSum = 0, naiveSum = 0
    const PALE = [236, 228, 212]
    for (let p = 0; p < W * H; p++) {
      const a = alpha[p], i = p * 4
      if (a >= 0.97) {
        solid++
        if (Math.abs(out[i] - data[i]) + Math.abs(out[i + 1] - data[i + 1]) + Math.abs(out[i + 2] - data[i + 2]) > 6) solidMoved++
      } else if (a > 0.15 && data[i] !== 30) {
        feather++
        for (let j = 0; j < 3; j++) {
          const ideal = a * PALE[j] + (1 - a) * cleanOut[i + j]
          errSum += Math.abs(out[i + j] - ideal)
          naiveSum += Math.abs(data[i + j] - ideal)
        }
      }
    }
    const solidPct = (100 * solidMoved) / solid
    const ratio = errSum / Math.max(1, naiveSum)
    // original code scored 146-156% here (worse than not recoloring); a pale print only ~7 Lab units off the tee colour cannot be separated perfectly by colour alone
    const ok = solidPct < 1 && ratio < 0.6
    if (!ok) failures++
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${label} -> ${target}: solid print moved ${solidPct.toFixed(2)}% | feathered edge error vs ideal ${(100 * ratio).toFixed(0)}% of "not recolored at all"`)
  }
}
if (failures) { console.error(`${failures} case(s) failed`); process.exit(1) }
console.log('garmentRecolor feathered-print self-test passed')

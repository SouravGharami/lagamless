// Run: node src/lib/garmentRecolor/selfTestWrongHint.mjs
// Real-world case: the admin's FIRST colour swatch ("red") is not the colour of the shirt in the photos (a BLACK tee
// with a big red/gold/silver print, on a beige card inside an off-white frame). The swatch used to be taken as "the
// shirt colour", so the red PRINT was recolored while the black fabric stayed black.
import assert from 'node:assert/strict'
import { prepareGarment, renderRecolor } from './core.js'

const W = 700, H = 760
let seed = 5
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

/** truth: 1 fabric, 2 print, 0 backdrop (frame + card + soft shadow) */
function scene(view) {
  const data = new Uint8ClampedArray(W * H * 4)
  const truth = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    let rgb = [239, 237, 230] // off-white frame
    let t = 0
    if (x > 40 && x < W - 40 && y > 40 && y < H - 40) rgb = [221 - y * 0.02, 211 - y * 0.02, 193 - y * 0.02] // beige card
    const body = x > 190 && x < 510 && y > 170 && y < 640
    const sleeveL = x > 100 && x <= 190 && y > 170 && y < 330 && y < 170 + (190 - x) * 1.2 + 90
    const sleeveR = x >= 510 && x < 600 && y > 170 && y < 330 && y < 170 + (x - 510) * 1.2 + 90
    const neck = (x - 350) ** 2 + (y - 170) ** 2 < 55 ** 2
    const shadow = x > 180 && x < 520 && y >= 640 && y < 665
    if (shadow) { rgb = [rgb[0] * 0.6, rgb[1] * 0.6, rgb[2] * 0.6] }
    if ((body || sleeveL || sleeveR) && !neck) {
      const s = 0.55 + 0.45 * Math.abs(Math.sin(x * 0.05 + Math.sin(y * 0.03) * 2)) * Math.cos(y * 0.01)
      const v = Math.max(8, 30 * s + (rnd() - 0.5) * 3)
      rgb = [v, v, v + 1]; t = 1
      if (view === 'front') {
        // big red mandala + gold trident + silver ring: more than half of the chest
        const d = Math.hypot(x - 350, (y - 400) * 1.05)
        if (d < 125) { rgb = [185 - d * 0.2, 25, 35]; t = 2 }
        if (d > 100 && d < 112) { rgb = [190, 190, 195]; t = 2 }
        if (Math.abs(x - 350) < 12 && y > 250 && y < 560) { rgb = [200, 200, 205]; t = 2 }
      } else if (view === 'gold') {
        if (Math.hypot(x - 350, y - 380) < 120) { rgb = [212, 160, 40]; t = 2 }
      } else if (view === 'back') {
        if (Math.hypot(x - 250, y - 330) < 22) { rgb = [40, 90, 200]; t = 2 }
      }
    }
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; truth[p] = t
  }
  return { data, truth }
}

const RED = '#6e2320' // the admin's swatch #1, NOT the shirt colour
let failures = 0
for (const view of ['front', 'gold', 'back']) {
  seed = 5
  const { data, truth } = scene(view)
  const prep = prepareGarment({ width: W, height: H, data }, { fabricHint: process.env.NOHINT ? null : RED })
  if (!prep.ok) { console.log(view, 'prepare failed:', prep.reason); failures++; continue }
  const out = renderRecolor(prep, '#0a5560')
  const n = [0, 0, 0], c = [0, 0, 0]
  for (let p = 0; p < W * H; p++) {
    n[truth[p]]++
    if (out[p * 4] !== data[p * 4] || out[p * 4 + 1] !== data[p * 4 + 1] || out[p * 4 + 2] !== data[p * 4 + 2]) c[truth[p]]++
  }
  const pct = (k) => (100 * c[k]) / n[k]
  console.log(`${view}: fabric ${pct(1).toFixed(1)}% | print ${pct(2).toFixed(1)}% | backdrop ${pct(0).toFixed(1)}%  (detected fabric ${prep.fabricHex})`)
  if (!(pct(1) > 90 && pct(2) < 1 && pct(0) < 1)) failures++
}
assert.equal(failures, 0, 'a wrong colour hint must never make the print the "fabric"')
console.log('wrong-hint self-test passed')

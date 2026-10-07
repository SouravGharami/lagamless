// Run: node src/lib/garmentRecolor/selfTestDarkTeeTouchesEdges.mjs
// Real-world case (product photo of a back view): a BLACK tee on a beige card whose sleeves and shoulders touch the photo's
// left/right/top edges, with a big WHITE cape print. The border sample then contains lots of black, which used to be taken
// for backdrop: the black fabric was flooded away and only the cape was recoloured. Second scene: a light tee with a dark
// FLOOR band along the bottom edge must keep working as before (the floor is backdrop, not a garment).
import assert from 'node:assert/strict'
import { prepareGarment, renderRecolor } from './core.js'

const W = 600, H = 600
let seed = 11
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

function blackTeeScene() {
  const data = new Uint8ClampedArray(W * H * 4)
  const truth = new Uint8Array(W * H) // 1 fabric, 2 print, 0 backdrop
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    let rgb = [212 - y * 0.03, 200 - y * 0.03, 182 - y * 0.03], t = 0
    // shoulders reach the TOP edge, sleeves reach LEFT and RIGHT edges, body ends above the bottom
    const body = x > 130 && x < 470 && y >= 0 && y < 520
    const sleeveL = x >= 0 && x <= 130 && y < 260 && y > 20 + (130 - x) * 0.25
    const sleeveR = x >= 470 && x < W && y < 260 && y > 20 + (x - 470) * 0.25
    if (body || sleeveL || sleeveR) {
      const s = 0.5 + 0.5 * Math.abs(Math.sin(x * 0.04 + Math.sin(y * 0.03) * 2))
      const v = Math.max(3, 9 * s + (rnd() - 0.5) * 2.5)
      rgb = [v, v, v + 0.5]; t = 1
      const cx = 300, cy = 250
      if (Math.abs(x - cx) + (y - cy) * 0.8 < 120 && y > 90 && y < 400 && Math.abs(x - cx) < 110) { const g = 235 + rnd() * 15; rgb = [g, g, g - 6]; t = 2 }
      if (Math.hypot(x - 300, y - 150) < 28) { rgb = [225, 165, 30]; t = 2 }
    }
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; truth[p] = t
  }
  return { data, truth }
}

function lightTeeWithFloorScene() {
  const data = new Uint8ClampedArray(W * H * 4)
  const truth = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    let rgb = y > 480 ? [38, 36, 35] : [226, 224, 220], t = 0 // dark floor band = the bottom 20% of the photo
    const body = x > 170 && x < 430 && y > 110 && y < 470
    const sleeveL = x > 100 && x <= 170 && y > 110 && y < 230 && y < 110 + (170 - x) * 1.1 + 60
    const sleeveR = x >= 430 && x < 500 && y > 110 && y < 230 && y < 110 + (x - 430) * 1.1 + 60
    if (body || sleeveL || sleeveR) {
      const s = 0.8 + 0.2 * Math.sin(x * 0.05 + y * 0.02)
      const v = 190 * s + (rnd() - 0.5) * 3
      rgb = [v, v - 12, v - 34]; t = 1
      if (Math.hypot(x - 300, y - 270) < 60) { rgb = [190, 30, 40]; t = 2 }
    }
    data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255; truth[p] = t
  }
  return { data, truth }
}

let failures = 0
for (const [name, build, hint] of [['black tee, edges touched', blackTeeScene, '#ffffff'], ['black tee, edges touched (no hint)', blackTeeScene, null], ['light tee + dark floor', lightTeeWithFloorScene, null]]) {
  seed = 11
  const { data, truth } = build()
  const prep = prepareGarment({ width: W, height: H, data }, { fabricHint: hint })
  if (!prep.ok) { console.log(`FAIL ${name}: prepare failed (${prep.reason})`); failures++; continue }
  const out = renderRecolor(prep, '#0a5560')
  const n = [0, 0, 0], c = [0, 0, 0]
  for (let p = 0; p < W * H; p++) {
    n[truth[p]]++
    if (out[p * 4] !== data[p * 4] || out[p * 4 + 1] !== data[p * 4 + 1] || out[p * 4 + 2] !== data[p * 4 + 2]) c[truth[p]]++
  }
  const pct = (k) => (100 * c[k]) / n[k]
  const ok = pct(1) > 90 && pct(2) < 1 && pct(0) < 1
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: fabric ${pct(1).toFixed(1)}% | print ${pct(2).toFixed(1)}% | backdrop ${pct(0).toFixed(1)}%  (detected fabric ${prep.fabricHex})`)
}
assert.equal(failures, 0)
console.log('dark-tee-touches-edges self-test passed')

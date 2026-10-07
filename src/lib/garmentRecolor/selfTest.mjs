// Run: node src/lib/garmentRecolor/selfTest.mjs
import assert from 'node:assert/strict'
import { prepareGarment, renderRecolor, hexToLab, hexToRgb } from './core.js'
import { toLab } from '../../admin/components/mockup-v2/garment-detection/detectGarment.js'

const W = 900, H = 900
let seed = 12345
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

/** Synthetic studio photo. truth: 0 background, 1 fabric, 2 print. Shading is multiplicative (like real light). */
function scene(shirt, { prints = true, bg = 232 } = {}) {
  const data = new Uint8ClampedArray(W * H * 4)
  const truth = new Uint8Array(W * H)
  const [sr, sg, sb] = hexToRgb(shirt)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x, i = p * 4
    // body 250..650 x 200..800, sleeves as wedges
    const body = x >= 250 && x < 650 && y >= 200 && y < 800
    const sleeveL = x >= 130 && x < 250 && y >= 200 && y < 200 + (250 - x) * 1.1 + 150 && y < 420
    const sleeveR = x >= 650 && x < 770 && y >= 200 && y < 200 + (x - 650) * 1.1 + 150 && y < 420
    const inShirt = body || sleeveL || sleeveR
    let r, g, b
    if (!inShirt) {
      const v = bg - y * 0.02 + x * 0.01
      r = g = b = v
      truth[p] = 0
    } else {
      const folds = 0.78 + 0.22 * Math.sin(x * 0.045 + Math.sin(y * 0.02) * 2.5) * Math.cos(y * 0.03) + 0.05 * Math.sin(y * 0.11)
      const tex = 1 + (rnd() - 0.5) * 0.06 + 0.025 * Math.sin((x + y) * 1.7)
      const s = Math.max(0.25, Math.min(1.15, folds * tex))
      // multiplicative shading in linear light
      const lin = (c) => Math.pow(c / 255, 2.2) * s
      const enc = (c) => Math.round(255 * Math.pow(Math.min(1, c), 1 / 2.2))
      r = enc(lin(sr)); g = enc(lin(sg)); b = enc(lin(sb))
      truth[p] = 1
      if (prints) {
        const dx = x - 450, dy = y - 430
        if (dx * dx + dy * dy < 70 * 70) { r = 200 * (0.8 + 0.2 * Math.sin(x * 0.1)); g = 30; b = 40; truth[p] = 2 }          // red logo
        else if (x > 360 && x < 540 && y > 540 && y < 575) { if (sr > 200) { r = 30; g = 90; b = 200 } else { r = g = b = 246 }; truth[p] = 2 }                                    // white bar
        else if (x > 330 && x < 570 && y > 610 && y < 613) { r = g = b = 12; truth[p] = 2 }                                      // thin black line
      }
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255
  }
  return { data, truth }
}

function lStar(data, p) {
  return toLab(data.subarray(p * 4, p * 4 + 4), 1)[0]
}
function corr(a, b) {
  const n = a.length
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n
  let sab = 0, sa = 0, sb = 0
  for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2 }
  return sab / Math.sqrt(sa * sb)
}
const median = (arr) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

function check(shirt, targets, opts) {
  const { data, truth } = scene(shirt, opts)
  let t0 = performance.now()
  const prep = prepareGarment({ width: W, height: H, data })
  const prepMs = performance.now() - t0
  assert.ok(prep.ok, `prepare failed for ${shirt}: ${prep.reason}`)

  // distance-to-shirt >= 6 px  => "far background"; print core = truth 2 eroded by 3px
  const near = (x, y, r, test) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; if (test(truth[yy * W + xx])) return true } return false }

  for (const hex of targets) {
    t0 = performance.now()
    const out = renderRecolor(prep, hex)
    const renderMs = performance.now() - t0

    let bgDiff = 0, bgCount = 0, printDiff = 0, printCount = 0, speck = 0, fabCount = 0
    const lo = [], lr = [], rs = [], gs = [], bs = []
    for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
      const p = y * W + x, i = p * 4
      const same = out[i] === data[i] && out[i + 1] === data[i + 1] && out[i + 2] === data[i + 2]
      if (truth[p] === 0 && !near(x, y, 6, (t) => t !== 0)) { bgCount++; if (!same) bgDiff++ }
      else if (truth[p] === 2 && !near(x, y, 3, (t) => t !== 2)) { printCount++; if (!same) printDiff++ }
      else if (truth[p] === 1 && !near(x, y, 4, (t) => t !== 1)) {
        fabCount++
        if (prep.weight[p] < 250) speck++
        if ((x + y) % 7 === 0) { lo.push(lStar(data, p)); lr.push(lStar(out, p)) }
        rs.push(out[i]); gs.push(out[i + 1]); bs.push(out[i + 2])
      }
    }
    const [tr, tg, tb] = hexToRgb(hex)
    const got = [median(rs), median(gs), median(bs)]
    const maxErr = Math.max(Math.abs(got[0] - tr), Math.abs(got[1] - tg), Math.abs(got[2] - tb))
    const c = corr(lo, lr)
    console.log(`${shirt} -> ${hex}: median ${got.map(Math.round)} (err ${maxErr.toFixed(1)}), texture corr ${c.toFixed(3)}, bg changed ${bgDiff}/${bgCount}, print changed ${printDiff}/${printCount}, fabric speckle ${(100 * speck / fabCount).toFixed(2)}%, prepare ${prepMs.toFixed(0)}ms render ${renderMs.toFixed(0)}ms`)
    assert.equal(bgDiff, 0, 'background must be byte-identical')
    assert.ok(printDiff / Math.max(1, printCount) < 0.002, 'print must be untouched')
    assert.ok(speck / fabCount < 0.01, 'fabric must be recolored uniformly (no old-color speckle)')
    const tol = hexToLab(hex)[0] > 95 ? 16 : 8 // white is anchored just under 255 on purpose
    assert.ok(maxErr <= tol, `fabric base color should match target (err ${maxErr})`)
    assert.ok(c > 0.9, `folds/texture should be preserved (corr ${c})`)
  }
}

check('#b7ab95', ['#1e2536', '#6e2320', '#ffffff', '#111111', '#9caf88'])  // stone tee
check('#111111', ['#e8e2d3', '#2f4b9c', '#8b877e'])                         // black tee with white print
check('#ffffff', ['#1e2536', '#e79ab0'], { bg: 140 })                                  // white tee
check('#565a3f', ['#b3562f'], { prints: false })                            // plain olive tee

console.log('garmentRecolor self-test passed')

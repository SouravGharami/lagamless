// Run: node src/admin/components/mockup-v2/garment-detection/selfTestGarmentDetection.mjs [--dump <dir>]
// Synthetic product photos with a known T-shirt outline; the detected mask must overlap it (IoU) and must not
// swallow hangers, skin or background. Deterministic (seeded noise).
import { detectGarment, upsampleMaskRows } from './detectGarment.js'
import { writeFileSync, mkdirSync } from 'node:fs'

const W = 800, H = 1000
let seed = 12345
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const TEE = [[0.36, 0.20], [0.44, 0.245], [0.56, 0.245], [0.64, 0.20], [0.80, 0.26], [0.95, 0.42], [0.84, 0.50], [0.76, 0.44], [0.76, 0.97], [0.24, 0.85], [0.24, 0.44], [0.16, 0.50], [0.05, 0.42], [0.20, 0.26]]
const inPoly = (poly, x, y) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16))
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, v * k)))

function scene({ shirt, bgTop = '#e9e9e6', bgBottom = '#cfcfc9', print = true, fold = 0.12, base = 0.92, hanger = false, model = false, alpha = false, none = false }) {
  const data = new Uint8ClampedArray(W * H * 4)
  const gt = new Uint8Array(W * H)
  const t = hex(bgTop), b = hex(bgBottom), s = hex(shirt)
  const skinC = [224, 172, 140]
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = y * W + x
    let c = t.map((tv, k) => tv + (b[k] - tv) * v)
    let a = 255
    if (alpha) a = 0
    // soft drop shadow under the garment
    if (!none && v > 0.84 && v < 0.9 && u > 0.2 && u < 0.8) c = shade(c, 0.88)
    if (model) {
      const head = ((u - 0.5) / 0.1) ** 2 + ((v - 0.1) / 0.075) ** 2 < 1
      const neck = Math.abs(u - 0.5) < 0.05 && v > 0.1 && v < 0.26
      const armL = u < 0.2 && u > 0.04 && v > 0.45 && v < 0.78 && Math.abs(u - (0.17 - (v - 0.45) * 0.3)) < 0.05
      const armR = u > 0.8 && u < 0.96 && v > 0.45 && v < 0.78 && Math.abs(u - (0.83 + (v - 0.45) * 0.3)) < 0.05
      if (head || neck || armL || armR) { c = shade(skinC, 0.95 + 0.1 * Math.sin(u * 40)); a = 255 }
      if (v > 0.85 && u > 0.26 && u < 0.74) { c = [40, 48, 70]; a = 255 } // trousers
    }
    if (hanger) {
      const hook = Math.abs(u - 0.5) < 0.004 && v > 0.04 && v < 0.2
      const arm = v > 0.19 && v < 0.215 && Math.abs((v - 0.19) * 14 + 0.5 - u) < 0.006 + 0 && u > 0.5
      const arm2 = v > 0.19 && v < 0.215 && Math.abs(0.5 - (v - 0.19) * 14 - u) < 0.006 && u < 0.5
      if (hook || arm || arm2) { c = [60, 45, 35]; a = 255 }
    }
    if (!none && inPoly(TEE, u, v)) {
      gt[i] = 1
      let k = base + fold * Math.sin(u * 18 + v * 5) + 0.06 * (0.5 - v) // folds + vertical shading
      c = shade(s, k)
      a = 255
      if (print) {
        const circle = ((u - 0.5) / 0.14) ** 2 + ((v - 0.5) / 0.1) ** 2 < 1
        const block = u > 0.34 && u < 0.66 && v > 0.62 && v < 0.85 // runs OFF the hem: touches the garment edge
        if (circle) c = [250, 220, 40]
        else if (block) c = [30, 160, 90]
      }
    }
    for (let k = 0; k < 3; k++) data[i * 4 + k] = c[k] + (rnd() - 0.5) * 6
    data[i * 4 + 3] = a
  }
  return { img: { width: W, height: H, data }, gt }
}

function iou(res, gt) {
  const hi = new Uint8ClampedArray(W * 4)
  let inter = 0, uni = 0, leaked = 0
  for (let y = 0; y < H; y++) {
    upsampleMaskRows(res.mask, res.width, res.height, W, H, y, y + 1, hi)
    for (let x = 0; x < W; x++) {
      const m = hi[x * 4] >= 128 ? 1 : 0, g = gt[y * W + x]
      if (m && g) inter++
      if (m || g) uni++
      if (m && !g) leaked++
    }
  }
  return { iou: inter / uni, leaked: leaked / Math.max(1, uni) }
}

const dump = process.argv.includes('--dump') ? process.argv[process.argv.indexOf('--dump') + 1] : null
let failed = 0
function check(name, cond, detail) { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}  ${detail ?? ''}`); if (!cond) failed++ }

const cases = [
  ['flat-lay navy tee + print touching hem', { shirt: '#1f3a6e' }, 0.97],
  ['white tee on light-grey gradient', { shirt: '#ffffff', bgTop: '#cfcfca', bgBottom: '#b2b2ac', fold: 0.04, base: 0.97 }, 0.9],
  ['black tee on white', { shirt: '#161616', bgTop: '#ffffff', bgBottom: '#f0f0ee' }, 0.97],
  ['red tee with hanger', { shirt: '#b3262d', hanger: true }, 0.97],
  ['grey tee on a person (skin, trousers)', { shirt: '#8a8f98', model: true, bgTop: '#ffffff', bgBottom: '#ececec' }, 0.97],
  ['skin-toned tee (beige) flat-lay', { shirt: '#d9b48f', bgTop: '#f7f7f7', bgBottom: '#e3e3e3', fold: 0.06 }, 0.97],
  ['transparent PNG cutout', { shirt: '#2f6b4f', alpha: true }, 0.97],
]
for (const [name, opts, min] of cases) {
  const { img, gt } = scene(opts)
  const t0 = Date.now()
  const res = detectGarment(img)
  const ms = Date.now() - t0
  const r = res.ok ? iou(res, gt) : { iou: 0, leaked: 1 }
  check(name, res.ok && r.iou >= min, `IoU ${r.iou.toFixed(3)} (min ${min}) leak ${(r.leaked * 100).toFixed(1)}% ${ms}ms conf=${res.stats.level} colour=${res.stats.fabricColor}`)
  if (dump) {
    mkdirSync(dump, { recursive: true })
    const slug = name.replace(/\W+/g, '_')
    const ppm = (rgb) => Buffer.concat([Buffer.from(`P6 ${W} ${H} 255\n`), Buffer.from(rgb)])
    const photo = new Uint8Array(W * H * 3), out = new Uint8Array(W * H * 3), hi = new Uint8ClampedArray(W * 4)
    for (let y = 0; y < H; y++) {
      upsampleMaskRows(res.mask, res.width, res.height, W, H, y, y + 1, hi)
      for (let x = 0; x < W; x++) {
        const i = y * W + x, m = hi[x * 4] / 255
        for (let k = 0; k < 3; k++) { photo[i * 3 + k] = img.data[i * 4 + k]; out[i * 3 + k] = img.data[i * 4 + k] * (1 - 0.55 * m) + (k === 1 ? 255 : 0) * 0.55 * m }
      }
    }
    writeFileSync(`${dump}/${slug}.ppm`, ppm(out))
  }
}

// no garment in the photo -> structured "not found", never a fake mask
{
  const { img } = scene({ shirt: '#000000', none: true })
  const res = detectGarment(img)
  check('plain backdrop reports no garment', !res.ok && res.status === 'no_garment' && res.stats.coverage === 0, `status=${res.status} ${res.stats.warnings[0] ?? ''}`)
}
// determinism
{
  const { img } = scene({ shirt: '#1f3a6e' })
  const a = detectGarment(img), b = detectGarment(img)
  check('deterministic', a.mask.every((v, i) => v === b.mask[i]))
}
// full-size mask is exactly the photo's size and strictly black/white-ish opaque
{
  const out = new Uint8ClampedArray(W * 4)
  upsampleMaskRows(new Uint8Array(4).fill(255), 2, 2, W, 2, 0, 1, out)
  check('upsample writes opaque white', out[0] === 255 && out[3] === 255 && out[W * 4 - 1] === 255)
}
console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED')
process.exit(failed ? 1 : 0)

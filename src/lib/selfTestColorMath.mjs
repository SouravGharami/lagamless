// Run: node src/lib/selfTestColorMath.mjs
import assert from 'node:assert/strict'
import { hexToHsv, hsvToHex, normalizeHex } from './colorMath.js'

assert.equal(normalizeHex('#ABC'), '#aabbcc')
assert.equal(normalizeHex('zzz'), null)
for (const hex of ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#b7ab95', '#565a3f', '#1e2536', '#6e2320', '#e8e2d3']) {
  const { h, s, v } = hexToHsv(hex)
  assert.equal(hsvToHex(h, s, v), hex, `round trip ${hex}`)
}
// every 17th step across the cube round-trips exactly
for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 17) for (let b = 0; b < 256; b += 17) {
  const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')
  const { h, s, v } = hexToHsv(hex)
  assert.equal(hsvToHex(h, s, v), hex)
}
console.log('colorMath ok')

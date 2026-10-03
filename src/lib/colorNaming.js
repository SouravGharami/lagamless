/**
 * Admin-side color tooling (Part 12 follow-up):
 *
 *  1. resolveColorName(text)  — as the admin types a color name into the
 *     Colors fieldset, work out what hex that name actually means, so the
 *     swatch box always matches the word instead of defaulting to black
 *     until someone manually picks a shade.
 *  2. extractDominantColor(file) + nearestColorName(hex) — the "Identify a
 *     color from a photo" tool: sample a photo the admin uploads and tell
 *     them the closest matching color name and hex.
 *
 * Both directions share one reference palette (APPAREL_SWATCHES) so a name
 * typed in and a name read back off a photo agree with each other.
 */

import { COLOR_HEX as BRAND_COLOR_HEX } from './productColor.js'

/**
 * A broad, apparel-flavoured palette used for two things: as extra names
 * resolveColorName() understands beyond the CSS keyword set, and as the
 * reference points nearestColorName() picks from when reading a photo.
 * Brand words (ink, bone, stone…) come first so they win ties.
 */
const APPAREL_SWATCHES = {
  ...BRAND_COLOR_HEX,
  cream: '#f2e9d8',
  beige: '#e3d5b8',
  khaki: '#c3b091',
  tan: '#d2b48c',
  sand: '#d9c4a3',
  mustard: '#d9a441',
  rust: '#b3562f',
  brown: '#6b4423',
  coffee: '#4a3222',
  burgundy: '#5c1a2b',
  wine: '#5c1a2b',
  crimson: '#a8193a',
  scarlet: '#c4291c',
  coral: '#e8836b',
  salmon: '#f0938a',
  pink: '#e79ab0',
  magenta: '#c02c6c',
  purple: '#5b3a70',
  lavender: '#b6a4d1',
  violet: '#7f5aa2',
  indigo: '#3d3a7a',
  royalblue: '#2f4b9c',
  skyblue: '#77b6e0',
  teal: '#1f6f6a',
  turquoise: '#3bb9a8',
  mint: '#9fd8c4',
  forestgreen: '#2f5233',
  sage: '#9caf88',
  lime: '#8bc93f',
  mustardyellow: '#d9a441',
  gold: '#c9a227',
  silver: '#c4c1b8',
  ivory: '#f4f0e4',
  offwhite: '#f2f0ea',
}

/** #rrggbb from 0-255 channel values. */
function rgbToHex(r, g, b) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** [r, g, b] (0-255 each) from a #rrggbb / #rgb string, or null if invalid. */
function hexToRgb(hex) {
  const clean = hex.trim().replace(/^#/, '')
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)]
}

/**
 * Resolves any color word (or hex/rgb string) the admin types into a real
 * hex value. Tries the brand + apparel word list first (it covers the
 * brand's own vocabulary like "ink" and "stone", which aren't real CSS
 * colors), then falls back to the browser's own CSS color parser — which
 * understands all ~150 standard keywords ("red", "teal", "cornflowerblue"…)
 * plus hex/rgb/hsl strings typed directly. Returns null if nothing matches,
 * so the caller can leave the previous swatch alone rather than guessing.
 *
 * @param {string} text
 * @returns {string | null} a #rrggbb hex, or null if unrecognised
 */
export function resolveColorName(text) {
  const word = text.trim().toLowerCase().replace(/[\s-]+/g, '')
  if (!word) return null

  if (APPAREL_SWATCHES[word]) return APPAREL_SWATCHES[word]

  // Browser-native CSS color parsing covers every standard keyword and
  // any hex/rgb()/hsl() string, without us hand-maintaining that list.
  if (typeof document === 'undefined') return null
  const probe = document.createElement('div')
  probe.style.color = ''
  probe.style.color = text.trim()
  if (!probe.style.color) return null // invalid CSS color — left unset
  document.body.appendChild(probe)
  const computed = getComputedStyle(probe).color
  document.body.removeChild(probe)
  const match = computed.match(/\d+(\.\d+)?/g)
  if (!match || match.length < 3) return null
  const [r, g, b] = match.map(Number)
  return rgbToHex(r, g, b)
}

/**
 * Given a hex color (e.g. read off a photo), finds the closest name in the
 * reference palette by plain Euclidean distance in RGB space. Good enough
 * for "what would a shopper call this" — not a scientific color-matching
 * algorithm.
 *
 * @param {string} hex
 * @returns {string} the nearest color name, Title Cased
 */
export function nearestColorName(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return 'Unknown'
  let bestName = 'Unknown'
  let bestDistance = Infinity
  for (const [name, swatchHex] of Object.entries(APPAREL_SWATCHES)) {
    const swatchRgb = hexToRgb(swatchHex)
    if (!swatchRgb) continue
    const distance =
      (rgb[0] - swatchRgb[0]) ** 2 + (rgb[1] - swatchRgb[1]) ** 2 + (rgb[2] - swatchRgb[2]) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      bestName = name
    }
  }
  return bestName.replace(/^./, (c) => c.toUpperCase())
}

/**
 * Reads an uploaded photo and returns its dominant color as a hex string.
 * Heuristic, not true image segmentation: assumes typical product
 * photography (garment roughly centered, filling most of the frame), so it
 * downsamples the image and averages a center crop — which skips a plain
 * or blurred background sitting at the photo's edges far more often than
 * it doesn't.
 *
 * @param {File} file
 * @returns {Promise<string>} a #rrggbb hex
 */
export function extractDominantColor(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      try {
        const size = 120
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, size, size)

        // Center 50% crop — where the garment usually sits.
        const cropStart = Math.round(size * 0.25)
        const cropSize = Math.round(size * 0.5)
        const { data } = ctx.getImageData(cropStart, cropStart, cropSize, cropSize)

        let r = 0
        let g = 0
        let b = 0
        let count = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue // skip transparent pixels
          r += data[i]
          g += data[i + 1]
          b += data[i + 2]
          count += 1
        }

        URL.revokeObjectURL(url)
        if (count === 0) {
          reject(new Error('Could not read any pixels from that image.'))
          return
        }
        resolve(rgbToHex(r / count, g / count, b / count))
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not load that image.'))
    }

    img.src = url
  })
}

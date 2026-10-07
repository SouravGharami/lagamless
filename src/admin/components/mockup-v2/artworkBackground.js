import { removeBackground } from '../../lib/backgroundStudio.js'

/**
 * Background removal for DTF ARTWORK (the T-shirt has its own, separate remover).
 *
 * Both methods read the untouched upload and return a NEW transparent PNG as a blob: URL. The original file is never
 * modified, and nothing is stored in localStorage.
 *
 *  - cutoutArtworkAI(): the same in-browser matting model the T-shirt uses. Best for photos, people, objects.
 *  - cutoutSolidBackground(): exact colour keying for artwork drawn on a flat backdrop (white paper, black, a brand
 *    colour) — ink illustrations, splatters, logos, text. It keeps every fine detail the AI model tends to drop.
 */

// Largest side we will rasterise for colour keying. Bigger uploads are scaled down to this to protect browser memory.
const MAX_KEY_SIDE = 8192

export const SOLID_DEFAULTS = { tolerance: 25, keepInner: false, color: null }

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new Error('The artwork decoded with no readable dimensions.')))
    img.onerror = () => reject(new Error('The artwork could not be decoded.'))
    img.src = url
  })
}

function canvasToBlobUrl(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('Could not encode the result.'))), 'image/png')
  })
}

/** AI cut-out of the foreground subject. */
export async function cutoutArtworkAI(url, onProgress) {
  const dataUrl = await removeBackground(url, onProgress)
  const blob = await (await fetch(dataUrl)).blob()
  return URL.createObjectURL(blob)
}

/** Most common colour along the image border (so a stray pixel or a logo touching an edge doesn't fool it). */
function dominantBorderColour(data, w, h) {
  const buckets = new Map()
  let transparent = 0
  let total = 0
  const take = (x, y) => {
    const i = (y * w + x) * 4
    total += 1
    if (data[i + 3] < 200) {
      transparent += 1
      return
    }
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4)
    const b = buckets.get(key)
    if (b) {
      b.n += 1
      b.r += data[i]
      b.g += data[i + 1]
      b.b += data[i + 2]
    } else {
      buckets.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] })
    }
  }
  const stepX = Math.max(1, Math.floor(w / 2000))
  const stepY = Math.max(1, Math.floor(h / 2000))
  for (let x = 0; x < w; x += stepX) {
    take(x, 0)
    take(x, h - 1)
  }
  for (let y = 0; y < h; y += stepY) {
    take(0, y)
    take(w - 1, y)
  }
  if (transparent / total > 0.5) return null // already transparent
  let best = null
  buckets.forEach((b) => {
    if (!best || b.n > best.n) best = b
  })
  if (!best) return null
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n }
}

/**
 * Removes a flat backdrop with "colour to transparent" (the same maths as GIMP's Color to Alpha), not a hard colour cut.
 *
 * Every pixel is treated as artwork ink mixed with the backdrop colour. Its transparency is how far it is from the
 * backdrop; its colour is un-mixed so the ink keeps its true colour. Consequences:
 *   - fine splatter, hairlines and anti-aliased edges survive at the right softness (no jagged cut, no halo);
 *   - paper-white pockets INSIDE the design (between splatters, inside letters) become transparent too;
 *   - off-white haze / JPEG noise is cleaned by the tolerance.
 *
 *  tolerance 0..100  cleans faint backdrop haze. Higher = cleaner background but light/faint parts of the art fade.
 *  keepInner         true: backdrop that is NOT connected to the image edge (white inside the design) stays opaque.
 *  color             '#rrggbb' to force the backdrop colour; null = detect it from the image border.
 */
export async function cutoutSolidBackground(url, { tolerance = SOLID_DEFAULTS.tolerance, keepInner = SOLID_DEFAULTS.keepInner, color = null } = {}) {
  const img = await loadImage(url)
  const scale = Math.min(1, MAX_KEY_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h)
  const data = image.data

  let bg = null
  if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
    bg = { r: parseInt(color.slice(1, 3), 16), g: parseInt(color.slice(3, 5), 16), b: parseInt(color.slice(5, 7), 16) }
  } else {
    bg = dominantBorderColour(data, w, h)
  }
  if (!bg) throw new Error('This artwork already has a transparent background.')
  // Snap near-white / near-black backdrops to the extreme (a 254 "white" must not turn pure 255 into full ink), round the rest.
  const B = [bg.r, bg.g, bg.b].map((v) => (v >= 249 ? 255 : v <= 6 ? 0 : Math.round(v)))

  // Raw "how much artwork is here" per pixel, 0..1 (max over channels).
  const raw = new Float32Array(w * h)
  for (let p = 0, i = 0; p < raw.length; p += 1, i += 4) {
    let a = 0
    for (let c = 0; c < 3; c += 1) {
      const v = data[i + c]
      const b = B[c]
      // Headroom is floored at 40 so a pixel marginally beyond a mid-tone backdrop is not mistaken for full-strength ink.
      const ac = v < b ? (b > 0 ? (b - v) / Math.max(b, 40) : 0) : v > b ? (b < 255 ? (v - b) / Math.max(255 - b, 40) : 0) : 0
      if (ac > a) a = ac > 1 ? 1 : ac
    }
    raw[p] = a * (data[i + 3] / 255)
  }

  // Optional: only treat the backdrop connected to the image edge (plus a thin rim) as removable.
  let removable = null
  if (keepInner) {
    const limit = 0.12 + (Math.min(100, Math.max(0, tolerance)) / 100) * 0.3
    const region = new Uint8Array(w * h)
    const stack = new Int32Array(w * h)
    let top = 0
    const seed = (p) => {
      if (!region[p] && raw[p] <= limit) {
        region[p] = 1
        stack[top++] = p
      }
    }
    for (let x = 0; x < w; x += 1) {
      seed(x)
      seed((h - 1) * w + x)
    }
    for (let y = 0; y < h; y += 1) {
      seed(y * w)
      seed(y * w + w - 1)
    }
    while (top > 0) {
      const p = stack[--top]
      const x = p % w
      if (x > 0) seed(p - 1)
      if (x < w - 1) seed(p + 1)
      if (p >= w) seed(p - w)
      if (p < w * (h - 1)) seed(p + w)
    }
    // Grow by 2px so the anti-aliased rim around the design is processed as well.
    removable = region
    for (let pass = 0; pass < 2; pass += 1) {
      const grown = Uint8Array.from(removable)
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const p = y * w + x
          if (removable[p]) continue
          if ((x > 0 && removable[p - 1]) || (x < w - 1 && removable[p + 1]) || (y > 0 && removable[p - w]) || (y < h - 1 && removable[p + w])) grown[p] = 1
        }
      }
      removable = grown
    }
  }

  // Raw strength below `floor` is backdrop haze (removed). Strength from `floor` up to KNEE ramps in; anything at or above
  // KNEE is solid artwork and keeps its ORIGINAL colour fully opaque (so strong colours and dark inks never turn translucent).
  const KNEE = 0.85
  const floor = Math.min(0.4, (Math.min(100, Math.max(0, tolerance)) / 100) * 0.4)
  const stretch = 1 / (KNEE - floor)
  for (let p = 0, i = 0; p < raw.length; p += 1, i += 4) {
    if (removable && !removable[p]) continue // protected inner area: untouched, fully opaque artwork pixel
    const a = raw[p]
    let out = (a - floor) * stretch
    out = out <= 0 ? 0 : out >= 1 ? 1 : out
    if (out === 0) {
      data[i + 3] = 0
      continue
    }
    if (out < 1) {
      for (let c = 0; c < 3; c += 1) {
        const v = (data[i + c] - B[c]) / out + B[c] // un-mix the backdrop so the edge keeps the ink's own colour
        data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v
      }
    }
    data[i + 3] = Math.round(out * 255)
  }

  ctx.putImageData(image, 0, 0)
  const out = await canvasToBlobUrl(canvas)
  canvas.width = 0
  canvas.height = 0
  return out
}

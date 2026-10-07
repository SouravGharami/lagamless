/**
 * Detects flat light "padding" baked into a photo's edges (white / cream bars left by an
 * export or upload tool) and reports how much of each side to crop away. Display-only:
 * the stored file is never touched, so existing uploads are fixed automatically.
 *
 * Returns fractions { top, right, bottom, left } (0..0.4) or null when there is nothing to
 * trim, the image can't be read (cross-origin without CORS) or is not a flat-margin photo.
 */
const cache = new Map() // src -> Promise<inset|null>
const SAMPLE = 160 // longest side the image is analysed at

function isLight(r, g, b) {
  return r > 225 && g > 222 && b > 210 && Math.max(r, g, b) - Math.min(r, g, b) < 28
}

export function detectMargins(src) {
  if (!src) return Promise.resolve(null)
  if (cache.has(src)) return cache.get(src)
  const p = new Promise((resolve) => {
    const img = new Image()
    if (!src.startsWith('data:') && !src.startsWith('blob:')) img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const scale = SAMPLE / Math.max(img.naturalWidth, img.naturalHeight)
        const w = Math.max(8, Math.round(img.naturalWidth * scale))
        const h = Math.max(8, Math.round(img.naturalHeight * scale))
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)
        const px = (x, y) => {
          const i = (y * w + x) * 4
          // transparent counts as margin too
          return data[i + 3] < 20 || isLight(data[i], data[i + 1], data[i + 2])
        }
        // a row/column is margin when >=98% of its pixels are light/transparent
        const rowBlank = (y) => {
          let n = 0
          for (let x = 0; x < w; x++) if (px(x, y)) n++
          return n / w >= 0.98
        }
        const colBlank = (x) => {
          let n = 0
          for (let y = 0; y < h; y++) if (px(x, y)) n++
          return n / h >= 0.98
        }
        let top = 0, bottom = 0, left = 0, right = 0
        while (top < h * 0.4 && rowBlank(top)) top++
        while (bottom < h * 0.4 && rowBlank(h - 1 - bottom)) bottom++
        while (left < w * 0.4 && colBlank(left)) left++
        while (right < w * 0.4 && colBlank(w - 1 - right)) right++
        const inset = { top: top / h, bottom: bottom / h, left: left / w, right: right / w }
        // ignore trivial margins (JPEG fuzz) and fully light images (a white product on white is not "margin")
        const total = inset.top + inset.bottom + inset.left + inset.right
        if (total < 0.04 || top + bottom >= h * 0.8 || left + right >= w * 0.8) return resolve(null)
        // keep a hair of breathing room so edges aren't clipped
        const pad = 0.004
        resolve({
          top: Math.max(0, inset.top - pad),
          bottom: Math.max(0, inset.bottom - pad),
          left: Math.max(0, inset.left - pad),
          right: Math.max(0, inset.right - pad),
        })
      } catch {
        resolve(null) // tainted canvas etc. — show the photo as-is
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
  cache.set(src, p)
  return p
}

export function insetToViewBox(inset) {
  const f = (n) => `${(n * 100).toFixed(2)}%`
  return `inset(${f(inset.top)} ${f(inset.right)} ${f(inset.bottom)} ${f(inset.left)})`
}

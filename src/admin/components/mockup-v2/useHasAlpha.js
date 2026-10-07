import { useEffect, useState } from 'react'

/**
 * True when the image has real transparency (used to decide whether a soft
 * shadow makes sense — an opaque photo would just get a rectangular shadow).
 * Samples a 32x32 thumbnail once per URL; no upload, no persistent work.
 */
export function useHasAlpha(url) {
  const [result, setResult] = useState({ url: null, alpha: false })
  useEffect(() => {
    if (!url) return undefined
    let live = true
    const img = new Image()
    img.onload = () => {
      if (!live) return
      let alpha = false
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 32
        canvas.height = 32
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, 32, 32)
        const data = ctx.getImageData(0, 0, 32, 32).data
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 250) {
            alpha = true
            break
          }
        }
      } catch {
        alpha = false
      }
      setResult({ url, alpha })
    }
    img.src = url
    return () => {
      live = false
    }
  }, [url])
  return result.url === url && result.alpha
}

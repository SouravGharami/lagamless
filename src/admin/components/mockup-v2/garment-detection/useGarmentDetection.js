import { useCallback, useEffect, useRef, useState } from 'react'
import { detectGarment } from './detectGarment.js'
import { decodePhotoForDetection } from './garmentMaskIO.js'

const CACHE_LIMIT = 8
// Results are cached per photo (+ sensitivity) so switching views/tabs never re-runs detection, and a result
// belongs to ONE uploaded photo: a new upload has a new id, hence a new detection.
const cache = new Map()
const remember = (key, value) => {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value)
}
const IDLE = Object.freeze({ status: 'idle', photo: null, result: null, error: null })

/**
 * Runs automatic garment detection on the current T-shirt's ORIGINAL upload whenever a new photo arrives (and again
 * on request / when the sensitivity changes). Pure read: it never touches the studio state.
 *
 * @returns {{ status: 'idle'|'detecting'|'ready'|'failed', photo, result, error, sensitivity, setSensitivity, rerun }}
 */
export function useGarmentDetection(tshirt) {
  const [sensitivity, setSensitivity] = useState('normal')
  const [state, setState] = useState(IDLE)
  const [nonce, setNonce] = useState(0)
  const forceRef = useRef(false)

  const id = tshirt?.id ?? null
  const url = tshirt?.originalUrl ?? null

  useEffect(() => {
    if (!id || !url) {
      setState(IDLE)
      return undefined
    }
    const key = `${id}|${sensitivity}`
    if (forceRef.current) { cache.delete(key); forceRef.current = false }
    const hit = cache.get(key)
    if (hit) {
      setState({ status: 'ready', ...hit, error: null })
      return undefined
    }
    let cancelled = false
    setState({ status: 'detecting', photo: null, result: null, error: null })
    // let the "Detecting…" state paint before the (synchronous) pixel work starts
    const timer = setTimeout(async () => {
      try {
        const photo = await decodePhotoForDetection(url)
        if (cancelled) return
        const result = detectGarment(photo, { sensitivity })
        if (cancelled) return
        const value = { photo, result }
        remember(key, value)
        setState({ status: 'ready', ...value, error: null })
      } catch (err) {
        if (cancelled) return
        console.error('Garment detection failed', err)
        setState({ status: 'failed', photo: null, result: null, error: err?.message || 'Garment detection failed.' })
      }
    }, 30)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [id, url, sensitivity, nonce])

  const rerun = useCallback(() => { forceRef.current = true; setNonce((n) => n + 1) }, [])
  return { ...state, sensitivity, setSensitivity, rerun }
}

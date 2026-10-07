import { useEffect, useState } from 'react'
import { detectMargins, insetToViewBox } from '../lib/imageMargins.js'

const SUPPORTS_VIEW_BOX = typeof CSS !== 'undefined' && CSS.supports?.('object-view-box', 'inset(1%)')

/**
 * <img> that automatically crops flat white/cream margins baked into the photo file, so
 * old and new uploads both fill their frame. Same props as <img>.
 */
function TrimmedImg({ src, style, ...rest }) {
  const [state, setState] = useState({ src: null, box: null })
  useEffect(() => {
    if (!SUPPORTS_VIEW_BOX || !src) return undefined
    let cancelled = false
    detectMargins(src).then((inset) => {
      if (!cancelled) setState({ src, box: inset ? insetToViewBox(inset) : null })
    })
    return () => {
      cancelled = true
    }
  }, [src])
  const box = state.src === src ? state.box : null
  return <img src={src} style={box ? { ...style, objectViewBox: box } : style} {...rest} />
}

export default TrimmedImg

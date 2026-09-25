import { useState } from 'react'
import { ShirtIcon } from './TrackIcons.jsx'

/**
 * Product photo tile for the customer order screens. Falls back to a shirt
 * icon when there's no photo or it fails to load.
 * @param {{ src?: string | null, alt?: string, size?: 'sm' | 'md' | 'lg', className?: string }} props
 */
export default function ItemImage({ src, alt = '', size = 'md', className = '' }) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  return (
    <span className={`tk-photo tk-photo--${size} ${className}`.trim()}>
      {showImage ? (
        <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <ShirtIcon />
      )}
    </span>
  )
}

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { viewLabel } from './galleryModel.js'

/** Large read-only preview with previous/next and click-to-zoom. Never touches the mockup. */
export default function MockupPreviewDialog({ items, index, onIndex, onClose }) {
  const closeRef = useRef(null)
  const [zoom, setZoom] = useState(false)
  const item = items[index]

  useEffect(() => {
    closeRef.current?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowLeft' && index > 0) { setZoom(false); onIndex(index - 1) }
      else if (e.key === 'ArrowRight' && index < items.length - 1) { setZoom(false); onIndex(index + 1) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, items.length, onIndex, onClose])

  if (!item) return null
  const go = (i) => { setZoom(false); onIndex(i) }

  return createPortal(
    <div className="mgal-preview" role="dialog" aria-modal="true" aria-label={`${viewLabel(item.viewType)} mockup preview`} onClick={onClose}>
      <div className="mgal-preview__bar" onClick={(e) => e.stopPropagation()}>
        <span className="text-label">
          {viewLabel(item.viewType)}{item.isMain ? ' · Main' : ''}
          {item.width ? ` · ${item.width}×${item.height}` : ''}
        </span>
        <span className="mgal-preview__bar-actions">
          <button type="button" className="btn btn-secondary" onClick={() => setZoom((z) => !z)}>{zoom ? 'Fit to screen' : 'Zoom 100%'}</button>
          <button ref={closeRef} type="button" className="btn btn-secondary" onClick={onClose}>Close</button>
        </span>
      </div>
      <div className={`mgal-preview__stage${zoom ? ' is-zoom' : ''}`} onClick={(e) => e.stopPropagation()}>
        <img src={item.imageUrl} alt={`${viewLabel(item.viewType)} mockup`} onClick={() => setZoom((z) => !z)} />
      </div>
      {items.length > 1 && (
        <div className="mgal-preview__nav" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-secondary" disabled={index === 0} onClick={() => go(index - 1)}>‹ Previous</button>
          <span className="text-small">{index + 1} / {items.length}</span>
          <button type="button" className="btn btn-secondary" disabled={index === items.length - 1} onClick={() => go(index + 1)}>Next ›</button>
        </div>
      )}
    </div>,
    document.body,
  )
}

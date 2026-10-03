import { useEffect, useRef } from 'react'
import { LockIcon } from './icons.jsx'
import { backgroundLayerStyle } from './backgroundStyle.js'
import { clampPresentation, shirtBox } from './tshirtPresentation.js'
import { shirtShadow } from './compositionFrame.js'
import { RESIZE_HANDLES, moveGeometry, resizeGeometry, rotateGeometry } from './artworkTransform.js'

/**
 * Interactive composition canvas for ONE surface: the T-shirt photo with that
 * surface's visible artwork layers over it. Layer geometry is stored in % of
 * the photo box, so nothing here depends on the displayed size; pixel maths
 * happens only during a gesture, using the box's size at that moment.
 *
 * Gestures (drag / corner resize / rotate) use pointer events, so mouse,
 * trackpad and touch share one code path. Pointer moves are coalesced to one
 * state update per animation frame. This is a 2D working view — no warping.
 */
const layerBox = (layer) => ({
  left: `${layer.x}%`,
  top: `${layer.y}%`,
  width: `${layer.width}%`,
  height: `${layer.height}%`,
  transform: `rotate(${layer.rotation}deg)`,
})

export default function MockupPreview({ tshirt, layers, selectedId, previewMode, background, backgroundImage, presentation, transparent, viewScale = 1, onPresentation, onSelect, onTransform }) {
  const frameRef = useRef(null)
  const shirtRef = useRef(null)
  const endGestureRef = useRef(null)
  const endShirtDragRef = useRef(null)

  // A gesture in flight must not outlive the canvas.
  useEffect(() => () => {
    endGestureRef.current?.()
    endShirtDragRef.current?.()
  }, [])

  const showCutout = tshirt.backgroundRemoved && !!tshirt.processedUrl
  const src = showCutout ? tshirt.processedUrl : tshirt.originalUrl
  const bgStyle = backgroundLayerStyle(background, backgroundImage)
  const box = shirtBox(tshirt, presentation)
  const shadowOn = presentation.shadow && transparent
  const visible = layers.filter((layer) => layer.visible)
  const selected = previewMode ? null : visible.find((layer) => layer.id === selectedId) || null

  /** kind: 'move' | 'rotate' | 'resize' (handle = RESIZE_HANDLES entry). */
  function beginGesture(event, layer, kind, handle) {
    if (previewMode || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    onSelect(layer.id)
    if (layer.locked) return

    const rect = shirtRef.current?.getBoundingClientRect()
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return
    endGestureRef.current?.()

    const box = { W: rect.width, H: rect.height }
    const start = { x: layer.x, y: layer.y, w: layer.width, h: layer.height, rot: layer.rotation }
    const startPoint = { x: event.clientX, y: event.clientY }
    const lockRatio = layer.aspectLocked !== false
    const center = {
      x: rect.left + ((start.x + start.w / 2) / 100) * box.W,
      y: rect.top + ((start.y + start.h / 2) / 100) * box.H,
    }

    const target = event.currentTarget
    const pointerId = event.pointerId
    target.setPointerCapture?.(pointerId)

    let frame = 0
    let pending = null
    const flush = () => {
      frame = 0
      if (pending) {
        const patch = pending
        pending = null
        onTransform(layer.id, patch)
      }
    }

    const onMove = (e) => {
      if (e.pointerId !== pointerId) return
      let patch = null
      if (kind === 'move') {
        patch = moveGeometry(start, e.clientX - startPoint.x, e.clientY - startPoint.y, box)
      } else if (kind === 'rotate') {
        patch = rotateGeometry(start.rot, center, startPoint, { x: e.clientX, y: e.clientY }, e.shiftKey)
      } else {
        patch = resizeGeometry(start, handle, { x: e.clientX - rect.left, y: e.clientY - rect.top }, box, lockRatio)
      }
      if (!patch) return
      pending = patch
      if (!frame) frame = requestAnimationFrame(flush)
    }

    const end = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
      target.removeEventListener('lostpointercapture', end)
      if (frame) cancelAnimationFrame(frame)
      flush()
      try {
        target.releasePointerCapture?.(pointerId)
      } catch {
        /* already released */
      }
      endGestureRef.current = null
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
    target.addEventListener('lostpointercapture', end)
    endGestureRef.current = end
  }

  /** Mouse/pen drag of the whole T-shirt. Touch uses the sliders so scrolling still works. */
  function beginShirtDrag(event) {
    if (previewMode) return
    onSelect(null)
    if (event.pointerType === 'touch' || (event.pointerType === 'mouse' && event.button !== 0)) return
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return
    event.preventDefault()
    endShirtDragRef.current?.()

    const start = { x: presentation.x, y: presentation.y }
    const startPoint = { x: event.clientX, y: event.clientY }
    const target = event.currentTarget
    const pointerId = event.pointerId
    target.setPointerCapture?.(pointerId)

    let frame = 0
    let pending = null
    const flush = () => {
      frame = 0
      if (pending) {
        const patch = pending
        pending = null
        onPresentation(patch)
      }
    }
    const onMove = (e) => {
      if (e.pointerId !== pointerId) return
      const dx = ((e.clientX - startPoint.x) / rect.width) * 100
      const dy = ((e.clientY - startPoint.y) / rect.height) * 100
      const next = clampPresentation(tshirt, { ...presentation, x: start.x + dx, y: start.y + dy })
      pending = { x: next.x, y: next.y }
      if (!frame) frame = requestAnimationFrame(flush)
    }
    const end = () => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
      target.removeEventListener('lostpointercapture', end)
      if (frame) cancelAnimationFrame(frame)
      flush()
      try {
        target.releasePointerCapture?.(pointerId)
      } catch {
        /* already released */
      }
      endShirtDragRef.current = null
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
    target.addEventListener('lostpointercapture', end)
    endShirtDragRef.current = end
  }

  return (
    <div
      ref={frameRef}
      className={`mv2-frame${previewMode ? ' is-preview' : ''}`}
      data-composition="layers"

      onPointerDown={() => {
        if (!previewMode) onSelect(null)
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      {/* Bottom layer: background -> T-shirt -> artwork -> selection. Never intercepts pointer input. */}
      {bgStyle && <div className="mv2-bgfill" style={bgStyle} aria-hidden="true" />}
      <div
        ref={shirtRef}
        className={`mv2-shirt${previewMode ? ' is-preview' : ''}`}
        style={box}
        onPointerDown={beginShirtDrag}
      >
      <img className="mv2-shirt__img" src={src} alt={`T-shirt: ${tshirt.name}`} draggable={false} style={shadowOn ? { filter: shirtShadow(viewScale) } : undefined} />

      {visible.map((layer) => (
        <div
          key={layer.id}
          role="button"
          tabIndex={previewMode ? -1 : 0}
          aria-label={`Select ${layer.name}`}
          aria-pressed={layer.id === selectedId}
          className={`mv2-art${layer.locked ? ' is-locked' : ''}`}
          style={{ ...layerBox(layer), opacity: layer.opacity }}
          onPointerDown={(event) => beginGesture(event, layer, 'move')}
          onKeyDown={(event) => {
            if (!previewMode && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault()
              onSelect(layer.id)
            }
          }}
        >
          <img src={layer.sourceUrl} alt="" draggable={false} />
        </div>
      ))}

      {selected && (
        <div className={`mv2-sel${selected.locked ? ' is-locked' : ''}`} data-ui-only="selection" style={layerBox(selected)}>
          {selected.locked ? (
            <span className="mv2-sel__lock" title="Locked">
              <LockIcon size={12} />
            </span>
          ) : (
            <>
              <span className="mv2-sel__stem" />
              <span
                className="mv2-handle mv2-handle--rotate"
                title="Rotate (hold Shift to snap to 15°)"
                onPointerDown={(event) => beginGesture(event, selected, 'rotate')}
              />
              {RESIZE_HANDLES.map((handle) => (
                <span
                  key={handle.key}
                  className={`mv2-handle mv2-handle--${handle.key}`}
                  onPointerDown={(event) => beginGesture(event, selected, 'resize', handle)}
                />
              ))}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

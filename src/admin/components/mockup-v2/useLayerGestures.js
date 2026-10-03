import { useCallback, useEffect, useRef } from 'react'
import { moveGeometry, resizeGeometry, rotateGeometry } from './artworkTransform.js'

/** Absolutely-positioned box of a layer over the photo (geometry is stored in % of the photo box). */
export const layerBoxStyle = (layer) => ({
  left: `${layer.x}%`,
  top: `${layer.y}%`,
  width: `${layer.width}%`,
  height: `${layer.height}%`,
  transform: `rotate(${layer.rotation}deg)`,
})

/**
 * Pointer gestures (move / resize / rotate) for artwork boxes over a stage element. Same geometry and rules as the
 * working view (artworkTransform.js); pointer moves are coalesced to one onTransform per animation frame.
 * getRect() -> the stage's client rect. Returns { beginGesture(event, layer, kind, handle?) }.
 */
export function useLayerGestures({ getRect, disabled = false, onSelect, onTransform }) {
  const endRef = useRef(null)
  const live = useRef({})
  live.current = { getRect, disabled, onSelect, onTransform }

  useEffect(() => () => endRef.current?.(), [])

  const beginGesture = useCallback((event, layer, kind, handle) => {
    const { getRect: rectOf, disabled: off, onSelect: select, onTransform: transform } = live.current
    if (off || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    select?.(layer.id)
    if (layer.locked) return
    const rect = rectOf?.()
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return
    endRef.current?.()

    const box = { W: rect.width, H: rect.height }
    const start = { x: layer.x, y: layer.y, w: layer.width, h: layer.height, rot: layer.rotation }
    const startPoint = { x: event.clientX, y: event.clientY }
    const lockRatio = layer.aspectLocked !== false
    const center = { x: rect.left + ((start.x + start.w / 2) / 100) * box.W, y: rect.top + ((start.y + start.h / 2) / 100) * box.H }
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
        transform?.(layer.id, patch)
      }
    }
    const onMove = (e) => {
      if (e.pointerId !== pointerId) return
      let patch
      if (kind === 'move') patch = moveGeometry(start, e.clientX - startPoint.x, e.clientY - startPoint.y, box)
      else if (kind === 'rotate') patch = rotateGeometry(start.rot, center, startPoint, { x: e.clientX, y: e.clientY }, e.shiftKey)
      else patch = resizeGeometry(start, handle, { x: e.clientX - rect.left, y: e.clientY - rect.top }, box, lockRatio)
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
      try { target.releasePointerCapture?.(pointerId) } catch { /* already released */ }
      endRef.current = null
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
    target.addEventListener('lostpointercapture', end)
    endRef.current = end
  }, [])

  return { beginGesture }
}

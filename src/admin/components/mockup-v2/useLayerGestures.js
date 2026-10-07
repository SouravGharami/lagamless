import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { moveGeometry, resizeGeometry, rotateGeometry } from './artworkTransform.js'

/** Absolutely-positioned box of a layer over the photo (geometry is stored in % of the photo box). */
export const layerBoxStyle = (layer) => ({
  left: `${layer.x}%`,
  top: `${layer.y}%`,
  width: `${layer.width}%`,
  height: `${layer.height}%`,
  transform: `rotate(${layer.rotation}deg)`,
})

const r2 = (n) => Math.round(n * 100) / 100

/**
 * Pointer gestures (move / resize / rotate) for artwork boxes over a stage element. Same geometry and rules as the
 * working view (artworkTransform.js).
 *
 * SMOOTHNESS: when `getElements(layerId)` is given, the gesture is "live-DOM": every animation frame it writes the new
 * geometry straight onto those elements (a GPU-composited translate for moves) and does NOT touch React state. The
 * studio therefore doesn't re-render (and the heavy final-mockup compositor doesn't re-run) while the pointer is moving;
 * the finished geometry is committed ONCE when the pointer is released. Without `getElements` the old behaviour is kept:
 * one onTransform per animation frame.
 *
 * getRect() -> the stage's client rect. Returns { beginGesture(event, layer, kind, handle?) }.
 */
export function useLayerGestures({ getRect, getElements, disabled = false, onSelect, onTransform }) {
  const endRef = useRef(null)
  const live = useRef({})
  live.current = { getRect, getElements, disabled, onSelect, onTransform }

  // A gesture in flight must not outlive the canvas. Commit it without flushSync (we are inside React's unmount phase).
  useEffect(() => () => endRef.current?.(false), [])

  const beginGesture = useCallback((event, layer, kind, handle) => {
    const { getRect: rectOf, getElements: elementsOf, disabled: off, onSelect: select, onTransform: transform } = live.current
    if (off || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    event.stopPropagation()
    select?.(layer.id)
    if (layer.locked) return
    const rect = rectOf?.()
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return
    endRef.current?.(true)

    const box = { W: rect.width, H: rect.height }
    const start = { x: layer.x, y: layer.y, w: layer.width, h: layer.height, rot: layer.rotation }
    const startPoint = { x: event.clientX, y: event.clientY }
    const lockRatio = layer.aspectLocked !== false
    const center = { x: rect.left + ((start.x + start.w / 2) / 100) * box.W, y: rect.top + ((start.y + start.h / 2) / 100) * box.H }
    const target = event.currentTarget
    const pointerId = event.pointerId
    target.setPointerCapture?.(pointerId)

    const els = elementsOf ? elementsOf(layer.id).filter(Boolean) : []
    const liveDom = els.length > 0
    if (liveDom) els.forEach((el) => { el.style.willChange = kind === 'move' ? 'transform' : 'left, top, width, height, transform' })

    let frame = 0
    let latest = null // newest geometry patch from the pointer
    let ended = false

    const paint = () => {
      frame = 0
      if (!latest) return
      if (!liveDom) {
        const patch = latest
        latest = null
        transform?.(layer.id, patch)
        return
      }
      const g = { x: start.x, y: start.y, width: start.w, height: start.h, rotation: start.rot, ...latest }
      for (const el of els) {
        if (kind === 'move') {
          const dx = ((g.x - start.x) / 100) * box.W
          const dy = ((g.y - start.y) / 100) * box.H
          el.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${g.rotation}deg)`
        } else {
          el.style.left = `${g.x}%`
          el.style.top = `${g.y}%`
          el.style.width = `${g.width}%`
          el.style.height = `${g.height}%`
          el.style.transform = `rotate(${g.rotation}deg)`
        }
      }
    }

    const onMove = (e) => {
      if (e.pointerId !== pointerId) return
      let patch
      if (kind === 'move') patch = moveGeometry(start, e.clientX - startPoint.x, e.clientY - startPoint.y, box)
      else if (kind === 'rotate') patch = rotateGeometry(start.rot, center, startPoint, { x: e.clientX, y: e.clientY }, e.shiftKey)
      else patch = resizeGeometry(start, handle, { x: e.clientX - rect.left, y: e.clientY - rect.top }, box, lockRatio)
      if (!patch) return
      latest = patch
      if (!frame) frame = requestAnimationFrame(paint)
    }

    const end = (sync = true) => {
      if (ended) return
      ended = true
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onEnd)
      target.removeEventListener('pointercancel', onEnd)
      target.removeEventListener('lostpointercapture', onEnd)
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      try { target.releasePointerCapture?.(pointerId) } catch { /* already released */ }
      endRef.current = null

      if (!liveDom) {
        if (latest) transform?.(layer.id, latest)
        return
      }
      if (latest) {
        const patch = Object.fromEntries(Object.entries(latest).map(([k, v]) => [k, r2(v)]))
        if (sync) flushSync(() => transform?.(layer.id, patch))
        else transform?.(layer.id, patch)
      }
      // React has now rendered the committed geometry; drop the temporary gesture styles. (A move never changes React's
      // `transform` prop, so the translate must be removed by hand.)
      if (sync) {
        for (const el of els) {
          el.style.willChange = ''
          if (kind === 'move') el.style.transform = `rotate(${start.rot}deg)`
        }
      }
    }
    // Pointer events arrive as (event) — only an explicit `false` (unmount) skips flushSync.
    const onEnd = (e) => end(e === false ? false : true)

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onEnd)
    target.addEventListener('pointercancel', onEnd)
    target.addEventListener('lostpointercapture', onEnd)
    endRef.current = (sync) => end(sync)
  }, [])

  return { beginGesture }
}

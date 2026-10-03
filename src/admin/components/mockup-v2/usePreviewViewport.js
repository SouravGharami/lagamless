import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_VIEW,
  ZOOM_LIMITS,
  clampPan,
  frameLayout,
  isPannable,
  zoomView,
} from './compositionFrame.js'

const ZERO = { w: 0, h: 0 }
const isInteractive = (el) => !!el?.closest?.('input, textarea, select, button, a, [contenteditable="true"]')

/**
 * Step 4B — owns the preview VIEW (mode, zoom, pan, guides) and the measured stage size.
 * Purely local UI state: it is never written to the studio reducer, so nothing here can
 * reach the T-shirt, artwork or background. The view outlives nothing: it resets when the
 * studio closes, and "Reset View" restores DEFAULT_VIEW without touching the composition.
 */
export function usePreviewViewport() {
  const stageRef = useRef(null)
  const [view, setView] = useState(DEFAULT_VIEW)
  const [metrics, setMetrics] = useState({ content: ZERO, viewport: ZERO })
  const [panning, setPanning] = useState(false)
  const [spaceHeld, setSpaceHeld] = useState(false)

  // Latest values for the imperative handlers (wheel / pointer), without re-binding them every render.
  const latest = useRef({ view, metrics })
  latest.current = { view, metrics }

  // ---- measure the stage (viewport = padding box, content = viewport minus padding) ----
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const measure = () => {
      const cs = getComputedStyle(el)
      const px = (v) => parseFloat(v) || 0
      const viewport = { w: el.clientWidth, h: el.clientHeight }
      const content = {
        w: Math.max(0, viewport.w - px(cs.paddingLeft) - px(cs.paddingRight)),
        h: Math.max(0, viewport.h - px(cs.paddingTop) - px(cs.paddingBottom)),
      }
      setMetrics((prev) =>
        prev.viewport.w === viewport.w && prev.viewport.h === viewport.h && prev.content.w === content.w && prev.content.h === content.h
          ? prev
          : { content, viewport },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const layout = useMemo(() => frameLayout(view, metrics.content), [view, metrics.content])
  const pan = useMemo(() => clampPan({ x: view.panX, y: view.panY }, layout, metrics.viewport), [view.panX, view.panY, layout, metrics.viewport])
  const pannable = isPannable(layout, metrics.viewport)
  const ready = metrics.content.w > 0 && metrics.content.h > 0

  // ---- actions (all touch `view` only) ----
  const setMode = useCallback((mode) => setView((v) => ({ ...v, mode, zoom: 1, panX: 0, panY: 0 })), [])
  const zoomBy = useCallback((factor, anchor) => {
    setView((v) => zoomView(v, latest.current.metrics.content, latest.current.metrics.viewport, { factor }, anchor))
  }, [])
  const zoomTo = useCallback((zoom, anchor) => {
    setView((v) => zoomView(v, latest.current.metrics.content, latest.current.metrics.viewport, { zoom }, anchor))
  }, [])
  const resetZoom = useCallback(() => setView((v) => ({ ...v, zoom: 1, panX: 0, panY: 0 })), [])
  const toggleGuides = useCallback(() => setView((v) => ({ ...v, guides: !v.guides })), [])
  /** Reset View: preview zoom, pan, mode and guides only. */
  const resetView = useCallback(() => setView(DEFAULT_VIEW), [])
  const panBy = useCallback((dx, dy) => {
    setView((v) => {
      const { metrics: m } = latest.current
      const l = frameLayout(v, m.content)
      const cur = clampPan({ x: v.panX, y: v.panY }, l, m.viewport)
      const next = clampPan({ x: cur.x + dx, y: cur.y + dy }, l, m.viewport)
      return next.x === v.panX && next.y === v.panY ? v : { ...v, panX: next.x, panY: next.y }
    })
  }, [])

  const isDefault =
    view.mode === DEFAULT_VIEW.mode && view.zoom === DEFAULT_VIEW.zoom && view.guides === DEFAULT_VIEW.guides && pan.x === 0 && pan.y === 0

  // ---- wheel: Ctrl/Cmd (and trackpad pinch) zooms at the cursor; plain scroll pans when zoomed in ----
  useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const onWheel = (event) => {
      const { view: v, metrics: m } = latest.current
      const rect = el.getBoundingClientRect()
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const anchor = { x: event.clientX - (rect.left + rect.width / 2), y: event.clientY - (rect.top + rect.height / 2) }
        zoomBy(Math.exp(-event.deltaY * 0.0025), anchor)
      } else if (isPannable(frameLayout(v, m.content), m.viewport)) {
        event.preventDefault()
        panBy(-event.deltaX, -event.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy, panBy])

  // ---- hold Space to pan with the mouse anywhere on the stage ----
  useEffect(() => {
    const down = (event) => {
      if (event.code !== 'Space' || event.repeat) return
      // Space keeps its normal job on a focused control — unless the pointer is resting on the stage,
      // where (after clicking a zoom button, say) it means "hold to pan".
      if (isInteractive(event.target) && !stageRef.current?.matches(':hover')) return
      event.preventDefault()
      setSpaceHeld(true)
    }
    const up = (event) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    const blur = () => setSpaceHeld(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  // ---- pan gesture ----
  const endPanRef = useRef(null)
  useEffect(() => () => endPanRef.current?.(), [])

  const beginPan = useCallback(
    (event) => {
      const el = event.currentTarget
      const pointerId = event.pointerId
      endPanRef.current?.()
      const startPoint = { x: event.clientX, y: event.clientY }
      const { view: v, metrics: m } = latest.current
      const start = clampPan({ x: v.panX, y: v.panY }, frameLayout(v, m.content), m.viewport)
      el.setPointerCapture?.(pointerId)
      setPanning(true)

      let frame = 0
      let pending = null
      const flush = () => {
        frame = 0
        if (!pending) return
        const { x, y } = pending
        pending = null
        setView((cur) => {
          const cm = latest.current.metrics
          const next = clampPan({ x, y }, frameLayout(cur, cm.content), cm.viewport)
          return next.x === cur.panX && next.y === cur.panY ? cur : { ...cur, panX: next.x, panY: next.y }
        })
      }
      const onMove = (e) => {
        if (e.pointerId !== pointerId) return
        pending = { x: start.x + (e.clientX - startPoint.x), y: start.y + (e.clientY - startPoint.y) }
        if (!frame) frame = requestAnimationFrame(flush)
      }
      const end = () => {
        el.removeEventListener('pointermove', onMove)
        el.removeEventListener('pointerup', end)
        el.removeEventListener('pointercancel', end)
        el.removeEventListener('lostpointercapture', end)
        if (frame) cancelAnimationFrame(frame)
        flush()
        try {
          el.releasePointerCapture?.(pointerId)
        } catch {
          /* already released */
        }
        setPanning(false)
        endPanRef.current = null
      }
      el.addEventListener('pointermove', onMove)
      el.addEventListener('pointerup', end)
      el.addEventListener('pointercancel', end)
      el.addEventListener('lostpointercapture', end)
      endPanRef.current = end
    },
    [],
  )

  /**
   * Capture-phase handler for the stage. Decides whether this press is a PAN (handled here and
   * kept away from the T-shirt / artwork handlers) or an object gesture (left alone).
   *  - middle mouse button, or Space + left button, anywhere
   *  - left button on the empty stage around the composition
   *  - one finger on the composition when zoomed in (artwork and its handles keep priority)
   */
  const onPointerDownCapture = useCallback(
    (event) => {
      const { view: v, metrics: m } = latest.current
      const can = isPannable(frameLayout(v, m.content), m.viewport)
      const isMouse = event.pointerType === 'mouse' || event.pointerType === 'pen'
      let pan = false
      if (isMouse && event.button === 1) pan = true
      else if (isMouse && event.button === 0 && spaceHeld) pan = true
      else if (isMouse && event.button === 0 && event.target === event.currentTarget && can) pan = true
      else if (event.pointerType === 'touch' && can && !event.target.closest?.('.mv2-art, .mv2-handle')) pan = true
      if (!pan) return
      if (!can) {
        if (event.button === 1) event.preventDefault()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      beginPan(event)
    },
    [beginPan, spaceHeld],
  )

  return {
    stageRef,
    view,
    layout,
    pan,
    metrics,
    ready,
    pannable,
    panning,
    spaceHeld,
    isDefault,
    limits: ZOOM_LIMITS,
    actions: { setMode, zoomBy, zoomTo, resetZoom, resetView, toggleGuides, panBy },
    onPointerDownCapture,
  }
}

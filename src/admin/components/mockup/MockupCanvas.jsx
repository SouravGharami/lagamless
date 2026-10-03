import { useEffect, useRef, useState } from 'react'
import { clampPlacement, updateCorner } from '../../lib/mockupPlacement.js'
import { loadImage, renderMockup, computeQuad, recolorGarment } from '../../lib/photoCompositor.js'
import { getTemplatePhoto, colorKeyFor } from '../../lib/templatePhotoStore.js'

/**
 * One angle's editing surface. Unlike the old SVG version, the garment
 * itself is now a real photograph: this component loads the uploaded
 * template photo for (templateId, angle, garment's colorway), recolors it
 * on the fly for a 'solid' fabric, and repaints a <canvas> through
 * photoCompositor.renderMockup on every relevant change. A plain
 * absolutely-positioned `<div>` overlay still handles drag/resize/rotate,
 * PLUS four small corner handles per selected placement for perspective
 * adjustment — dragging a single corner skews just that corner of the
 * print so it can follow a sleeve curve or a garment fold, matching a
 * real DTF transfer instead of a flat decal.
 *
 * If no real photo has been uploaded yet for this angle/colorway, the
 * canvas shows a plain "upload the template photo" prompt instead of
 * ever falling back to a drawn placeholder — this studio never fakes the
 * garment.
 *
 * @param {object} props
 * @param {string} props.templateId
 * @param {'front'|'back'|'three-quarter-front'|'three-quarter-back'|'side'|'detail'} props.angle
 * @param {{ hex: string, fabric: string, colorName?: string }} props.garment
 * @param {Array} props.placements - already filtered to this angle
 * @param {Record<string, object>} props.artworksById
 * @param {boolean} [props.interactive]
 * @param {string|null} [props.selectedId]
 * @param {(id: string|null) => void} [props.onSelect]
 * @param {(id: string, patch: object) => void} [props.onChange]
 * @param {(id: string) => void} [props.onDelete]
 * @param {(file: File) => void} [props.onUploadTemplatePhoto] - called with the raw file when the admin uploads a missing template photo for this angle/colorway
 * @param {() => void} [props.onDragStart] - fired once at the START of each move/resize/rotate/corner drag (before anything changes), so the caller can snapshot state for undo
 */
// Unit direction (in the placement's own unrotated local frame) from the
// box's center out to each of computeQuad()'s four corners, in the same
// top-left/top-right/bottom-right/bottom-left order. Used only to push the
// perspective "corner" dot a little further outward than the resize grip
// that sits at the same corner — see the ROOT CAUSE note on the corner-dot
// render below.
const SQRT2 = Math.SQRT2
const CORNER_LOCAL_DIRS = [
  { x: -1 / SQRT2, y: -1 / SQRT2 },
  { x: 1 / SQRT2, y: -1 / SQRT2 },
  { x: 1 / SQRT2, y: 1 / SQRT2 },
  { x: -1 / SQRT2, y: 1 / SQRT2 },
]

function MockupCanvas({
  templateId,
  angle,
  garment,
  placements,
  artworksById,
  interactive = true,
  selectedId = null,
  onSelect,
  onChange,
  onDelete,
  onUploadTemplatePhoto,
  onDragStart,
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [garmentImage, setGarmentImage] = useState(null)
  const [photoMissing, setPhotoMissing] = useState(false)
  const [artworkImages, setArtworkImages] = useState({})

  const colorKey = colorKeyFor(garment)

  // Load (and recolor, for 'solid') the real template photo whenever the
  // angle or colorway changes. No photo on file -> show the upload
  // prompt rather than any drawn stand-in.
  useEffect(() => {
    let cancelled = false
    setGarmentImage(null)
    setPhotoMissing(false)

    const record = getTemplatePhoto(templateId, angle, garment.fabric === 'solid' ? 'solid' : colorKey)
    if (!record) {
      setPhotoMissing(true)
      return undefined
    }

    loadImage(record.dataUrl)
      .then(async (img) => {
        if (cancelled) return
        if (garment.fabric === 'solid' && garment.hex) {
          const recolored = recolorGarment(img, garment.hex)
          const recoloredImg = await loadImage(recolored.toDataURL('image/png'))
          if (!cancelled) setGarmentImage(recoloredImg)
        } else {
          setGarmentImage(img)
        }
      })
      .catch(() => !cancelled && setPhotoMissing(true))

    return () => {
      cancelled = true
    }
  }, [templateId, angle, garment.fabric, garment.hex, colorKey])

  // Decode every artwork data URL currently referenced by a placement on
  // this angle, once per artwork (cached across angle switches).
  useEffect(() => {
    let cancelled = false
    const needed = placements.map((p) => artworksById[p.artworkId]).filter(Boolean)
    Promise.all(
      needed.map(async (art) => {
        if (artworkImages[art.id]) return null
        const img = await loadImage(art.dataUrl)
        return [art.id, img]
      }),
    ).then((pairs) => {
      if (cancelled) return
      const fresh = pairs.filter(Boolean)
      if (fresh.length) setArtworkImages((prev) => ({ ...prev, ...Object.fromEntries(fresh) }))
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements, artworksById])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const measure = () => setContainerWidth(el.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // The actual paint step: real garment photo + every placement, warped
  // and fabric-shaded, straight onto the canvas element.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !garmentImage) return
    const width = garmentImage.naturalWidth || garmentImage.width
    const height = garmentImage.naturalHeight || garmentImage.height
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    renderMockup(ctx, { garmentImage, placements, artworkImages })
  }, [garmentImage, placements, artworkImages])

  const photoWidth = garmentImage?.naturalWidth || garmentImage?.width || 0
  const photoHeight = garmentImage?.naturalHeight || garmentImage?.height || 0

  function scaleFactor() {
    if (!photoWidth) return 1
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return 1
    return rect.width / photoWidth
  }

  function toPhotoSpace(clientX, clientY) {
    const rect = containerRef.current.getBoundingClientRect()
    const scale = scaleFactor()
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  function beginDrag(event, placement, mode, cornerIndex = null) {
    if (!interactive) return
    event.preventDefault()
    event.stopPropagation()
    onSelect?.(placement.id)
    // Snapshot BEFORE anything about this placement changes — one history
    // entry per whole drag gesture (move/resize/rotate/corner-adjust),
    // not one per pixel of movement.
    onDragStart?.(placement.id)
    const start = toPhotoSpace(event.clientX, event.clientY)
    dragRef.current = {
      mode, // 'move' | 'resize' | 'rotate' | 'corner'
      cornerIndex,
      placement,
      startVb: start,
      startX: placement.x,
      startY: placement.y,
      startWidth: placement.width,
      startHeight: placement.height,
      startRotation: placement.rotation,
      startDist: Math.max(1, Math.hypot(start.x - placement.x, start.y - placement.y)),
      startAngle: Math.atan2(start.y - placement.y, start.x - placement.x) * (180 / Math.PI),
    }
    window.addEventListener('pointermove', handleDrag)
    window.addEventListener('pointerup', endDrag)
  }

  function handleDrag(event) {
    const drag = dragRef.current
    if (!drag) return
    const point = toPhotoSpace(event.clientX, event.clientY)
    const { placement, mode } = drag

    if (mode === 'move') {
      const dx = point.x - drag.startVb.x
      const dy = point.y - drag.startVb.y
      onChange?.(placement.id, clampPlacement({ ...placement, x: drag.startX + dx, y: drag.startY + dy }, photoWidth, photoHeight))
    } else if (mode === 'resize') {
      // Free resize, aspect-ratio locked: the only ceiling is
      // clampPlacement's own generous canvas-based safety cap (see its
      // doc comment), not a print-position/printable-area restriction.
      const dist = Math.max(1, Math.hypot(point.x - drag.startX, point.y - drag.startY))
      const ratio = dist / drag.startDist
      const width = drag.startWidth * ratio
      const height = width * (drag.startHeight / drag.startWidth)
      onChange?.(placement.id, clampPlacement({ ...placement, width, height }, photoWidth, photoHeight))
    } else if (mode === 'rotate') {
      const angleNow = Math.atan2(point.y - drag.startY, point.x - drag.startX) * (180 / Math.PI)
      const rotation = Math.round(drag.startRotation + (angleNow - drag.startAngle))
      onChange?.(placement.id, { ...placement, rotation })
    } else if (mode === 'corner') {
      const dx = point.x - drag.startVb.x
      const dy = point.y - drag.startVb.y
      drag.startVb = point
      onChange?.(placement.id, updateCorner(placement, drag.cornerIndex, dx, dy))
    }
  }

  function endDrag() {
    dragRef.current = null
    window.removeEventListener('pointermove', handleDrag)
    window.removeEventListener('pointerup', endDrag)
  }

  function handlePhotoUpload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onUploadTemplatePhoto?.(file)
  }

  if (photoMissing) {
    if (!interactive) {
      return (
        <div className="mockup-canvas mockup-canvas--missing mockup-canvas--missing-compact" ref={containerRef}>
          <p className="text-small">No real photo yet</p>
        </div>
      )
    }
    return (
      <div className="mockup-canvas mockup-canvas--missing" ref={containerRef}>
        <div className="mockup-canvas__missing">
          <p className="text-small">
            No real template photo on file yet for <strong>{angle}</strong>
            {garment.fabric !== 'solid' ? <> in <strong>{colorKey}</strong></> : null}.
          </p>
          <p className="text-small">
            Upload an actual photograph of the garment for this angle — this studio only composites
            onto real photography, never a drawn or AI-generated stand-in.
          </p>
          <label className="btn btn-secondary btn-block">
            Upload template photo
            <input type="file" accept="image/png,image/jpeg,image/webp" className="visually-hidden" onChange={handlePhotoUpload} />
          </label>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`mockup-canvas${interactive ? '' : ' mockup-canvas--readonly'}`}
      style={{ aspectRatio: photoWidth && photoHeight ? `${photoWidth} / ${photoHeight}` : '4 / 5' }}
      onPointerDown={() => interactive && onSelect?.(null)}
    >
      <canvas ref={canvasRef} className="mockup-canvas__photo" />

      {interactive && (
        <div className="mockup-canvas__handles">
          {placements.map((placement) => {
            const scale = containerWidth && photoWidth ? containerWidth / photoWidth : 0
            const w = placement.width * scale
            const h = placement.height * scale
            const left = placement.x * scale
            const top = placement.y * scale
            const isSelected = placement.id === selectedId
            const quad = computeQuad(placement)
            return (
              <div key={placement.id}>
                <div
                  className={`mockup-handle${isSelected ? ' mockup-handle--selected' : ''}`}
                  style={{
                    width: w,
                    height: h,
                    left,
                    top,
                    transform: `translate(-50%, -50%) rotate(${placement.rotation}deg)`,
                  }}
                  onPointerDown={(e) => beginDrag(e, placement, 'move')}
                >
                  {isSelected && (
                    <>
                      <button
                        type="button"
                        className="mockup-handle__delete"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => onDelete?.(placement.id)}
                        aria-label="Remove this print"
                      >
                        ×
                      </button>
                      {/* Resize handles on all four corners. Each starts the
                          same 'resize' drag mode — the resize math in
                          handleDrag scales width/height from the object's
                          own center based on distance-to-pointer, so it
                          works identically no matter which corner is
                          grabbed, and always maintains aspect ratio. */}
                      <span
                        className="mockup-handle__grip mockup-handle__grip--resize-tl"
                        onPointerDown={(e) => beginDrag(e, placement, 'resize')}
                        aria-hidden="true"
                        title="Resize"
                      />
                      <span
                        className="mockup-handle__grip mockup-handle__grip--resize-tr"
                        onPointerDown={(e) => beginDrag(e, placement, 'resize')}
                        aria-hidden="true"
                        title="Resize"
                      />
                      <span
                        className="mockup-handle__grip mockup-handle__grip--resize-br"
                        onPointerDown={(e) => beginDrag(e, placement, 'resize')}
                        aria-hidden="true"
                        title="Resize"
                      />
                      <span
                        className="mockup-handle__grip mockup-handle__grip--resize-bl"
                        onPointerDown={(e) => beginDrag(e, placement, 'resize')}
                        aria-hidden="true"
                        title="Resize"
                      />
                      <span
                        className="mockup-handle__grip mockup-handle__grip--rotate"
                        onPointerDown={(e) => beginDrag(e, placement, 'rotate')}
                        aria-hidden="true"
                        title="Rotate"
                      />
                      {/* Counter-rotate so the readout stays upright and
                          legible no matter how far the print itself is
                          rotated (its parent box carries the rotation). */}
                      <span
                        className="mockup-handle__angle"
                        style={{ transform: `translateX(-50%) rotate(${-placement.rotation}deg)` }}
                        aria-live="polite"
                      >
                        {Math.round(((placement.rotation % 360) + 360) % 360)}°
                      </span>
                    </>
                  )}
                </div>

                {isSelected &&
                  quad.map((corner, i) => {
                    // ROOT CAUSE (resize handles not working): this dot's
                    // position (from computeQuad) sits on the exact same
                    // pixel as the resize grip at that corner (both are
                    // "the box's corner"). Because this span is a later
                    // DOM sibling of the .mockup-handle box, it painted on
                    // top and silently ate every pointerdown meant for the
                    // resize grip underneath — so every "resize" drag was
                    // actually a single-corner perspective-skew drag
                    // instead, and the print's overall width/height (see
                    // handleDrag's 'resize' branch) never changed. Pushing
                    // this dot further out along the box's own (rotated)
                    // diagonal than the grip's radius clears that overlap
                    // so both handles are independently clickable.
                    const rad = (placement.rotation * Math.PI) / 180
                    const dir = CORNER_LOCAL_DIRS[i]
                    const dirX = dir.x * Math.cos(rad) - dir.y * Math.sin(rad)
                    const dirY = dir.x * Math.sin(rad) + dir.y * Math.cos(rad)
                    const OUTSET = 16 // px, screen space — clears the 14px (22px on touch) resize grip
                    return (
                      <span
                        key={i}
                        className="mockup-handle__corner"
                        style={{ left: corner.x * scale + dirX * OUTSET, top: corner.y * scale + dirY * OUTSET }}
                        onPointerDown={(e) => beginDrag(e, placement, 'corner', i)}
                        title="Drag to adjust perspective at this corner"
                      />
                    )
                  })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default MockupCanvas

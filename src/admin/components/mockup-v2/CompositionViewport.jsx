import { SAFE_INSET } from './compositionFrame.js'
import { TRANSPARENCY_INDICATOR_CSS } from './backgroundStyle.js'

/**
 * Step 4B — the sized, panned composition frame. The frame is laid out at its real displayed
 * pixel size (not CSS-scaled), so images stay sharp and pointer maths in MockupPreview keeps
 * working from the frame's own bounding box. Pan is an integer-pixel translate.
 *
 * Everything drawn here that is not the composition (the boundary outline, the neutral base
 * behind the frame, the guides) is UI-only and lives OUTSIDE `.mv2-frame`, marked data-ui-only.
 */
export default function CompositionViewport({ layout, pan, viewport, guides, indicator, children }) {
  const width = Math.max(1, Math.round(layout.width))
  const height = Math.max(1, Math.round(layout.height))
  const left = Math.round((viewport.w - width) / 2 + pan.x)
  const top = Math.round((viewport.h - height) / 2 + pan.y)

  return (
    <div
      className="mv2-comp"
      data-ui-only="base"
      style={{ width, height, transform: `translate(${left}px, ${top}px)` }}
    >
      {/* UI-only transparency indicator: BEHIND the frame, never inside it, never a composition layer. */}
      {indicator && <div className="mv2-checker" data-ui-only="checkerboard" style={{ background: TRANSPARENCY_INDICATOR_CSS }} aria-hidden="true" />}
      {children}
      {guides && (
        <div className="mv2-guides" data-ui-only="guides" aria-hidden="true">
          <span className="mv2-guides__safe" style={{ inset: `${SAFE_INSET * 100}%` }} />
          <span className="mv2-guides__v" />
          <span className="mv2-guides__h" />
        </div>
      )}
    </div>
  )
}

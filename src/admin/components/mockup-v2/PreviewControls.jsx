import { SLIDER_RANGE, VIEW_MODES, ZOOM_LIMITS, sliderToZoom, zoomToSlider } from './compositionFrame.js'

/**
 * Step 4B — compact VIEW controls. Every control here changes the preview view only
 * (usePreviewViewport); none of them dispatches to the studio reducer, so the T-shirt,
 * artwork and background cannot be affected. PREVIEW ZOOM is not T-SHIRT SCALE.
 */
export default function PreviewControls({ viewport }) {
  const { view, layout, isDefault, actions } = viewport
  const percent = Math.round(view.zoom * 100)
  const shown = Math.round(layout.scale * 100)

  return (
    <div className="mv2-view" role="group" aria-label="Preview view">
      <div className="mv2-view__group" role="radiogroup" aria-label="Fit mode">
        <span className="mv2-view__label">View</span>
        {VIEW_MODES.map((mode) => (
          <button
            key={mode.key}
            type="button"
            role="radio"
            aria-checked={view.mode === mode.key}
            className={`mv2-btn mv2-view__mode${view.mode === mode.key ? ' is-active' : ''}`}
            title={mode.title}
            onClick={() => actions.setMode(mode.key)}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="mv2-view__group mv2-view__zoom">
        <span className="mv2-view__label" id="mv2-zoom-l" title="Changes how the preview is displayed only — the T-shirt keeps its own scale">Zoom</span>
        <button type="button" className="mv2-btn mv2-tp__step" aria-label="Zoom out" disabled={view.zoom <= ZOOM_LIMITS.min} onClick={() => actions.zoomBy(1 / ZOOM_LIMITS.step)}>−</button>
        <input
          type="range" className="mv2-range" aria-labelledby="mv2-zoom-l" aria-valuetext={`${percent}%`}
          min={SLIDER_RANGE.min} max={SLIDER_RANGE.max} step={SLIDER_RANGE.step} value={zoomToSlider(view.zoom)}
          onChange={(event) => actions.zoomTo(sliderToZoom(Number(event.target.value)))}
        />
        <button type="button" className="mv2-btn mv2-tp__step" aria-label="Zoom in" disabled={view.zoom >= ZOOM_LIMITS.max} onClick={() => actions.zoomBy(ZOOM_LIMITS.step)}>+</button>
        <button
          type="button" className="mv2-view__readout" onClick={actions.resetZoom} disabled={view.zoom === 1}
          title={`Reset zoom (composition shown at ${shown}% of its working size)`}
        >
          {percent}%
        </button>
      </div>

      <div className="mv2-view__group">
        <label className="mv2-check">
          <input type="checkbox" checked={view.guides} onChange={actions.toggleGuides} />
          Show guides
        </label>
        <button type="button" className="mv2-btn" disabled={isDefault} onClick={actions.resetView} title="Reset zoom, pan, view mode and guides. The T-shirt, artwork and background are not changed.">
          Reset view
        </button>
      </div>
    </div>
  )
}

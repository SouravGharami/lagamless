import { SCALE_LIMITS, centerRange, clampPresentation, isDefaultPresentation } from './tshirtPresentation.js'

/**
 * Compact "T-shirt presentation" controls (Step 4A-2). Every action here is a
 * *_TSHIRT_* presentation action, so background and artwork can't be touched.
 */
export default function TshirtPresentationPanel({ tshirt, presentation, canShadow, dispatch }) {
  const p = clampPresentation(tshirt, presentation)
  const range = centerRange(tshirt, p.scale)
  const percent = Math.round(p.scale * 100)
  const setScale = (scale) => dispatch({ type: 'SET_TSHIRT_SCALE', scale })
  const setPos = (patch) => dispatch({ type: 'SET_TSHIRT_POSITION', ...patch })
  const canMoveX = range.maxX - range.minX > 0.01
  const canMoveY = range.maxY - range.minY > 0.01

  return (
    <div className="mv2-tp">
      <div className="mv2-group__head">
        <h3 className="mv2-group__title">T-shirt presentation</h3>
        <button
          type="button"
          className="mv2-btn"
          disabled={isDefaultPresentation(p)}
          onClick={() => dispatch({ type: 'RESET_TSHIRT_PRESENTATION' })}
          title="Restore the T-shirt's default position, size and shadow (background and artwork are not changed)"
        >
          Reset
        </button>
      </div>

      <div className="mv2-tp__grid">
        <div className="mv2-field">
          <span className="mv2-field__label" id="mv2-tp-scale-l">Scale · {percent}%</span>
          <div className="mv2-tp__row">
            <button type="button" className="mv2-btn mv2-tp__step" aria-label="Smaller" disabled={p.scale <= SCALE_LIMITS.min} onClick={() => setScale(p.scale - SCALE_LIMITS.step)}>−</button>
            <input
              type="range" className="mv2-range" aria-labelledby="mv2-tp-scale-l"
              min={SCALE_LIMITS.min} max={SCALE_LIMITS.max} step={0.01} value={p.scale}
              onChange={(event) => setScale(Number(event.target.value))}
            />
            <button type="button" className="mv2-btn mv2-tp__step" aria-label="Larger" disabled={p.scale >= SCALE_LIMITS.max} onClick={() => setScale(p.scale + SCALE_LIMITS.step)}>+</button>
          </div>
        </div>

        <div className="mv2-field">
          <label className="mv2-field__label" htmlFor="mv2-tp-x">Horizontal</label>
          <input
            id="mv2-tp-x" type="range" className="mv2-range" disabled={!canMoveX}
            min={range.minX} max={Math.max(range.maxX, range.minX)} step={0.1} value={p.x}
            onChange={(event) => setPos({ x: Number(event.target.value) })}
          />
        </div>

        <div className="mv2-field">
          <label className="mv2-field__label" htmlFor="mv2-tp-y">Vertical</label>
          <input
            id="mv2-tp-y" type="range" className="mv2-range" disabled={!canMoveY}
            min={range.minY} max={Math.max(range.maxY, range.minY)} step={0.1} value={p.y}
            onChange={(event) => setPos({ y: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="mv2-actions">
        <button type="button" className="mv2-btn" onClick={() => dispatch({ type: 'CENTER_TSHIRT', axis: 'x' })}>Center horizontally</button>
        <button type="button" className="mv2-btn" onClick={() => dispatch({ type: 'CENTER_TSHIRT', axis: 'y' })}>Center vertically</button>
        <button type="button" className="mv2-btn" onClick={() => dispatch({ type: 'CENTER_TSHIRT', axis: 'both' })} title="Reset position only">Reset position</button>
        <label className={`mv2-check${canShadow ? '' : ' is-disabled'}`} title={canShadow ? '' : 'Needs a T-shirt image with a transparent background'}>
          <input type="checkbox" checked={p.shadow && canShadow} disabled={!canShadow} onChange={(event) => dispatch({ type: 'SET_TSHIRT_SHADOW', shadow: event.target.checked })} />
          Soft shadow
        </label>
      </div>
      {!canShadow && <p className="mv2-hint">Shadow is available once the T-shirt image has a transparent background.</p>}
    </div>
  )
}

import { useState } from 'react'
import { SURFACES } from './mockupStudioState.js'
import { ANGLE_DEFS, DEFAULT_ANGLE } from './generation/mockupAngles.js'
import { DEFAULT_REALISM } from './compositing/placement.js'
import { DEFAULT_WARP } from './compositing/surfaceWarp.js'
import { CopyIcon, TrashIcon, ResetIcon } from './icons.jsx'

/** Numeric field that lets you type freely and commits every valid number. */
function NumberField({ label, value, onCommit, disabled, unit, step = 1 }) {
  const [draft, setDraft] = useState(null)
  const shown = draft ?? String(Math.round(value * 100) / 100)
  return (
    <label className="mv2-field">
      <span className="mv2-field__label">{label}</span>
      <span className="mv2-field__control">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={shown}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value)
            const n = parseFloat(event.target.value)
            if (Number.isFinite(n)) onCommit(n)
          }}
          onBlur={() => setDraft(null)}
        />
        {unit && <span className="mv2-field__unit">{unit}</span>}
      </span>
    </label>
  )
}

const ORDER_OPS = [
  ['forward', 'Bring forward'],
  ['backward', 'Send backward'],
  ['front', 'Bring to front'],
  ['back', 'Send to back'],
]

/** Right column: properties of the selected artwork layer. */
export default function PropertiesPanel({ layer, placements = {}, dispatch }) {
  if (!layer) {
    return (
      <aside className="mv2-props" aria-label="Properties">
        <h3 className="mv2-group__title">Properties</h3>
        <p className="mv2-hint">Select an artwork layer to edit its position, size, rotation and opacity.</p>
      </aside>
    )
  }

  const off = layer.locked
  const update = (patch) => dispatch({ type: 'UPDATE_ARTWORK', id: layer.id, patch })

  return (
    <aside className="mv2-props" aria-label="Properties">
      <h3 className="mv2-group__title">Properties</h3>
      <p className="mv2-file" title={layer.name}>
        <span className="mv2-file__name">{layer.name}</span>
        <span className="mv2-file__meta">{layer.naturalWidth} × {layer.naturalHeight}px source</span>
      </p>
      {off && <p className="mv2-hint mv2-hint--accent">Locked — unlock the layer to edit it.</p>}

      <label className="mv2-field mv2-field--wide">
        <span className="mv2-field__label">Surface</span>
        <select
          className="mv2-select"
          value={layer.surface}
          disabled={off}
          onChange={(event) => dispatch({ type: 'MOVE_ARTWORK_SURFACE', id: layer.id, surface: event.target.value })}
        >
          {SURFACES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
      </label>

      <div className="mv2-fields">
        <NumberField label="Position X" unit="%" value={layer.x} disabled={off} onCommit={(x) => update({ x })} />
        <NumberField label="Position Y" unit="%" value={layer.y} disabled={off} onCommit={(y) => update({ y })} />
        <NumberField label="Width" unit="%" value={layer.width} disabled={off} onCommit={(width) => update({ width })} />
        <NumberField label="Height" unit="%" value={layer.height} disabled={off} onCommit={(height) => update({ height })} />
        <NumberField label="Rotation" unit="°" value={layer.rotation} disabled={off} onCommit={(rotation) => update({ rotation })} />
        <NumberField
          label="Opacity"
          unit="%"
          value={layer.opacity * 100}
          disabled={off}
          onCommit={(pct) => update({ opacity: pct / 100 })}
        />
      </div>

      <label className="mv2-field mv2-field--wide">
        <span className="mv2-field__label">Fabric integration · {Math.round(layer.realism ?? DEFAULT_REALISM)}</span>
        <input
          type="range"
          className="mv2-range"
          min="0"
          max="100"
          step="1"
          value={layer.realism ?? DEFAULT_REALISM}
          disabled={off}
          aria-label="Fabric integration"
          onChange={(event) => update({ realism: Number(event.target.value) })}
        />
      </label>
      <p className="mv2-hint">
        0 keeps the artwork flat. Higher lets the shirt&rsquo;s own folds, shadows and texture show through the print
        (in the photo composite). Colours are never tinted.
      </p>

      <label className="mv2-field mv2-field--wide">
        <span className="mv2-field__label">Surface warp · {Math.round(layer.warp ?? DEFAULT_WARP)}</span>
        <input
          type="range"
          className="mv2-range"
          min="0"
          max="100"
          step="1"
          value={layer.warp ?? DEFAULT_WARP}
          disabled={off}
          aria-label="Surface warp"
          onChange={(event) => update({ warp: Number(event.target.value) })}
        />
      </label>
      <p className="mv2-hint">
        0 keeps the print geometrically flat. Higher lets it bend subtly with the shirt&rsquo;s folds (in the photo
        composite). Movement is capped and scales with the artwork, so small logos stay readable.
      </p>

      <fieldset className="mv2-viewassign">
        <legend className="mv2-field__label">Shown in views</legend>
        {ANGLE_DEFS.map(({ id, label }) => {
          const placed = placements[id]
          const here = id === (layer.view ?? DEFAULT_ANGLE)
          const only = here && Object.keys(placements).length <= 1
          return (
            <div key={id} className="mv2-viewassign__row">
              <label className="mv2-check">
                <input
                  type="checkbox"
                  checked={!!placed}
                  disabled={only || placed?.locked || (here && off)}
                  onChange={() => (placed
                    ? dispatch({ type: 'DELETE_ARTWORK', id: placed.id })
                    : dispatch({ type: 'COPY_PLACEMENT_TO_VIEW', id: layer.id, view: id }))}
                />
                {label}{here ? ' (this view)' : ''}
              </label>
              {placed && !here && (
                <button
                  type="button"
                  className="mv2-btn"
                  disabled={placed.locked}
                  onClick={() => dispatch({ type: 'COPY_PLACEMENT_TO_VIEW', id: layer.id, view: id })}
                  title={`Overwrite the ${label} placement with this view's position, size, rotation, warp and fabric integration`}
                >
                  Copy here
                </button>
              )}
            </div>
          )
        })}
      </fieldset>
      <p className="mv2-hint">
        Ticking a view gives this artwork its own placement there, starting from the current one. Each view is then
        edited, reset or removed on its own; the source image is shared. Unticking removes that view&rsquo;s placement only.
      </p>

      <label className="mv2-check">
        <input
          type="checkbox"
          checked={layer.aspectLocked !== false}
          disabled={off}
          onChange={() => dispatch({ type: 'TOGGLE_ASPECT_LOCK', id: layer.id })}
        />
        Lock aspect ratio
      </label>

      <p className="mv2-hint">
        Drag the artwork on the canvas to move it, corner handles to resize, the top handle to rotate (Shift snaps to
        15°). Values are percentages of the T-shirt image.
      </p>

      <div className="mv2-actions" role="group" aria-label="Layer order">
        {ORDER_OPS.map(([op, label]) => (
          <button
            key={op}
            type="button"
            className="mv2-btn"
            disabled={off}
            onClick={() => dispatch({ type: 'ORDER_ARTWORK', id: layer.id, op })}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mv2-actions">
        <button type="button" className="mv2-btn" onClick={() => dispatch({ type: 'DUPLICATE_ARTWORK', id: layer.id })}>
          <CopyIcon /> Duplicate
        </button>
        <button type="button" className="mv2-btn" disabled={off} onClick={() => dispatch({ type: 'RESET_ARTWORK', id: layer.id })}>
          <ResetIcon /> Reset transform
        </button>
        <button
          type="button"
          className="mv2-btn mv2-btn--danger"
          disabled={off}
          onClick={() => dispatch({ type: 'DELETE_ARTWORK', id: layer.id })}
          title="Removes this placement from this view only; other views keep theirs"
        >
          <TrashIcon /> Delete
        </button>
      </div>
    </aside>
  )
}

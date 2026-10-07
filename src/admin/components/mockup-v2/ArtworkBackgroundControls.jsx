import { useEffect, useRef, useState } from 'react'
import { SOLID_DEFAULTS } from './artworkBackground.js'
import { useArtworkBackgroundRemoval } from './useArtworkBackgroundRemoval.js'
import { ResetIcon } from './icons.jsx'

/**
 * "Artwork background" group in the Properties panel. Removes the background of the selected artwork (shared by every
 * placement of that artwork). The uploaded file is never changed — Restore original brings it straight back.
 */
export default function ArtworkBackgroundControls({ source, dispatch }) {
  const { runAI, runSolid, restore, useCutout } = useArtworkBackgroundRemoval(source, dispatch)
  const [tolerance, setTolerance] = useState(source?.bgOptions?.tolerance ?? SOLID_DEFAULTS.tolerance)
  const [keepInner, setKeepInner] = useState(source?.bgOptions?.keepInner ?? SOLID_DEFAULTS.keepInner)
  const [color, setColor] = useState(source?.bgOptions?.color ?? null)
  const timer = useRef(null)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  if (!source) return null

  const processing = source.bgStatus === 'processing'
  const hasCutout = !!source.processedUrl
  const solidActive = source.backgroundRemoved && source.bgMethod === 'solid'

  // Once a solid-colour cut-out is showing, slider / checkbox changes re-run it from the ORIGINAL (debounced).
  const rerun = (next) => {
    window.clearTimeout(timer.current)
    if (!solidActive) return
    timer.current = window.setTimeout(() => runSolid(next), 220)
  }

  return (
    <div className="mv2-group mv2-bgremove">
      <h3 className="mv2-group__title">Artwork background</h3>

      <p className="mv2-file__meta">
        {source.backgroundRemoved ? `Background removed (${source.bgMethod === 'solid' ? 'solid colour' : 'AI'})` : 'Original'}
      </p>

      <button type="button" className="mv2-btn mv2-btn--block" onClick={runAI} disabled={processing}>
        Remove background (AI)
      </button>
      <p className="mv2-hint">Best for photos, people and objects. The first use downloads the AI model.</p>

      <button type="button" className="mv2-btn mv2-btn--block" onClick={() => runSolid({ tolerance, keepInner, color })} disabled={processing}>
        Remove background (ink / logo)
      </button>
      <p className="mv2-hint">
        Best for ink, splatter, logos and text on a flat white / black / colour backdrop. Keeps every fine detail and removes the backdrop everywhere, including between splatters.
      </p>

      <label className="mv2-field mv2-field--wide">
        <span className="mv2-field__label">Clean-up strength · {tolerance}</span>
        <input
          type="range"
          className="mv2-range"
          min="0"
          max="100"
          step="1"
          value={tolerance}
          aria-label="Background clean-up strength"
          onChange={(event) => {
            const value = Number(event.target.value)
            setTolerance(value)
            rerun({ tolerance: value, keepInner, color })
          }}
        />
      </label>
      <p className="mv2-hint">Raise it if faint grey haze is left behind. Lower it if light parts of the design start to fade.</p>

      <label className="mv2-check">
        <input
          type="checkbox"
          checked={keepInner}
          onChange={(event) => {
            setKeepInner(event.target.checked)
            rerun({ tolerance, keepInner: event.target.checked, color })
          }}
        />
        Keep white areas inside the design
      </label>

      <label className="mv2-field mv2-field--wide">
        <span className="mv2-field__label">Backdrop colour {color ? '' : '(auto)'}</span>
        <span className="mv2-field__control">
          <input
            type="color"
            value={color ?? '#ffffff'}
            aria-label="Backdrop colour to remove"
            onChange={(event) => {
              setColor(event.target.value)
              rerun({ tolerance, keepInner, color: event.target.value })
            }}
          />
          {color && (
            <button
              type="button"
              className="mv2-btn"
              onClick={() => {
                setColor(null)
                rerun({ tolerance, keepInner, color: null })
              }}
            >
              Auto
            </button>
          )}
        </span>
      </label>

      {source.backgroundRemoved && (
        <button type="button" className="mv2-btn mv2-btn--block" onClick={restore} disabled={processing}>
          <ResetIcon /> Restore original
        </button>
      )}
      {!source.backgroundRemoved && hasCutout && (
        <button type="button" className="mv2-btn mv2-btn--block" onClick={useCutout} disabled={processing}>
          Use background-removed version
        </button>
      )}

      {processing && (
        <p className="mv2-status" role="status">
          <span className="mv2-spinner" aria-hidden="true" />
          Removing background...
        </p>
      )}
      {source.bgStatus === 'failed' && (
        <p className="mv2-status mv2-status--error" role="alert">
          {source.bgError}
        </p>
      )}
    </div>
  )
}

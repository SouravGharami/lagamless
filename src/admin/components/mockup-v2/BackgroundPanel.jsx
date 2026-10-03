import { useImagePicker } from './useImagePicker.js'
import BackgroundColorField from './BackgroundColorField.jsx'
import { BACKGROUND_MODES, GRADIENT_DIRECTIONS } from './backgroundStyle.js'
import { getPreset } from './backgroundPresets.js'
import { IMAGE_ACCEPT } from './mockupStudioAssets.js'

/**
 * Background Studio controls (Step 4A-1). Only the background is touched:
 * every action here is a SET_/REMOVE_/RESET_/CLEAR_BACKGROUND* action, so
 * T-shirt and artwork state can never be affected. Controls appear per mode.
 */
export default function BackgroundPanel({ background, backgroundImage, tshirt, dispatch }) {
  const picker = useImagePicker({ dispatch, onAsset: (asset) => dispatch({ type: 'SET_BACKGROUND_IMAGE', asset }) })
  const { mode } = background
  const setMode = (next) => dispatch({ type: 'SET_BACKGROUND_MODE', mode: next })
  const setGradient = (patch) => dispatch({ type: 'SET_BACKGROUND_GRADIENT', patch })
  const cutoutActive = !!tshirt?.backgroundRemoved

  return (
    <div className="mv2-bg">
      <div className="mv2-group__head">
        <h3 className="mv2-group__title">Background</h3>
        <div className="mv2-actions">
          <button
            type="button"
            className="mv2-btn"
            disabled={mode === 'original'}
            onClick={() => dispatch({ type: 'RESET_BACKGROUND' })}
            title="Back to the original background (keeps your colour and image settings)"
          >
            Reset
          </button>
          <button
            type="button"
            className="mv2-btn mv2-btn--danger"
            onClick={() => dispatch({ type: 'CLEAR_BACKGROUND' })}
            title="Reset background and forget colours, gradient and uploaded image"
          >
            Clear settings
          </button>
        </div>
      </div>

      <div className="mv2-chips" role="radiogroup" aria-label="Background mode">
        {BACKGROUND_MODES.map(({ key, label }) => {
          const active = mode === key
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              className={`mv2-chip${active ? ' is-active' : ''}`}
              onClick={() => setMode(key)}
            >
              {label}
            </button>
          )
        })}
      </div>

      {mode === 'preset' && (
        <p className="mv2-hint">Library preset: {getPreset(background.presetId)?.name}. Choose Solid or Gradient to make your own.</p>
      )}

      {mode === 'original' && <p className="mv2-hint">Showing the T-shirt exactly as uploaded.</p>}

      {mode === 'transparent' && (
        <p className="mv2-hint">
          The checkerboard only shows transparency — it is never part of the image.
          {tshirt && !cutoutActive ? ' Remove the T-shirt’s own background (left panel) to see it.' : ''}
        </p>
      )}

      {mode === 'solid' && (
        <div className="mv2-bg__controls">
          <BackgroundColorField
            label="Color"
            value={background.color}
            onChange={(color) => dispatch({ type: 'SET_BACKGROUND_COLOR', color })}
          />
        </div>
      )}

      {mode === 'gradient' && (
        <div className="mv2-bg__controls">
          <BackgroundColorField label="Color 1" value={background.gradientColor1} onChange={(c) => setGradient({ color1: c })} />
          <BackgroundColorField label="Color 2" value={background.gradientColor2} onChange={(c) => setGradient({ color2: c })} />
          <div className="mv2-field">
            <label className="mv2-field__label" htmlFor="mv2-bg-direction">Direction</label>
            <select
              id="mv2-bg-direction"
              className="mv2-select"
              value={background.gradientDirection}
              onChange={(event) => setGradient({ direction: event.target.value })}
            >
              {GRADIENT_DIRECTIONS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {mode === 'image' && (
        <div className="mv2-bg__controls">
          <input ref={picker.inputRef} type="file" accept={IMAGE_ACCEPT} hidden onChange={picker.onChange} />
          {backgroundImage && (
            <div className="mv2-bgimage">
              <img className="mv2-bgimage__thumb" src={backgroundImage.sourceUrl} alt="" draggable={false} />
              <span className="mv2-hint">
                {backgroundImage.name} · {backgroundImage.width} × {backgroundImage.height}px
              </span>
            </div>
          )}
          <div className="mv2-actions">
            <button type="button" className="mv2-btn" onClick={picker.open}>
              {backgroundImage ? 'Replace background' : 'Upload background'}
            </button>
            {backgroundImage && (
              <button type="button" className="mv2-btn mv2-btn--danger" onClick={() => dispatch({ type: 'REMOVE_BACKGROUND_IMAGE' })}>
                Remove image
              </button>
            )}
          </div>
          {!backgroundImage && <p className="mv2-hint">PNG, JPG, WebP or SVG · up to 30 MB. Shown behind the T-shirt, cropped to fill, never stretched.</p>}
        </div>
      )}
    </div>
  )
}

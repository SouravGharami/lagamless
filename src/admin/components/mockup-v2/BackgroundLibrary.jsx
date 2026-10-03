import { useState } from 'react'
import { PRESET_CATEGORIES, presetsInCategory } from './backgroundPresets.js'

/**
 * Background Library (Step 4A-3): category filter + thumbnail cards. Picking a
 * card dispatches APPLY_BACKGROUND_PRESET, which changes background state only.
 */
export default function BackgroundLibrary({ background, dispatch }) {
  const [category, setCategory] = useState('All')
  const activeId = background.mode === 'preset' ? background.presetId : null
  const presets = presetsInCategory(category)

  return (
    <div className="mv2-lib">
      <div className="mv2-group__head">
        <h3 className="mv2-group__title">Background library</h3>
        <span className="mv2-hint">{presets.length} {presets.length === 1 ? 'preset' : 'presets'}</span>
      </div>

      <div className="mv2-lib__cats" role="tablist" aria-label="Background categories">
        {PRESET_CATEGORIES.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={category === name}
            className={`mv2-chip${category === name ? ' is-active' : ''}`}
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mv2-lib__grid" role="group" aria-label="Background presets">
        {presets.map((preset) => {
          const active = preset.id === activeId
          return (
            <button
              key={preset.id}
              type="button"
              className={`mv2-preset${active ? ' is-active' : ''}`}
              aria-pressed={active}
              title={`${preset.name} · ${preset.category}`}
              onClick={() => dispatch({ type: 'APPLY_BACKGROUND_PRESET', id: preset.id })}
            >
              <span className="mv2-preset__thumb" style={{ background: preset.thumbnail }}>
                {active && <span className="mv2-preset__check" aria-hidden="true">✓</span>}
              </span>
              <span className="mv2-preset__name">{preset.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

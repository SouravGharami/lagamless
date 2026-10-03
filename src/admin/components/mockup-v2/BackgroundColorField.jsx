import { useId, useState } from 'react'
import { normalizeHex } from './backgroundStyle.js'

/**
 * Colour picker + HEX text box kept in sync. Typing commits as soon as the
 * text is a valid HEX (#RGB or #RRGGBB); invalid text is flagged and, on
 * blur, snaps back to the last valid colour — the background never receives
 * an invalid value.
 */
export default function BackgroundColorField({ label, value, onChange }) {
  const id = useId()
  const [draft, setDraft] = useState(null) // null = show the committed value
  const invalid = draft !== null && !normalizeHex(draft)

  function onText(event) {
    const text = event.target.value
    setDraft(text)
    const hex = normalizeHex(text)
    if (hex) onChange(hex)
  }

  return (
    <div className="mv2-field">
      <label className="mv2-field__label" htmlFor={id}>{label}</label>
      <div className="mv2-colorrow">
        <input
          type="color"
          className="mv2-colorrow__swatch"
          aria-label={`${label} picker`}
          value={value}
          onChange={(event) => {
            setDraft(null)
            onChange(event.target.value.toUpperCase())
          }}
        />
        <input
          id={id}
          type="text"
          className="mv2-colorrow__hex"
          value={draft ?? value}
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          onChange={onText}
          onBlur={() => setDraft(null)}
        />
      </div>
      {invalid && <span className="mv2-hint mv2-hint--accent">Enter a HEX colour like #FFFFFF.</span>}
    </div>
  )
}

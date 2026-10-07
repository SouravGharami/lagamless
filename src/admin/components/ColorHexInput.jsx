import { useEffect, useState } from 'react'
import { parseHex } from '../../lib/colorNaming.js'

/**
 * Small text box for typing a hex code ("#ff8800", "ff8800" or "#f80"). It keeps its own draft text so a half-typed
 * value like "#ff8" never fights the swatch, and only reports a change once the text is a complete, valid hex.
 * When the shade changes from elsewhere (the picker, a color name that was recognised) the text follows it.
 *
 * @param {object} props
 * @param {string} props.value - current '#rrggbb'
 * @param {(hex: string) => void} props.onCommit - called with a normalised '#rrggbb' once the typed text is valid
 */
export default function ColorHexInput({ value, onCommit }) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)

  // Follow outside changes, but never overwrite what the admin is in the middle of typing.
  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])

  const invalid = draft.trim() !== '' && !parseHex(draft)

  function handleChange(e) {
    const text = e.target.value
    setDraft(text)
    const hex = parseHex(text)
    if (hex && hex !== value) onCommit(hex)
  }

  return (
    <input
      className={`input admin-color-row__hexinput${invalid ? ' is-invalid' : ''}`}
      value={draft}
      onChange={handleChange}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setDraft(parseHex(draft) || value) // incomplete text snaps back to the current shade
      }}
      placeholder="#rrggbb"
      maxLength={7}
      spellCheck={false}
      autoComplete="off"
      aria-label="Hex color code"
      aria-invalid={invalid}
    />
  )
}

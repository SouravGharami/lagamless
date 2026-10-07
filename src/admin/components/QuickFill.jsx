import { useEffect, useMemo, useRef, useState } from 'react'
import { TEE_PRESETS } from './ColorPicker.jsx'
import { parseQuickFill, describePatch, applyQuickFill, cloneDetails } from '../lib/quickFill.js'

const EXAMPLE = 'samurai 650 850 oversized black gen z featured'

/**
 * "Quick Fill" — type or speak one line (or paste a WhatsApp-style
 * "Key: value" block) and the whole form fills in. Everything still blank
 * is auto-generated (number, SKU, slug, copy, details, sizes, stock, chart).
 * Nothing is saved until the normal "Create product" button is pressed, and
 * "Undo" restores the form exactly as it was before the fill.
 *
 * @param {object} props
 * @param {object} props.form
 * @param {(next: object) => void} props.onReplaceForm
 * @param {object[]} props.existing - the catalog, loaded once by ProductForm
 */
function QuickFill({ form, onReplaceForm, existing = [] }) {
  const [text, setText] = useState('')
  const [cloneId, setCloneId] = useState('')
  const [result, setResult] = useState(null) // { changed: string[], snapshot: object }
  const [listening, setListening] = useState(false)
  const inputRef = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    return () => recognitionRef.current?.abort?.()
  }, [])

  const patch = useMemo(() => parseQuickFill(text, { presets: TEE_PRESETS }), [text])
  // A name typed in the Product name field always wins, so don't advertise one from the line.
  const chips = useMemo(
    () => describePatch(form.name.trim() ? { ...patch, name: undefined } : patch),
    [patch, form.name],
  )

  const cloneSource = existing.find((p) => p.id === cloneId) || existing[0] || null
  const ctx = { template: cloneSource, defaultCategory: cloneSource?.category || 'Tees' }

  function run(base, nextPatch) {
    const { form: next, changed } = applyQuickFill(base, nextPatch, ctx)
    onReplaceForm(next)
    setResult({ changed: [...changed, 'product number, SKU & slug (auto, in sequence)'], snapshot: form })
  }

  function handleFill() {
    run(form, patch)
    setText('')
    inputRef.current?.focus()
  }

  function handleAutoFill() {
    run(form, {})
  }

  function handleClone() {
    if (!cloneSource) return
    const cloned = cloneDetails(form, cloneSource)
    const { form: next, changed } = applyQuickFill(cloned, {}, ctx)
    onReplaceForm(next)
    setResult({ changed: ['details from ' + cloneSource.name, ...changed], snapshot: form })
  }

  function handleUndo() {
    if (!result) return
    onReplaceForm(result.snapshot)
    setResult(null)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (text.trim()) handleFill()
    }
  }

  const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

  function toggleMic() {
    if (!SpeechRecognition) return
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.lang = 'en-IN'
    rec.interimResults = true
    rec.continuous = false
    const base = text ? text.trim() + ' ' : ''
    rec.onresult = (e) => {
      const spoken = Array.from(e.results).map((r) => r[0].transcript).join(' ')
      setText(base + spoken)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    setListening(true)
    rec.start()
  }

  return (
    <section className="quickfill" aria-labelledby="quickfill-title">
      <div className="quickfill__head">
        <h2 id="quickfill-title" className="quickfill__title">
          Quick fill
        </h2>
        <span className="quickfill__badge">whole form in ~30 seconds</span>
      </div>
      <p className="quickfill__hint">
        Type it the way you'd say it, then press <kbd>Enter</kbd>. Name, price, MRP, fit, colors, sizes, stock and where it
        shows can all go in one line — everything else is written for you.
      </p>

      <div className="quickfill__row">
        <textarea
          ref={inputRef}
          className="quickfill__input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`e.g. ${EXAMPLE}`}
          aria-label="Quick fill — describe the product in one line, or paste Key: value lines"
          spellCheck={false}
        />
        <div className="quickfill__buttons">
          <button type="button" className="quickfill__go" onClick={handleFill} disabled={!text.trim()}>
            Fill form ↵
          </button>
          {SpeechRecognition && (
            <button
              type="button"
              className={'quickfill__mic' + (listening ? ' quickfill__mic--on' : '')}
              onClick={toggleMic}
              aria-pressed={listening}
            >
              {listening ? '● Listening…' : '🎤 Speak'}
            </button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <ul className="quickfill__chips" aria-label="What Quick fill understood" aria-live="polite">
          {chips.map((chip) => (
            <li key={chip.label} className="quickfill__chip">
              <span className="quickfill__chip-label">{chip.label}</span>
              {chip.swatches?.map((hex) => (
                <span key={hex} className="quickfill__swatch" style={{ backgroundColor: hex }} aria-hidden="true" />
              ))}
              <span>{chip.value}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="quickfill__tools">
        <button type="button" className="quickfill__tool" onClick={handleAutoFill}>
          ✦ Auto-fill all blanks
        </button>
        <span className="quickfill__or">or</span>
        <label className="quickfill__clone">
          Copy details from
          <select value={cloneSource?.id || ''} onChange={(e) => setCloneId(e.target.value)} disabled={existing.length === 0}>
            {existing.length === 0 && <option value="">No products yet</option>}
            {existing.slice(0, 15).map((p, i) => (
              <option key={p.id} value={p.id}>
                {i === 0 ? 'Last product — ' : ''}
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="quickfill__tool" onClick={handleClone} disabled={!cloneSource}>
          Copy
        </button>
      </div>

      {result && (
        <p className="quickfill__result" role="status">
          <strong>Filled {result.changed.length} things:</strong> {result.changed.join(', ')}.{' '}
          <span>Check the photos, then hit Create product.</span>{' '}
          <button type="button" className="quickfill__undo" onClick={handleUndo}>
            Undo
          </button>
        </p>
      )}
    </section>
  )
}

export default QuickFill

import { useEffect, useMemo, useRef, useState } from 'react'
import Field from './Field.jsx'
import {
  VIBES,
  vibeFromCollections,
  writeDescription,
  writeStory,
  factSnippets,
  buildContext,
  wordCount,
} from '../lib/copyStudio.js'

const DESC_IDEAL_MIN = 120
const DESC_IDEAL_MAX = 160

/**
 * Description + Product story, with a writing assistant on top.
 *
 *  - Pick a vibe (defaults from the "Where this product appears" ticks) and
 *    optionally type a few theme words ("anime, samurai, bold back print").
 *  - AUTO-WRITE (on by default): the two boxes are written — and kept up to date — from every detail
 *    on the form (name, category, tags, fabric, GSM, fit, sizes, colours, price, design / construction /
 *    styling / care notes, store placement). The moment the admin types in a box themselves, that box is
 *    left alone. "Write description + story" rewrites both on demand (Undo brings the old text back).
 *  - "Another version" walks to the next wording; Short / Full changes length.
 *  - "Add from your details" chips append real facts (fabric, sizes, offer,
 *    care…) — only facts the admin already entered, never invented ones.
 *  - Undo steps back through whatever was there before, so a click can never
 *    destroy hand-written text.
 *
 * It only reads/writes `description` and `story` through `onChange`, so the
 * form's validation, autosave and submit behave exactly as before.
 */
/** True when the text already says this fact (ignores case and the final full stop). */
function alreadyHas(haystack, fact) {
  return Boolean(fact) && String(haystack || '').toLowerCase().includes(fact.replace(/[.!?]$/, '').toLowerCase())
}

function CopyStudio({ form, onChange, descriptionError, onDescriptionBlur }) {
  const [vibeChoice, setVibeChoice] = useState(null) // null = follow the store-placement ticks
  const [keywords, setKeywords] = useState('')
  const [length, setLength] = useState('full')
  const [variants, setVariants] = useState({ description: 0, story: 0 }) // 0 is what Quick Fill and auto-write use
  const [history, setHistory] = useState({ description: [], story: [] })

  const autoVibe = vibeFromCollections(form.collections)
  const vibe = vibeChoice || autoVibe
  const facts = useMemo(() => factSnippets(form), [form])
  const opts = { vibe, keywords, length }

  const [auto, setAuto] = useState(true)
  const lastAuto = useRef({ description: '', story: '' }) // what we last wrote into each box
  const prevForm = useRef(form) // the form as it was when we last wrote, to recognise untouched text
  const latest = useRef({})
  latest.current = { form, opts, variants, onChange }

  // Everything the writer reads — when any of it changes, untouched boxes are re-written.
  const signature = JSON.stringify([
    form.name, form.category, form.tags, form.collections, form.fabric, form.gsm, form.fit, form.care,
    form.construction, form.design, form.stylingNote, form.sizes, (form.colors || []).map((c) => c.name),
    form.price, form.compareAtPrice, vibe, keywords, length,
  ])

  useEffect(() => {
    const timer = setTimeout(() => {
      const { form: f, opts: o, variants: vs, onChange: set } = latest.current
      const before = prevForm.current
      prevForm.current = f
      if (!auto || !String(f.name || '').trim()) return
      for (const field of ['description', 'story']) {
        const writer = field === 'description' ? writeDescription : writeStory
        const current = String(f[field] || '').trim()
        // "Ours" = empty, or still exactly what we (or Quick Fill) wrote. Anything else was typed by the admin.
        const ours = !current || current === lastAuto.current[field] || current === writer(before, { ...o, variant: vs[field] })
        if (!ours) continue
        const next = writer(f, { ...o, variant: vs[field] })
        lastAuto.current[field] = next
        if (next === current) continue
        if (current) setHistory((h) => ({ ...h, [field]: [...h[field].slice(-9), current] }))
        set(field, next)
      }
    }, 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, auto])

  const edited = (field) => Boolean((form[field] || '').trim()) && form[field].trim() !== lastAuto.current[field]

  // Notes the admin typed that the story can't use (too short, or just repeating the fit/fabric).
  const ctx = useMemo(() => buildContext(form, keywords), [form, keywords])
  const unused = [
    ['Design note', form.design, ctx.design],
    ['Construction', form.construction, ctx.construction],
    ['Care', form.care, ctx.care],
  ].filter(([, raw, used]) => String(raw || '').trim() && !used)

  function setField(field, value) {
    const current = form[field] || ''
    if (value === current) return
    if (current.trim()) setHistory((h) => ({ ...h, [field]: [...h[field].slice(-9), current] }))
    onChange(field, value)
  }

  function write(field, variant) {
    const text = field === 'description' ? writeDescription(form, { ...opts, variant }) : writeStory(form, { ...opts, variant })
    lastAuto.current[field] = text
    setField(field, text)
  }

  function writeBoth() {
    write('description', variants.description)
    write('story', variants.story)
  }

  function another(field) {
    const next = variants[field] + 1
    setVariants((v) => ({ ...v, [field]: next }))
    write(field, next)
  }

  function undo(field) {
    const stack = history[field]
    if (!stack.length) return
    const previous = stack[stack.length - 1]
    setHistory((h) => ({ ...h, [field]: stack.slice(0, -1) }))
    onChange(field, previous)
  }

  function addFact(field, text) {
    const current = (form[field] || '').trimEnd()
    if (alreadyHas(current, text)) return
    onChange(field, current ? `${current} ${text}` : text)
  }

  const descLen = (form.description || '').trim().length
  const descState = descLen === 0 ? 'idle' : descLen < DESC_IDEAL_MIN ? 'short' : descLen <= DESC_IDEAL_MAX ? 'good' : 'long'
  const descMessage = {
    idle: `Aim for ${DESC_IDEAL_MIN}–${DESC_IDEAL_MAX} characters`,
    short: `${descLen} characters — a little more would help (${DESC_IDEAL_MIN}–${DESC_IDEAL_MAX} is ideal)`,
    good: `${descLen} characters — ideal length`,
    long: `${descLen} characters — may get cut off in search results (${DESC_IDEAL_MAX} max is ideal)`,
  }[descState]

  const storyWords = wordCount(form.story)

  function renderFacts(field) {
    return (
      <div className="copystudio__facts" role="group" aria-label={`Add from your details to the ${field}`}>
        <span className="copystudio__facts-label">Add from your details</span>
        {facts[field].map((f) => {
          const already = alreadyHas(form[field], f.text)
          return (
            <button
              key={f.key}
              type="button"
              className={'copystudio__fact' + (already ? ' copystudio__fact--on' : '')}
              disabled={!f.text || already}
              onClick={() => addFact(field, f.text)}
              title={f.text || 'Fill this in above first'}
            >
              {already ? '✓' : '+'} {f.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="copystudio">
      <div className="copystudio__panel">
        <div className="copystudio__panel-head">
          <strong>Copy studio</strong>
          <span className="copystudio__sub">Writes from your details — facts only, nothing made up.</span>
          <label className="copystudio__auto">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto-write as I fill in details
          </label>
        </div>

        <div className="copystudio__row" role="group" aria-label="Writing vibe">
          <span className="copystudio__label">Vibe</span>
          {VIBES.map((v) => (
            <button
              key={v.key}
              type="button"
              className={'copystudio__chip' + (vibe === v.key ? ' copystudio__chip--on' : '')}
              aria-pressed={vibe === v.key}
              onClick={() => setVibeChoice(v.key === autoVibe && vibeChoice === v.key ? null : v.key)}
              title={v.hint}
            >
              {v.label}
              {v.key === autoVibe && !vibeChoice && <em> · auto</em>}
            </button>
          ))}
        </div>

        <div className="copystudio__row">
          <label className="copystudio__label" htmlFor="copystudio-keywords">
            Theme words
          </label>
          <input
            id="copystudio-keywords"
            className="input copystudio__keywords"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="optional — e.g. anime, samurai, bold back print"
          />
          <div className="copystudio__seg" role="group" aria-label="Length">
            {['short', 'full'].map((l) => (
              <button
                key={l}
                type="button"
                className={'copystudio__segbtn' + (length === l ? ' copystudio__segbtn--on' : '')}
                aria-pressed={length === l}
                onClick={() => setLength(l)}
              >
                {l === 'short' ? 'Short' : 'Full'}
              </button>
            ))}
          </div>
        </div>

        <div className="copystudio__row">
          <button type="button" className="copystudio__write" onClick={writeBoth} disabled={!form.name.trim()}>
            ✦ Write description + story
          </button>
          {!form.name.trim() && <span className="copystudio__sub">Enter the product name first.</span>}
          {form.name.trim() && auto && (
            <span className="copystudio__sub">Both boxes update as you add details. Type in a box yourself and it stops changing that one.</span>
          )}
        </div>
        {unused.length > 0 && (
          <p className="copystudio__sub copystudio__unused">
            Left out of the story (too short or already covered): {unused.map(([label, raw]) => `${label} “${String(raw).trim()}”`).join(', ')}. Add a full sentence to use it.
          </p>
        )}
      </div>

      <Field
        label="Description"
        required
        error={descriptionError}
        onBlur={onDescriptionBlur}
      >
        <textarea
          className="input admin-form__textarea"
          rows={3}
          value={form.description}
          onChange={(e) => onChange('description', e.target.value)}
        />
        <div className="copystudio__bar">
          <button type="button" className="copystudio__mini" onClick={() => another('description')} disabled={!form.name.trim()}>
            ↻ Another version
          </button>
          <button type="button" className="copystudio__mini" onClick={() => undo('description')} disabled={!history.description.length}>
            Undo
          </button>
          {auto && edited('description') && <span className="copystudio__edited">✎ edited by you — auto-write paused here</span>}
          <span className={`copystudio__count copystudio__count--${descState}`}>{descMessage}</span>
        </div>
        {renderFacts('description')}
      </Field>

      <Field label="Product story" hint="Longer editorial/brand copy.">
        <textarea
          className="input admin-form__textarea"
          rows={5}
          value={form.story}
          onChange={(e) => onChange('story', e.target.value)}
        />
        <div className="copystudio__bar">
          <button type="button" className="copystudio__mini" onClick={() => another('story')} disabled={!form.name.trim()}>
            ↻ Another version
          </button>
          <button type="button" className="copystudio__mini" onClick={() => undo('story')} disabled={!history.story.length}>
            Undo
          </button>
          {auto && edited('story') && <span className="copystudio__edited">✎ edited by you — auto-write paused here</span>}
          <span className="copystudio__count">{storyWords} words</span>
        </div>
        {renderFacts('story')}
      </Field>
    </div>
  )
}

export default CopyStudio

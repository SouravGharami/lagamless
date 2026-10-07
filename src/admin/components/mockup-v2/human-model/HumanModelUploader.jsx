import { useState } from 'react'
import { HUMAN_MODEL_ACCEPT } from './humanModelValidation.js'

const REQUIREMENTS = [
  'A realistic photograph',
  'Upper body clearly visible',
  'Wearing a plain/simple top, or a torso area suitable for replacement',
  'Torso not heavily obstructed (crossed arms, bags, large props)',
  'Good, even lighting',
  'Sufficient resolution (1024 px or more on the shorter side is best)',
]

/** STEP 1 — upload area. Shows validation errors/warnings as readable messages. The photo stays in the browser. */
export default function HumanModelUploader({ picker, compact = false }) {
  const [dragging, setDragging] = useState(false)

  return (
    <div className="hms-uploader">
      <input ref={picker.inputRef} type="file" accept={HUMAN_MODEL_ACCEPT} hidden onChange={picker.onChange} />

      {!compact && (
        <button
          type="button"
          className={`hms-drop${dragging ? ' is-dragging' : ''}`}
          disabled={picker.busy}
          onClick={picker.open}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            picker.onDropFile(e.dataTransfer.files?.[0])
          }}
        >
          <span className="hms-drop__title">{picker.busy ? 'Checking image…' : 'Upload AI Human Model'}</span>
          <span className="hms-drop__hint">PNG, JPG, JPEG or WEBP · click or drop a file here</span>
        </button>
      )}

      {picker.errors.length > 0 && (
        <ul className="hms-messages hms-messages--error" role="alert">
          {picker.errors.map((e) => <li key={e.code}>{e.message}</li>)}
        </ul>
      )}
      {picker.warnings.length > 0 && (
        <ul className="hms-messages hms-messages--warn" role="status">
          {picker.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
        </ul>
      )}

      {!compact && (
        <div className="hms-req">
          <h4 className="hms-req__title">Photo requirements</h4>
          <ul className="hms-req__list">
            {REQUIREMENTS.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <p className="hms-hint">These are guidelines, not strict rules — a useful photo is never rejected for style. The image is kept in your browser and is not sent anywhere.</p>
        </div>
      )}
    </div>
  )
}

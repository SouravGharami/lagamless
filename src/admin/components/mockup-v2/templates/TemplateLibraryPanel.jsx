import { useState } from 'react'
import TemplateCard from './TemplateCard.jsx'
import TemplateUploadForm from './TemplateUploadForm.jsx'
import { useTemplateLibrary } from './useTemplateLibrary.js'
import { useImagePicker } from '../useImagePicker.js'
import { TSHIRT_ACCEPT, TSHIRT_ACCEPTED } from '../mockupStudioAssets.js'
import { ANGLE_DEFS } from '../generation/mockupAngles.js'
import { GARMENT_DEFS } from '../generation/templateModel.js'
import { filterTemplates, ANGLE_FILTER_ALL, GARMENT_FILTER_ALL } from '../generation/templateLibrary.js'
import { UploadIcon } from '../icons.jsx'

/** "Real photo templates": upload, browse, filter and manage photographic templates. It never generates or edits an image. */
export default function TemplateLibraryPanel({ state, dispatch }) {
  const { snapshot, library } = useTemplateLibrary()
  const [pendingAsset, setPendingAsset] = useState(null)
  const [angle, setAngle] = useState(ANGLE_FILTER_ALL)
  const [garment, setGarment] = useState(GARMENT_FILTER_ALL)

  const picker = useImagePicker({ dispatch, onAsset: (asset) => setPendingAsset(asset), accepted: TSHIRT_ACCEPTED })
  const appliedId = state.sourceAssets.tshirt?.fromTemplateId ?? null
  const visible = filterTemplates(snapshot.entries, { angle, garment })

  async function save(fields) {
    await library.addTemplate(pendingAsset, fields)
    setPendingAsset(null)
  }
  function cancel() {
    if (pendingAsset?.url) URL.revokeObjectURL(pendingAsset.url)
    setPendingAsset(null)
  }

  return (
    <div className="mv2-group mv2-tplib">
      <h3 className="mv2-group__title">Real photo templates</h3>
      <input ref={picker.inputRef} type="file" accept={TSHIRT_ACCEPT} hidden onChange={picker.onChange} />

      {snapshot.notice && (
        <p className="mv2-hint mv2-hint--accent" role="status">
          {snapshot.notice} <button type="button" className="mv2-link" onClick={library.clearNotice}>Dismiss</button>
        </p>
      )}

      {pendingAsset ? (
        <TemplateUploadForm key={pendingAsset.url} asset={pendingAsset} onSave={save} onCancel={cancel} />
      ) : (
        <button type="button" className="mv2-btn mv2-btn--block mv2-btn--primary" onClick={picker.open}>
          <UploadIcon /> Upload Real Photo
        </button>
      )}

      <div className="mv2-tpl-filters">
        <label className="mv2-field">
          <span className="mv2-field__label">Angle</span>
          <select className="mv2-select" value={angle} onChange={(e) => setAngle(e.target.value)}>
            <option value={ANGLE_FILTER_ALL}>All</option>
            {ANGLE_DEFS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="mv2-field">
          <span className="mv2-field__label">Garment</span>
          <select className="mv2-select" value={garment} onChange={(e) => setGarment(e.target.value)}>
            <option value={GARMENT_FILTER_ALL}>All</option>
            {GARMENT_DEFS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </label>
      </div>

      {snapshot.status === 'loading' && <p className="mv2-hint" role="status">Loading templates…</p>}
      {snapshot.status === 'error' && (
        <p className="mv2-status mv2-status--error" role="alert">
          {snapshot.error} <button type="button" className="mv2-link" onClick={() => library.load({ force: true })}>Try again</button>
        </p>
      )}

      {snapshot.status === 'ready' && snapshot.entries.length === 0 && (
        <p className="mv2-hint">No photo templates yet. Upload a real photograph of the garment — only the angles you upload will exist.</p>
      )}
      {snapshot.entries.length > 0 && visible.length === 0 && <p className="mv2-hint">No templates match these filters.</p>}

      {visible.length > 0 && (
        <ul className="mv2-tpl-grid" aria-label="Photo templates">
          {visible.map((entry) => (
            <TemplateCard key={entry.template.id} entry={entry} inUse={appliedId === entry.template.id} library={library} dispatch={dispatch} />
          ))}
        </ul>
      )}
    </div>
  )
}

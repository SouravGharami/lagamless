import { useMemo, useState } from 'react'
import { ANGLE_DEFS, DEFAULT_ANGLE, getAngle } from '../generation/mockupAngles.js'
import { REGION_DEFS } from '../generation/artworkRegions.js'
import { GARMENT_DEFS, DEFAULT_GARMENT_TYPE, TEMPLATE_COLORS } from '../generation/templateModel.js'
import { describeImageInfo, assessImageQuality } from '../generation/templateImageInfo.js'

const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

/** Metadata form for one freshly picked photograph. The photo is shown and stored as-is. */
export default function TemplateUploadForm({ asset, onSave, onCancel }) {
  const [name, setName] = useState(asset.name)
  const [description, setDescription] = useState('')
  const [angle, setAngle] = useState(DEFAULT_ANGLE)
  const [garmentType, setGarmentType] = useState(DEFAULT_GARMENT_TYPE)
  const [colors, setColors] = useState(['any'])
  const [regions, setRegions] = useState(getAngle(DEFAULT_ANGLE).regions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const info = useMemo(() => describeImageInfo({ width: asset.width, height: asset.height, fileType: asset.file?.type, bytes: asset.file?.size }), [asset])
  const quality = assessImageQuality(asset)

  function changeAngle(next) {
    setAngle(next)
    setRegions(getAngle(next).regions) // sensible starting point; still editable
  }
  function pickColor(id) {
    setColors((current) => {
      if (id === 'any') return ['any']
      const next = toggle(current.filter((c) => c !== 'any'), id)
      return next.length ? next : ['any']
    })
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave({ name, description, angle, garmentType, colors, supportedRegions: regions })
    } catch (err) {
      setError(err?.message || 'Could not save the template.')
      setSaving(false)
    }
  }

  return (
    <form className="mv2-tpl-form" onSubmit={submit}>
      <img className="mv2-tpl-form__photo" src={asset.url} alt={`Preview of ${asset.name}`} />
      <p className="mv2-hint">
        {[info.dimensions, info.aspectRatio && `ratio ${info.aspectRatio}`, info.fileType, info.size].filter(Boolean).join(' · ')}
      </p>
      {!quality.ok && <p className="mv2-hint mv2-hint--accent" role="status">{quality.message}</p>}

      <label className="mv2-field">
        <span className="mv2-field__label">Template name</span>
        <span className="mv2-field__control"><input type="text" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required /></span>
      </label>

      <label className="mv2-field">
        <span className="mv2-field__label">Description (optional)</span>
        <span className="mv2-field__control"><input type="text" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} /></span>
      </label>

      <label className="mv2-field">
        <span className="mv2-field__label">Angle shown in this photo</span>
        <select className="mv2-select" value={angle} onChange={(e) => changeAngle(e.target.value)}>
          {ANGLE_DEFS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </label>

      <label className="mv2-field">
        <span className="mv2-field__label">Garment</span>
        <select className="mv2-select" value={garmentType} onChange={(e) => setGarmentType(e.target.value)}>
          {GARMENT_DEFS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
      </label>

      <fieldset className="mv2-tpl-set">
        <legend className="mv2-field__label">Compatible T-shirt colours (info only — the photo is never recoloured)</legend>
        <div className="mv2-tpl-chips">
          {TEMPLATE_COLORS.map((c) => (
            <button key={c.id} type="button" className={`mv2-chip${colors.includes(c.id) ? ' is-active' : ''}`} aria-pressed={colors.includes(c.id)} onClick={() => pickColor(c.id)}>{c.label}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mv2-tpl-set">
        <legend className="mv2-field__label">Print areas this photo can show</legend>
        <div className="mv2-tpl-chips">
          {REGION_DEFS.map((r) => (
            <button key={r.id} type="button" className={`mv2-chip${regions.includes(r.id) ? ' is-active' : ''}`} aria-pressed={regions.includes(r.id)} onClick={() => setRegions((cur) => toggle(cur, r.id))}>{r.label}</button>
          ))}
        </div>
      </fieldset>

      <p className="mv2-hint">You are declaring this is a real photograph. It is stored exactly as uploaded — no recolouring, stylising, upscaling or generation.</p>
      {error && <p className="mv2-status mv2-status--error" role="alert">{error}</p>}

      <div className="mv2-tpl-actions">
        <button type="submit" className="mv2-btn mv2-btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Save template'}</button>
        <button type="button" className="mv2-btn" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </form>
  )
}

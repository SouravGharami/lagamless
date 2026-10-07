import { useRef, useState } from 'react'
import { getAngle } from '../generation/mockupAngles.js'
import { getGarmentDef, TEMPLATE_SOURCE_TYPES } from '../generation/templateModel.js'
import { describeImageInfo, assessImageQuality, aspectDiffers } from '../generation/templateImageInfo.js'
import { TSHIRT_ACCEPT, TSHIRT_ACCEPTED, readImageFile } from '../mockupStudioAssets.js'

const SOURCE_LABEL = { [TEMPLATE_SOURCE_TYPES.STORED_TEMPLATE]: 'Stored template', [TEMPLATE_SOURCE_TYPES.UPLOADED_PHOTO]: 'Uploaded photo (this session)' }

/** One photographic template: the photo, its facts, and safe management actions. */
export default function TemplateCard({ entry, inUse, library, dispatch }) {
  const { template: t, persisted } = entry
  const fileRef = useRef(null)
  const [pending, setPending] = useState(null) // a picked replacement photo awaiting confirmation
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const info = describeImageInfo(t.imageInfo)
  const quality = assessImageQuality(t.imageInfo)
  const fail = (err) => dispatch({ type: 'NOTICE', message: err?.message || 'That action failed.' })

  async function run(fn) {
    setBusy(true)
    try { await fn() } catch (err) { fail(err) } finally { setBusy(false) }
  }

  async function onPickReplacement(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const asset = await readImageFile(file, TSHIRT_ACCEPTED)
      if (aspectDiffers(asset, t.imageInfo)) setPending(asset) // needs a warning first
      else await commitReplacement(asset)
    } catch (err) { fail(err) }
  }

  async function commitReplacement(asset) {
    await run(async () => {
      const { unchanged } = await library.replacePhoto(t.id, asset)
      if (unchanged) return
      if (inUse) dispatch({ type: 'REPLACE_TEMPLATE_PHOTO', id: t.id })
    })
    setPending(null)
  }

  function cancelReplacement() {
    if (pending?.url) URL.revokeObjectURL(pending.url)
    setPending(null)
  }

  const toggleActive = () => run(async () => {
    await library.setActive(t.id, !t.active)
    if (t.active && inUse) dispatch({ type: 'DETACH_TEMPLATE_PHOTO', id: t.id }) // deactivated while loaded: keep the photo, drop the template link
  })

  const remove = () => run(async () => {
    if (inUse) dispatch({ type: 'DETACH_TEMPLATE_PHOTO', id: t.id })
    await library.removeTemplate(t.id)
  })

  return (
    <li className={`mv2-tpl${t.active ? '' : ' is-inactive'}${inUse ? ' is-selected' : ''}`}>
      <div className="mv2-tpl__photo">
        {/* A photograph shown as a photograph: no filters, no stylising. */}
        <img src={t.previewImage || t.source.url} alt={`${t.name} — ${getAngle(t.angle)?.label ?? t.angle}`} loading="lazy" />
        {inUse && <span className="mv2-tpl__badge">In use</span>}
        {!t.active && <span className="mv2-tpl__badge mv2-tpl__badge--off">Inactive</span>}
      </div>

      <div className="mv2-tpl__body">
        <strong className="mv2-tpl__name" title={t.name}>{t.name}</strong>
        <span className="mv2-tpl__meta">{getAngle(t.angle)?.label} · {getGarmentDef(t.garmentType)?.label ?? t.garmentType}</span>
        <span className="mv2-tpl__meta">{SOURCE_LABEL[t.sourceType] ?? t.sourceType}{!persisted && ' · not saved'}</span>
        <span className="mv2-tpl__meta">{[info.dimensions, info.aspectRatio && `ratio ${info.aspectRatio}`, info.fileType].filter(Boolean).join(' · ')}</span>
        {!quality.ok && <span className="mv2-tpl__warn">{quality.message}</span>}
      </div>

      {pending ? (
        <div className="mv2-tpl__confirm" role="alertdialog" aria-label="Confirm photo replacement">
          <p className="mv2-hint mv2-hint--accent">
            The new photo has a different shape ({describeImageInfo(pending).aspectRatio} vs {info.aspectRatio}). Artwork positions are relative to the photo, so
            {inUse ? ' the placed artwork will keep its proportions but may sit differently on the new garment.' : ' placements may need adjusting when this template is used.'}
          </p>
          <div className="mv2-tpl-actions">
            <button type="button" className="mv2-btn mv2-btn--primary" disabled={busy} onClick={() => commitReplacement(pending)}>Replace anyway</button>
            <button type="button" className="mv2-btn" disabled={busy} onClick={cancelReplacement}>Cancel</button>
          </div>
        </div>
      ) : confirmDelete ? (
        <div className="mv2-tpl__confirm" role="alertdialog" aria-label="Confirm delete">
          <p className="mv2-hint mv2-hint--accent">Remove “{t.name}” from the library? The photo file is kept, but the template will no longer be listed.</p>
          <div className="mv2-tpl-actions">
            <button type="button" className="mv2-btn mv2-btn--danger" disabled={busy} onClick={remove}>Delete</button>
            <button type="button" className="mv2-btn" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep</button>
          </div>
        </div>
      ) : (
        <div className="mv2-tpl__actions">
          {inUse ? (
            <button type="button" className="mv2-btn is-active" disabled={busy} onClick={() => dispatch({ type: 'RELEASE_TEMPLATE_PHOTO' })} title="Go back to your own T-shirt photo">Use my photo</button>
          ) : (
            <button type="button" className="mv2-btn mv2-btn--primary" disabled={busy || !t.active} onClick={() => dispatch({ type: 'APPLY_TEMPLATE_PHOTO', id: t.id })}>{t.active ? 'Use' : 'Inactive'}</button>
          )}
          <button type="button" className="mv2-btn" disabled={busy} onClick={() => fileRef.current?.click()}>Replace Photo</button>
          <button type="button" className="mv2-btn" disabled={busy} onClick={toggleActive}>{t.active ? 'Deactivate' : 'Activate'}</button>
          <button type="button" className="mv2-btn mv2-btn--danger" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete</button>
          <input ref={fileRef} type="file" accept={TSHIRT_ACCEPT} hidden onChange={onPickReplacement} />
        </div>
      )}
    </li>
  )
}

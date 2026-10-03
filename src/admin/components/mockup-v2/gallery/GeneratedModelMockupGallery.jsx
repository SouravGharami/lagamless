import { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmDialog from '../../ConfirmDialog.jsx'
import MockupPreviewDialog from './MockupPreviewDialog.jsx'
import { generatedProviderLabel, generatedStatusLabel, generatedViewLabel } from './generatedModelLabels.js'
import {
  addToProductImages, deleteGeneratedMockup, friendlyGeneratedMockupError, listGeneratedMockups,
  moveGenerated, reorderGeneratedMockups, setGeneratedStatus, setMainGeneratedMockup,
} from '../../../../services/generatedMockups.js'
import './MockupGallery.css'

/**
 * HUMAN MODEL VTON RESULTS — admin gallery for ONE product. Reads `generated_model_mockups` (NOT product_mockups).
 * Results stay PENDING until approved. Nothing reaches the storefront until "Add to product images" is pressed.
 * All database work goes through src/services/generatedMockups.js.
 */
export default function GeneratedModelMockupGallery({ productId, refreshKey = 0 }) {
  const [items, setItems] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  const [notice, setNotice] = useState(null)
  const [preview, setPreview] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [applyTo, setApplyTo] = useState(null) // { item, slot }
  const [imgFailed, setImgFailed] = useState({})
  const currentProduct = useRef(productId)
  currentProduct.current = productId
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const reload = useCallback(async () => {
    try {
      const list = await listGeneratedMockups(productId)
      if (!alive.current || currentProduct.current !== productId) return
      setItems(list)
      setError(null)
    } catch (err) {
      if (!alive.current || currentProduct.current !== productId) return
      console.error('[generated-gallery]', err)
      setError(`Could not load generated VTON results. ${friendlyGeneratedMockupError(err, '')}`.trim())
    }
  }, [productId])

  useEffect(() => { setItems(null); setNotice(null); setPreview(null); setImgFailed({}) }, [productId])
  useEffect(() => { reload() }, [reload, refreshKey])

  async function run(item, label, fn, okMessage) {
    if (busy) return
    setBusy({ id: item.id, label })
    setNotice(null)
    try {
      await fn()
      if (okMessage) setNotice({ kind: 'ok', text: okMessage })
    } catch (err) {
      setNotice({ kind: 'error', text: friendlyGeneratedMockupError(err, 'That action failed. Nothing was changed — please try again.') })
    } finally {
      if (alive.current) setBusy(null)
      await reload()
    }
  }

  const label = (item) => generatedViewLabel(item.view)
  const approve = (item) => run(item, 'Approving…', () => setGeneratedStatus(item.id, 'approved'), `${label(item)} approved.`)
  const reject = (item) => run(item, 'Rejecting…', () => setGeneratedStatus(item.id, 'rejected'), `${label(item)} rejected.`)
  const backToPending = (item) => run(item, 'Updating…', () => setGeneratedStatus(item.id, 'pending'), `${label(item)} is pending again.`)
  const setMain = (item) => run(item, 'Setting main…', () => setMainGeneratedMockup(item.id), `${label(item)} is now the main model mockup.`)
  const move = (item, delta) => run(item, 'Reordering…', async () => {
    const ids = moveGenerated(items, item.id, delta)
    if (ids) await reorderGeneratedMockups(productId, ids)
  }, 'Order updated.')
  const doRemove = (item) => run(item, 'Removing…', () => deleteGeneratedMockup(item), `${label(item)} result removed.`)
  const doAdd = () => {
    const { item, slot } = applyTo
    setApplyTo(null)
    run(item, 'Adding…', () => addToProductImages(item, { slot }), `${label(item)} added to the product images (${slot === 'main' ? 'main image' : 'model image'}). Reopen the product form to see it in the Images section.`)
  }

  const approvedIds = (items ?? []).filter((m) => m.approved).map((m) => m.id)
  // MockupPreviewDialog reads { viewType, imageUrl, isMain, width, height }; viewType is passed as the display label.
  const previewItems = (items ?? []).map((m) => ({ ...m, viewType: generatedViewLabel(m.view) }))

  return (
    <div className="mgal">
      {notice && <p className={`mgal__notice${notice.kind === 'error' ? ' is-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}

      {error && (
        <div className="mgal__state" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={reload}>Try again</button>
        </div>
      )}

      {!error && items === null && <p className="mgal__state text-small" role="status">Loading generated VTON results…</p>}

      {!error && items?.length === 0 && (
        <p className="mgal__state text-small">No human-model results yet. Open Mockup Studio → Human Model → FIT T-SHIRT TO MODEL.</p>
      )}

      {items?.length > 0 && (
        <ul className="mgal__grid">
          {items.map((item, i) => {
            const working = busy?.id === item.id
            const approvedIndex = approvedIds.indexOf(item.id)
            return (
              <li key={item.id} className={`mgal-card${item.isMain ? ' is-main' : ''}`}>
                <button type="button" className="mgal-card__img" onClick={() => setPreview(i)} aria-label={`Preview ${label(item)} VTON result`}>
                  {imgFailed[item.id]
                    ? <span className="mgal-card__busy" role="alert">Image failed to load — {label(item)} · {generatedProviderLabel(item.provider)}</span>
                    : <img src={item.imageUrl} alt={`${label(item)} model wearing the T-shirt`} loading="lazy" decoding="async" onError={() => setImgFailed((f) => ({ ...f, [item.id]: true }))} />}
                  {working && <span className="mgal-card__busy" role="status">{busy.label}</span>}
                </button>
                <div className="mgal-card__head">
                  <span className="text-label">{label(item)}</span>
                  <span>
                    {item.isMain && <span className="mgal-card__main">Main</span>}{' '}
                    <span className="text-small">{generatedStatusLabel(item).toUpperCase()}</span>
                  </span>
                </div>
                <p className="mgal-card__meta text-small">
                  {item.width ? `${item.width}×${item.height} · ` : ''}{generatedProviderLabel(item.provider)}
                  {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleString()}` : ''}
                </p>
                <div className="mgal-card__actions">
                  <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setPreview(i)}>Preview</button>
                  {!item.approved && <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => approve(item)}>Approve</button>}
                  {item.status !== 'rejected' && <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => reject(item)}>Reject</button>}
                  {item.status === 'rejected' && <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => backToPending(item)}>Back to pending</button>}
                  {item.approved && !item.isMain && <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setMain(item)}>Set as Main</button>}
                  {item.approved && <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setApplyTo({ item, slot: 'model' })}>Add to product images</button>}
                  <button type="button" className="btn btn-secondary mgal-card__remove" disabled={Boolean(busy)} onClick={() => setConfirm(item)}>Remove</button>
                </div>
                {item.promotedImageId && <p className="mgal-card__hint text-small">Already added to the product images.</p>}
                {item.approved && (
                  <div className="mgal-card__order">
                    <button type="button" className="btn-ghost" disabled={Boolean(busy) || approvedIndex <= 0} onClick={() => move(item, -1)}>← Earlier</button>
                    <button type="button" className="btn-ghost" disabled={Boolean(busy) || approvedIndex === approvedIds.length - 1} onClick={() => move(item, 1)}>Later →</button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {preview !== null && previewItems[preview] && (
        <MockupPreviewDialog items={previewItems} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} />
      )}

      {applyTo && (
        <div className="admin-dialog__backdrop" onClick={() => setApplyTo(null)}>
          <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="gmg-apply-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="gmg-apply-title" className="text-h3">Add to product images</h2>
            <p className="text-small admin-dialog__description">
              This publishes the {label(applyTo.item)} model image through the existing product image workflow. It is a deliberate step:
              approved results are never published automatically.
            </p>
            <label className="admin-field">
              <span className="text-label">Product image slot</span>
              <select className="input" value={applyTo.slot} onChange={(e) => setApplyTo({ ...applyTo, slot: e.target.value })}>
                <option value="model">Model image (adds an image)</option>
                <option value="main">Main image (replaces the current main image)</option>
              </select>
            </label>
            <div className="admin-dialog__actions">
              <button type="button" className="btn btn-secondary" onClick={() => setApplyTo(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={doAdd}>Add image</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        destructive
        title={`Remove the ${confirm ? label(confirm) : ''} VTON result?`}
        description="It is removed from this gallery. The product, the studio mockups and any product image you already added are not affected."
        confirmLabel="Remove"
        onConfirm={() => { const c = confirm; setConfirm(null); doRemove(c) }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

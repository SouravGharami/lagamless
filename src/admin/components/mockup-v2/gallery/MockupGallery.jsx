import { useCallback, useEffect, useRef, useState } from 'react'
import ConfirmDialog from '../../ConfirmDialog.jsx'
import MockupPreviewDialog from './MockupPreviewDialog.jsx'
import { destinationSlots, isRegenerable, viewLabel, viewSlug } from './galleryModel.js'
import { regenerateMockup, validateReplacementFile } from './mockupRender.js'
import { downloadMockupBlob, friendlyMockupError, listMockups, moveMockup, removeMockup, replaceMockupImage, setMainMockup } from '../../../../services/adminMockups.js'
import './MockupGallery.css'

/**
 * Admin Mockup Gallery for ONE product: preview, replace, regenerate, remove, set as main, reorder.
 * All data comes from product_mockups filtered by productId, so mockups cannot leak between products.
 * `refreshKey` changes whenever the studio saves something.
 */
export default function MockupGallery({ productId, refreshKey = 0, productImages = null, onUseAsProductImage = null }) {
  const [items, setItems] = useState(null) // null = loading
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null) // { id, label } while one action runs — every action is disabled meanwhile
  const [notice, setNotice] = useState(null)
  const [preview, setPreview] = useState(null) // index into items
  const [confirm, setConfirm] = useState(null) // { kind: 'remove' | 'regenerate', item }
  const [applyTo, setApplyTo] = useState(null) // { item, slot } — "Use as product image" dialog
  const currentProduct = useRef(productId)
  currentProduct.current = productId
  const fileRef = useRef(null)
  const replaceTarget = useRef(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const reload = useCallback(async () => {
    try {
      const list = await listMockups(productId)
      if (!alive.current || currentProduct.current !== productId) return // a slow answer for a previous product is dropped
      setItems(list)
      setError(null)
    } catch (err) {
      if (alive.current && currentProduct.current === productId) setError(friendlyMockupError(err, 'Could not load the gallery. Check your connection and try again.'))
    }
  }, [productId])

  // A different product starts from a clean, loading gallery; a save in the studio (refreshKey) refreshes in place.
  useEffect(() => { setItems(null); setNotice(null); setPreview(null) }, [productId])
  useEffect(() => { reload() }, [reload, refreshKey])

  async function run(item, label, fn, okMessage) {
    if (busy) return
    setBusy({ id: item.id, label })
    setNotice(null)
    try {
      await fn()
      if (okMessage) setNotice({ kind: 'ok', text: okMessage })
    } catch (err) {
      setNotice({ kind: 'error', text: friendlyMockupError(err, 'That action failed. Nothing was changed — please try again.') })
    } finally {
      if (alive.current) setBusy(null)
      await reload()
    }
  }

  const setMain = (item) => run(item, 'Setting main…', () => setMainMockup(item.id), `${viewLabel(item.viewType)} is now the main mockup.`)
  const move = (item, delta) => run(item, 'Reordering…', () => moveMockup(productId, items, item.id, delta), 'Order updated.')
  const doRemove = (item) => run(item, 'Removing…', () => removeMockup(item, items), `${viewLabel(item.viewType)} mockup removed.`)
  const doRegenerate = (item) => run(item, 'Regenerating…', () => regenerateMockup(item), `${viewLabel(item.viewType)} mockup regenerated.`)

  // Queue the mockup into the product form's EXISTING image slot; it is written by the form's normal "Save" (syncProductImages).
  function applyAsProductImage() {
    const { item, slot } = applyTo
    setApplyTo(null)
    run(item, 'Preparing…', async () => {
      const blob = await downloadMockupBlob(item.imagePath)
      const ext = item.imagePath.split('.').pop() || 'png'
      onUseAsProductImage(slot, new File([blob], `${viewSlug(item.viewType)}-mockup.${ext}`, { type: blob.type || 'image/png' }))
    }, `${viewLabel(item.viewType)} mockup queued as the product's ${destinationSlots(item).find((d) => d.key === slot)?.label ?? slot} image — click Save changes to apply it.`)
  }

  function pickReplacement(item) {
    replaceTarget.current = item
    if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click() }
  }

  function onFileChosen(e) {
    const file = e.target.files?.[0]
    const item = replaceTarget.current
    e.target.value = ''
    if (!file || !item) return
    run(item, 'Uploading…', async () => {
      const size = await validateReplacementFile(file)
      await replaceMockupImage(item, { blob: file, width: size.width, height: size.height, origin: 'uploaded' })
    }, `${viewLabel(item.viewType)} mockup replaced.`)
  }

  useEffect(() => {
    if (!applyTo) return
    const onKey = (e) => { if (e.key === 'Escape') setApplyTo(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [applyTo])

  const scrollToStudio = () => {
    const el = document.getElementById('mockup-studio-section')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.querySelector('button')?.focus()
  }

  return (
    <div className="mgal">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={onFileChosen} />

      {notice && (
        <p className={`mgal__notice${notice.kind === 'error' ? ' is-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>
      )}

      {error && (
        <div className="mgal__state" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary" onClick={reload}>Try again</button>
        </div>
      )}

      {!error && items === null && <p className="mgal__state text-small" role="status">Loading mockups…</p>}

      {!error && items?.length === 0 && (
        <div className="mgal__state">
          <p>No mockups generated yet.</p>
          <button type="button" className="btn btn-secondary" onClick={scrollToStudio}>Go to Mockup Studio</button>
        </div>
      )}

      {items?.length > 0 && (
        <ul className="mgal__grid">
          {items.map((item, i) => {
            const working = busy?.id === item.id
            const canRegen = isRegenerable(item)
            return (
              <li key={item.id} className={`mgal-card${item.isMain ? ' is-main' : ''}`}>
                <button type="button" className="mgal-card__img" onClick={() => setPreview(i)} aria-label={`Preview ${viewLabel(item.viewType)} mockup`}>
                  <img src={item.imageUrl} alt={`${viewLabel(item.viewType)} mockup`} loading="lazy" decoding="async" />
                  {working && <span className="mgal-card__busy" role="status">{busy.label}</span>}
                </button>
                <div className="mgal-card__head">
                  <span className="text-label">{viewLabel(item.viewType)}</span>
                  {item.isMain && <span className="mgal-card__main">Main</span>}
                </div>
                <p className="mgal-card__meta text-small">
                  {item.width ? `${item.width}×${item.height} · ` : ''}{item.origin === 'uploaded' ? 'Uploaded image' : 'Studio render'}
                </p>
                <div className="mgal-card__actions">
                  <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setPreview(i)} aria-label={`Preview ${viewLabel(item.viewType)} mockup`}>Preview</button>
                  <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => pickReplacement(item)} aria-label={`Replace ${viewLabel(item.viewType)} mockup image`}>Replace</button>
                  <button type="button" className="btn btn-secondary" disabled={Boolean(busy) || !canRegen}
                    title={canRegen ? 'Re-render from the saved studio settings' : 'No saved render settings for this mockup'}
                    aria-label={`Regenerate ${viewLabel(item.viewType)} mockup`}
                    onClick={() => (item.origin === 'uploaded' ? setConfirm({ kind: 'regenerate', item }) : doRegenerate(item))}>
                    Regenerate
                  </button>
                  {!item.isMain && <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setMain(item)} aria-label={`Set ${viewLabel(item.viewType)} as main mockup`}>Set as Main</button>}
                  {onUseAsProductImage && (
                    <button type="button" className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => setApplyTo({ item, slot: destinationSlots(item)[0].key })} aria-label={`Use ${viewLabel(item.viewType)} mockup as product image`}>Use as product image</button>
                  )}
                  <button type="button" className="btn btn-secondary mgal-card__remove" disabled={Boolean(busy)} onClick={() => setConfirm({ kind: 'remove', item })} aria-label={`Remove ${viewLabel(item.viewType)} mockup`}>Remove</button>
                </div>
                {!canRegen && <p className="mgal-card__hint text-small">Can&apos;t be regenerated: no saved render settings. Recreate it in Mockup Studio and save it again.</p>}
                <div className="mgal-card__order">
                  <button type="button" className="btn-ghost" disabled={Boolean(busy) || i === 0} onClick={() => move(item, -1)} aria-label={`Move ${viewLabel(item.viewType)} earlier`}>← Earlier</button>
                  <button type="button" className="btn-ghost" disabled={Boolean(busy) || i === items.length - 1} onClick={() => move(item, 1)} aria-label={`Move ${viewLabel(item.viewType)} later`}>Later →</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {preview !== null && items?.[preview] && (
        <MockupPreviewDialog items={items} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} />
      )}

      {applyTo && (
        <div className="admin-dialog__backdrop" onClick={() => setApplyTo(null)}>
          <div className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="mgal-apply-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="mgal-apply-title" className="text-h3">Use as product image</h2>
            <p className="text-small admin-dialog__description">
              Copies this {viewLabel(applyTo.item.viewType)} mockup into the product&apos;s image slot below. It is only applied when you
              click Save changes, and it does not replace anything else. The gallery mockup stays as it is.
            </p>
            <label className="admin-field">
              <span className="text-label">Product image slot</span>
              <select className="input" value={applyTo.slot} onChange={(e) => setApplyTo({ ...applyTo, slot: e.target.value })}>
                {destinationSlots(applyTo.item).map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            {productImages?.[applyTo.slot]?.src && (
              <p className="text-small">The current {destinationSlots(applyTo.item).find((d) => d.key === applyTo.slot)?.label} image will be replaced when you save the product.</p>
            )}
            <div className="admin-dialog__actions">
              <button type="button" className="btn btn-secondary" onClick={() => setApplyTo(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={applyAsProductImage}>Use image</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        destructive
        title={`Remove the ${confirm ? viewLabel(confirm.item.viewType) : ''} mockup?`}
        description={confirm?.item.isMain
          ? 'This is the main mockup. It will be removed from the gallery and the next mockup will become main. The product, the other mockups and the source photos are not affected.'
          : 'It will be removed from the gallery. The product, the other mockups and the source photos are not affected.'}
        confirmLabel="Remove"
        onConfirm={() => { const c = confirm; setConfirm(null); doRemove(c.item) }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm?.kind === 'regenerate'}
        title={`Regenerate the ${confirm ? viewLabel(confirm.item.viewType) : ''} mockup?`}
        description="This view currently shows an image you uploaded. Regenerating replaces it with a fresh render from the saved studio settings."
        confirmLabel="Regenerate"
        onConfirm={() => { const c = confirm; setConfirm(null); doRegenerate(c.item) }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

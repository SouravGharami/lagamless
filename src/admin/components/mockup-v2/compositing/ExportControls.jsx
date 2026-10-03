import { useCallback, useEffect, useRef, useState } from 'react'
import { COMPOSITE_ERROR, CompositeError, toCompositeError } from './compositeErrors.js'
import { downloadBlob, exportableViews, renderFinalView, snapshotView } from './finalRender.js'
import { DEFAULT_ANGLE } from '../generation/mockupAngles.js'
import ConfirmDialog from '../../ConfirmDialog.jsx'
import { useMockupProduct } from '../gallery/MockupProductContext.js'
import { saveStudioView } from '../gallery/mockupRender.js'
import { viewLabel } from '../gallery/galleryModel.js'
import { friendlyMockupError, listMockups } from '../../../../services/adminMockups.js'

/** Decodes a fresh image for one export (not the preview's cache, so the export can release it when done). */
function loadForExport(url, label) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new CompositeError(COMPOSITE_ERROR.MISSING_PHOTO, `The ${label} is missing.`))
    const img = new Image()
    img.onload = () => (img.naturalWidth > 0 ? resolve(img) : reject(new CompositeError(COMPOSITE_ERROR.INVALID_IMAGE, `The ${label} decoded with no size.`)))
    img.onerror = () => reject(new CompositeError(COMPOSITE_ERROR.CORRUPTED_IMAGE, `The ${label} could not be decoded. It may be corrupted or in an unsupported format.`))
    img.src = url
  })
}

/**
 * Step 5-4 — final PNG export. Reads a deep-copied snapshot of the view(s) and runs the ONE compositor at the photograph's
 * native size (finalRender.renderFinalView). It dispatches nothing: the editor's selection, transforms, warp and fabric
 * settings are untouched. The exported image contains only the composite — the selection overlay is a separate DOM layer.
 */
export default function ExportControls({ state }) {
  const [status, setStatus] = useState({ kind: 'idle', message: '' })
  const [confirmReplace, setConfirmReplace] = useState(null) // { view, label, record } — an existing gallery mockup that saving would replace
  const { productId, onMockupsChanged } = useMockupProduct()
  const [savedViews, setSavedViews] = useState([]) // view ids already in THIS product's gallery
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const activeView = state.composition.activeView ?? DEFAULT_ANGLE
  const views = exportableViews(state)
  const busy = status.kind === 'working'
  const activeReady = views.some((v) => v.view === activeView && v.layers > 0)
  const readyViews = views.filter((v) => v.layers > 0)

  const refreshSaved = useCallback(async () => {
    if (!productId) return setSavedViews([])
    try {
      const list = await listMockups(productId)
      if (alive.current) setSavedViews(list.map((m) => m.viewType))
    } catch { /* the gallery below reports load errors; this line is informational */ }
  }, [productId])
  useEffect(() => { refreshSaved() }, [refreshSaved])

  const say = (kind, message) => { if (alive.current) setStatus({ kind, message }) }

  async function run(targets) {
    if (busy) return
    const done = []
    const failed = []
    for (const target of targets) {
      say('working', `Rendering ${target.label}…`)
      try {
        const job = snapshotView(state, target.view)
        const result = await renderFinalView(job, { loadImage: loadForExport })
        downloadBlob(result.blob, result.filename)
        done.push(`${result.filename} (${result.width}×${result.height}${result.downscaled ? `, reduced from ${result.sourceWidth}×${result.sourceHeight} to fit this device` : ''})`)
      } catch (err) {
        failed.push(`${target.label}: ${toCompositeError(err).message}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 0)) // let the browser breathe / free memory between views
    }
    if (failed.length) say('error', `${done.length ? `Exported ${done.join(', ')}. ` : ''}Could not export — ${failed.join(' ')}`)
    else say('ok', `Exported ${done.join(', ')}.`)
  }

  // Step 5-5: same snapshot + same renderer as Download PNG, but the result goes to this product's gallery instead of a file.
  async function saveToGallery(view, label, replace = null) {
    say('working', `Rendering and saving ${label}…`)
    try {
      await saveStudioView({ state, view, productId, replace })
      onMockupsChanged(view)
      refreshSaved()
      say('ok', `${label} ${replace ? 'replaced in' : 'saved to'} the Mockup Gallery.`)
    } catch (err) {
      say('error', `Could not save ${label}. ${friendlyMockupError(err, 'Nothing was saved — check your connection and try again.')}`)
    }
  }

  async function requestSave() {
    if (busy) return
    const label = views.find((v) => v.view === activeView)?.label ?? viewLabel(activeView)
    say('working', `Checking the gallery for ${label}…`) // also disables every button, so a double click cannot start two saves
    try {
      const existing = (await listMockups(productId)).find((m) => m.viewType === activeView)
      if (existing) { say('idle', ''); return setConfirmReplace({ view: activeView, label, record: existing }) }
    } catch (err) {
      return say('error', `Could not check the gallery. ${friendlyMockupError(err, 'Check your connection and try again.')}`)
    }
    saveToGallery(activeView, label)
  }

  return (
    <div className="mv2-export" data-ui-only="export">
      <button type="button" className="mv2-btn" disabled={busy || !activeReady} onClick={() => run(views.filter((v) => v.view === activeView))}
        title={activeReady ? 'Download this view as a full-resolution PNG' : 'Add visible artwork to this view first'}>
        Download PNG
      </button>
      {readyViews.length > 1 && (
        <button type="button" className="mv2-btn" disabled={busy} onClick={() => run(readyViews)} title="One full-resolution PNG per view that has artwork">
          Download all views ({readyViews.length})
        </button>
      )}
      <button type="button" className="mv2-btn" disabled={busy || !activeReady || !productId} onClick={requestSave}
        title={!productId ? 'Save the product first — mockups are stored per product' : activeReady ? 'Render this view at full resolution and add it to the product\'s Mockup Gallery' : 'Add visible artwork to this view first'}>
        {busy ? 'Working…' : savedViews.includes(activeView) ? 'Update gallery mockup' : 'Save to gallery'}
      </button>
      {savedViews.length > 0 && <p className="mv2-composite__note">In this product&apos;s gallery: {savedViews.map(viewLabel).join(', ')}</p>}
      {!productId && <p className="mv2-composite__note">Save the product first to store mockups in its gallery.</p>}
      <ConfirmDialog
        open={Boolean(confirmReplace)}
        title={`Replace the ${confirmReplace?.label ?? ''} mockup?`}
        description="This view already has a mockup in the gallery. Its image will be replaced with this render; its order and main status are kept, and other views are not touched."
        confirmLabel="Replace"
        onConfirm={() => { const c = confirmReplace; setConfirmReplace(null); if (!busy) saveToGallery(c.view, c.label, c.record) }}
        onCancel={() => setConfirmReplace(null)}
      />
      {status.kind !== 'idle' && (
        <p className={`mv2-composite__note${status.kind === 'error' ? ' is-error' : ''}`} role={status.kind === 'error' ? 'alert' : 'status'}>{status.message}</p>
      )}
    </div>
  )
}

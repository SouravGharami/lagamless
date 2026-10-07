import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { allArtworks, createInitialState, mockupReducer, placementsInView, viewCounts, viewPhoto } from './mockupStudioState.js'
import { useHumanModel } from './human-model/useHumanModel.js'
import { MockupProductContext } from './gallery/MockupProductContext.js'
import './MockupStudioV2.css'

// The studio (and its CSS) load only when first opened, keeping the product form light.
const MockupStudioV2 = lazy(() => import('./MockupStudioV2.jsx'))

/**
 * The single integration point between ProductForm and Mockup Studio v2.
 *
 * It owns the studio state (so closing the workspace doesn't lose work) and
 * the lifetime of the in-memory blob: URLs behind uploaded images. It reads
 * nothing from, and writes nothing to, the product form. The only thing that
 * reaches the database is an explicit "Save to gallery" (Step 5-5), which is
 * scoped to `productId`. Studio state lives only as long as the product form
 * does — no localStorage.
 */
/** Cheap fingerprint of one view: its artwork layers (geometry, warp, fabric…) and which photo it sits on. */
function viewSignature(state, view) {
  return JSON.stringify([viewPhoto(state, view)?.id ?? null, placementsInView(state.composition, view)])
}

export default function MockupStudioLauncher({ productId = null, onMockupsChanged = () => {} }) {
  const [open, setOpen] = useState(false)
  const [state, rawDispatch] = useReducer(mockupReducer, undefined, createInitialState)
  const humanModel = useHumanModel() // Human Model Studio state (Step 1); kept here so it survives closing the studio
  const openerRef = useRef(null)
  const [savedSigs, setSavedSigs] = useState({}) // view id -> signature of that view as last saved to the gallery
  const stateRef = useRef(state)
  const urlsRef = useRef(new Set())

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const release = useCallback((url) => {
    if (url && urlsRef.current.delete(url)) URL.revokeObjectURL(url)
  }, [])

  // Every uploaded asset arrives as an action carrying a blob URL: register it,
  // and free the URL of any single-slot asset (T-shirt, background) it replaces.
  const dispatch = useCallback(
    (action) => {
      if (action.asset?.url) urlsRef.current.add(action.asset.url)
      const current = stateRef.current.sourceAssets.tshirt
      if (action.type === 'SET_TSHIRT' || action.type === 'RESET_TSHIRT') {
        release(current?.originalUrl)
        release(current?.processedUrl)
        // Step 5-2: the parked personal photo is dropped too. (A library template's own photo is never in urlsRef, so it is never revoked here.)
        release(stateRef.current.sourceAssets.tshirtBeforeTemplate?.originalUrl)
        release(stateRef.current.sourceAssets.tshirtBeforeTemplate?.processedUrl)
      }
      // Step 5-2: template actions carry no blob asset; only a cut-out made from the template photo needs freeing.
      if (['RELEASE_TEMPLATE_PHOTO', 'REPLACE_TEMPLATE_PHOTO', 'DETACH_TEMPLATE_PHOTO', 'APPLY_TEMPLATE_PHOTO'].includes(action.type) && current?.fromTemplateId) {
        if (action.type !== 'DETACH_TEMPLATE_PHOTO') release(current.processedUrl)
      }
      if (action.type === 'BG_SUCCESS') {
        // A cut-out finishing after the T-shirt was replaced/reset is discarded.
        if (!current || current.id !== action.id) {
          URL.revokeObjectURL(action.url)
          return
        }
        urlsRef.current.add(action.url)
      }
      // Artwork background removal: a cut-out finishing after its artwork was deleted is discarded; otherwise it is tracked.
      if (action.type === 'ART_BG_SUCCESS') {
        if (!stateRef.current.sourceAssets.artworkSources.some((s) => s.id === action.sourceId)) {
          URL.revokeObjectURL(action.url)
          return
        }
        urlsRef.current.add(action.url)
      }
      // Step 5-3A: a replaced / cleared mask frees its blob URL.
      if (action.type === 'SET_MASK' || action.type === 'CLEAR_MASK') {
        const old = stateRef.current.sourceAssets[action.kind === 'design' ? 'designMask' : 'tshirtMask']
        release(old?.url)
      }
      if (['SET_BACKGROUND_IMAGE', 'REMOVE_BACKGROUND_IMAGE', 'CLEAR_BACKGROUND'].includes(action.type)) {
        release(stateRef.current.sourceAssets.backgroundImage?.sourceUrl)
      }
      rawDispatch(action)
    },
    [release],
  )

  // Free the blob URL of any artwork source that no layer references any more.
  const sourceUrlsRef = useRef(new Set())
  useEffect(() => {
    const live = new Set(state.sourceAssets.artworkSources.flatMap((s) => [s.url, s.processedUrl]).filter(Boolean))
    sourceUrlsRef.current.forEach((url) => {
      if (!live.has(url)) release(url)
    })
    sourceUrlsRef.current = live
  }, [state.sourceAssets.artworkSources, release])

  useEffect(() => {
    const urls = urlsRef.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    // Return focus to where the admin came from.
    requestAnimationFrame(() => openerRef.current?.focus())
  }, [])

  // "Meaningful unsaved changes" = a view that has artwork whose current layout differs from what was last saved to the gallery.
  // Selecting layers, toggling Preview or opening/closing the studio never counts.
  const unsavedViews = useMemo(
    () => Object.entries(viewCounts(state.composition)).filter(([view, n]) => n > 0 && viewSignature(state, view) !== savedSigs[view]).map(([view]) => view),
    [state, savedSigs],
  )
  const unsaved = unsavedViews.length > 0

  // Studio work lives only in this page; warn before a refresh / tab close throws it away.
  useEffect(() => {
    if (!unsaved) return
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const handleMockupsChanged = useCallback((view) => {
    if (view) setSavedSigs((prev) => ({ ...prev, [view]: viewSignature(stateRef.current, view) }))
    onMockupsChanged()
  }, [onMockupsChanged])

  const { tshirt } = state.sourceAssets
  const layerCount = allArtworks(state.composition).length

  return (
    <div className="mv2-launcher">
      <p className="text-small">
        Compose the T-shirt and DTF artwork placements in a full-screen workspace, then use &ldquo;Save to gallery&rdquo;
        to store a final render in this product&apos;s Mockup Gallery below. Saved mockups are not published and do not
        change the product&apos;s storefront images.
      </p>
      <div className="mv2-launcher__row">
        <button ref={openerRef} type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
          Open Mockup Studio
        </button>
        <span className="text-small mv2-launcher__status">
          {tshirt ? `T-shirt: ${tshirt.name}` : 'No T-shirt yet'} · {layerCount} artwork {layerCount === 1 ? 'layer' : 'layers'} ·
          {unsaved ? 'not saved to the gallery yet' : 'studio layout kept only while this form is open'}
        </span>
      </div>

      {open && (
        <Suspense fallback={null}>
          <MockupProductContext.Provider value={{ productId, onMockupsChanged: handleMockupsChanged }}>
            <MockupStudioV2 state={state} dispatch={dispatch} onClose={close} unsaved={unsaved} humanModel={humanModel} />
          </MockupProductContext.Provider>
        </Suspense>
      )}
    </div>
  )
}

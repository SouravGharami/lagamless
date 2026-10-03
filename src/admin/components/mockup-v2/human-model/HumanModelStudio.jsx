import { useMemo, useContext, useRef, useState, useEffect } from 'react'
import HumanModelUploader from './HumanModelUploader.jsx'
import HumanModelPreview from './HumanModelPreview.jsx'
import HumanModelControls from './HumanModelControls.jsx'
import { useHumanModelPicker } from './useHumanModelPicker.js'
import { effectiveJobStatus } from './humanModelState.js'
import FinishedTshirtPanel from './FinishedTshirtPanel.jsx'
import GenerationPreview from './GenerationPreview.jsx'
import { useGarmentReadiness } from './useGarmentReadiness.js'
import { evaluateFitReadiness, buildReadyChecklist } from './fitReadiness.js'
import { assembleGenerationAssets } from './buildGenerationAssets.js'
import { generateHumanModelMockups, HUMAN_MODEL_GENERATION_STATUS, registerHumanModelProvider } from './generateHumanModelMockups.js'
import { DEFAULT_PROVIDER_ID, getProvider, getSelectedProviderId } from './providers/providerRegistry.js'
import { createVtonAssetsProvider, finalGarmentFor } from './providers/vtonProvider.js'
import { PROVIDER_IDS } from './providers/providerTypes.js'
import { saveGeneratedMockup, friendlyGeneratedMockupError, GeneratedMockupError } from '../../../../services/generatedMockups.js'

import { MockupProductContext } from '../gallery/MockupProductContext.js'
import { hasSafetyFailure, GARMENT_EXPORT_UNSAFE_MESSAGE } from './exportSafety.js'
import { FinishedTshirtError, FINISHED_TSHIRT_ERROR_MESSAGE, computeCompositionSignature, hasFinishedTshirt, prepareFinishedTshirt } from '../finishedTshirtSnapshot.js'
import { generatedProviderLabel, generatedStatusLabel, generatedViewLabel } from '../gallery/generatedModelLabels.js'
import './humanModelStudio.css'


function readImageDimensions(blob) {
  return new Promise((resolve, reject) => {
    if (!(blob instanceof Blob)) return reject(new Error('Invalid image blob.'))
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height }) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new GeneratedMockupError('BAD_IMAGE', 'The generated image could not be decoded, so it was not saved.')) }
    img.src = url
  })
}

/**
 * Human Model Studio panel.
 *
 * INTEGRATION BOUNDARY: `studioState` is the existing Mockup Studio state, READ ONLY. "Use current T-shirt" turns it
 * into a finished-T-shirt snapshot with the EXISTING compositor (finishedTshirtSnapshot.js) and stores that snapshot in
 * this panel's own state. There is no second compositor and no second artwork editor here; nothing is dispatched to the studio.
 */
export default function HumanModelStudio({ studioState, humanModel }) {
  const { state, dispatch } = humanModel
  const { productId, onMockupsChanged } = useContext(MockupProductContext)
  const { modelImage, modelViewType, job, notice, tshirtSnapshot, snapshotStatus, snapshotError, snapshotRequestId } = state

  const picker = useHumanModelPicker({ onAsset: (asset) => dispatch({ type: 'SET_MODEL_IMAGE', asset }) })

  const canUseCurrent = hasFinishedTshirt(studioState)
  const currentSignature = useMemo(() => computeCompositionSignature(studioState), [studioState])
  const stale = !!tshirtSnapshot && tshirtSnapshot.compositionSignature !== currentSignature

  async function useCurrentTshirt() {
    const requestId = snapshotRequestId + 1
    dispatch({ type: 'SNAPSHOT_STARTED', requestId })
    try {
      const snapshot = await prepareFinishedTshirt(studioState)
      dispatch({ type: 'SNAPSHOT_READY', requestId, snapshot })
    } catch (err) {
      const details = err instanceof FinishedTshirtError ? err.details : [err?.message || 'Unknown error']
      const failures = err instanceof FinishedTshirtError ? err.failures : []
      // A CORS / tainted-canvas cause gets its own explicit message; everything else keeps the Step 2 wording.
      const message = hasSafetyFailure(failures) ? GARMENT_EXPORT_UNSAFE_MESSAGE : FINISHED_TSHIRT_ERROR_MESSAGE
      dispatch({ type: 'SNAPSHOT_FAILED', requestId, message, details, failures })
    }
  }

  const hasModel = !!modelImage
  const hasSnapshot = !!tshirtSnapshot && !stale

  // STEP 3: readiness = valid model AND valid current T-shirt AND garment renders verified (present, non-empty, not blank).
  const garmentState = useGarmentReadiness(tshirtSnapshot)
  const readiness = evaluateFitReadiness({ modelImage, snapshot: tshirtSnapshot, stale, snapshotStatus, garmentState, requestedViews: modelViewType })
  const canFit = readiness.ready
  const status = effectiveJobStatus(job, hasModel && hasSnapshot)
  const generationPending = ['preparing', 'uploading', 'generating', 'processing'].includes(job.status)
  const garmentResult = garmentState.status === 'ready' && garmentState.snapshotId === tshirtSnapshot?.id ? garmentState.result : null
  // The provider actually selected for this project (falls back to the registry default). The UI text below uses its real label.
  const activeVtonProvider = getProvider(getSelectedProviderId()) ?? getProvider(DEFAULT_PROVIDER_ID)
  const providerLabel = activeVtonProvider?.label ?? 'VTON provider'
  const activeVtonConfig = activeVtonProvider?.isConfigured?.() ?? { ok: false }
  const supportedProviderViews = activeVtonProvider?.supportedViews ?? []

  const assembled = useMemo(
    () => (canFit ? assembleGenerationAssets({ humanModel: modelImage, snapshot: tshirtSnapshot, garmentResult, requestedViews: modelViewType }) : null),
    [canFit, modelImage, tshirtSnapshot, garmentResult, modelViewType],
  )
  const checklist = canFit && garmentResult ? buildReadyChecklist({ garment: garmentResult.garment, artworkPreserved: garmentResult.artworkPreserved }) : []

  const inFlightRef = useRef(false)
  const abortRef = useRef(null)
  const [savedResults, setSavedResults] = useState([]) // rows just saved to generated_model_mockups, shown immediately below the controls
  const [resultImgFailed, setResultImgFailed] = useState({})
  const [unsaved, setUnsaved] = useState(null) // generated results that exist but could not be persisted: { results, assets, error }
  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => () => { if (unsaved?.previews) unsaved.previews.forEach((p) => URL.revokeObjectURL(p.url)) }, [unsaved])

  /** Uploads each generated image and inserts its generated_model_mockups row. Returns { saved, failure }. Never throws. */
  async function persistResults(results, assets) {
    const saved = []
    const remaining = []
    let failure = null
    if (!productId) {
      return { saved, remaining: results, failure: 'Save the product first, then generate model mockups. The generated image is kept here so you can retry.' }
    }
    for (const result of results) {
      if (failure) { remaining.push(result); continue }
      try {
        const dimensions = await readImageDimensions(result.imageBlob)
        saved.push(await saveGeneratedMockup({
          productId, view: result.view, blob: result.imageBlob, width: dimensions.width, height: dimensions.height,
          provider: result.provider, providerJobId: result.jobId ?? null,
          sourceGarmentId: assets.composition.compositionId, humanModelId: assets.humanModel.id, approve: false,
        }))
      } catch (err) {
        failure = friendlyGeneratedMockupError(err, 'The generated image could not be saved.')
        remaining.push(result)
      }
    }
    return { saved, remaining, failure }
  }

  function outcomeFailureMessage(outcome) {
    if (outcome.message) return outcome.message
    if (outcome.status === HUMAN_MODEL_GENERATION_STATUS.INVALID_INPUT) return outcome.problems?.join(' ') || 'The model or T-shirt input is not valid.'
    if (outcome.status === HUMAN_MODEL_GENERATION_STATUS.CANCELLED) return 'Generation was cancelled.'
    return `Generation did not complete (${outcome.status}).`
  }

  function rememberUnsaved(remaining, assets, error) {
    const previews = remaining.map((r) => ({ view: r.view, url: URL.createObjectURL(r.imageBlob) }))
    setUnsaved({ results: remaining, assets, error, previews })
  }

  async function retrySave() {
    if (!unsaved || inFlightRef.current) return
    inFlightRef.current = true
    dispatch({ type: 'FIT_STARTED', message: 'Saving the generated image…' })
    try {
      const { saved, remaining, failure } = await persistResults(unsaved.results, unsaved.assets)
      if (saved.length) { setSavedResults((prev) => [...saved, ...prev]); onMockupsChanged?.() }
      if (failure) {
        rememberUnsaved(remaining, unsaved.assets, failure)
        dispatch({ type: 'FIT_REQUESTED', ok: false, status: 'failed', summary: `Generated image was created but not saved: ${failure}`, errorMessage: failure })
      } else {
        setUnsaved(null)
        dispatch({ type: 'FIT_REQUESTED', ok: true, status: 'completed', summary: `VTON generated successfully. ${saved.length} human-model result${saved.length === 1 ? '' : 's'} saved as PENDING.`, errorMessage: null })
      }
    } catch (err) {
      const message = friendlyGeneratedMockupError(err, 'The generated image could not be saved.')
      dispatch({ type: 'FIT_REQUESTED', ok: false, status: 'failed', summary: message, errorMessage: message })
    } finally {
      inFlightRef.current = false
    }
  }

  // Hands the verified assets to the provider-neutral entry point. Every exit path ends in a FIT_REQUESTED dispatch,
  // so the UI can never stay on "Generating". A generated image that fails to save is kept for retry, never discarded or faked.
  async function fit() {
    if (inFlightRef.current) return
    if (!assembled?.ok) return dispatch({ type: 'FIT_REQUESTED', ok: false, status: 'failed', summary: 'The model and finished T-shirt are not ready.', errorMessage: 'The model and finished T-shirt are not ready.' })
    inFlightRef.current = true
    const controller = new AbortController()
    abortRef.current = controller
    let generatedButUnsaved = false
    try {
      setUnsaved(null)
      setSavedResults([])
      setResultImgFailed({})
      dispatch({ type: 'FIT_STARTED', message: `Starting ${providerLabel}…` })
      if (!activeVtonProvider) throw new GeneratedMockupError('NO_PROVIDER', 'No VTON provider is available.')
      const selectedSupportedViews = modelViewType.filter((view) => supportedProviderViews.includes(view))
      if (selectedSupportedViews.length === 0) {
        const message = `${providerLabel} does not support the selected view(s). Select Front.`
        return dispatch({ type: 'FIT_REQUESTED', ok: false, status: 'failed', summary: message, errorMessage: message })
      }
      const assets = selectedSupportedViews.length === modelViewType.length
        ? assembled.assets
        : { ...assembled.assets, requestedViews: assembled.assets.requestedViews.filter((v) => selectedSupportedViews.includes(v.type)) }
      // The Kaggle worker receives the EXACT finished T-shirt (all artwork already baked in by the Studio compositor), so the
      // artwork is not painted a second time afterwards. Other providers keep the clean-garment + exact-artwork post-composite flow.
      const sendsFinalGarment = activeVtonProvider.id === PROVIDER_IDS.KAGGLE_WORKER
      const provider = createVtonAssetsProvider(activeVtonProvider, {
        ...(sendsFinalGarment ? { resolveCleanGarment: finalGarmentFor, postComposite: false } : {}),
        timeoutMs: activeVtonProvider.timeoutMs,
        onStatus: (phase, detail) => {
          const messages = { PREPARING: 'Preparing images…', CONNECTING: `Connecting to ${providerLabel}…`, SUBMITTING: `Submitting to ${providerLabel}…`, QUEUED: 'Job queued — waiting for a free GPU…', PROCESSING: 'Generating the try-on…', COMPLETED: 'Generation completed.' }
          dispatch({ type: 'FIT_STATUS', status: phase === 'QUEUED' || phase === 'PROCESSING' ? 'processing' : 'generating', message: detail || messages[phase] || `${providerLabel}: ${phase}` })
        },
      })
      registerHumanModelProvider(provider)
      const outcome = await generateHumanModelMockups(assets, { provider, signal: controller.signal })
      const counts = `${assets.humanModel.fileName} · ${Object.keys(assets.garment.views).length} garment ${Object.keys(assets.garment.views).length === 1 ? 'image' : 'images'} · ${assets.composition.artworkLayers.length} artwork ${assets.composition.artworkLayers.length === 1 ? 'layer' : 'layers'} · ${assets.requestedViews.length} requested ${assets.requestedViews.length === 1 ? 'view' : 'views'}.`

      if (outcome.status !== HUMAN_MODEL_GENERATION_STATUS.COMPLETED) {
        const message = outcomeFailureMessage(outcome)
        return dispatch({ type: 'FIT_REQUESTED', ok: false, status: 'failed', summary: `VTON: ${counts} ${message}`, errorMessage: message })
      }
      const results = (outcome.results ?? []).filter((r) => r?.imageBlob)
      if (results.length === 0) {
        const message = 'The provider reported success but returned no image. Nothing was saved.'
        return dispatch({ type: 'FIT_REQUESTED', ok: false, status: 'failed', summary: message, errorMessage: message })
      }

      const { saved, remaining, failure } = await persistResults(results, assets)
      if (saved.length) { setSavedResults((prev) => [...saved, ...prev]); onMockupsChanged?.() }
      if (failure) {
        generatedButUnsaved = true
        rememberUnsaved(remaining, assets, failure)
        const message = `The image was generated, but saving it failed: ${failure}`
        return dispatch({ type: 'FIT_REQUESTED', ok: false, status: 'failed', summary: message, errorMessage: message })
      }
      dispatch({
        type: 'FIT_REQUESTED', ok: true, status: 'completed',
        summary: `VTON generated successfully. ${saved.length} human-model result${saved.length === 1 ? '' : 's'} saved as PENDING. (${counts})`,
        errorMessage: null,
      })
    } catch (err) {
      const message = controller.signal.aborted ? 'Generation was cancelled.' : friendlyGeneratedMockupError(err, err?.message || 'Generation failed unexpectedly.')
      if (!generatedButUnsaved) dispatch({ type: 'FIT_REQUESTED', ok: false, status: 'failed', summary: message, errorMessage: message })
    } finally {
      inFlightRef.current = false
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  const steps = [
    { n: 1, title: 'Upload Human Model', state: hasModel ? 'done' : 'active', note: hasModel ? 'Model image loaded' : 'Upload a photo to begin' },
    { n: 2, title: 'Use Finished T-Shirt', state: hasSnapshot ? 'done' : canUseCurrent ? 'active' : 'pending', note: stale ? 'Studio changed — refresh' : tshirtSnapshot ? 'Finished design loaded' : canUseCurrent ? 'Click USE CURRENT T-SHIRT' : 'Finish the T-shirt in the Studio tab' },
    { n: 3, title: 'Fit T-Shirt to Model', state: canFit ? 'active' : 'locked', note: canFit ? (activeVtonConfig.ok ? `Ready for AI fitting · ${providerLabel} connected` : `Ready for AI fitting · ${providerLabel} is not configured`) : (activeVtonConfig.ok ? 'Provider ready · finish the inputs' : `${providerLabel} not connected`) },
    { n: 4, title: 'Generate Model Views', state: 'locked', note: 'Coming in a later step' },
  ]

  return (
    <section className="hms" aria-label="Human Model Studio">
      <ol className="hms-steps">
        {steps.map((s) => (
          <li key={s.n} className={`hms-step is-${s.state}`}>
            <span className="hms-step__n">STEP {s.n}</span>
            <span className="hms-step__title">{s.title}</span>
            <span className="hms-step__note">{s.note}</span>
          </li>
        ))}
      </ol>

      <div className="hms-grid">
        <div className="hms-card">
          <h3 className="hms-card__title">1 · Human model</h3>
          <HumanModelUploader picker={picker} compact={hasModel} />
          <HumanModelPreview
            modelImage={modelImage}
            busy={picker.busy}
            onChange={picker.open}
            onRemove={() => { picker.clearMessages(); dispatch({ type: 'CLEAR_MODEL_IMAGE' }) }}
          />
        </div>

        <div className="hms-card">
          <h3 className="hms-card__title">2 · Finished T-shirt</h3>
          <FinishedTshirtPanel
            snapshot={tshirtSnapshot}
            status={snapshotStatus}
            error={snapshotError}
            stale={stale}
            canUse={canUseCurrent}
            onUse={useCurrentTshirt}
            onClear={() => dispatch({ type: 'CLEAR_SNAPSHOT' })}
          />
        </div>

        {garmentState.status === 'failed' && garmentState.snapshotId === tshirtSnapshot?.id && (
          <div className="hms-card hms-card--wide">
            <div className="hms-messages hms-messages--error" role="alert">
              <p>{hasSafetyFailure(garmentState.result?.failures) ? GARMENT_EXPORT_UNSAFE_MESSAGE : 'Garment image could not be prepared'}</p>
              <ul>{(garmentState.result?.failures ?? []).map((f, i) => <li key={`${f.code}-${i}`}>{f.message}</li>)}</ul>
              <details className="hms-tech">
                <summary>Technical details (for developers)</summary>
                <ul>{(garmentState.result?.failures ?? []).map((f, i) => <li key={`${f.code}-${i}`}><code>{f.code}</code>{f.view ? ` · ${f.view}` : ''} — {f.technical}</li>)}</ul>
              </details>
            </div>
          </div>
        )}

        {(hasModel || garmentResult) && (
          <div className="hms-card hms-card--wide">
            <h3 className="hms-card__title">Generation preview</h3>
            <GenerationPreview modelImage={modelImage} garment={garmentResult?.garment ?? null} selectedViews={modelViewType} />
          </div>
        )}

        {unsaved && (
          <div className="hms-card hms-card--wide">
            <div className="hms-messages hms-messages--error" role="alert">
              <p>The generated image exists but was not saved: {unsaved.error}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {unsaved.previews.map((p) => <img key={p.url} src={p.url} alt={`Generated ${p.view} (unsaved)`} style={{ maxHeight: 160 }} />)}
              </div>
              <button type="button" className="mv2-btn mv2-btn--primary" onClick={retrySave} disabled={generationPending}>RETRY SAVING</button>
            </div>
          </div>
        )}

        <div className="hms-card hms-card--wide">
          <h3 className="hms-card__title">3 · Fit &amp; 4 · Model views</h3>
          <HumanModelControls
            selectedViews={modelViewType}
            onToggleView={(view) => dispatch({ type: 'TOGGLE_MODEL_VIEW', view })}
            canFit={canFit}
            blockers={readiness.blockers}
            pending={generationPending}
            checklist={checklist}
            status={status}
            notice={notice}
            inputSummary={state.preparedInput}
            onFit={fit}
            onDismissNotice={() => dispatch({ type: 'CLEAR_MODEL_NOTICE' })}
            providerReady={activeVtonConfig.ok}
            supportedViews={supportedProviderViews}
          />
        </div>

        {savedResults.length > 0 && (
          <div className="hms-card hms-card--wide">
            <h3 className="hms-card__title">Generated VTON result</h3>
            {savedResults.slice(0, 1).map((r) => (
              <figure key={r.id} style={{ margin: 0, display: 'grid', gap: '.5rem', justifyItems: 'start' }}>
                {resultImgFailed[r.id]
                  ? <p role="alert">The saved image could not be displayed — {generatedViewLabel(r.view)} · {generatedProviderLabel(r.provider)}.</p>
                  : <img src={r.imageUrl} alt={`${generatedViewLabel(r.view)} — model wearing the T-shirt`} onError={() => setResultImgFailed((f) => ({ ...f, [r.id]: true }))} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', background: '#f2f2f2' }} />}
                <figcaption className="hms-hint">
                  <strong>{generatedViewLabel(r.view)}</strong> · {generatedProviderLabel(r.provider)}{r.width ? ` · ${r.width}×${r.height}` : ''} · {generatedStatusLabel(r)}
                  <br />Saved to Human Model VTON Results (Product editor). It stays pending until you approve it there.
                </figcaption>
              </figure>
            ))}
            {savedResults.length > 1 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {savedResults.map((r) => <img key={r.id} src={r.imageUrl} alt={`${generatedViewLabel(r.view)} thumbnail`} style={{ height: 96 }} />)}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

import { useImagePicker } from './useImagePicker.js'
import MockupPreview from './MockupPreview.jsx'
import BackgroundPanel from './BackgroundPanel.jsx'
import BackgroundLibrary from './BackgroundLibrary.jsx'
import CompositionViewport from './CompositionViewport.jsx'
import PreviewControls from './PreviewControls.jsx'
import { usePreviewViewport } from './usePreviewViewport.js'
import TshirtPresentationPanel from './TshirtPresentationPanel.jsx'
import { useHasAlpha } from './useHasAlpha.js'
import { needsTransparencyIndicator } from './backgroundStyle.js'
import { TSHIRT_ACCEPT, TSHIRT_ACCEPTED } from './mockupStudioAssets.js'
import { SURFACES, layersForSurface } from './mockupStudioState.js'
import { getAngle } from './generation/mockupAngles.js'
import CompositePreview from './compositing/CompositePreview.jsx'
import { ShirtIcon } from './icons.jsx'

/**
 * Centre column:
 * - T-shirt canvas
 * - view / zoom controls
 * - background studio
 * - background library
 * - final composite preview
 */
export default function MockupWorkspace({ state, dispatch }) {
  const viewport = usePreviewViewport()

  const picker = useImagePicker({
    dispatch,
    onAsset: (asset) => dispatch({ type: 'SET_TSHIRT', asset }),
    accepted: TSHIRT_ACCEPTED,
  })

  const { tshirt } = state.sourceAssets
  const { activeSurface, activeView, selectedArtworkId } = state.composition

  const viewLabel = getAngle(activeView)?.label ?? 'Front'

  const surfaceLabel =
    SURFACES.find((s) => s.key === activeSurface)?.label ?? 'Front'

  const layers = layersForSurface(state, activeSurface)

  const shirtSrc = tshirt
    ? (
        tshirt.backgroundRemoved && tshirt.processedUrl
          ? tshirt.processedUrl
          : tshirt.originalUrl
      )
    : null

  const hasAlpha = useHasAlpha(shirtSrc)

  const transparent =
    !!tshirt &&
    (
      hasAlpha ||
      (tshirt.backgroundRemoved && !!tshirt.processedUrl)
    )

  return (
    <section className="mv2-workspace" aria-label="Canvas">

      {/* ---------------------------------------------------------
          EDITING HEADER
      --------------------------------------------------------- */}
      <div className="mv2-editing" aria-live="polite">
        {state.ui.previewMode ? 'PREVIEW: ' : 'EDITING: '}
        <strong>
          {viewLabel.toUpperCase()} · {surfaceLabel.toUpperCase()}
        </strong>
      </div>

      {/* ---------------------------------------------------------
          T-SHIRT CANVAS
      --------------------------------------------------------- */}
      <div
        ref={viewport.stageRef}
        className={`mv2-stage${
          viewport.pannable ? ' is-pannable' : ''
        }${
          viewport.panning ? ' is-panning' : ''
        }${
          viewport.spaceHeld ? ' is-space' : ''
        }`}
        onPointerDownCapture={viewport.onPointerDownCapture}
      >

        {tshirt ? (
          viewport.ready && (
            <CompositionViewport
              layout={viewport.layout}
              pan={viewport.pan}
              viewport={viewport.metrics.viewport}
              guides={viewport.view.guides}
              indicator={needsTransparencyIndicator(
                state.composition.background,
                tshirt
              )}
            >
              <MockupPreview
                tshirt={tshirt}
                layers={layers}
                selectedId={selectedArtworkId}
                previewMode={state.ui.previewMode}
                background={state.composition.background}
                presentation={state.composition.tshirtPresentation}
                transparent={transparent}
                viewScale={viewport.layout.scale}
                onPresentation={(patch) =>
                  dispatch({
                    type: 'SET_TSHIRT_POSITION',
                    ...patch,
                  })
                }
                backgroundImage={
                  state.sourceAssets.backgroundImage
                }
                onSelect={(id) =>
                  dispatch({
                    type: 'SELECT_ARTWORK',
                    id,
                  })
                }
                onTransform={(id, patch) =>
                  dispatch({
                    type: 'UPDATE_ARTWORK',
                    id,
                    patch,
                    keepRatio: false,
                  })
                }
              />
            </CompositionViewport>
          )
        ) : (
          <>
            <input
              ref={picker.inputRef}
              type="file"
              accept={TSHIRT_ACCEPT}
              hidden
              onChange={picker.onChange}
            />

            <button
              type="button"
              className="mv2-empty"
              onClick={picker.open}
            >
              <ShirtIcon />

              <span className="mv2-empty__title">
                Upload your {viewLabel.toLowerCase()} T-shirt image
              </span>

              <span className="mv2-empty__hint">
                PNG, JPG or WebP · up to 30 MB · a flat-lay or
                ghost-mannequin photo works best
              </span>
            </button>
          </>
        )}

        {tshirt && viewport.ready && (
          <p
            className="mv2-stage__hint"
            data-ui-only="hint"
            aria-hidden="true"
          >
            {viewport.pannable
              ? 'Drag empty space or hold Space to pan · '
              : ''}
            Ctrl/⌘ + scroll to zoom
          </p>
        )}
      </div>

      {/* ---------------------------------------------------------
          VIEW / ZOOM CONTROLS
      --------------------------------------------------------- */}
      {tshirt && (
        <PreviewControls viewport={viewport} />
      )}

      {/* ---------------------------------------------------------
          BACKGROUND STUDIO
          
          IMPORTANT:
          This is intentionally placed immediately after the
          T-shirt preview controls so it stays accessible after
          uploading a T-shirt.
      --------------------------------------------------------- */}
      <div className="mv2-controls">

        {tshirt && (
          <TshirtPresentationPanel
            tshirt={tshirt}
            presentation={
              state.composition.tshirtPresentation
            }
            canShadow={transparent}
            dispatch={dispatch}
          />
        )}

        <BackgroundPanel
          background={state.composition.background}
          backgroundImage={
            state.sourceAssets.backgroundImage
          }
          tshirt={tshirt}
          dispatch={dispatch}
        />

        <BackgroundLibrary
          background={state.composition.background}
          dispatch={dispatch}
        />

      </div>

      {/* ---------------------------------------------------------
          SURFACE INFORMATION
      --------------------------------------------------------- */}
      {tshirt && activeSurface !== 'front' && (
        <p className="mv2-surface-note">
          Working on the {surfaceLabel.toLowerCase()} surface.
          The uploaded T-shirt photo is only a positioning
          reference here — it is not a real{' '}
          {activeSurface === 'back'
            ? 'back'
            : 'sleeve'} photograph.
        </p>
      )}

      {/* ---------------------------------------------------------
          EMPTY ARTWORK STATE
      --------------------------------------------------------- */}
      {tshirt &&
        layers.length === 0 &&
        !state.ui.previewMode && (
          <div className="mv2-surface-empty">
            <span>
              No artwork placed on this surface yet.
            </span>

            <button
              type="button"
              className="mv2-btn"
              onClick={() =>
                document
                  .getElementById('mv2-add-artwork')
                  ?.click()
              }
            >
              + Add Artwork
            </button>
          </div>
        )}

      {/* ---------------------------------------------------------
          FINAL MOCKUP PREVIEW
      --------------------------------------------------------- */}
      {tshirt && (
        <CompositePreview
          state={state}
          layers={layers}
        />
      )}

      {/* ---------------------------------------------------------
          CAPTION
      --------------------------------------------------------- */}
      <p className="mv2-caption">
        <strong>
          {viewLabel} · {surfaceLabel}
        </strong>

        {tshirt
          ? ` · ${layers.length} artwork ${
              layers.length === 1
                ? 'layer'
                : 'layers'
            } in this view`
          : ` · no ${viewLabel.toLowerCase()} photo yet`}
      </p>

    </section>
  )
}
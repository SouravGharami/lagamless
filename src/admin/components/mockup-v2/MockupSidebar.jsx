import TshirtUploader from './TshirtUploader.jsx'
import ArtworkUploader from './ArtworkUploader.jsx'
import MaskUploader from './MaskUploader.jsx'
import GarmentDetectionPanel from './garment-detection/GarmentDetectionPanel.jsx'
import ArtworkLayers from './ArtworkLayers.jsx'
import SurfaceTabs from './SurfaceTabs.jsx'
import ViewTabs from './ViewTabs.jsx'
import GenerationPanel from './GenerationPanel.jsx'
import TemplateLibraryPanel from './templates/TemplateLibraryPanel.jsx'
import { useImagePicker } from './useImagePicker.js'
import { SURFACES, layersForSurface } from './mockupStudioState.js'
import { ARTWORK_ACCEPTED } from './mockupStudioAssets.js'

/** Left column: source assets, surface switching, and the layer list. */
export default function MockupSidebar({ state, dispatch }) {
  const { tshirt } = state.sourceAssets
  const { activeSurface, activeView, selectedArtworkId } = state.composition
  const surfaceLabel = SURFACES.find((s) => s.key === activeSurface)?.label ?? 'Front'
  const layers = layersForSurface(state, activeSurface)

  // One picker feeds both the Upload button and the layer list's "+".
  const artworkPicker = useImagePicker({ dispatch, onAsset: (asset) => dispatch({ type: 'ADD_ARTWORK', asset }),
    accepted: ARTWORK_ACCEPTED,
  })

  return (
    <aside className="mv2-sidebar" aria-label="Assets and layers">
      <div className="mv2-group">
        <h3 className="mv2-group__title">View</h3>
        <ViewTabs
          activeView={activeView}
          composition={state.composition}
          viewPhotos={state.sourceAssets.viewPhotos}
          tshirt={tshirt}
          onSelect={(view) => dispatch({ type: 'SET_VIEW', view })}
        />
        <p className="mv2-hint">Each view has its own photo, masks and artwork placement. A dot means no photo yet.</p>
      </div>
      <TshirtUploader tshirt={tshirt} dispatch={dispatch} />
      <GarmentDetectionPanel tshirt={tshirt} tshirtMask={state.sourceAssets.tshirtMask} dispatch={dispatch} />
      <MaskUploader state={state} dispatch={dispatch} />
      <ArtworkUploader picker={artworkPicker} hasTshirt={!!tshirt} activeSurfaceLabel={surfaceLabel} />
      <div className="mv2-group">
        <h3 className="mv2-group__title">Surfaces</h3>
        <SurfaceTabs
          activeSurface={activeSurface}
          composition={state.composition}
          onSelect={(surface) => dispatch({ type: 'SET_SURFACE', surface })}
        />
      </div>
      <ArtworkLayers
        layers={layers}
        selectedId={selectedArtworkId}
        surfaceLabel={surfaceLabel}
        dispatch={dispatch}
        onAdd={artworkPicker.open}
        canAdd={!!tshirt}
      />
      <TemplateLibraryPanel state={state} dispatch={dispatch} />
      <GenerationPanel state={state} dispatch={dispatch} />
    </aside>
  )
}

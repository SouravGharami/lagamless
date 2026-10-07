import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon, TrashIcon, PlusIcon } from './icons.jsx'

/** Layer list for the active surface: select, hide/show, lock/unlock, delete. */
export default function ArtworkLayers({ layers, selectedId, surfaceLabel, dispatch, onAdd, canAdd }) {
  return (
    <div className="mv2-group">
      <div className="mv2-group__head">
        <h3 className="mv2-group__title">Artwork layers</h3>
        <button
          type="button"
          className="mv2-iconbtn"
          onClick={onAdd}
          disabled={!canAdd}
          aria-label="Add artwork"
          title={canAdd ? 'Add artwork' : 'Upload a T-shirt first'}
        >
          <PlusIcon />
        </button>
      </div>

      {layers.length === 0 ? (
        <p className="mv2-hint">No artwork on the {surfaceLabel.toLowerCase()} yet.</p>
      ) : (
        <ul className="mv2-layers">
          {/* Top of the list = top of the stack. */}
          {[...layers].reverse().map((layer) => {
            const selected = layer.id === selectedId
            return (
              <li key={layer.id} className={`mv2-layer${selected ? ' is-selected' : ''}${layer.visible ? '' : ' is-hidden'}`}>
                <button
                  type="button"
                  className="mv2-layer__main"
                  aria-pressed={selected}
                  onClick={() => dispatch({ type: 'SELECT_ARTWORK', id: layer.id })}
                >
                  <img className="mv2-layer__thumb" src={layer.sourceUrl} alt="" />
                  <span className="mv2-layer__name">{layer.name}</span>
                </button>
                <button
                  type="button"
                  className="mv2-iconbtn"
                  aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
                  onClick={() => dispatch({ type: 'TOGGLE_VISIBLE', id: layer.id })}
                >
                  {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
                </button>
                <button
                  type="button"
                  className={`mv2-iconbtn${layer.locked ? ' is-on' : ''}`}
                  aria-label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
                  aria-pressed={layer.locked}
                  onClick={() => dispatch({ type: 'TOGGLE_LOCK', id: layer.id })}
                >
                  {layer.locked ? <LockIcon /> : <UnlockIcon />}
                </button>
                <button
                  type="button"
                  className="mv2-iconbtn mv2-iconbtn--danger"
                  aria-label={`Delete ${layer.name}`}
                  disabled={layer.locked}
                  title={layer.locked ? 'Unlock to delete' : 'Delete'}
                  onClick={() => dispatch({ type: 'DELETE_ARTWORK', id: layer.id })}
                >
                  <TrashIcon />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

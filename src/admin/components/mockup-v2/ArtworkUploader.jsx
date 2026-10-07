import { ARTWORK_ACCEPT } from './mockupStudioAssets.js'
import { PlusIcon } from './icons.jsx'

/** Adds DTF artwork as new layers on the active surface. Multiple files allowed. */
export default function ArtworkUploader({ picker, hasTshirt, activeSurfaceLabel }) {
  return (
    <div className="mv2-group">
      <h3 className="mv2-group__title">Artwork</h3>
      <input ref={picker.inputRef} type="file" accept={ARTWORK_ACCEPT} multiple hidden onChange={picker.onChange} />
      <button id="mv2-add-artwork" type="button" className="mv2-btn mv2-btn--block" disabled={!hasTshirt || picker.busy} aria-busy={picker.busy} onClick={picker.open}>
        <PlusIcon />
        {picker.busy ? 'Uploading…' : 'Upload DTF Artwork'}
      </button>
      <p className="mv2-hint">
        {hasTshirt
          ? `New artwork is added to the ${activeSurfaceLabel.toLowerCase()}. PNG with transparency works best (PNG, JPG or WebP, up to 30 MB each).`
          : 'Upload a T-shirt first — artwork is positioned relative to the garment.'}
      </p>
    </div>
  )
}

import { useImagePicker } from './useImagePicker.js'
import { TSHIRT_ACCEPT, TSHIRT_ACCEPTED } from './mockupStudioAssets.js'
import { UploadIcon } from './icons.jsx'

/** One upload slot for a black/white mask. Reuses the studio's existing image picker (type + size + decode checks). */
function MaskSlot({ kind, label, hint, mask, disabled, dispatch }) {
  const picker = useImagePicker({
    dispatch,
    onAsset: (asset) => dispatch({ type: 'SET_MASK', kind, asset }),
    accepted: TSHIRT_ACCEPTED,
  })
  return (
    <div className="mv2-mask">
      <input ref={picker.inputRef} type="file" accept={TSHIRT_ACCEPT} hidden onChange={picker.onChange} />
      <p className="mv2-hint"><strong>{label}</strong> — {hint}</p>
      {mask && (
        <p className="mv2-file" title={mask.name}>
          <span className="mv2-file__name">{mask.name}</span>
          <span className="mv2-file__meta">{mask.width} × {mask.height}px</span>
        </p>
      )}
      <div className="mv2-actions">
        <button type="button" className="mv2-btn" disabled={disabled} onClick={picker.open}>
          <UploadIcon /> {mask ? 'Replace' : 'Upload'}
        </button>
        {mask && (
          <button type="button" className="mv2-btn" onClick={() => dispatch({ type: 'CLEAR_MASK', kind })}>Remove</button>
        )}
      </div>
    </div>
  )
}

/** Step 5-3A: T-shirt mask (garment) and optional design mask (printable region). White = allowed, black = protected. */
export default function MaskUploader({ state, dispatch }) {
  const { tshirt, tshirtMask, designMask } = state.sourceAssets
  return (
    <div className="mv2-group">
      <h3 className="mv2-group__title">Masks</h3>
      <MaskSlot kind="tshirt" label="T-shirt mask (optional fallback)" hint="white = shirt, black = protected. Not required after background removal." mask={tshirtMask} disabled={!tshirt} dispatch={dispatch} />
      <MaskSlot kind="design" label="Design mask (optional)" hint="white = printable area. Without one, the T-shirt mask is used." mask={designMask} disabled={!tshirt} dispatch={dispatch} />
      <p className="mv2-hint">T-shirt mask is optional when the uploaded photo has a background-removed transparent cutout. Any mask used must be exactly the photo&apos;s pixel size{tshirt ? ` (${tshirt.width} × ${tshirt.height}px)` : ''}. They are never stretched.</p>
    </div>
  )
}

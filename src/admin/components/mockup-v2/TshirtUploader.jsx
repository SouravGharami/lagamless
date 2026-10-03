import { TSHIRT_ACCEPT, TSHIRT_ACCEPTED } from './mockupStudioAssets.js'
import { useImagePicker } from './useImagePicker.js'
import { useBackgroundRemoval } from './useBackgroundRemoval.js'
import { UploadIcon, ResetIcon } from './icons.jsx'

/**
 * Upload / Replace T-shirt, plus background removal and switching between
 * the original photo and its cut-out. The uploaded photo is the source of
 * truth: it is never recoloured, filtered or overwritten.
 */
export default function TshirtUploader({ tshirt, dispatch }) {
  const picker = useImagePicker({
    dispatch,
    onAsset: (asset) => dispatch({ type: 'SET_TSHIRT', asset }),
    accepted: TSHIRT_ACCEPTED,
  })
  const removeBg = useBackgroundRemoval(tshirt, dispatch)

  const processing = tshirt?.bgStatus === 'processing'
  const hasCutout = !!tshirt?.processedUrl

  return (
    <div className="mv2-group">
      <h3 className="mv2-group__title">T-shirt</h3>
      <input ref={picker.inputRef} type="file" accept={TSHIRT_ACCEPT} hidden onChange={picker.onChange} />

      {tshirt && (
        <p className="mv2-file" title={tshirt.name}>
          <span className="mv2-file__name">{tshirt.name}</span>
          <span className="mv2-file__meta">
            {tshirt.width} × {tshirt.height}px · {tshirt.backgroundRemoved ? 'Background removed' : 'Original'}
          </span>
        </p>
      )}

      <button type="button" className="mv2-btn mv2-btn--block" onClick={picker.open} disabled={picker.busy} aria-busy={picker.busy}>
        {tshirt ? <ResetIcon /> : <UploadIcon />}
        {picker.busy ? 'Uploading…' : tshirt ? 'Replace T-shirt' : 'Upload T-shirt'}
      </button>

      {tshirt && !hasCutout && (
        <button type="button" className="mv2-btn mv2-btn--block" onClick={removeBg} disabled={processing}>
          Remove background
        </button>
      )}

      {tshirt && hasCutout && tshirt.backgroundRemoved && (
        <button type="button" className="mv2-btn mv2-btn--block" onClick={() => dispatch({ type: 'SHOW_ORIGINAL' })}>
          Restore Original
        </button>
      )}

      {tshirt && hasCutout && !tshirt.backgroundRemoved && (
        <button type="button" className="mv2-btn mv2-btn--block" onClick={() => dispatch({ type: 'SHOW_PROCESSED' })}>
          Show background removed
        </button>
      )}

      {processing && (
        <p className="mv2-status" role="status">
          <span className="mv2-spinner" aria-hidden="true" />
          Removing background...
        </p>
      )}

      {tshirt?.bgStatus === 'failed' && (
        <p className="mv2-status mv2-status--error" role="alert">
          {tshirt.bgError}
        </p>
      )}
    </div>
  )
}

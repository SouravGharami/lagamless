import { formatFileSize } from './humanModelValidation.js'

/** Shows the uploaded model photo and its facts, with Change / Remove. Purely local. */
export default function HumanModelPreview({ modelImage, onChange, onRemove, busy = false }) {
  if (!modelImage) return null
  return (
    <div className="hms-preview">
      <div className="hms-preview__frame">
        <img src={modelImage.previewUrl} alt={`Human model: ${modelImage.fileName}`} className="hms-preview__img" />
      </div>
      <dl className="hms-facts">
        <div><dt>File</dt><dd title={modelImage.fileName}>{modelImage.fileName}</dd></div>
        <div><dt>Dimensions</dt><dd>{modelImage.width} × {modelImage.height} px</dd></div>
        <div><dt>Format</dt><dd>{(modelImage.mimeType || '').replace('image/', '').toUpperCase() || '—'}</dd></div>
        <div><dt>Size</dt><dd>{formatFileSize(modelImage.fileSize)}</dd></div>
      </dl>
      {modelImage.quality?.warnings?.length > 0 && (
        <ul className="hms-messages hms-messages--warn" role="status" aria-label="Image quality notes">
          {modelImage.quality.warnings.map((w) => <li key={w.code}>{w.message}</li>)}
        </ul>
      )}
      <div className="hms-row">
        <button type="button" className="mv2-btn" onClick={onChange} disabled={busy}>Change image</button>
        <button type="button" className="mv2-btn mv2-btn--danger" onClick={onRemove}>Remove</button>
      </div>
    </div>
  )
}

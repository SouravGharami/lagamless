import { useRef, useState } from 'react'
import { suggestPlacement } from '../../lib/mockupPlacement.js'

const AREA_OPTIONS = [
  { id: 'front', label: 'Front' },
  { id: 'back', label: 'Back' },
  { id: 'sleeve', label: 'Sleeve' },
]

/**
 * The left-hand rail of the studio: upload DTF artwork, see what the
 * automatic analysis found, pick which body area it's for, and place it —
 * matching the brief's own flow (upload → analyze → suggest → admin
 * accepts/changes → drag/resize/rotate → repeat for more prints).
 *
 * @param {object} props
 * @param {Array} props.artworks
 * @param {boolean} props.analyzing
 * @param {(files: FileList) => void} props.onUpload
 * @param {(artworkId: string, areaHint: string) => void} props.onPlace - adds a new placement from the suggestion
 * @param {(artworkId: string) => void} props.onRemove
 * @param {(angle: string) => boolean} props.angleHasPhoto - whether a real template photo is already on file for a given angle
 * @param {string|null} [props.pendingReviewAngle] - an angle currently mid background-review (uploaded, previewed, not yet explicitly confirmed) — purely informational now: clicking "Add to garment" auto-saves that preview first, so the button stays enabled
 */
function ArtworkPanel({ artworks, analyzing, onUpload, onPlace, onRemove, angleHasPhoto, pendingReviewAngle }) {
  const fileInputRef = useRef(null)
  const [areaHints, setAreaHints] = useState({})

  function handleFiles(fileList) {
    if (!fileList || !fileList.length) return
    onUpload(fileList)
  }

  return (
    <div className="mockup-artwork-panel">
      <div className="mockup-artwork-panel__upload">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/webp"
          multiple
          className="visually-hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button type="button" className="btn btn-secondary btn-block" onClick={() => fileInputRef.current?.click()}>
          {analyzing ? 'Analyzing artwork…' : 'Upload DTF artwork'}
        </button>
        <p className="text-small">
          Print-ready PNGs work best (transparent background). Each upload is measured for its true
          printed size before a placement is suggested.
        </p>
      </div>

      {artworks.length > 0 && (
        <ul className="mockup-artwork-list">
          {artworks.map((art) => {
            const areaHint = areaHints[art.id] || 'front'
            // Recomputed from the CURRENTLY selected chip, not the frozen
            // suggestion from upload time — that one was always calculated
            // for 'front' (see handleUpload), so its note used to keep
            // describing a front placement even after switching to Back,
            // which read as broken/inconsistent even when placement itself
            // was working correctly.
            const suggestion = suggestPlacement(art, areaHint)
            const missingPhoto = angleHasPhoto ? !angleHasPhoto(suggestion.angle) : false
            const reviewPending = pendingReviewAngle === suggestion.angle
            return (
              <li className="mockup-artwork-item" key={art.id}>
                <img src={art.dataUrl} alt={art.name} className="mockup-artwork-item__thumb" />
                <div className="mockup-artwork-item__body">
                  <span className="text-small mockup-artwork-item__name">{art.name}</span>

                  {suggestion && <p className="mockup-artwork-item__note text-small">{suggestion.note}</p>}

                  <div className="mockup-artwork-item__areas" role="radiogroup" aria-label={`Body area for ${art.name}`}>
                    {AREA_OPTIONS.map((opt) => (
                      <button
                        type="button"
                        key={opt.id}
                        className={`mockup-chip${areaHint === opt.id ? ' mockup-chip--active' : ''}`}
                        onClick={() => setAreaHints((prev) => ({ ...prev, [art.id]: opt.id }))}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {missingPhoto && !reviewPending && (
                    <p className="mockup-artwork-item__warning text-small">
                      No real template photo yet for "{suggestion.angle}" — clicking Add to garment will jump you to
                      that tab so you can upload one first.
                    </p>
                  )}

                  {reviewPending && (
                    <p className="mockup-artwork-item__warning text-small">
                      Still previewing a background for "{suggestion.angle}" — clicking Add to garment will save it
                      exactly as shown, then place the print.
                    </p>
                  )}

                  <div className="mockup-artwork-item__actions">
                    <button type="button" className="btn btn-secondary" onClick={() => onPlace(art.id, areaHint)}>
                      Add to garment
                    </button>
                    <button type="button" className="btn-ghost admin-image-slot__btn" onClick={() => onRemove(art.id)}>
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default ArtworkPanel

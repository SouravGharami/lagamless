import { useRef } from 'react'
import MockupCanvas from './MockupCanvas.jsx'
import { ANGLES } from '../../lib/mockupTemplates.js'
import { getTemplatePhoto, removeTemplatePhoto } from '../../lib/templatePhotoStore.js'

/**
 * "Angle Photos" — one card per real photo angle (front, 3/4 front, side,
 * back, 3/4 back, detail/sleeve), so the admin can see, at a glance and
 * without hunting through tabs one at a time, exactly which angles have a
 * real photo on file for the current colorway and what the DTF looks like
 * actually applied to each.
 *
 * Each card's preview is a genuine, live MockupCanvas in read-only mode —
 * the exact same photo + the exact same perspective-warped, fabric-shaded
 * DTF compositing used in the big interactive editor below, not a mockup
 * of a mockup. If an angle has no real photo yet, its card says so
 * plainly and offers Upload; nothing here ever synthesizes a missing
 * angle from another one's photo.
 *
 * @param {object} props
 * @param {string} props.templateId
 * @param {{ hex: string, fabric: string, colorName?: string }} props.garment
 * @param {Array} props.placements - every placement, any angle (this component filters per-card)
 * @param {Record<string, object>} props.artworksById
 * @param {string} props.activeAngle
 * @param {(angle: string) => void} props.onSelectAngle - open this angle in the big editor
 * @param {(file: File, angle: string) => void} props.onUpload - admin picked a file to upload/replace this angle's photo
 * @param {(angle: string) => void} props.onRemoved - fired after a photo was removed, so the caller can bump its refresh key
 * @param {number} props.photoVersion - bump this to force every card to re-check templatePhotoStore
 */
function AnglePhotoManager({ templateId, garment, placements, artworksById, activeAngle, onSelectAngle, onUpload, onRemoved, photoVersion }) {
  const fileInputs = useRef({})

  function triggerUpload(angleId) {
    fileInputs.current[angleId]?.click()
  }

  function handleFileChange(angleId, event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    // onUpload is MockupStudio's handleTemplatePhotoUpload(file, angleOverride) —
    // file FIRST. This used to be called as onUpload(angleId, file), which
    // silently swapped the two: the "angle" string landed in the `file`
    // parameter and got handed straight to `reader.readAsDataURL(angleId)`,
    // throwing ("parameter 1 is not of type 'Blob'") before anything was
    // ever saved. The upload looked like it did nothing (no toast, no
    // visible change), and every later "Add to garment" for that angle then
    // failed with "upload a real template photo first" — because, from
    // templatePhotoStore's point of view, none ever had been.
    if (file) onUpload(file, angleId)
  }

  function handleRemove(angleId, label) {
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(
      `Remove the real template photo for "${label}"? Any prints already placed on this angle will stay saved, but Generate Mockups won't be able to render this angle again until a new photo is uploaded.`,
    )
    if (!confirmed) return
    const colorKey = garment.fabric === 'solid' ? 'solid' : `${garment.fabric}:${(garment.colorName || garment.hex || 'default').toLowerCase()}`
    removeTemplatePhoto(templateId, angleId, colorKey)
    onRemoved(angleId)
  }

  return (
    <div className="mockup-angle-grid">
      {ANGLES.map((angle) => {
        const colorKey = garment.fabric === 'solid' ? 'solid' : `${garment.fabric}:${(garment.colorName || garment.hex || 'default').toLowerCase()}`
        const record = getTemplatePhoto(templateId, angle.id, colorKey)
        const anglePlacements = placements.filter((p) => p.angle === angle.id)
        const isActive = activeAngle === angle.id

        return (
          <div key={angle.id} className={`mockup-angle-card${isActive ? ' mockup-angle-card--active' : ''}`}>
            <button type="button" className="mockup-angle-card__preview" onClick={() => onSelectAngle(angle.id)} title={`Edit ${angle.label}`}>
              <MockupCanvas
                key={`${angle.id}-${colorKey}-${photoVersion}`}
                templateId={templateId}
                angle={angle.id}
                garment={garment}
                placements={anglePlacements}
                artworksById={artworksById}
                interactive={false}
              />
            </button>

            <div className="mockup-angle-card__meta">
              <span className="mockup-angle-card__label">{angle.label}</span>
              {anglePlacements.length > 0 && (
                <span className="mockup-angle-card__badge">
                  {anglePlacements.length} print{anglePlacements.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            <div className="mockup-angle-card__actions">
              <input
                ref={(el) => {
                  fileInputs.current[angle.id] = el
                }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="visually-hidden"
                onChange={(e) => handleFileChange(angle.id, e)}
              />
              <button type="button" className="btn-ghost" onClick={() => triggerUpload(angle.id)}>
                {record ? 'Replace photo' : 'Upload photo'}
              </button>
              {record && (
                <button type="button" className="btn-ghost" onClick={() => handleRemove(angle.id, angle.label)}>
                  Remove photo
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default AnglePhotoManager

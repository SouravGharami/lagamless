import { useRef } from 'react'
import { IMAGE_SLOTS } from '../lib/productFormValidation.js'

/**
 * Lets the admin see, replace, remove, edit alt text for, and reorder (by
 * promoting to "Main") each of a product's six named image slots.
 *
 * Each slot in `images` carries: `src` (current preview URL — either the
 * saved Supabase Storage public URL, or a local `URL.createObjectURL`
 * preview of a not-yet-uploaded file), `alt`, `id` (the underlying
 * `product_images` row id, `null` if this slot has never been saved),
 * `storagePath` (the saved file's Storage path, for cleanup on
 * replace/remove), `pendingFile` (a `File` chosen but not yet uploaded),
 * and `removed` (marks a previously-saved slot for deletion).
 *
 * This component never talks to Supabase directly — it only ever updates
 * this local, in-memory shape via `onChange`. The actual upload / record
 * update / record+file deletion happens when the product is saved (see
 * `syncProductImages` in `src/services/adminProducts.js`), so a mis-click
 * here costs nothing until "Save" is pressed, and a new product (no id
 * yet) works exactly the same way as editing an existing one.
 *
 * @param {object} props
 * @param {Record<string, {src: string|null, alt: string, id: string|null, storagePath: string|null, pendingFile: File|null, removed: boolean}>} props.images
 * @param {(images: object) => void} props.onChange
 */
function ImageSlotManager({ images, onChange }) {
  const fileInputRefs = useRef({})

  function handleReplace(slotKey, file) {
    if (!file) return
    const url = URL.createObjectURL(file)
    onChange({
      ...images,
      [slotKey]: { ...images[slotKey], src: url, pendingFile: file, removed: false },
    })
  }

  function handleRemove(slotKey) {
    onChange({
      ...images,
      [slotKey]: { ...images[slotKey], src: null, pendingFile: null, removed: true },
    })
  }

  function handleAltChange(slotKey, alt) {
    onChange({
      ...images,
      [slotKey]: { ...images[slotKey], alt },
    })
  }

  function handleSetMain(slotKey) {
    if (slotKey === 'main') return
    onChange({
      ...images,
      main: { ...images[slotKey] },
      [slotKey]: { ...images.main },
    })
  }

  return (
    <div className="admin-image-slots">
      {IMAGE_SLOTS.map(({ key, label }) => {
        const slot = images[key] || { src: null, alt: '', id: null, storagePath: null, pendingFile: null, removed: false }
        return (
          <div className="admin-image-slot" key={key}>
            <div className="admin-image-slot__preview">
              {slot.src ? (
                <img src={slot.src} alt={slot.alt} />
              ) : (
                <span className="admin-image-slot__placeholder text-label">
                  {slot.removed ? 'Marked for removal' : 'No image'}
                </span>
              )}
              {key === 'main' && <span className="admin-image-slot__main-tag">Main</span>}
            </div>

            <span className="text-label">{label}</span>

            {slot.src && (
              <input
                type="text"
                className="input admin-image-slot__alt"
                placeholder="Alt text"
                value={slot.alt}
                onChange={(e) => handleAltChange(key, e.target.value)}
                aria-label={`Alt text for ${label} image`}
              />
            )}

            <div className="admin-image-slot__actions">
              <input
                ref={(el) => {
                  fileInputRefs.current[key] = el
                }}
                type="file"
                accept="image/*"
                className="visually-hidden"
                onChange={(event) => handleReplace(key, event.target.files?.[0])}
                aria-label={`Replace ${label} image`}
              />
              <button
                type="button"
                className="btn-ghost admin-image-slot__btn"
                onClick={() => fileInputRefs.current[key]?.click()}
              >
                Replace
              </button>
              {slot.src && (
                <button
                  type="button"
                  className="btn-ghost admin-image-slot__btn"
                  onClick={() => handleRemove(key)}
                >
                  Remove
                </button>
              )}
              {slot.src && key !== 'main' && (
                <button
                  type="button"
                  className="btn-ghost admin-image-slot__btn"
                  onClick={() => handleSetMain(key)}
                >
                  Set as main
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ImageSlotManager

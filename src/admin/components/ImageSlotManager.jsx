import { useRef, useState } from 'react'
import { IMAGE_SLOTS } from '../lib/productFormValidation.js'
import { removeBackground, compositeOnBackdrop, STUDIO_BACKDROPS } from '../lib/backgroundStudio.js'
import { loadImage } from '../lib/photoCompositor.js'

// Presets offered inline in each slot's "Clean up in Studio" row. The
// gradient backdrop needs its own two-color pickers (see MockupStudio) —
// out of scope for this one-click, per-slot action — so it's left out here.
const QUICK_BACKDROPS = STUDIO_BACKDROPS.filter((b) => b.id !== 'gradient')
const DEFAULT_BACKDROP_ID = 'light-grey'
// The hanger (requirement #7) belongs on a full hanging-garment shot, not
// on a tight detail crop or a flat fabric swatch — drawing a hanger arc
// across either of those would look like a stray graphic, not a prop.
const HANGER_SLOTS = new Set(['main', 'front', 'model', 'side', 'back', 'three_quarter_back'])

/** Reads any src this component ever hands out (a blob: object URL from a
 * freshly-chosen file, or a saved Supabase Storage https:// URL) into a
 * data URL, so removeBackground() always gets bytes it owns outright
 * rather than a live cross-origin URL. */
async function toDataUrl(src) {
  if (src.startsWith('data:')) return src
  const response = await fetch(src)
  const blob = await response.blob()
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Could not read that image.'))
    reader.readAsDataURL(blob)
  })
}

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
  // Always points at the newest `images`. The async "Clean up in Studio" action finishes seconds after it started;
  // by then the admin may have uploaded other slots, and spreading the (stale) `images` captured when it began would
  // silently wipe those uploads. Every handler reads this ref instead, so no slot is ever overwritten by an old copy.
  const imagesRef = useRef(images)
  imagesRef.current = images
  // Per-slot state for the "Clean up in Studio" action — never touches
  // `images` itself until the result is ready, same spirit as everything
  // else here: a slot's own file input state is separate from `onChange`.
  const [studio, setStudio] = useState({}) // { [slotKey]: { backdropId, working, progress, error } }

  function studioFor(slotKey) {
    return studio[slotKey] || { backdropId: DEFAULT_BACKDROP_ID, working: false, progress: 0, error: null }
  }

  function setStudioFor(slotKey, patch) {
    setStudio((prev) => ({ ...prev, [slotKey]: { ...studioFor(slotKey), ...prev[slotKey], ...patch } }))
  }

  function handleBackdropChange(slotKey, backdropId) {
    setStudioFor(slotKey, { backdropId })
  }

  /**
   * Runs the same background-removal + studio-backdrop compositing the
   * Mockup Studio uses (see backgroundStudio.js) on whatever's currently
   * in this slot — a raw flat-lay, a photo on a mannequin, a phone photo
   * against a bedroom wall, anything — and replaces the slot's preview
   * with a clean, evenly-lit studio version: garment cut out, centered,
   * dropped onto a seamless backdrop with a soft contact shadow. This is
   * what turns "a photo of the product" into "a product photo" without
   * needing an actual studio shoot for every upload.
   *
   * The result becomes this slot's new `pendingFile` exactly like a
   * manual "Replace" would, so it's uploaded on Save through the normal
   * pipeline — nothing else downstream needs to know it was cleaned up.
   */
  async function handleCleanUp(slotKey) {
    const slot = imagesRef.current[slotKey]
    if (!slot?.src) return
    const backdropId = studioFor(slotKey).backdropId
    setStudioFor(slotKey, { working: true, progress: 0, error: null })
    try {
      const sourceDataUrl = await toDataUrl(slot.src)
      const cutoutDataUrl = await removeBackground(sourceDataUrl, (ratio) => setStudioFor(slotKey, { progress: ratio }))
      const cutoutImage = await loadImage(cutoutDataUrl)
      const canvas = compositeOnBackdrop(cutoutImage, backdropId, undefined, undefined, { show: HANGER_SLOTS.has(slotKey) })
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the studio image.'))), 'image/png'),
      )
      const file = new File([blob], slot.pendingFile?.name || `${slotKey}-studio.png`, { type: 'image/png' })
      const url = URL.createObjectURL(file)
      const latest = imagesRef.current
      onChange({
        ...latest,
        [slotKey]: { ...latest[slotKey], src: url, pendingFile: file, removed: false },
      })
      setStudioFor(slotKey, { working: false, progress: 1, error: null })
    } catch (err) {
      setStudioFor(slotKey, {
        working: false,
        error: err instanceof Error ? err.message : 'Could not clean up this photo — try again.',
      })
    }
  }

  function handleReplace(slotKey, file) {
    if (!file) return
    const url = URL.createObjectURL(file)
    onChange({
      ...imagesRef.current,
      [slotKey]: { ...imagesRef.current[slotKey], src: url, pendingFile: file, removed: false },
    })
  }

  function handleRemove(slotKey) {
    onChange({
      ...imagesRef.current,
      [slotKey]: { ...imagesRef.current[slotKey], src: null, pendingFile: null, removed: true },
    })
  }

  function handleAltChange(slotKey, alt) {
    onChange({
      ...imagesRef.current,
      [slotKey]: { ...imagesRef.current[slotKey], alt },
    })
  }

  function handleSetMain(slotKey) {
    if (slotKey === 'main') return
    onChange({
      ...imagesRef.current,
      main: { ...imagesRef.current[slotKey] },
      [slotKey]: { ...imagesRef.current.main },
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

            {slot.src && (
              <div className="admin-image-slot__studio">
                <select
                  className="input admin-image-slot__studio-select"
                  value={studioFor(key).backdropId}
                  onChange={(e) => handleBackdropChange(key, e.target.value)}
                  disabled={studioFor(key).working}
                  aria-label={`Studio backdrop for ${label} image`}
                >
                  {QUICK_BACKDROPS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn-ghost admin-image-slot__btn admin-image-slot__studio-btn"
                  onClick={() => handleCleanUp(key)}
                  disabled={studioFor(key).working}
                >
                  {studioFor(key).working
                    ? `Cleaning up… ${Math.round(studioFor(key).progress * 100)}%`
                    : 'Clean up in Studio'}
                </button>
                {studioFor(key).error && (
                  <span className="text-small admin-image-slot__studio-error" role="alert">
                    {studioFor(key).error}
                  </span>
                )}
              </div>
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

/**
 * Local draft persistence for /admin/products/new.
 *
 * Scope: this ONLY covers the "add new product" form. Editing an existing
 * product (`AdminProductEdit.jsx` / `AdminProductNew.jsx` used with an
 * `initialProduct`) never reads or writes this key — see the versioned,
 * new-product-specific key below.
 *
 * What gets persisted:
 *   - Every plain form field (name, productNumber, sku, slug, category,
 *     tags, price, compareAtPrice, description, story, fabric, gsm, fit,
 *     care, construction, design, stylingNote, sizes, variants,
 *     measurements, status, isFeatured, isNewArrival).
 *   - For each image slot: `alt`, `id`, `storagePath`, and `src` — but
 *     ONLY when `src` is a real, already-uploaded URL. A `pendingFile`
 *     (a `File` the admin just chose but hasn't saved yet) can never be
 *     serialized to JSON/localStorage, so it is always dropped. Its
 *     local preview (`URL.createObjectURL(file)`, an `blob:` URL) is
 *     dropped too — that URL is only valid for this page's current life
 *     and is meaningless (and would 404) after a reload, so keeping it
 *     around would just show a broken image on restore. The admin simply
 *     re-picks the file after restore; nothing else about the draft is
 *     lost.
 *
 * What never gets persisted: File objects, auth tokens, Supabase keys,
 * passwords, or any other secret — this module only ever touches the
 * plain-object `form` shape produced by `ProductForm`'s own state, which
 * doesn't contain any of those to begin with.
 */

export const DRAFT_KEY = 'lagamless:admin:new-product-draft:v1'

const AUTOSAVE_DEBOUNCE_MS = 800

/**
 * Strips anything from an image slot that can't/shouldn't survive a
 * localStorage round-trip: the `File` object itself, and a `blob:` object
 * URL that would be dangling after reload.
 */
function sanitizeImageSlot(slot) {
  if (!slot) return slot
  const isBlobUrl = typeof slot.src === 'string' && slot.src.startsWith('blob:')
  return {
    src: isBlobUrl ? null : slot.src ?? null,
    alt: slot.alt ?? '',
    id: slot.id ?? null,
    storagePath: slot.storagePath ?? null,
    // Never persisted — a File can't be JSON-serialized, and even if it
    // could, localStorage is not a safe place to keep binary upload data.
    pendingFile: null,
    removed: !!slot.removed,
  }
}

function sanitizeImages(images) {
  if (!images || typeof images !== 'object') return {}
  return Object.fromEntries(Object.entries(images).map(([slot, value]) => [slot, sanitizeImageSlot(value)]))
}

/**
 * Produces the localStorage-safe version of a ProductForm `form` state
 * object. Safe to call on every keystroke — it's a plain object mapping,
 * no I/O happens here (see `scheduleDraftSave` for the debounced write).
 */
function sanitizeFormForStorage(form) {
  const { images, ...rest } = form
  return { ...rest, images: sanitizeImages(images) }
}

/**
 * Reads the saved draft, if any. Returns `null` when there is no draft,
 * or when the stored value is missing/corrupted/unparsable — in the
 * latter case the bad entry is removed so it doesn't keep failing on
 * every future load.
 *
 * @returns {{ form: object, savedAt: string } | null}
 */
export function loadDraft() {
  if (typeof window === 'undefined' || !window.localStorage) return null

  let raw
  try {
    raw = window.localStorage.getItem(DRAFT_KEY)
  } catch (err) {
    // Storage inaccessible (privacy mode, quota, disabled) — treat as "no
    // draft" rather than crashing the page.
    console.warn('productDraft: localStorage.getItem failed.', err)
    return null
  }

  if (!raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || typeof parsed.form !== 'object' || parsed.form === null) {
      throw new Error('Malformed draft shape.')
    }
    return parsed
  } catch (err) {
    console.warn('productDraft: discarding corrupted draft.', err)
    try {
      window.localStorage.removeItem(DRAFT_KEY)
    } catch {
      // Nothing further we can do — ignore.
    }
    return null
  }
}

/** Immediately (synchronously) writes the given form state as the draft. */
export function saveDraftNow(form) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const payload = JSON.stringify({ form: sanitizeFormForStorage(form), savedAt: new Date().toISOString() })
    window.localStorage.setItem(DRAFT_KEY, payload)
  } catch (err) {
    // Quota exceeded, storage disabled, etc. — draft autosave is a
    // convenience, not a critical path, so this must never throw up into
    // the form's onChange handler.
    console.warn('productDraft: failed to save draft.', err)
  }
}

/** Removes the saved draft, if any. Safe to call when none exists. */
export function clearDraft() {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.removeItem(DRAFT_KEY)
  } catch (err) {
    console.warn('productDraft: failed to clear draft.', err)
  }
}

/**
 * Builds a debounced autosave function bound to a single "last scheduled
 * timeout" so rapid keystrokes coalesce into one localStorage write
 * instead of one per keystroke. Call the returned function on every form
 * change; call `.flush()` to save immediately (e.g. right before
 * navigating away), and `.cancel()` to drop a pending save (e.g. right
 * after the draft was intentionally cleared).
 *
 * @param {(form: object) => void} [onSaved] - called after each actual write
 */
export function createDraftAutosaver(onSaved) {
  let timeoutId = null
  let pendingForm = null

  function run() {
    timeoutId = null
    if (pendingForm === null) return
    const form = pendingForm
    pendingForm = null
    saveDraftNow(form)
    onSaved?.(form)
  }

  function schedule(form) {
    pendingForm = form
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(run, AUTOSAVE_DEBOUNCE_MS)
  }

  schedule.flush = () => {
    if (timeoutId) clearTimeout(timeoutId)
    run()
  }

  schedule.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = null
    pendingForm = null
  }

  return schedule
}

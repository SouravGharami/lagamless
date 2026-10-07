/**
 * Real-photo template store.
 *
 * The realistic mockup engine (see photoCompositor.js) composites DTF
 * artwork onto an *actual photograph* of the garment — never a drawn
 * silhouette. Nobody can conjure genuine studio photography from code, so
 * this module is the other half of that requirement: a small, boring
 * place for an admin to upload the real photos once, per angle and per
 * colorway, and have every mockup in the studio reuse them from then on.
 *
 * Storage is intentionally simple (localStorage, data URLs) so this works
 * today with zero backend changes. If/when product photography moves to
 * real storage (Supabase storage, S3, etc.), swap the get/set/list bodies
 * below for network calls — every caller in the studio only goes through
 * these three functions, never `localStorage` directly.
 */

const STORAGE_KEY = 'lagamless:mockup-template-photos:v1'

/**
 * @typedef {{
 *   angle: string, colorKey: string,
 *   dataUrl: string, width: number, height: number, uploadedAt: string,
 *   rawDataUrl?: string,    - the admin's original upload, before any background work, kept so "change background" never needs a re-upload
 *   cutoutDataUrl?: string, - the background-removal model's transparent-PNG output, cached so switching studio backdrops never re-runs the (slow) ML model
 *   backdropKind?: 'preset' | 'custom', - whether `dataUrl` was last composited onto a built-in STUDIO_BACKDROPS entry or the admin's own uploaded background photo
 *   backdropId?: string,    - which STUDIO_BACKDROPS entry `dataUrl` was last composited onto, if backdropKind is 'preset' (or unset, for older records)
 *   customBackgroundDataUrl?: string, - the admin's own uploaded background photo, if backdropKind is 'custom' — kept so "change background" can reopen it without a re-upload
 *   bgTransform?: {scale:number, offsetX:number, offsetY:number},      - composition editor: custom background pan/zoom
 *   subjectTransform?: {scale:number, offsetX:number, offsetY:number}, - composition editor: subject (garment/model) scale + position
 *   gradientColors?: {top:string, bottom:string}, - the "Custom gradient" backdrop's own admin-picked colors, if backdropId is 'gradient' (previously dropped on save — see setTemplatePhoto — so reopening "Change background" on a gradient photo silently reset it to the default gradient colors instead of the ones actually chosen)
 *   hanger?: {show:boolean, style:'wood'|'neutral'}, - requirement #7: whether the composited `dataUrl` has the studio's drawn hanger above the collar, and which finish. Omitted (older records) falls back to DEFAULT_HANGER wherever it's read.
 * }} TemplatePhoto
 */

function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeAll(map) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch (err) {
    // Most likely quota exceeded (data URLs are large). Surface this to
    // the caller rather than silently dropping the upload.
    throw new Error(
      err instanceof DOMException && err.name === 'QuotaExceededError'
        ? 'This browser is out of local storage space for template photos. Move template photography to server-side storage for production use.'
        : 'Could not save the template photo.',
    )
  }
}

function key(templateId, angle, colorKey) {
  return `${templateId}::${angle}::${colorKey}`
}

/**
 * A colorway "key" for template-photo lookup. Solid colors are all
 * rendered from ONE neutral base photo (garment color is applied on top
 * — see photoCompositor.recolorGarment), but special finishes (acid
 * wash, tie-dye, marble…) are never faked from a hex value: each one
 * needs its own real photograph, keyed by its own color name.
 */
export function colorKeyFor(garment) {
  if (!garment || garment.fabric === 'solid') return 'solid'
  return `${garment.fabric}:${(garment.colorName || garment.hex || 'default').toLowerCase()}`
}

/** @returns {TemplatePhoto | null} */
export function getTemplatePhoto(templateId, angle, colorKey) {
  const all = readAll()
  return all[key(templateId, angle, colorKey)] || null
}

/**
 * Stores a photo (as a data URL) for one template/angle/colorway.
 * `dataUrl` is always the FINAL image the rest of the studio composites
 * prints onto — e.g. the background-removal + studio-backdrop result,
 * if the admin used those tools, or the plain original upload otherwise.
 * `rawDataUrl`/`cutoutDataUrl`/`backdropId` are optional extras that
 * let "change background" re-composite a new backdrop later without
 * asking for a re-upload or re-running the ML model.
 */
export function setTemplatePhoto(
  templateId,
  angle,
  colorKey,
  {
    dataUrl,
    width,
    height,
    rawDataUrl,
    cutoutDataUrl,
    backdropKind,
    backdropId,
    customBackgroundDataUrl,
    bgTransform,
    subjectTransform,
    gradientColors,
    hanger,
  },
) {
  const all = readAll()
  all[key(templateId, angle, colorKey)] = {
    angle,
    colorKey,
    dataUrl,
    width,
    height,
    uploadedAt: new Date().toISOString(),
    ...(rawDataUrl ? { rawDataUrl } : {}),
    ...(cutoutDataUrl ? { cutoutDataUrl } : {}),
    ...(backdropKind ? { backdropKind } : {}),
    ...(backdropId ? { backdropId } : {}),
    ...(customBackgroundDataUrl ? { customBackgroundDataUrl } : {}),
    ...(bgTransform ? { bgTransform } : {}),
    ...(subjectTransform ? { subjectTransform } : {}),
    ...(gradientColors ? { gradientColors } : {}),
    ...(hanger ? { hanger } : {}),
  }
  writeAll(all)
}

export function removeTemplatePhoto(templateId, angle, colorKey) {
  const all = readAll()
  delete all[key(templateId, angle, colorKey)]
  writeAll(all)
}

/** Every uploaded photo for a template, so the studio can show what's still missing. */
export function listTemplatePhotos(templateId) {
  const all = readAll()
  return Object.entries(all)
    .filter(([k]) => k.startsWith(`${templateId}::`))
    .map(([, v]) => v)
}

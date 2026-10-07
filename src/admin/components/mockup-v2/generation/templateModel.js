/**
 * Step 5-1 — mockup TEMPLATE model.
 *
 * A template is the *photographic base* a mockup is built on. The model deliberately keeps two
 * things apart:
 *   assetKind REAL_PHOTO       an actual photograph (natural folds, fabric, light, shadow, perspective)
 *   assetKind GENERATED_OUTPUT a digital / generated image
 * A flat T-shirt PNG is NOT a realistic photograph. Code cannot verify that from pixels, so
 * `assetKind` is a declaration made by whoever supplies the template; later steps read the
 * photographic qualities from it (masks, garment region) rather than assuming them.
 * Nothing here draws or generates anything.
 */
import { isAngle } from './mockupAngles.js'
import { REGION_IDS, isRegion } from './artworkRegions.js'

export const TEMPLATE_SOURCE_TYPES = Object.freeze({
  UPLOADED_PHOTO: 'uploaded_photo', // a photo the admin uploaded (e.g. the studio's current T-shirt image)
  STORED_TEMPLATE: 'stored_template', // a reusable template kept in the registry / storage
  GENERATED_IMAGE: 'generated_image', // FUTURE: model output. Type exists for compatibility; not usable yet.
})

export const ASSET_KINDS = Object.freeze({ REAL_PHOTO: 'REAL_PHOTO', GENERATED_OUTPUT: 'GENERATED_OUTPUT' })

/** Garment types. Only the oversized T-shirt exists in the app today; add an entry here (one line) when another garment is supported. */
export const GARMENT_TYPES = Object.freeze({ OVERSIZED_TSHIRT: 'OVERSIZED_TSHIRT' })
export const GARMENT_DEFS = Object.freeze([{ id: 'OVERSIZED_TSHIRT', label: 'Oversized T-shirt' }].map(Object.freeze))
export const DEFAULT_GARMENT_TYPE = GARMENT_TYPES.OVERSIZED_TSHIRT
export const isGarmentType = (id) => GARMENT_DEFS.some((g) => g.id === id)
export const getGarmentDef = (id) => GARMENT_DEFS.find((g) => g.id === id) || null

/** Colour compatibility is METADATA ONLY. Nothing recolours the photograph. 'any' = colour-agnostic. */
export const TEMPLATE_COLORS = Object.freeze([
  { id: 'any', label: 'Any' }, { id: 'black', label: 'Black' }, { id: 'white', label: 'White' }, { id: 'off-white', label: 'Off-white' },
  { id: 'olive', label: 'Olive' }, { id: 'bottle-green', label: 'Bottle green' }, { id: 'beige', label: 'Beige' }, { id: 'custom', label: 'Custom' },
].map(Object.freeze))

/** Reserved slots for later steps. They stay null in Step 5-2: no mask, perspective or lighting is invented or detected. */
export const MASK_DATA_KEYS = Object.freeze(['garmentMask', 'printAreaMask', 'sleeveMask', 'perspectiveData', 'deformationData', 'lightingData'])
export const emptyMaskData = () => Object.fromEntries(MASK_DATA_KEYS.map((k) => [k, null]))

const SOURCE_TYPE_LIST = Object.values(TEMPLATE_SOURCE_TYPES)
/** Only these are functional in Step 5-1. */
const FUNCTIONAL = new Set(['uploaded_photo', 'stored_template'])

export const isSourceType = (t) => SOURCE_TYPE_LIST.includes(t)
export const isFunctionalSourceType = (t) => FUNCTIONAL.has(t)

/** Generated images can never count as real photos; the other types are real photos unless declared otherwise. */
export const defaultAssetKind = (sourceType) => (sourceType === 'generated_image' ? ASSET_KINDS.GENERATED_OUTPUT : ASSET_KINDS.REAL_PHOTO)

/**
 * @typedef {Object} MockupTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} tshirtType             e.g. 'crew_neck_tee'
 * @property {string[]} colors               compatible colours; ['any'] = colour-agnostic (alias: supportedColors)
 * @property {string} garmentType            a GARMENT_TYPES id
 * @property {string} description
 * @property {string[]} supportedRegions     ARTWORK_REGIONS ids this photo can carry; [] = unspecified (not restricted)
 * @property {boolean} active                false = kept in the library but not selectable
 * @property {string} createdAt              ISO time
 * @property {string} updatedAt
 * @property {{width:number|null,height:number|null,fileType:string|null,bytes:number|null,contentHash:string|null}} imageInfo
 * @property {Object} maskData               reserved (garmentMask, printAreaMask, ... ) — all null in Step 5-2
 * @property {string} angle                  a MOCKUP_ANGLES id
 * @property {string} sourceType             a TEMPLATE_SOURCE_TYPES value
 * @property {'REAL_PHOTO'|'GENERATED_OUTPUT'} assetKind
 * @property {{url:string|null, ref:string|null, width:number|null, height:number|null}} source
 * @property {string|null} previewImage
 * @property {Object} placement              default per-region rectangle, % of the garment box (may be empty)
 * @property {Object|null} mask              optional mask description (future)
 * @property {Object|null} garmentRegion     optional garment bounds / polygon, 0..1 of the source (future)
 */

const isStr = (v) => typeof v === 'string' && v.trim().length > 0

export function validateTemplate(t) {
  const errors = []
  if (!t || typeof t !== 'object') return ['Template must be an object.']
  if (!isStr(t.id)) errors.push('id is required.')
  if (!isStr(t.name)) errors.push('name is required.')
  if (!isAngle(t.angle)) errors.push(`angle "${t.angle}" is not a known angle.`)
  if (!isSourceType(t.sourceType)) errors.push(`sourceType "${t.sourceType}" is not supported.`)
  if (isSourceType(t.sourceType)) {
    if (t.sourceType === 'generated_image' && t.assetKind === ASSET_KINDS.REAL_PHOTO) errors.push('A generated_image template cannot be declared a REAL_PHOTO.')
    if (isFunctionalSourceType(t.sourceType) && !(isStr(t.source?.url) || isStr(t.source?.ref))) errors.push('source.url or source.ref is required.')
  }
  if (!isGarmentType(t.garmentType)) errors.push(`garmentType "${t.garmentType}" is not supported.`)
  if (!Array.isArray(t.supportedRegions) || t.supportedRegions.some((r) => !isRegion(r))) errors.push('supportedRegions must be a list of known artwork regions.')
  if (!Array.isArray(t.colors) || t.colors.some((c) => !isStr(c))) errors.push('colors must be a list of colour names.')
  if (t.placement) for (const key of Object.keys(t.placement)) if (!isRegion(key)) errors.push(`placement region "${key}" is unknown.`)
  return errors
}

/** Normalises input into a complete template. Throws if it is invalid, so a registry never holds a broken entry. */
export function createTemplate(input = {}) {
  const sourceType = input.sourceType
  const nowIso = new Date().toISOString()
  const colorInput = input.colors ?? input.supportedColors
  const colors = Array.isArray(colorInput) && colorInput.length ? [...new Set(colorInput)] : ['any']
  const info = input.imageInfo ?? {}
  const createdAt = input.createdAt ?? nowIso
  const template = {
    id: input.id,
    name: input.name,
    tshirtType: input.tshirtType ?? 'crew_neck_tee',
    colors,
    supportedColors: colors, // alias of `colors` (same array)
    description: typeof input.description === 'string' ? input.description : '',
    garmentType: input.garmentType ?? DEFAULT_GARMENT_TYPE,
    supportedRegions: Array.isArray(input.supportedRegions) ? [...new Set(input.supportedRegions)] : [],
    active: input.active !== false,
    createdAt,
    updatedAt: input.updatedAt ?? createdAt,
    angle: input.angle,
    sourceType,
    assetKind: input.assetKind ?? defaultAssetKind(sourceType),
    source: {
      url: input.source?.url ?? input.sourceImage ?? null,
      ref: input.source?.ref ?? null,
      width: input.source?.width ?? null,
      height: input.source?.height ?? null,
    },
    previewImage: input.previewImage ?? null,
    placement: { ...input.placement },
    imageInfo: {
      width: info.width ?? input.source?.width ?? null,
      height: info.height ?? input.source?.height ?? null,
      fileType: info.fileType ?? null,
      bytes: info.bytes ?? null,
      contentHash: info.contentHash ?? null,
    },
    maskData: { ...emptyMaskData(), ...input.maskData },
    mask: input.mask ?? null,
    garmentRegion: input.garmentRegion ?? null,
  }
  const errors = validateTemplate(template)
  if (errors.length) throw new TypeError(`Invalid mockup template: ${errors.join(' ')}`)
  return Object.freeze(template)
}

/** A template is usable now only when its source type is functional AND it is active (inactive ones are never selectable). */
export const isTemplateUsable = (t) => !!t && isFunctionalSourceType(t.sourceType) && t.active !== false

export const supportsColor = (t, color) => !color || t.colors.includes('any') || t.colors.includes(color)

/** Returns a re-validated copy with `patch` applied and updatedAt refreshed. The original is never mutated. */
export function withTemplateUpdates(template, patch = {}) {
  return createTemplate({ ...template, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() })
}

export const UPLOADED_TEMPLATE_PREFIX = 'uploaded:'

/**
 * The studio's current T-shirt image, expressed as an `uploaded_photo` template. It REFERENCES the
 * existing in-memory image (no re-upload, no copy). Angle is whatever the person says the photo shows.
 */
export function templateFromUploadedTshirt(tshirt, angle = 'FRONT', overrides = {}) {
  if (!tshirt) return null
  return createTemplate({
    id: `${UPLOADED_TEMPLATE_PREFIX}${tshirt.id}`,
    name: tshirt.name ? `Uploaded photo — ${tshirt.name}` : 'Uploaded photo',
    angle,
    sourceType: TEMPLATE_SOURCE_TYPES.UPLOADED_PHOTO,
    source: { url: tshirt.originalUrl, ref: tshirt.id, width: tshirt.width, height: tshirt.height },
    previewImage: tshirt.originalUrl,
    ...overrides,
  })
}

export { REGION_IDS }

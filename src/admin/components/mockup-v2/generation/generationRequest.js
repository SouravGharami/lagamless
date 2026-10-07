/**
 * Step 5-1 — generation REQUEST. A plain, serialisable description of what a future provider should
 * make. It references images (URLs / ids); it never embeds bytes, and it is NOT sent anywhere in this
 * step. It carries no credentials of any kind: secrets belong to a server-side provider only.
 */
import { isAngle } from './mockupAngles.js'
import { ARTWORK_REGIONS, REGION_IDS, activeRegions } from './artworkRegions.js'

export const REQUEST_VERSION = 1
export const QUALITY_LEVELS = Object.freeze(['draft', 'standard', 'high'])
export const OUTPUT_FORMATS = Object.freeze(['png', 'jpeg', 'webp'])
export const DEFAULT_GENERATION_SETTINGS = Object.freeze({ provider: 'none', quality: 'standard', outputFormat: 'png' })

/** Fields whose presence would mean a credential leaked into a request. Checked by validateGenerationRequest. */
const FORBIDDEN_KEY = /(api[-_]?key|secret|token|password|authorization|bearer)/i

/**
 * @param project   result of buildMockupProject()
 * @param overrides any request field, incl. `extras` for provider-specific options
 */
export function createGenerationRequest(project, overrides = {}) {
  const settings = { ...DEFAULT_GENERATION_SETTINGS, ...project?.generationSettings }
  const artworkRegions = project?.artwork ?? {}
  // Unique artworks across all regions (an artwork appears once even if referenced twice).
  const artwork = []
  const seen = new Set()
  for (const region of REGION_IDS) {
    for (const p of artworkRegions[region] ?? []) {
      if (seen.has(p.artworkId)) continue
      seen.add(p.artworkId)
      artwork.push({ id: p.artworkId, sourceId: p.sourceId, name: p.name, region })
    }
  }
  return {
    version: REQUEST_VERSION,
    templateId: project?.template?.id ?? null,
    angle: project?.angle ?? null,
    tShirtType: project?.tshirt?.type ?? null,
    tShirtColor: project?.tshirt?.color ?? null,
    artwork,
    artworkRegions,
    background: project?.background ?? null, // described by the existing Background system (Step 4)
    generationProvider: settings.provider,
    quality: settings.quality,
    outputFormat: settings.outputFormat,
    extras: {},
    ...overrides,
  }
}

export function validateGenerationRequest(req) {
  const errors = []
  if (!req || typeof req !== 'object') return ['Request must be an object.']
  if (!req.templateId) errors.push('templateId is required.')
  if (!isAngle(req.angle)) errors.push('angle is invalid.')
  if (!QUALITY_LEVELS.includes(req.quality)) errors.push('quality is invalid.')
  if (!OUTPUT_FORMATS.includes(req.outputFormat)) errors.push('outputFormat is invalid.')
  if (activeRegions(req.artworkRegions).length === 0) errors.push('At least one artwork region needs artwork.')
  for (const key of Object.keys(req.artworkRegions ?? {})) if (!Object.values(ARTWORK_REGIONS).includes(key)) errors.push(`Unknown region "${key}".`)
  const leaked = []
  ;(function scan(o, path) {
    if (!o || typeof o !== 'object') return
    for (const [k, v] of Object.entries(o)) {
      if (FORBIDDEN_KEY.test(k)) leaked.push(`${path}${k}`)
      scan(v, `${path}${k}.`)
    }
  })(req, '')
  if (leaked.length) errors.push(`Request must not contain credentials (${leaked.join(', ')}).`)
  return errors
}

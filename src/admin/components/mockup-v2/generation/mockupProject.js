/**
 * Step 5-1 — the MOCKUP PROJECT: one read-only view assembled from the existing studio state.
 *
 *   Mockup Project
 *   ├── tshirt      { type, color, fabric, size, photo }
 *   ├── artwork     { FRONT[], BACK[], LEFT_SLEEVE[], RIGHT_SLEEVE[] }   (derived from composition.surfaces)
 *   ├── background  the Step-4 background description (describeBackground) — not a second background system
 *   ├── presentation  T-shirt position / scale / shadow (Step 4A-2)
 *   ├── template    the selected MockupTemplate (or null)
 *   ├── angle       a MOCKUP_ANGLES id
 *   └── generationSettings { provider, quality, outputFormat }
 *
 * Pure: it copies nothing back into state and duplicates no image.
 */
import { describeBackground } from '../compositionLayers.js'
import { describeArtworkRegions, activeRegions } from './artworkRegions.js'
import { templateFromUploadedTshirt, supportsColor, isTemplateUsable } from './templateModel.js'
import { templateRegistry } from './templateRegistry.js'

/**
 * The studio's own photo is derived as an `uploaded_photo` template — except while a LIBRARY template's photo
 * is loaded and still selected (the library template is then the one and only entry for that image).
 */
function derivedUploadedTemplate(state) {
  const { tshirt } = state.sourceAssets
  if (tshirt?.fromTemplateId && state.generation.templateId != null) return null
  return templateFromUploadedTshirt(tshirt, state.generation.angle)
}

/** Templates the person can pick right now: the current T-shirt photo first, then ACTIVE library templates (inactive ones are never offered). */
export function availableTemplates(state, registry = templateRegistry) {
  const uploaded = derivedUploadedTemplate(state)
  return [...(uploaded ? [uploaded] : []), ...registry.list().filter(isTemplateUsable)]
}

export function resolveTemplate(state, registry = templateRegistry) {
  const { templateId } = state.generation
  if (templateId == null) return derivedUploadedTemplate(state)
  return registry.get(templateId)
}

export function buildMockupProject(state, registry = templateRegistry) {
  const { generation, sourceAssets, composition } = state
  const template = resolveTemplate(state, registry)
  const tshirt = sourceAssets.tshirt
  return {
    tshirt: {
      ...generation.garment,
      photo: tshirt
        ? { id: tshirt.id, name: tshirt.name, width: tshirt.width, height: tshirt.height, cutout: !!(tshirt.backgroundRemoved && tshirt.processedUrl) }
        : null,
    },
    artwork: describeArtworkRegions(composition),
    background: describeBackground(composition.background, sourceAssets.backgroundImage),
    backgroundSettings: { ...composition.background },
    presentation: { ...composition.tshirtPresentation },
    template,
    angle: generation.angle,
    generationSettings: { ...generation.settings },
    colorCompatible: template ? supportsColor(template, generation.garment.color) : null,
    // Regions that carry artwork but that the template says it cannot show ([] when the template does not restrict regions).
    unsupportedRegions: template?.supportedRegions?.length ? activeRegions(describeArtworkRegions(composition)).filter((r) => !template.supportedRegions.includes(r)) : [],
  }
}

/**
 * Step 5-1 — template REGISTRY. Add a template by adding one entry to STORED_TEMPLATES (or calling
 * register()); no generation code changes. It is intentionally EMPTY: this project has no real
 * photographic mockup assets for the v2 studio yet, and we do not invent fake ones. The studio's
 * uploaded T-shirt photo is offered separately as an `uploaded_photo` template (see templateModel.js).
 *
 * Entry example (uncomment once a real photograph exists):
 *   { id: 'tee-black-front', name: 'Black tee — front', angle: 'FRONT', sourceType: 'stored_template',
 *     colors: ['black'], sourceImage: '/images/templates/tee-black-front.jpg', assetKind: 'REAL_PHOTO' }
 */
import { createTemplate, isTemplateUsable, supportsColor } from './templateModel.js'

export const STORED_TEMPLATES = []

export function createTemplateRegistry(initial = []) {
  const items = new Map()
  const api = {
    register(input) {
      const template = createTemplate(input)
      if (items.has(template.id)) throw new Error(`Template "${template.id}" is already registered.`)
      items.set(template.id, template)
      return template
    },
    /** Insert-or-replace (used by the template library to keep this registry in sync). */
    upsert(input) {
      const template = createTemplate(input)
      items.set(template.id, template)
      return template
    },
    remove: (id) => items.delete(id),
    clear: () => items.clear(),
    get: (id) => items.get(id) ?? null,
    list: () => [...items.values()],
    forAngle: (angle) => [...items.values()].filter((t) => t.angle === angle),
    forColor: (color) => [...items.values()].filter((t) => supportsColor(t, color)),
    usable: () => [...items.values()].filter(isTemplateUsable),
  }
  initial.forEach((t) => api.register(t))
  return api
}

export const templateRegistry = createTemplateRegistry(STORED_TEMPLATES)

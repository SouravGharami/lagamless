/**
 * Step 4A-3 — Background Library presets (local config; no database, no assets).
 *
 *   id         stable key stored in composition.background.presetId
 *   name       label shown under the thumbnail
 *   category   one of PRESET_CATEGORIES (minus 'All')
 *   type       'solid'    -> value is a HEX colour
 *              'gradient' -> value is a CSS gradient
 *              'scene'    -> value is a CSS multi-layer / hard-stop background (wall & floor etc.)
 *   value      what the type above needs
 *   thumbnail  CSS `background` for the card (same as the live background, so the card is a true preview)
 *
 * Everything is pure CSS, so the library adds no images and no network requests.
 */

export const PRESET_CATEGORIES = ['All', 'Studio', 'Minimal', 'Dark', 'Light', 'Gradient', 'Lifestyle']

/** The CSS `background` value for a preset. */
export const presetCss = (preset) => preset.value

function make(id, name, category, type, value) {
  return Object.freeze({ id, name, category, type, value, thumbnail: value })
}

export const BACKGROUND_PRESETS = Object.freeze([
  // Studio
  make('studio-white', 'Clean white studio', 'Studio', 'gradient', 'radial-gradient(ellipse at 50% 40%, #FFFFFF 0%, #EDEDEB 100%)'),
  make('studio-gray', 'Soft light gray', 'Studio', 'solid', '#E4E4E2'),
  make('studio-warm', 'Warm neutral', 'Studio', 'solid', '#E6DED2'),
  // Minimal
  make('minimal-offwhite', 'Off-white', 'Minimal', 'solid', '#F7F5F0'),
  make('minimal-beige', 'Soft beige', 'Minimal', 'solid', '#E9DDCB'),
  // Dark
  make('dark-black', 'Matte black', 'Dark', 'solid', '#101010'),
  make('dark-charcoal', 'Charcoal', 'Dark', 'solid', '#2A2C30'),
  make('dark-navy', 'Deep navy', 'Dark', 'solid', '#0E1A33'),
  // Light
  make('light-blush', 'Soft blush', 'Light', 'solid', '#F2E4E0'),
  make('light-sage', 'Pale sage', 'Light', 'solid', '#E2E9DE'),
  // Gradient
  make('grad-light', 'Light neutral gradient', 'Gradient', 'gradient', 'linear-gradient(180deg, #FFFFFF 0%, #E2E0DC 100%)'),
  make('grad-dark', 'Dark premium gradient', 'Gradient', 'gradient', 'linear-gradient(160deg, #30333A 0%, #0A0A0B 100%)'),
  make('grad-warm', 'Soft warm gradient', 'Gradient', 'gradient', 'linear-gradient(135deg, #F7E9DA 0%, #E8C7AC 100%)'),
  // Lifestyle (simple CSS "rooms" — no photos)
  make('life-wall-floor', 'Warm wall & floor', 'Lifestyle', 'scene', 'linear-gradient(180deg, #EBE4D9 0%, #EBE4D9 70%, #CDB9A0 70%, #CDB9A0 100%)'),
  make('life-sunlit', 'Sunlit plaster', 'Lifestyle', 'scene', 'radial-gradient(ellipse at 25% 15%, #FFF7EA 0%, rgba(255, 247, 234, 0) 60%), linear-gradient(180deg, #E9DCC8 0%, #D8C6AD 100%)'),
])

export const getPreset = (id) => BACKGROUND_PRESETS.find((p) => p.id === id) || null

export const presetsInCategory = (category) =>
  category === 'All' ? BACKGROUND_PRESETS : BACKGROUND_PRESETS.filter((p) => p.category === category)

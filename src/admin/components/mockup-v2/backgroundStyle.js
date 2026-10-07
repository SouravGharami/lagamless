/**
 * Background Studio (Step 4A-1) — pure helpers shared by the reducer, the
 * control panel and the canvas. No React, no DOM: everything here is a plain
 * function so it can be tested on its own.
 */

import { getPreset, presetCss } from './backgroundPresets.js'

export const BACKGROUND_MODES = [
  { key: 'original', label: 'Original' },
  { key: 'transparent', label: 'Transparent' },
  { key: 'solid', label: 'Solid' },
  { key: 'gradient', label: 'Gradient' },
  { key: 'image', label: 'Image' },
]

export const GRADIENT_DIRECTIONS = [
  { key: 'top-bottom', label: 'Top → Bottom', css: 'to bottom' },
  { key: 'left-right', label: 'Left → Right', css: 'to right' },
  { key: 'tl-br', label: 'Top Left → Bottom Right', css: 'to bottom right' },
  { key: 'bl-tr', label: 'Bottom Left → Top Right', css: 'to top right' },
  { key: 'radial', label: 'Radial', css: null },
]

/** Only the choice + its settings; the uploaded image itself lives in sourceAssets.backgroundImage. */
export const DEFAULT_BACKGROUND = {
  mode: 'original',
  color: '#FFFFFF',
  gradientColor1: '#FFFFFF',
  gradientColor2: '#000000',
  gradientDirection: 'top-bottom',
  presetId: null, // set only while mode === 'preset' (Background Library)
}

/** '#abc' / 'abc' / '#AABBCC' -> '#AABBCC'; anything else -> null. */
export function normalizeHex(value) {
  if (typeof value !== 'string') return null
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c)
  return `#${hex.toUpperCase()}`
}

export const isGradientDirection = (key) => GRADIENT_DIRECTIONS.some((d) => d.key === key)

export function gradientCss({ gradientColor1, gradientColor2, gradientDirection }) {
  const dir = GRADIENT_DIRECTIONS.find((d) => d.key === gradientDirection) || GRADIENT_DIRECTIONS[0]
  return dir.css
    ? `linear-gradient(${dir.css}, ${gradientColor1}, ${gradientColor2})`
    : `radial-gradient(circle at center, ${gradientColor1}, ${gradientColor2})`
}

/**
 * The ONE transparency indicator (checkerboard). It is editor UI, never composition content:
 * it is rendered by CompositionViewport as a sibling BEHIND the composition frame (marked
 * data-ui-only="checkerboard"), so the frame's own layers stay genuinely transparent and the
 * checkerboard can never end up in an export. Nothing inside `.mv2-frame` may paint it.
 */
export const TRANSPARENCY_INDICATOR_CSS = 'repeating-conic-gradient(#3a3835 0 25%, #2a2927 0 50%) 0 0 / 20px 20px'

/** True when the user should see the indicator: Transparent mode, or Original mode over a cut-out T-shirt. */
export function needsTransparencyIndicator(background, tshirt) {
  if (background.mode === 'transparent') return true
  return background.mode === 'original' && !!tshirt && tshirt.backgroundRemoved && !!tshirt.processedUrl
}

/**
 * Style for the background COMPOSITION layer that sits behind the T-shirt, or null when
 * nothing should be painted: Original (the existing look), Image with no image yet, and
 * Transparent — which paints nothing at all (the checkerboard is the UI indicator above,
 * not a layer, and transparent pixels are never replaced with a colour).
 */
export function backgroundLayerStyle(background, image) {
  switch (background.mode) {
    case 'transparent':
      return null // no pixels: see TRANSPARENCY_INDICATOR_CSS
    case 'solid':
      return { background: background.color }
    case 'gradient':
      return { background: gradientCss(background) }
    case 'preset': {
      const preset = getPreset(background.presetId)
      return preset ? { background: presetCss(preset) } : null
    }
    case 'image':
      return image?.sourceUrl
        ? {
            backgroundImage: `url("${image.sourceUrl}")`,
            backgroundSize: 'cover', // fills the frame, crops instead of stretching
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }
        : null
    default:
      return null
  }
}

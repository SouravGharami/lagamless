/**
 * Step 4B — export-ready foundation. A pure description of the composition as ordered layers
 * (background -> T-shirt -> artwork), in the same units the editor uses (% of the composition
 * frame / of the T-shirt box). Nothing is flattened or rasterised here: a later export step can
 * paint these layers at any resolution. UI-only aids (transparent checkerboard, guides, selection
 * handles, the stage) are deliberately NOT layers and are marked `previewOnly` where they exist.
 */
import { COMPOSITION, COMPOSITION_ASPECT, LOGICAL_HEIGHT, LOGICAL_WIDTH } from './compositionFrame.js'
import { backgroundLayerStyle } from './backgroundStyle.js'
import { clampPresentation, shirtSize } from './tshirtPresentation.js'

export function describeBackground(background, image) {
  if (background.mode === 'transparent') return { kind: 'background', mode: 'transparent', paint: null, previewOnly: 'checkerboard' }
  const css = backgroundLayerStyle(background, image)
  return { kind: 'background', mode: background.mode, paint: css, previewOnly: null }
}

/**
 * @param state       the studio state
 * @param opts.surface  which surface's artwork to include (default: the active one)
 * @param opts.shadowAvailable  whether the T-shirt image has transparency (shadow only then)
 */
export function describeComposition(state, { surface, shadowAvailable = false } = {}) {
  const { tshirt, backgroundImage } = state.sourceAssets
  const { background, tshirtPresentation, activeSurface, surfaces, activeView = 'FRONT' } = state.composition
  const layers = [describeBackground(background, backgroundImage)]
  if (tshirt) {
    const p = clampPresentation(tshirt, tshirtPresentation)
    const { w, h } = shirtSize(tshirt, p.scale)
    layers.push({
      kind: 'tshirt',
      src: tshirt.backgroundRemoved && tshirt.processedUrl ? tshirt.processedUrl : tshirt.originalUrl,
      centerX: p.x, centerY: p.y, width: w, height: h, // % of the frame
      shadow: !!p.shadow && shadowAvailable,
    })
    for (const layer of (surfaces[surface || activeSurface]?.artworks ?? []).filter((l) => l.visible && (l.view ?? 'FRONT') === activeView)) {
      layers.push({
        kind: 'artwork', id: layer.id, src: layer.sourceUrl, opacity: layer.opacity, rotation: layer.rotation,
        x: layer.x, y: layer.y, width: layer.width, height: layer.height, // % of the T-shirt box
      })
    }
  }
  return {
    frame: { ratioW: COMPOSITION.ratioW, ratioH: COMPOSITION.ratioH, aspect: COMPOSITION_ASPECT, logicalWidth: LOGICAL_WIDTH, logicalHeight: LOGICAL_HEIGHT },
    layers,
  }
}

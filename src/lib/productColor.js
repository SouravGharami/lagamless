/**
 * Lightweight colour helper used purely for shop-page presentation
 * (swatch dots on product cards, the sidebar colour filter). The catalog
 * doesn't model colour as its own field — LAGAMLESS product names already
 * carry it after an em dash, e.g. "Oversized Tee — Ink" — so this just
 * parses that convention and maps the word to a real swatch colour.
 *
 * Falls back to the brand's ink tone for any word not in the table, so an
 * unrecognised colour still renders a sensible dot instead of breaking.
 */

export const COLOR_HEX = {
  ink: '#0c0c0b',
  black: '#111111',
  charcoal: '#3a3a38',
  graphite: '#55534c',
  bone: '#e8e2d3',
  white: '#ffffff',
  stone: '#b7ab95',
  olive: '#565a3f',
  red: '#6e2320',
  maroon: '#6e2320',
  navy: '#1e2536',
  grey: '#8b877e',
  gray: '#8b877e',
}

/**
 * @param {import('../data/products.js').Product} product
 * @returns {{ name: string, hex: string }}
 */
export function getProductColor(product) {
  const afterDash = product.name.split('—')[1]?.trim() ?? ''
  const word = afterDash.split(',')[0].trim()
  const key = word.toLowerCase()
  return {
    name: word || 'Signature',
    hex: COLOR_HEX[key] ?? '#0c0c0b',
  }
}

/**
 * The list of color options a shopper can actually pick on the product
 * page (Part 12). Prefers the admin-configured `product.colors` list —
 * each entry is `{ name, hex }`, with index 0 always meaning "matches the
 * uploaded photos as-is" (see ProductGallery.jsx, which only applies the
 * recolor effect for every entry AFTER the first). Falls back to the
 * single legacy name-parsed color for any product that hasn't had colors
 * configured yet, so nothing regresses for older catalog entries.
 *
 * @param {import('../data/products.js').Product} product
 * @returns {{ name: string, hex: string }[]}
 */
export function getProductColors(product) {
  if (product.colors && product.colors.length > 0) {
    return product.colors.map((c) => ({ name: c.name, hex: c.hex }))
  }
  return [getProductColor(product)]
}

/** Distinct list of { name, hex } colours present across a product list. */
export function getAvailableColors(products) {
  const seen = new Map()
  for (const product of products) {
    for (const color of getProductColors(product)) {
      if (!seen.has(color.name)) seen.set(color.name, color)
    }
  }
  return [...seen.values()]
}

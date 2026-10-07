/**
 * Product identity (Product number, SKU, Slug) — generated from the catalog,
 * not from thin air.
 *
 * How it works:
 *   1. Look at EVERY existing product and find the highest running number
 *      used anywhere (product number, SKU or slug), so nothing can collide.
 *   2. Look at the LATEST product (newest `createdAt`, else the highest
 *      number) and copy its pattern:
 *        product number  "LAGAMLESS 006"      → prefix "LAGAMLESS ", 3 digits
 *        SKU             "LGML-006-INK"       → "LGML-" + number + "-" + colour code
 *        slug            "lagamless-006"      → "lagamless-" + number   (sequence style)
 *                        "samurai-tee"        → built from the name      (name style)
 *   3. Next product = highest number + 1, in that same pattern.
 *
 * Pure functions only (no React / DOM / network) so it is testable in node.
 */

import { slugify } from '../../lib/slugify.js'

export const DEFAULTS = {
  numberPrefix: 'LAGAMLESS ',
  numberWidth: 3,
  skuPrefix: 'LGML-',
  skuWidth: 3,
  skuSep: '-',
  skuHasColor: true,
  slugMode: 'sequence', // 'sequence' | 'name'
  slugPrefix: 'lagamless-',
  slugWidth: 3,
}

const pad = (n, width) => String(n).padStart(width, '0')

function lastNumber(str) {
  const m = String(str || '').match(/(\d+)\D*$/)
  return m ? Number(m[1]) : 0
}

/** Newest product by createdAt; falls back to the highest-numbered one. */
export function findLastProduct(existing = []) {
  if (!existing.length) return null
  const dated = existing.filter((p) => p.createdAt && !Number.isNaN(new Date(p.createdAt).getTime()))
  if (dated.length) {
    return [...dated].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
  }
  return [...existing].sort(
    (a, b) => Math.max(lastNumber(b.productNumber), lastNumber(b.sku)) - Math.max(lastNumber(a.productNumber), lastNumber(a.sku)),
  )[0]
}

/** Highest running number used by any product, in any of the three identity fields. */
export function highestNumber(existing = []) {
  let max = 0
  for (const p of existing) {
    max = Math.max(max, lastNumber(p.productNumber))
    const sku = String(p.sku || '').match(/^[^\d]*(\d+)/)
    if (sku) max = Math.max(max, Number(sku[1]))
    if (/\d+$/.test(p.slug || '') && /^[a-z-]*-\d+$/.test(p.slug)) max = Math.max(max, lastNumber(p.slug))
  }
  return max
}

/** "Charcoal" → "CHR", "Black" → "BLA", "Ink" → "INK", "Royal Blue" → "RBL". Letters only, upper-case. */
export function colorCode(name) {
  const words = String(name || '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 3).padEnd(3, words[words.length - 1].slice(1, 3)).slice(0, 3)
  const w = words[0]
  if (w.length <= 5) return w.slice(0, 3)
  const consonants = w.slice(1).replace(/[AEIOU]/g, '')
  return (w[0] + consonants).slice(0, 3).padEnd(3, w.slice(1))
}

/** Reads the naming pattern off the latest product. */
export function detectPattern(existing = []) {
  const last = findLastProduct(existing)
  const p = { ...DEFAULTS, last }
  if (!last) return p

  const num = String(last.productNumber || '').match(/^(.*?)(\d+)\s*$/)
  if (num) {
    p.numberPrefix = num[1]
    p.numberWidth = num[2].length
  }

  const sku = String(last.sku || '').match(/^([^\d]*)(\d+)(.*)$/)
  if (sku) {
    p.skuPrefix = sku[1]
    p.skuWidth = sku[2].length
    p.skuHasColor = sku[3].length > 0
    p.skuSep = sku[3].match(/^[-_.]/)?.[0] ?? '-'
  }

  const slug = String(last.slug || '')
  const slugSeq = slug.match(/^(.*?)(\d+)$/)
  const nameBased = last.name && slug === slugify(last.name)
  if (slugSeq && !nameBased) {
    p.slugMode = 'sequence'
    p.slugPrefix = slugSeq[1]
    p.slugWidth = slugSeq[2].length
  } else if (slug) {
    p.slugMode = 'name'
  }
  return p
}

/**
 * @param {object[]} existing   all current products
 * @param {{ name?: string, colorName?: string }} input
 * @returns {{ seq: number, productNumber: string, sku: string, slug: string, pattern: object, summary: string }}
 */
export function buildIdentity(existing = [], { name = '', colorName = '' } = {}) {
  const pattern = detectPattern(existing)
  const seq = highestNumber(existing) + 1

  const productNumber = `${pattern.numberPrefix}${pad(seq, pattern.numberWidth)}`

  const code = colorCode(colorName)
  const sku = `${pattern.skuPrefix}${pad(seq, pattern.skuWidth)}${pattern.skuHasColor && code ? pattern.skuSep + code : ''}`

  const takenSlugs = new Set(existing.map((p) => String(p.slug || '').toLowerCase()))
  let slug = ''
  if (pattern.slugMode === 'sequence') {
    slug = `${pattern.slugPrefix}${pad(seq, pattern.slugWidth)}`
  } else if (slugify(name)) {
    slug = slugify(name)
    if (takenSlugs.has(slug)) slug = `${slug}-${pad(seq, 3)}`
  }

  const last = pattern.last
  const summary = last
    ? `Following your last product (${last.productNumber || last.name}) — next in sequence is ${pad(seq, pattern.numberWidth)}.`
    : `No products yet — starting the sequence at ${pad(seq, pattern.numberWidth)}.`

  return { seq, productNumber, sku, slug, pattern, summary }
}

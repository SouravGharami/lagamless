/**
 * Quick Fill — turns ONE typed line ("samurai 650 850 oversized black gen-z"),
 * a pasted "key: value" block, or a dictated sentence into the whole Add
 * Product form, then auto-generates every field that is still blank
 * (product number, SKU, slug, copy, details, sizes, stock, size chart…).
 *
 * Pure functions only — no React, no DOM — so it is testable in node and
 * ProductForm just calls `applyQuickFill(form, parsed.patch, ctx)`.
 *
 * Rules that keep it safe:
 *   - Things the admin explicitly typed always win.
 *   - Auto-generated values only ever go into fields that are BLANK
 *     (empty text, empty list, 0 stock / 0 measurement).
 *   - Nothing here touches images, mockups or the saved draft; the form
 *     keeps its normal validation and autosave.
 */

import { writeDescription, writeStory, vibeFromCollections } from './copyStudio.js'
import { resolveColorName } from '../../lib/colorNaming.js'
import { SIZE_OPTIONS, emptyMeasurement } from './productFormValidation.js'

export const DEFAULT_STOCK = 5

/** Size-chart presets: S values + the step added per size (inches). */
export const CHART_PRESETS = {
  oversized: { label: 'Oversized', chest: 42, length: 27.5, shoulder: 8.5, step: { chest: 2, length: 0.5, shoulder: 0.5 } },
  boxy: { label: 'Boxy', chest: 40, length: 26.5, shoulder: 8, step: { chest: 2, length: 0.5, shoulder: 0.5 } },
  regular: { label: 'Regular', chest: 38, length: 27, shoulder: 7.5, step: { chest: 2, length: 0.5, shoulder: 0.5 } },
}

const FITS = {
  oversized: 'Oversized',
  boxy: 'Boxy',
  relaxed: 'Relaxed',
  tapered: 'Tapered',
  regular: 'Regular',
}

const TEE_WORDS = new Set(['tee', 'tees', 'tshirt', 'tshirts', 't-shirt', 't-shirts', 'shirt'])
const FILLER = new Set([
  'price', 'rs', 'inr', 'rupees', 'rupee', 'mrp', 'was', 'compare', 'sizes', 'size', 'stock', 'qty', 'all',
  'with', 'and', 'in', 'color', 'colors', 'colour', 'colours', 'fit', 'gsm', 'at', 'for', 'of', 'the', 'a',
  'an', 'product', 'each', 'pcs', 'pc', 'to', 'cut', 'strike', 'sp', 'only', 'is', 'it', '@', 'x', '-', '&',
])

// A few CSS keywords are "valid colors" to the browser but are never a shade.
const NOT_COLORS = new Set(['inherit', 'initial', 'unset', 'revert', 'transparent', 'currentcolor', 'none', 'auto'])

/** word(s) → collection slug(s). A flag key means it maps to a boolean on the form. */
const COLLECTION_WORDS = {
  genz: ['gen-z'],
  'gen-z': ['gen-z'],
  millennial: ['millennials'],
  millennials: ['millennials'],
  durga: ['durga-puja'],
  puja: ['durga-puja'],
  'durga-puja': ['durga-puja'],
  pop: ['pop-culture'],
  popculture: ['pop-culture'],
  'pop-culture': ['pop-culture'],
  minimal: ['minimal-lovers', 'minimal-tees'],
  streetwear: ['streetwear-heads'],
  'streetwear-heads': ['streetwear-heads'],
  graphic: ['graphic-tees'],
  'graphic-tees': ['graphic-tees'],
  cultural: ['cultural-edits'],
  'cultural-edits': ['cultural-edits'],
}
const PHRASES = {
  'gen z': { collections: ['gen-z'] },
  'pop culture': { collections: ['pop-culture'] },
  'durga puja': { collections: ['durga-puja'] },
  'new arrival': { flag: 'isNewArrival' },
  'new arrivals': { flag: 'isNewArrival' },
  'off white': { color: 'Off White' },
}

const titleCase = (s) => s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
const isNum = (t) => /^\d+(?:\.\d+)?$/.test(t)

function uniq(list) {
  return [...new Set(list)]
}

/** Resolve a color word to { name, hex } using the tee presets first, then the apparel/CSS lookup. */
export function resolveColor(word, presets = []) {
  const w = word.trim().toLowerCase()
  if (!w || NOT_COLORS.has(w)) return null
  const preset = presets.find((p) => p.name.toLowerCase() === w)
  if (preset) return { name: preset.name, hex: preset.hex }
  const hex = resolveColorName(w)
  if (!hex) return null
  return { name: titleCase(w), hex }
}

function sizesFromWords(words) {
  const set = new Set(words.map((w) => w.toUpperCase()).filter((w) => SIZE_OPTIONS.includes(w)))
  return SIZE_OPTIONS.filter((s) => set.has(s))
}

function sizeRange(a, b) {
  const i = SIZE_OPTIONS.indexOf(a.toUpperCase())
  const j = SIZE_OPTIONS.indexOf(b.toUpperCase())
  if (i < 0 || j < 0) return null
  return SIZE_OPTIONS.slice(Math.min(i, j), Math.max(i, j) + 1)
}

/** Free-form line → patch of explicitly stated values. */
export function parseLine(text, { presets = [] } = {}) {
  const patch = {}
  const raw = (text || '').replace(/[₹]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!raw) return patch

  const tokens = raw.split(/[\s,]+/).filter(Boolean)
  const lower = tokens.map((t) => t.toLowerCase())
  const used = tokens.map(() => false)
  const bare = []
  const colors = []
  const collections = []
  const mark = (i, n = 1) => {
    for (let k = 0; k < n; k++) used[i + k] = true
  }

  // Preset color names can be two words ("royal blue", "forest green").
  const multiColors = presets.map((p) => p.name.toLowerCase()).filter((n) => n.includes(' '))

  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue
    const t = lower[i]
    const next = lower[i + 1]
    const pair = next ? `${t} ${next}` : ''

    if (pair && multiColors.includes(pair)) {
      colors.push(resolveColor(pair, presets))
      mark(i, 2)
      continue
    }
    if (pair && PHRASES[pair]) {
      const ph = PHRASES[pair]
      if (ph.collections) collections.push(...ph.collections)
      if (ph.flag) patch[ph.flag] = true
      if (ph.color) colors.push({ name: ph.color, hex: resolveColorName(ph.color) || '#f2f0ea' })
      mark(i, 2)
      continue
    }

    let m
    if ((m = t.match(/^(\d{2,3})gsm$/))) {
      patch.gsm = Number(m[1])
      mark(i)
      continue
    }
    if (t === 'gsm') {
      if (i > 0 && !used[i - 1] && isNum(lower[i - 1])) {
        patch.gsm = Number(lower[i - 1])
        mark(i - 1, 2)
      } else if (next && isNum(next)) {
        patch.gsm = Number(next)
        mark(i, 2)
      }
      continue
    }
    if (['mrp', 'was', 'compare', 'cut', 'strike', 'cutprice'].includes(t) && next && isNum(next)) {
      patch.compareAtPrice = Number(next)
      mark(i, 2)
      continue
    }
    if (['price', 'rs', 'inr', 'sp', 'at', '@'].includes(t) && next && isNum(next)) {
      patch.price = Number(next)
      mark(i, 2)
      continue
    }
    if ((m = t.match(/^(?:x|stock|qty)(\d+)$/)) || (m = t.match(/^(\d+)(?:pcs|pc|each)$/))) {
      patch.stock = Number(m[1])
      mark(i)
      continue
    }
    if ((t === 'stock' || t === 'qty') && next && isNum(next)) {
      patch.stock = Number(next)
      mark(i, 2)
      continue
    }
    // "s-xl", "s to xl"
    if ((m = t.match(/^([a-z]{1,3})-([a-z]{1,3})$/)) && sizeRange(m[1], m[2])) {
      patch.sizes = sizeRange(m[1], m[2])
      mark(i)
      continue
    }
    if (lower[i + 1] === 'to' && lower[i + 2] && sizeRange(t, lower[i + 2]) && SIZE_OPTIONS.includes(t.toUpperCase())) {
      patch.sizes = sizeRange(t, lower[i + 2])
      mark(i, 3)
      continue
    }
    if (t === 'sizes' || t === 'size') {
      let j = i + 1
      const picked = []
      while (j < tokens.length && SIZE_OPTIONS.includes(tokens[j].toUpperCase())) picked.push(tokens[j++])
      if (picked.length) {
        patch.sizes = sizesFromWords(picked)
        mark(i, j - i)
        continue
      }
      mark(i)
      continue
    }
    if (t === 'all' && (next === 'sizes' || next === 'size')) {
      patch.sizes = [...SIZE_OPTIONS]
      mark(i, 2)
      continue
    }
    if (FITS[t]) {
      patch.fit = FITS[t]
      mark(i)
      continue
    }
    if (t === 'hoodie' || t === 'hoodies') {
      patch.category = 'Hoodies'
      mark(i)
      continue
    }
    if (TEE_WORDS.has(t)) {
      patch.categoryIsTee = true
      mark(i)
      continue
    }
    if (t === 'cotton') {
      patch.fabric = 'Combed cotton'
      mark(i)
      continue
    }
    if (t === 'draft') {
      patch.status = 'draft'
      mark(i)
      continue
    }
    if (['publish', 'published', 'live'].includes(t)) {
      patch.status = 'published'
      mark(i)
      continue
    }
    if (t === 'featured' || t === 'homepage') {
      patch.isFeatured = true
      mark(i)
      continue
    }
    if (t === 'new' || t === 'newarrival' || t === 'newarrivals') {
      patch.isNewArrival = true
      mark(i)
      continue
    }
    if (COLLECTION_WORDS[t]) {
      collections.push(...COLLECTION_WORDS[t])
      mark(i)
      continue
    }
    if (isNum(t)) {
      bare.push({ i, v: Number(t) })
      continue
    }
    if (!FILLER.has(t) && t.length >= 3) {
      const c = resolveColor(t, presets)
      if (c) {
        colors.push(c)
        mark(i)
        continue
      }
    }
  }

  // Unlabelled numbers: first = price, second = compare-at (the bigger one is the strike-through).
  const priceLike = bare.filter((b) => b.v >= 50)
  priceLike.forEach((b) => mark(b.i))
  bare.filter((b) => b.v < 50).forEach((b) => mark(b.i)) // tiny stray numbers aren't part of the name
  if (patch.price === undefined && priceLike[0]) patch.price = priceLike.shift().v
  else if (patch.price !== undefined) priceLike.length = 0
  if (patch.compareAtPrice === undefined && priceLike[0]) patch.compareAtPrice = priceLike[0].v
  if (patch.price !== undefined && patch.compareAtPrice !== undefined) {
    if (patch.compareAtPrice < patch.price) [patch.price, patch.compareAtPrice] = [patch.compareAtPrice, patch.price]
    if (patch.compareAtPrice === patch.price) delete patch.compareAtPrice
  }

  const leftover = tokens.filter((_, i) => !used[i] && !FILLER.has(lower[i]) && !isNum(lower[i]))
  if (leftover.length) patch.name = titleCase(leftover.join(' '))

  const seen = new Set()
  const cleanColors = colors.filter((c) => c && !seen.has(c.name.toLowerCase()) && seen.add(c.name.toLowerCase()))
  if (cleanColors.length) patch.colors = cleanColors
  if (collections.length) patch.collections = uniq(collections)
  return patch
}

const BLOCK_KEYS = {
  name: 'name', title: 'name', product: 'name', 'product name': 'name',
  price: 'price', sp: 'price', 'selling price': 'price',
  mrp: 'compareAtPrice', compare: 'compareAtPrice', 'compare at': 'compareAtPrice', 'compare-at': 'compareAtPrice', strike: 'compareAtPrice',
  sku: 'sku',
  number: 'productNumber', 'product number': 'productNumber', no: 'productNumber',
  slug: 'slug',
  category: 'category', type: 'category',
  tags: 'tags',
  fabric: 'fabric', material: 'fabric',
  gsm: 'gsm',
  fit: 'fit',
  care: 'care',
  construction: 'construction',
  design: 'design', 'design note': 'design',
  styling: 'stylingNote', 'styling note': 'stylingNote',
  description: 'description', desc: 'description',
  story: 'story',
  sizes: 'sizes', size: 'sizes',
  stock: 'stock', qty: 'stock', quantity: 'stock',
  colors: 'colors', colours: 'colors', color: 'colors', colour: 'colors',
  collections: 'collections', where: 'collections', placement: 'collections',
  status: 'status',
}

/**
 * Full entry point. Accepts a one-liner, a pasted "Key: value" block, or a
 * mix of both (un-keyed lines are run through the one-liner parser).
 */
export function parseQuickFill(text, opts = {}) {
  const lines = String(text || '').split(/\r?\n/)
  const looseLines = []
  const keyed = []
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z .\-_/]*?)\s*[:=]\s*(.+?)\s*$/)
    const key = m && BLOCK_KEYS[m[1].toLowerCase().replace(/[_/]+/g, ' ').trim()]
    if (key) keyed.push([key, m[2]])
    else if (line.trim()) looseLines.push(line)
  }

  const patch = parseLine(looseLines.join(' '), opts)
  for (const [key, value] of keyed) {
    switch (key) {
      case 'price':
      case 'compareAtPrice':
      case 'gsm':
      case 'stock': {
        const n = Number(String(value).replace(/[^\d.]/g, ''))
        if (!Number.isNaN(n) && String(value).match(/\d/)) patch[key] = n
        break
      }
      case 'sizes': {
        const sizes = /all/i.test(value) ? [...SIZE_OPTIONS] : (() => {
          const r = value.match(/\b([a-z]{1,3})\s*(?:-|to)\s*([a-z]{1,3})\b/i)
          return (r && sizeRange(r[1], r[2])) || sizesFromWords(value.split(/[\s,/|]+/))
        })()
        if (sizes.length) patch.sizes = sizes
        break
      }
      case 'colors': {
        const list = value
          .split(/[,/|&]|\band\b/i)
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => resolveColor(c, opts.presets))
          .filter(Boolean)
        if (list.length) patch.colors = list
        break
      }
      case 'collections': {
        const found = parseLine(value, opts)
        if (found.collections) patch.collections = uniq([...(patch.collections || []), ...found.collections])
        if (found.isFeatured) patch.isFeatured = true
        if (found.isNewArrival) patch.isNewArrival = true
        break
      }
      case 'fit': {
        const f = FITS[value.trim().toLowerCase()]
        patch.fit = f || titleCase(value.trim())
        break
      }
      case 'status':
        patch.status = /draft/i.test(value) ? 'draft' : 'published'
        break
      case 'name':
        patch.name = titleCase(value.trim())
        break
      default:
        patch[key] = value.trim()
    }
  }
  return patch
}

/** Human-readable chips for the live "here's what I understood" preview. */
export function describePatch(patch) {
  const chips = []
  if (patch.name) chips.push({ label: 'Name', value: patch.name })
  if (patch.price !== undefined) chips.push({ label: 'Price', value: `₹${patch.price}` })
  if (patch.compareAtPrice !== undefined) chips.push({ label: 'MRP', value: `₹${patch.compareAtPrice}` })
  if (patch.fit) chips.push({ label: 'Fit', value: patch.fit })
  if (patch.gsm !== undefined) chips.push({ label: 'GSM', value: String(patch.gsm) })
  if (patch.colors) chips.push({ label: 'Colors', value: patch.colors.map((c) => c.name).join(', '), swatches: patch.colors.map((c) => c.hex) })
  if (patch.sizes) chips.push({ label: 'Sizes', value: `${patch.sizes[0]}–${patch.sizes[patch.sizes.length - 1]}` })
  if (patch.stock !== undefined) chips.push({ label: 'Stock each', value: String(patch.stock) })
  if (patch.category) chips.push({ label: 'Category', value: patch.category })
  if (patch.collections) chips.push({ label: 'Shows in', value: patch.collections.join(', ') })
  if (patch.isFeatured) chips.push({ label: 'Homepage', value: 'Featured' })
  if (patch.isNewArrival) chips.push({ label: 'Tag', value: 'New arrival' })
  if (patch.status) chips.push({ label: 'Status', value: patch.status === 'draft' ? 'Draft' : 'Published' })
  const handled = new Set(['name', 'price', 'compareAtPrice', 'fit', 'gsm', 'colors', 'sizes', 'stock', 'category', 'collections', 'isFeatured', 'isNewArrival', 'status', 'categoryIsTee'])
  Object.keys(patch)
    .filter((k) => !handled.has(k))
    .forEach((k) => chips.push({ label: k, value: String(patch[k]).slice(0, 28) }))
  return chips
}

// ---------------------------------------------------------------------------
// Applying to the form
// ---------------------------------------------------------------------------

const blank = (v) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0)

/** Rebuilds sizes/variants/measurements for a new size list, keeping what's already entered. */
export function setSizes(form, sizes) {
  const ordered = SIZE_OPTIONS.filter((s) => sizes.includes(s))
  return {
    ...form,
    sizes: ordered,
    variants: ordered.map((s) => form.variants.find((v) => v.size === s) || { size: s, stock: 0 }),
    measurements: Object.fromEntries(ordered.map((s) => [s, form.measurements[s] || emptyMeasurement()])),
  }
}

export function setAllStock(form, stock) {
  return { ...form, variants: form.variants.map((v) => ({ ...v, stock })) }
}

const round = (n) => Math.round(n * 10) / 10

/** Writes a size chart for the selected sizes. `overwrite:false` only fills 0 / blank cells. */
export function fillMeasurements(form, presetKey, { overwrite = true, template = null } = {}) {
  const preset = CHART_PRESETS[presetKey] || CHART_PRESETS.oversized
  const measurements = { ...form.measurements }
  for (const size of form.sizes) {
    const idx = SIZE_OPTIONS.indexOf(size)
    const current = measurements[size] || emptyMeasurement()
    const fromTemplate = template?.measurements?.[size]
    const next = { ...current }
    for (const dim of ['chest', 'length', 'shoulder']) {
      if (!overwrite && Number(current[dim]) > 0) continue
      next[dim] = fromTemplate && Number(fromTemplate[dim]) > 0 ? fromTemplate[dim] : round(preset[dim] + preset.step[dim] * idx)
    }
    measurements[size] = next
  }
  return { ...form, measurements }
}

/** Copies the reusable "details" (not name/price/photos/colors) from another product. */
export function cloneDetails(form, product) {
  let next = {
    ...form,
    category: product.category || form.category,
    tags: (product.tags || []).join(', '),
    collections: [...(product.collections || [])],
    isFeatured: !!product.isFeatured,
    isNewArrival: !!product.isNewArrival,
    fabric: product.fabric || '',
    gsm: product.gsm || '',
    fit: product.fit || '',
    care: product.care || '',
    construction: product.construction || '',
    design: product.design || '',
    stylingNote: product.stylingNote || '',
  }
  next = setSizes({ ...next, sizes: [], variants: [], measurements: {} }, product.sizes || [])
  next.variants = next.sizes.map((s) => ({ size: s, stock: (product.variants || []).find((v) => v.size === s)?.stock ?? 0 }))
  next.measurements = Object.fromEntries(
    next.sizes.map((s) => [s, { ...emptyMeasurement(), ...(product.measurements?.[s] || {}) }]),
  )
  return next
}

/**
 * Applies the explicit `patch`, then fills every still-blank field.
 *
 * @param {object} form   current ProductForm state
 * @param {object} patch  from parseQuickFill (may be {} for "auto-fill blanks")
 * @param {{ template?: object|null, defaultCategory?: string }} ctx
 * @returns {{ form: object, changed: string[] }}
 */
export function applyQuickFill(form, patch = {}, ctx = {}) {
  const { template = null, defaultCategory = 'Tees' } = ctx
  let next = { ...form }
  const changed = []
  const touch = (label) => {
    if (!changed.includes(label)) changed.push(label)
  }
  const put = (key, value, label) => {
    next[key] = value
    touch(label)
  }

  // The product name is typed by hand in its own field and is never overwritten by Quick Fill.
  // A name found in the quick-fill line is only used when the Product name field is still empty.
  if (next.name.trim()) {
    patch = { ...patch }
    delete patch.name
  }

  // 1) Explicit values
  for (const [key, label] of [
    ['name', 'name'], ['price', 'price'], ['compareAtPrice', 'compare-at price'], ['gsm', 'GSM'], ['fit', 'fit'],
    ['fabric', 'fabric'], ['category', 'category'], ['status', 'status'], ['care', 'care'], ['construction', 'construction'], ['design', 'design note'],
    ['stylingNote', 'styling note'], ['description', 'description'], ['story', 'story'],
  ]) {
    if (patch[key] !== undefined && patch[key] !== '') put(key, patch[key], label)
  }
  // Product number is locked and always auto-generated. A SKU / slug typed by the admin is kept
  // (flagged as hand-edited so the auto-generator stops overwriting it).
  if (patch.sku) {
    put('sku', patch.sku, 'SKU')
    next.skuEdited = true
  }
  if (patch.slug) {
    put('slug', patch.slug, 'slug')
    next.slugEdited = true
  }
  if (patch.categoryIsTee && blank(next.category)) put('category', defaultCategory, 'category')
  if (patch.tags) put('tags', patch.tags, 'tags')
  if (patch.isFeatured) put('isFeatured', true, 'homepage featured')
  if (patch.isNewArrival) put('isNewArrival', true, 'new arrival')
  if (patch.collections) put('collections', uniq([...next.collections, ...patch.collections]), 'store placement')
  if (patch.colors) put('colors', patch.colors.map((c) => ({ name: c.name, hex: c.hex, nameIsManual: true })), 'colors')
  if (patch.sizes) {
    next = setSizes(next, patch.sizes)
    touch('sizes')
  }

  // 2) Blank fills
  if (blank(next.sizes)) {
    next = setSizes(next, template?.sizes?.length ? template.sizes : SIZE_OPTIONS)
    touch('sizes')
  }
  const stockFill = patch.stock ?? template?.variants?.[0]?.stock ?? DEFAULT_STOCK
  next = {
    ...next,
    variants: next.variants.map((v) => {
      const explicit = patch.stock !== undefined
      if (explicit || Number(v.stock) === 0) {
        const fromTemplate = template?.variants?.find((tv) => tv.size === v.size)?.stock
        const value = explicit ? patch.stock : fromTemplate || stockFill || DEFAULT_STOCK
        if (Number(v.stock) !== value) touch('stock')
        return { ...v, stock: value }
      }
      return v
    }),
  }

  const fitKey = (next.fit || template?.fit || 'oversized').toLowerCase()
  if (blank(next.fit)) put('fit', FITS[fitKey] || 'Oversized', 'fit')
  const before = JSON.stringify(next.measurements)
  next = fillMeasurements(next, CHART_PRESETS[fitKey] ? fitKey : 'oversized', { overwrite: false, template })
  if (JSON.stringify(next.measurements) !== before) touch('size chart')

  if (blank(next.category)) put('category', template?.category || defaultCategory, 'category')
  if (blank(next.gsm)) put('gsm', template?.gsm || 240, 'GSM')

  const name = next.name.trim()
  const firstColor = next.colors?.[0]?.name || ''

  const gsmText = next.gsm ? `${next.gsm} GSM ` : ''
  const fitLower = (next.fit || 'oversized').toLowerCase()
  if (blank(next.fabric)) put('fabric', `${gsmText}combed cotton`.trim().replace(/^./, (c) => c.toUpperCase()), 'fabric')
  if (blank(next.care)) put('care', template?.care || 'Machine wash cold, inside out. Do not bleach. Tumble dry low. Warm iron on the reverse.', 'care')
  if (blank(next.construction)) put('construction', template?.construction || 'Single jersey knit, double-stitched hems throughout.', 'construction')
  if (blank(next.design)) put('design', template?.design || 'Graphic-led design on a clean, minimal body.', 'design note')
  if (blank(next.stylingNote)) {
    const styling = {
      oversized: 'Wear it oversized on purpose — pair with relaxed cargos or straight denim.',
      boxy: 'Let the boxy cut do the work — tuck the front lightly or leave it loose.',
      relaxed: 'An easy everyday fit — works with jeans, joggers or shorts.',
    }
    put('stylingNote', styling[fitLower] || 'Easy to style with denim, joggers or shorts.', 'styling note')
  }
  const vibe = vibeFromCollections(next.collections)
  if (blank(next.description) && name) put('description', writeDescription(next, { vibe, variant: 0 }), 'description')
  if (blank(next.story) && name) put('story', writeStory(next, { vibe, variant: 0 }), 'story')
  if (blank(next.tags)) {
    put('tags', uniq([fitLower, 'tee', firstColor.toLowerCase(), 'cotton'].filter(Boolean)).join(', '), 'tags')
  }

  return { form: next, changed }
}

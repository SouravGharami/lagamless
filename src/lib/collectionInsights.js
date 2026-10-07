import { productInCollection } from '../data/collections.js'
import { getProductColors } from './productColor.js'
import { COLLECTION_STORIES } from '../data/collectionStories.js'

/** Cover/thumbnail photo of a product (same slot the shop cards use). */
export function productPhoto(product) {
  return product?.images?.main?.src || product?.images?.front?.src || null
}

/** 'dark' | 'light' | 'colour' for a #rrggbb colour — used by the swipe finder's colour lean. */
export function colourTone(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return 'dark'
  const n = parseInt(m[1], 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (s > 0.32 && l > 0.12 && l < 0.88) return 'colour'
  if (l < 0.34) return 'dark'
  if (l > 0.6) return 'light'
  return 'colour'
}

/** Live numbers for one collection, computed from the real catalog. */
export function getCollectionStats(products, slug) {
  const items = products.filter((p) => productInCollection(p, slug))
  const prices = items.map((p) => p.price).filter((n) => typeof n === 'number')
  const swatches = []
  const seen = new Set()
  for (const p of items) {
    const c = getProductColors(p)[0]
    if (c && !seen.has(c.hex.toLowerCase())) {
      seen.add(c.hex.toLowerCase())
      swatches.push(c)
    }
  }
  return {
    items,
    count: items.length,
    from: prices.length ? Math.min(...prices) : null,
    newCount: items.filter((p) => p.isNewArrival).length,
    swatches,
    thumbs: items.map(productPhoto).filter(Boolean).slice(0, 3),
  }
}

/** Small seeded shuffle so "Start over" deals a different hand but a render never reshuffles. */
function seededShuffle(list, seed) {
  const out = [...list]
  let a = (seed + 1) * 0x9e3779b1
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * The swipe deck: one tee from every collection first (so the deck spans the whole range of the brand),
 * topped up with anything else that has a photo, then dealt in a shuffled order.
 */
export function pickDeck(products, size = 8, seed = 0) {
  const pool = seededShuffle(products.filter((p) => productPhoto(p)), seed)
  const deck = []
  const used = new Set()
  const take = (p) => {
    deck.push(p)
    used.add(p.id)
  }
  for (const s of seededShuffle(COLLECTION_STORIES, seed)) {
    if (deck.length >= size) break
    const p = pool.find((x) => !used.has(x.id) && productInCollection(x, s.slug))
    if (p) take(p)
  }
  for (const p of pool) {
    if (deck.length >= size) break
    if (!used.has(p.id)) take(p)
  }
  return seededShuffle(deck, seed + 7)
}

/**
 * Taste map for the swipe deck. A collection scores one hit per liked tee inside it, weighted so small,
 * specific collections count for more than "everything is new" style ones (a tiny tf-idf).
 */
export function collectionScores(products, picked) {
  const total = products.length || 1
  return COLLECTION_STORIES.map((s) => {
    const size = products.filter((p) => productInCollection(p, s.slug)).length
    const hits = picked.filter((p) => productInCollection(p, s.slug)).length
    const weight = size ? Math.log(1 + total / size) : 0
    return { slug: s.slug, title: s.title, hits, score: hits * weight }
  })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.score - a.score || b.hits - a.hits)
}

/** Everything the "your edit" result needs: winning collection, colour lean, and more tees like the picks. */
export function buildEdit(products, picked) {
  const scores = collectionScores(products, picked)
  const top = scores[0] || null
  const topStory = top ? COLLECTION_STORIES.find((s) => s.slug === top.slug) : null

  const tally = { dark: 0, light: 0, colour: 0 }
  for (const p of picked) tally[colourTone(getProductColors(p)[0]?.hex)]++
  const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1])
  const tone = picked.length && ranked[0][1] > (ranked[1]?.[1] ?? 0) ? ranked[0][0] : null

  const pickedIds = new Set(picked.map((p) => p.id))
  const more = top
    ? products
        .filter((p) => !pickedIds.has(p.id) && productInCollection(p, top.slug))
        .sort(
          (a, b) =>
            Number(!!b.isFeatured) - Number(!!a.isFeatured) ||
            String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        )
        .slice(0, 4)
    : []

  return { scores, top, topStory, tone, more }
}

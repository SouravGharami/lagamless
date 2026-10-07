/**
 * Copy Studio — writes the Description and Product story from what is
 * already on the form (name, fit, GSM, fabric, colour, sizes, price, theme
 * words), in a chosen "vibe".
 *
 * Deliberately NOT an AI call: it is instant, free, works offline, and only
 * ever states facts that exist on the form. It never invents "pre-shrunk",
 * "bio-washed" etc. Every click on "Another version" moves to the next
 * combination, so there are dozens of different results per vibe.
 *
 * Pure functions — no React/DOM.
 */

import { COLLECTIONS } from '../../data/collections.js'

export const VIBES = [
  { key: 'streetwear', label: 'Streetwear', hint: 'Loud, confident' },
  { key: 'minimal', label: 'Minimal', hint: 'Clean, quiet' },
  { key: 'playful', label: 'Playful', hint: 'Fun, Gen Z' },
  { key: 'cultural', label: 'Cultural', hint: 'Rooted, festive' },
]

/** Picks a default vibe from the store-placement ticks. */
export function vibeFromCollections(collections = []) {
  const has = (s) => collections.includes(s)
  if (has('minimal-lovers') || has('minimal-tees')) return 'minimal'
  if (has('durga-puja') || has('cultural-edits')) return 'cultural'
  if (has('gen-z') || has('pop-culture')) return 'playful'
  return 'streetwear'
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const an = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

function joinWithAnd(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function parseKeywords(text) {
  return String(text || '')
    .split(/[,\n|/]+/)
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 5)
}

function sizeText(sizes = []) {
  if (!sizes.length) return ''
  return sizes.length === 1 ? sizes[0] : `${sizes[0]} to ${sizes[sizes.length - 1]}`
}

const words = (s) => String(s || '').toLowerCase().match(/[a-z0-9₹]+/g) || []

/** "Tees" -> "tee", "Hoodies" -> "hoodie", "Outerwear" -> "outerwear". */
function categoryNoun(category) {
  const c = String(category || '').trim().toLowerCase()
  if (!c) return { noun: 'tee', nouns: 'tees' }
  if (/(wear|bottoms|joggers|shorts|jeans|pants)$/.test(c)) return { noun: c, nouns: c }
  const noun = c.endsWith('s') && !c.endsWith('ss') ? c.slice(0, -1) : c
  return { noun, nouns: noun + 's' }
}

/** Always ends in . ! or ? and starts with a capital. */
function sentence(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  const s = cap(t)
  return /[.!?…]$/.test(s) ? s : `${s}.`
}

/** Lower-case the first letter unless it looks like an acronym / proper word ("GSM", "I"). */
const lowerFirst = (t) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t)

/**
 * Turns one of the admin's own notes (design note, styling tip, care…) into a clean sentence — or
 * '' when it adds nothing: fewer than two words ("safe"), or only repeats facts already stated
 * ("oversized" next to an oversized fit). Their wording is kept; we never invent.
 */
function cleanNote(raw, known) {
  const t = String(raw || '').replace(/\s+/g, ' ').trim()
  if (words(t).length < 2) return ''
  if (words(t).every((w) => known.has(w))) return ''
  return sentence(t)
}

/** Which "edit" this product belongs to, e.g. "Durga Puja" — used for one line in the story. */
function editName(collections = []) {
  const order = ['durga-puja', 'cultural-edits', 'pop-culture', 'graphic-tees', 'minimal-tees', 'minimal-lovers', 'streetwear-heads']
  const slug = order.find((s) => collections.includes(s))
  const label = COLLECTIONS.find((c) => c.slug === slug)?.label || ''
  return label.replace(/\s+Collection$/i, '')
}

const GENERIC_TAGS = new Set(['tee', 'tees', 'tshirt', 't-shirt', 'cotton', 'new', 'men', 'women', 'unisex', 'sale'])

/** Flattens the form into the plain facts the templates use. Uses every field the admin can fill. */
export function buildContext(form, keywords = '') {
  const gsm = Number(form.gsm) || 0
  let material = String(form.fabric || '').trim().toLowerCase().replace(/\bgsm\b/g, 'GSM')
  if (!material) material = gsm ? `${gsm} GSM cotton` : 'soft cotton'
  else if (gsm && !/\d/.test(material)) material = `${gsm} GSM ${material}`
  const fit = String(form.fit || 'oversized').trim().toLowerCase()
  const { noun, nouns } = categoryNoun(form.category)
  const colors = (form.colors || []).map((c) => String(c.name || '').trim().toLowerCase()).filter(Boolean)

  // Theme: the words typed in Copy studio win; otherwise fall back to meaningful tags.
  let kws = parseKeywords(keywords)
  let themeFromTags = false
  if (!kws.length) {
    themeFromTags = true
    const skip = new Set([...words(fit), ...words(noun), ...colors.flatMap(words)])
    kws = String(form.tags || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter((k) => k && !GENERIC_TAGS.has(k) && !words(k).every((w) => skip.has(w)))
      .slice(0, 2)
  }

  const known = new Set([...words(form.name), ...words(fit), ...words(noun), ...words(nouns), ...words(material), ...colors.flatMap(words), ...kws.flatMap(words), 'fit', 'cut', 'tee', 'tees', 'wear', 'it', 'a', 'the', 'and', 'with'])

  return {
    name: String(form.name || '').trim() || `This ${noun}`,
    noun,
    nouns,
    fit,
    fitArticle: an(fit),
    material,
    materialCap: cap(material),
    color: colors[0] || '',
    colors,
    theme: kws.length ? joinWithAnd(kws) : '',
    themeFromTags: themeFromTags && kws.length > 0,
    sizes: sizeText(form.sizes),
    price: Number(form.price) || 0,
    compareAt: Number(form.compareAtPrice) || 0,
    design: cleanNote(form.design, known),
    construction: cleanNote(form.construction, new Set([...known, 'stitched'])),
    styling: cleanNote(form.stylingNote, new Set(['wear', 'it', 'a', 'the', 'and', 'with', ...words(fit)])),
    care: cleanNote(form.care, new Set()),
    edit: editName(form.collections),
  }
}

/* -------------------------------------------------------------------------
   Templates: each slot is a list; the variant number walks through them.
   ------------------------------------------------------------------------- */
const t = (c) => ({
  inColor: c.colors.length === 1 ? ` in ${c.color}` : '',
  about: c.theme ? ` inspired by ${c.theme}` : '',
  sizesTail: c.sizes ? `, available in ${c.sizes}` : '',
})

const VOICES = {
  streetwear: {
    hooks: [
      (c) => `${c.name} is ${c.fitArticle} ${c.fit} ${c.noun} that does the talking${c.theme ? ` — ${c.theme}, front and centre` : ''}.`,
      (c) => (c.theme ? `Street style, powered by ${c.theme}: ${c.name} is ${c.fitArticle} ${c.fit} ${c.noun} made to be seen.` : `${c.name}: ${c.fitArticle} ${c.fit} ${c.noun} with loud attitude and a relaxed fall.`),
      (c) => `Built for the street, ${c.name} is ${c.fitArticle} ${c.fit} ${c.noun}${t(c).inColor} that owns every outfit.`,
      (c) => `Skip the basics. ${c.name} is ${c.fitArticle} ${c.fit} ${c.noun}${t(c).about} with serious presence.`,
    ],
    specs: [
      (c) => `Cut in ${c.material} for a heavy, comfortable drape${t(c).sizesTail}.`,
      (c) => `${c.materialCap} with ${c.fitArticle} ${c.fit} fit — easy to throw on, hard to ignore.`,
      (c) => `Soft ${c.material}, ${c.fitArticle} ${c.fit} body and room to move${t(c).sizesTail}.`,
    ],
    open: [
      (c) => `${c.name} was made for the ones who dress for themselves first.`,
      (c) => `Some ${c.nouns} blend in. ${c.name} was never meant to.`,
      (c) => (c.theme ? `${c.name} pulls ${c.theme} straight into everyday streetwear.` : `${c.name} is streetwear without the noise — just attitude and fit.`),
    ],
    craft: [
      (c) => `It's cut ${c.fit} in ${c.material}${t(c).inColor}, so it sits right and falls with weight.`,
      (c) => `The ${c.fit} body is made in ${c.material}, built to look sharp wash after wash.`,
      (c) => `${c.materialCap}, ${c.fitArticle} ${c.fit} cut${t(c).inColor} — a ${c.noun} that feels as good as it looks.`,
    ],
    wear: [
      () => 'Throw it over cargos, layer it under an open shirt, or wear it solo.',
      () => 'Pair it with straight denim and chunky sneakers and you are done.',
      () => 'Day out, late night, last-minute plan — it works for all of it.',
    ],
    close: [
      () => 'Wear it loud. Wear it your way.',
      () => 'Made to be worn hard and remembered.',
      () => 'Street-ready from the first wear.',
    ],
  },

  minimal: {
    hooks: [
      (c) => `${c.name} is ${c.fitArticle} ${c.fit} ${c.noun}${t(c).inColor}, kept simple on purpose.`,
      (c) => `Quiet by design: ${c.name}, ${c.fitArticle} ${c.fit} ${c.noun}${t(c).about || ' with nothing extra'}.`,
      (c) => `${c.name} — ${c.fitArticle} ${c.fit} everyday ${c.noun}${t(c).inColor} that lets the cut speak.`,
      (c) => `Clean lines, ${c.fit} fit. ${c.name} is the ${c.noun} you reach for first.`,
    ],
    specs: [
      (c) => `Made in ${c.material}, soft against the skin${t(c).sizesTail}.`,
      (c) => `${c.materialCap} with ${c.fitArticle} ${c.fit} fit that works with everything.`,
      (c) => `${cap(c.fitArticle)} ${c.fit} cut in ${c.material} — simple, comfortable, easy to wear on repeat.`,
    ],
    open: [
      (c) => `${c.name} is for people who prefer less, done well.`,
      (c) => `Not every good ${c.noun} needs to shout. ${c.name} doesn't.`,
      (c) => (c.theme ? `${c.name} keeps ${c.theme} understated and easy.` : `${c.name} is built on one idea: a ${c.noun} worth wearing every week.`),
    ],
    craft: [
      (c) => `It's cut ${c.fit} in ${c.material}${t(c).inColor}, with a clean finish and a calm silhouette.`,
      (c) => `${c.materialCap} gives it a soft hand and a shape that stays put.`,
      (c) => `The ${c.fit} fit${t(c).inColor} is relaxed without looking sloppy.`,
    ],
    wear: [
      () => 'Wear it with anything — denim, chinos, shorts — and it just works.',
      () => 'Layer it under a jacket or let it stand alone.',
      () => (c) => `The kind of ${c.noun} that goes from morning errands to evening plans.`,
    ],
    close: [
      () => 'Simple, comfortable, yours.',
      () => 'An easy staple for every day.',
      () => 'Less noise, more wear.',
    ],
  },

  playful: {
    hooks: [
      (c) => `Meet ${c.name} — ${c.fitArticle} ${c.fit} ${c.noun}${t(c).about} with main-character energy.`,
      (c) => `${c.name} is here, and it's ${c.fit} in all the right ways.`,
      (c) => (c.theme ? `${cap(c.theme)}, but make it a ${c.noun}. Say hi to ${c.name}.` : `Fun fit alert: ${c.name}, ${c.fitArticle} ${c.fit} ${c.noun} made for good moods.`),
      (c) => `${c.name}: ${c.fitArticle} ${c.fit} ${c.noun}${t(c).inColor} that starts conversations.`,
    ],
    specs: [
      (c) => `Super soft ${c.material} with ${c.fitArticle} ${c.fit} fit${t(c).sizesTail}.`,
      (c) => `${c.materialCap}, ${c.fit} cut, zero fuss — just throw it on and go.`,
      (c) => `Comfy ${c.material} and a roomy ${c.fit} body${t(c).sizesTail}.`,
    ],
    open: [
      (c) => `Every wardrobe needs one ${c.noun} that makes you smile. ${c.name} is that ${c.noun}.`,
      (c) => (c.theme ? `${c.name} is for everyone who's a little obsessed with ${c.theme}.` : `${c.name} is for the ones who never take fashion too seriously.`),
      (c) => `Good vibes only — and ${c.name} has plenty.`,
    ],
    craft: [
      (c) => `It comes ${c.fit} in ${c.material}${t(c).inColor}, so it feels as good as it looks.`,
      (c) => `${c.materialCap} keeps it soft, and the ${c.fit} cut keeps it easy.`,
      (c) => `${cap(c.fitArticle)} ${c.fit} fit${t(c).inColor}, made in ${c.material} — comfort, sorted.`,
    ],
    wear: [
      () => 'Wear it to college, the café, or a random Tuesday that deserves better.',
      () => 'Matches your sneakers, your mood and most of your wardrobe.',
      () => 'Tag a friend who needs this one.',
    ],
    close: [
      () => 'Fun fits, big smiles.',
      () => 'Wear it. Love it. Repeat.',
      () => (c) => `Your new favourite ${c.noun} is right here.`,
    ],
  },

  cultural: {
    hooks: [
      (c) => `${c.name} brings ${c.theme || 'a piece of our culture'} to ${c.fitArticle} ${c.fit} ${c.noun} made for everyday wear.`,
      (c) => `Rooted in ${c.theme || 'tradition'}, ${c.name} is ${c.fitArticle} ${c.fit} ${c.noun}${t(c).inColor} with a story to tell.`,
      (c) => `${c.name} — ${c.fitArticle} ${c.fit} ${c.noun}${t(c).about || ' that carries our heritage forward'}.`,
      (c) => `Heritage, worn modern: ${c.name}, ${c.fitArticle} ${c.fit} ${c.noun}${t(c).inColor}.`,
    ],
    specs: [
      (c) => `Made in ${c.material} for comfort through long days and festive evenings${t(c).sizesTail}.`,
      (c) => `${c.materialCap} with ${c.fitArticle} ${c.fit} fit — easy to wear, easy to celebrate in.`,
      (c) => `${cap(c.fitArticle)} ${c.fit} body in ${c.material}${t(c).sizesTail}.`,
    ],
    open: [
      (c) => (c.theme ? `${c.name} is inspired by ${c.theme}, and it shows in every detail.` : `${c.name} is inspired by the stories we grew up with.`),
      (c) => `Some designs are more than a print — ${c.name} is one of them.`,
      (c) => `${c.name} carries a little of home wherever you wear it.`,
    ],
    craft: [
      (c) => `It's made ${c.fit} in ${c.material}${t(c).inColor}, comfortable enough for a full day of celebrations.`,
      (c) => `${c.materialCap} keeps the ${c.fit} fit soft and breathable.`,
      (c) => `${cap(c.fitArticle)} ${c.fit} cut${t(c).inColor}, so tradition feels effortless.`,
    ],
    wear: [
      () => 'Wear it to festivals, family get-togethers, or just because.',
      () => 'Pair it with jeans for the evening or layer it for something dressier.',
      () => 'Easy to style, easy to feel proud in.',
    ],
    close: [
      () => 'Culture you can wear every day.',
      () => 'Tradition, made modern.',
      () => 'Proudly ours, comfortably yours.',
    ],
  },
}

const pick = (list, variant, salt = 0) => list[(variant + salt) % list.length]
const say = (fn, c) => fn(c)

/** Theme words must never be silently dropped: if a template didn't use them, tack them on. */
function withTheme(text, c) {
  if (!c.theme || c.themeFromTags) return text
  const first = c.theme.split(/,| and /)[0].trim().toLowerCase()
  if (first && text.toLowerCase().includes(first)) return text
  return `${text.replace(/[.!?]$/, '')}, inspired by ${c.theme}.`
}

const DESC_MAX = 160

/**
 * Description — search-friendly, aims for 120–160 characters in "full": a hook, then the fabric
 * and sizes, then colours and any real discount, adding each only while it still fits.
 */
export function writeDescription(form, { vibe = 'streetwear', keywords = '', variant = 0, length = 'full' } = {}) {
  const v = VOICES[vibe] || VOICES.streetwear
  const c = buildContext(form, keywords)
  const hook = withTheme(say(pick(v.hooks, variant), c), c)
  if (length === 'short') return hook

  const spec = say(pick(v.specs, variant, 1), c)
  const specNoSizes = spec.replace(/,? available in [^.]+\./, '.')
  let text = hook
  const tryAdd = (extra) => {
    if (extra && `${text} ${extra}`.length <= DESC_MAX) text = `${text} ${extra}`
    return text.includes(extra)
  }
  const compact = `${c.materialCap}${c.sizes ? `, sizes ${c.sizes}` : ''}.`
  if (!tryAdd(spec) && !tryAdd(specNoSizes)) tryAdd(compact) || tryAdd(`${c.materialCap}.`)
  if (c.colors.length > 1) tryAdd(`Comes in ${joinWithAnd(c.colors)}.`)
  else if (c.sizes && !/\b(sizes?|available)\b/i.test(text)) tryAdd(`Sizes ${c.sizes}.`)
  if (c.price && c.compareAt > c.price) {
    tryAdd(`Now ₹${c.price}, ${Math.round(((c.compareAt - c.price) / c.compareAt) * 100)}% off.`)
  }
  return text
}

/**
 * Product story — one flowing paragraph (the product page shows it as a single block):
 * opening line → the make → the designer's own design / construction notes → how to wear it →
 * the edit it belongs to → care → closing line. Every sentence comes from a field on the form.
 */
export function writeStory(form, { vibe = 'streetwear', keywords = '', variant = 0, length = 'full' } = {}) {
  const v = VOICES[vibe] || VOICES.streetwear
  const c = buildContext(form, keywords)
  const open = withTheme(say(pick(v.open, variant), c), c)
  const wear = c.styling || say(pick(v.wear, variant, 1), c)
  if (length === 'short') return `${open} ${wear}`

  let craft = say(pick(v.craft, variant, 2), c)
  if (!craft.toLowerCase().includes(c.material.toLowerCase())) craft += ` Made in ${c.material}.`
  const parts = [open, craft]
  if (c.design) parts.push(c.design)
  if (c.construction) parts.push(c.construction)
  parts.push(wear)
  if (c.edit) parts.push(`You'll find it in our ${c.edit} edit.`)
  if (c.care) parts.push(`To keep it looking its best, ${lowerFirst(c.care)}`)
  parts.push(say(pick(v.close, variant, 0), c))
  return parts.join(' ')
}

/**
 * "Add from your details" — factual one-liners built only from fields the
 * admin already filled in. `null` text means the data isn't there yet.
 */
export function factSnippets(form) {
  const c = buildContext(form)
  const colors = c.colors.length ? c.colors : null
  const off = c.price && c.compareAt > c.price ? Math.round(((c.compareAt - c.price) / c.compareAt) * 100) : 0
  return {
    description: [
      { key: 'fabric', label: 'Fabric', text: form.fabric || form.gsm ? `Made in ${c.material}.` : null },
      { key: 'fit', label: 'Fit', text: form.fit ? `${cap(c.fit)} fit.` : null },
      { key: 'sizes', label: 'Sizes', text: c.sizes ? `Available in ${c.sizes}.` : null },
      { key: 'colors', label: 'Colors', text: colors ? `Available in ${joinWithAnd(colors)}.` : null },
      { key: 'offer', label: 'Offer', text: off ? `Now ₹${c.price}, ${off}% off the ₹${c.compareAt} price.` : null },
    ],
    story: [
      { key: 'design', label: 'Design note', text: form.design ? sentence(form.design) : null },
      { key: 'styling', label: 'Styling tip', text: form.stylingNote ? sentence(form.stylingNote) : null },
      { key: 'care', label: 'Care', text: form.care ? sentence(form.care) : null },
    ],
  }
}

export function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length
}

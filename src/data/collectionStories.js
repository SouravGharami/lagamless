import { HOME_IMAGES } from './homeImages.js'

/**
 * Editorial copy + presentation for the /collections page.
 *
 * Which products belong to a collection is still decided ONLY by src/data/collections.js (the admin tick-boxes),
 * so this file never needs to know about products. To add a collection to the page: add its slug to
 * COLLECTIONS in collections.js, then add one entry here (title, blurb, kind, optional cover image).
 *
 * `kind` drives the filter chips on the page. `image: null` means "use the first product's photo as the cover".
 */

/** Filter chips on the Collections page. */
export const COLLECTION_KINDS = [
  { key: 'all', label: 'All' },
  { key: 'vibe', label: 'By vibe' },
  { key: 'style', label: 'By style' },
  { key: 'culture', label: 'Culture' },
  { key: 'fresh', label: 'Fresh' },
]

/** Display order = the order on the page (issue numbers follow it). */
export const COLLECTION_STORIES = [
  { slug: 'durga-puja', kind: 'culture', title: 'Durga Puja Collection', line: 'Tradition meets streetwear.', image: HOME_IMAGES.catDurgaPuja, focal: '50% 40%' },
  { slug: 'new-arrivals', kind: 'fresh', title: 'New Arrivals', line: 'Fresh drops. New stories.', image: HOME_IMAGES.catNewArrivals, focal: '50% 45%' },
  { slug: 'gen-z', kind: 'vibe', title: 'Gen Z', line: 'Bolder fits. Louder stories.', image: HOME_IMAGES.catGenZ, focal: '50% 25%' },
  { slug: 'streetwear-heads', kind: 'vibe', title: 'Streetwear Heads', line: 'Bigger fits. Bigger attitude.', image: HOME_IMAGES.catStreetwear, focal: '50% 45%' },
  { slug: 'minimal-lovers', kind: 'vibe', title: 'Minimal Lovers', line: 'Less noise. More meaning.', image: HOME_IMAGES.catMinimal, focal: '50% 30%' },
  { slug: 'millennials', kind: 'vibe', title: 'Millennials', line: 'Timeless style. Modern living.', image: HOME_IMAGES.catMillennials, focal: '50% 30%' },
  { slug: 'pop-culture', kind: 'vibe', title: 'Pop Culture Fans', line: 'Music. Art. Movies. Inspiration everywhere.', image: HOME_IMAGES.catPopCulture, focal: '50% 35%' },
  { slug: 'graphic-tees', kind: 'style', title: 'Graphic Tees', line: 'Bold statements, worn loud.', image: null, focal: '50% 30%' },
  { slug: 'minimal-tees', kind: 'style', title: 'Minimal Tees', line: 'Pared back. Quietly premium.', image: null, focal: '50% 30%' },
  { slug: 'cultural-edits', kind: 'culture', title: 'Cultural Edits', line: 'Roots in style.', image: null, focal: '50% 30%' },
]

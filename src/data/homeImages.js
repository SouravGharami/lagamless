/**
 * Centralized image slots for the homepage.
 *
 * Every homepage section reads its image(s) from here instead of hardcoding
 * a URL inline. To drop in real campaign photography later, just set `src`
 * on the relevant slot — no component code needs to change.
 *
 * NOTE — reference imagery pass: every slot below now points at a real
 * photograph sourced from Unsplash (free-to-use license) so the whole
 * homepage renders as a fully "dressed" reference build. These are
 * intentionally stand-ins to show *where* and *what kind* of photography
 * each slot expects (hero/campaign/lifestyle/detail/texture) — swap the
 * `src` for actual LAGAMLESS campaign photography whenever it's ready, and
 * nothing else about the section needs to change. `src: null` still falls
 * back to the shared diagonal placeholder (see EditorialImage.jsx) for any
 * future slot that hasn't been assigned art yet.
 *
 * @typedef {Object} ImageSlot
 * @property {string|null} src
 * @property {string} alt
 */

const UNSPLASH = (id, w = 1600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`

/** @type {Record<string, ImageSlot>} */
export const HOME_IMAGES = {
  hero: {
    // Real LAGAMLESS campaign photo — the crew shot supplied for the
    // hero slide. Served from /public/images so it works completely
    // standalone with no external dependency.
    src: '/images/hero-1.webp',
    alt: 'LAGAMLESS campaign — four models wearing oversized graphic and logo tees, street/rooftop shoot',
  },
  categoryAllTshirts: {
    src: '/images/category-tiles/all-tshirts.jpg',
    alt: 'LAGAMLESS model in sunglasses wearing an oversized black graphic tee, street backdrop',
  },
  categoryGraphicTees: {
    src: '/images/category-tiles/graphic-tees.jpg',
    alt: 'LAGAMLESS "Good Things Take Time" back-print graphic tee, urban backdrop',
  },
  categoryMinimalTees: {
    src: '/images/category-tiles/minimal-tees.jpg',
    alt: 'LAGAMLESS pared-back minimal white tee with LL logo, urban backdrop',
  },
  categoryCulturalEdits: {
    src: '/images/category-tiles/cultural-edits.jpg',
    alt: 'LAGAMLESS Durga back-print graphic tee in red, temple backdrop',
  },
  shopSidebarPromo: {
    src: '/images/shop-sidebar-promo.jpg',
    alt: 'LAGAMLESS "Wear bigger. Think different." — model in an oversized LL logo tee, rooftop backdrop',
  },
  heroSlide2: {
    src: '/images/hero-2.webp',
    alt: 'LAGAMLESS campaign — multi-generation group in LL tees at a Durga Puja pandal, same roots different stories',
  },
  heroSlide3: {
    src: '/images/hero-3.webp',
    alt: 'LAGAMLESS campaign — couple in LL tees watching the sunset by the Howrah Bridge, better together',
  },
  heroSlide4: {
    src: '/images/hero-4.webp',
    alt: 'LAGAMLESS campaign — model in an LL graphic tee at a creative desk, same passion different people',
  },
  shopHeroCampaign: {
    // Real LAGAMLESS campaign photo — the pair shot supplied for the Shop
    // page hero (rooftop/street backdrop, trishul back-print tee + plain
    // white tee). Served from /public/images so it works standalone.
    src: '/images/shop-hero-campaign.png',
    alt: 'LAGAMLESS campaign — two models on a rooftop, one in a black trishul graphic back-print tee, one in a plain white LL tee',
  },
  shopMovementBanner: {
    // Closing banner on the Shop page. The headline, "Explore now" button and
    // handwritten tagline are part of the artwork itself, so the alt text
    // repeats them for screen readers.
    src: '/images/shop-movement-banner.png',
    alt: 'LAGAMLESS — Not just a t-shirt. A movement. Same people, different stories, same culture. Explore now.',
    width: 2172,
    height: 724,
  },
  oversizedChoice: {
    src: UNSPLASH('photo-1721637635502-b0abaaa75edb', 1400),
    alt: 'Model in a dynamic street pose showing off an oversized silhouette, reference photography',
  },
  campaignPrimary: {
    src: UNSPLASH('photo-1523398002811-999ca8dec234', 1400),
    alt: 'LAGAMLESS campaign photography, full-width moody street shot, reference photography',
  },
  campaignSecondary: {
    src: UNSPLASH('photo-1721713168896-11db10d9740b', 1200),
    alt: 'LAGAMLESS campaign photography, street/skate culture detail shot, reference photography',
  },
  campaignDetail: {
    src: UNSPLASH('photo-1594734415578-00fc9540929b', 1200),
    alt: 'LAGAMLESS campaign photography, close-up construction and fabric detail, reference photography',
  },
  philosophy: {
    src: UNSPLASH('photo-1528458909336-e7a0adfed0a5', 1200),
    alt: 'Close-up of heavyweight cotton fabric texture, reference photography',
  },
  collectionIntro: {
    src: UNSPLASH('photo-1524404794194-16bae22718c0', 1200),
    alt: 'LAGAMLESS current collection, folded tee stack overview, reference photography',
  },
  lookPrimary: {
    src: UNSPLASH('photo-1635650804263-1a1941e14df5', 1200),
    alt: 'LAGAMLESS styled look, full outfit on model, reference photography',
  },
  lookSecondary: {
    src: UNSPLASH('photo-1626781309887-cdfb9f258c64', 1200),
    alt: 'LAGAMLESS styled look, seated detail crop, reference photography',
  },
  attitudeMinimal: {
    src: UNSPLASH('photo-1623596305214-19f21cbf48ee', 1200),
    alt: 'LAGAMLESS pared-back, minimal styling in white and black, reference photography',
  },
  attitudeBold: {
    src: UNSPLASH('photo-1578854955076-970394ef2512', 1200),
    alt: 'LAGAMLESS bold, high-contrast styling, reference photography',
  },
  attitudeDark: {
    src: UNSPLASH('photo-1586396847415-2c76ae7e79fc', 1200),
    alt: 'LAGAMLESS all-black styling, no compromise, reference photography',
  },
  attitudeStatement: {
    src: UNSPLASH('photo-1636047250452-6772f6144b3d', 1200),
    alt: 'LAGAMLESS statement-piece graphic tee styling, reference photography',
  },
  attitudeEveryday: {
    src: UNSPLASH('photo-1508216310976-c518daae0cdc', 1200),
    alt: 'LAGAMLESS everyday, easy hoodie styling, reference photography',
  },
  spotlight: {
    src: UNSPLASH('photo-1721637686340-de9f8cebda5a', 1400),
    alt: 'Model wearing the LAGAMLESS oversized fit, talk-of-the-town spotlight shot, reference photography',
  },

  // ---- Category strip (7-card "for everyone" grid) ----
  // Real LAGAMLESS campaign photography, numbered 01-07 in the same order
  // the tiles appear on the homepage. Served from /public/images so it works
  // standalone with no external dependency.
  catGenZ: {
    src: '/images/category-tiles/01-gen-z.webp',
    alt: 'For Gen Z — bolder fits, louder stories',
  },
  catMillennials: {
    src: '/images/category-tiles/02-millennials.webp',
    alt: 'For Millennials — timeless style, modern living',
  },
  catDurgaPuja: {
    src: '/images/category-tiles/03-durga-puja.webp',
    alt: 'Durga Puja collection — tradition meets streetwear',
  },
  catPopCulture: {
    src: '/images/category-tiles/04-pop-culture.webp',
    alt: 'For pop culture fans — music, art, movies, inspiration everywhere',
  },
  catMinimal: {
    src: '/images/category-tiles/05-minimal-lovers.webp',
    alt: 'For minimal lovers — less noise, more meaning',
  },
  catStreetwear: {
    src: '/images/category-tiles/06-streetwear-heads.webp',
    alt: 'For streetwear heads — bigger fits, bigger attitude',
  },
  catNewArrivals: {
    src: '/images/category-tiles/07-new-arrivals.webp',
    alt: 'New arrivals — fresh drops, new stories',
  },

  // ---- Puja / tradition editorial banner ----
  // Real LAGAMLESS campaign creative — a fully pre-composed banner (model
  // wearing the "Rooted In A Higher Culture" Durga tee at a puja pandal,
  // with the "Tradition Meets Today" headline, CTA, script line and tag
  // list already laid into the artwork). Because the copy is baked into
  // the image itself, CultureManifesto renders it full-bleed instead of
  // layering a second, live text overlay on top — see that component.
  pujaBanner: {
    src: '/images/puja-banner-campaign.jpg',
    alt: 'LAGAMLESS — Tradition Meets Today. This Durga Puja, celebrate your roots with a modern state of mind. Explore Puja collection. Culture in every thread: faith, fashion, freedom, together.',
  },

  // ---- Beyond-trends closing banner ----
  beyondTrends: {
    // Real LAGAMLESS campaign photo — five models shot from behind against
    // a concrete wall, each wearing a different graphic/logo tee from the
    // drop. Served from /public/images so it works standalone with no
    // external dependency.
    src: '/images/beyond-trends-campaign.jpg',
    alt: 'LAGAMLESS campaign — five models shown from behind wearing different graphic and logo oversized tees against a concrete wall',
  },
}

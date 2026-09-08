/**
 * Centralized image slots for the homepage.
 *
 * Every homepage section reads its image(s) from here instead of hardcoding
 * a URL inline. To drop in real campaign photography later, just set `src`
 * on the relevant slot — no component code needs to change.
 *
 * `src: null` renders the shared editorial placeholder (see
 * EditorialImage.jsx) so every section still looks intentional before real
 * photography exists.
 *
 * @typedef {Object} ImageSlot
 * @property {string|null} src
 * @property {string} alt
 */

/** @type {Record<string, ImageSlot>} */
export const HOME_IMAGES = {
  hero: {
    src: null,
    alt: 'LAGAMLESS autumn/winter campaign photography',
  },
  oversizedChoice: {
    src: null,
    alt: 'Model wearing an oversized LAGAMLESS silhouette',
  },
  campaignPrimary: {
    src: null,
    alt: 'LAGAMLESS campaign photography, full-width',
  },
  campaignSecondary: {
    src: null,
    alt: 'LAGAMLESS campaign photography, detail shot',
  },
  philosophy: {
    src: null,
    alt: 'Close-up of LAGAMLESS fabric and construction detail',
  },
}

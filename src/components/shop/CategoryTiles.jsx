import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './CategoryTiles.css'

const TILES = [
  {
    key: 'all',
    label: 'All T-Shirts',
    blurb: 'The full collection',
    image: HOME_IMAGES.categoryAllTshirts,
  },
  {
    key: 'graphic-tees',
    label: 'Graphic Tees',
    blurb: 'Bold statements',
    image: HOME_IMAGES.categoryGraphicTees,
  },
  {
    key: 'minimal-tees',
    label: 'Minimal Tees',
    blurb: 'Less noise, more meaning',
    image: HOME_IMAGES.categoryMinimalTees,
  },
  {
    key: 'cultural-edits',
    label: 'Cultural Edits',
    blurb: 'Roots in style',
    image: HOME_IMAGES.categoryCulturalEdits,
  },
]

/**
 * The four-tile "shop by edit" strip directly under the hero. Each image
 * supplied for this strip is a finished graphic with its own label,
 * blurb and arrow already composited in, so the tile here only needs to
 * show that image edge-to-edge — no extra CSS text/scrim on top, which
 * would otherwise double up with what's already baked into the photo.
 * The label/blurb stay in the markup as visually-hidden text purely for
 * screen readers; `onSelect` wires each tile into the grid filter.
 *
 * Each `key` is a collection slug from src/data/collections.js (or 'all'):
 * the grid shows the products an admin ticked for that category.
 *
 * @param {{ onSelect: (key: string) => void, active?: string }} props
 */
function CategoryTiles({ onSelect, active = 'all' }) {
  return (
    <nav className="category-tiles" aria-label="Shop by edit">
      {TILES.map((tile) => (
        <button
          type="button"
          key={tile.key}
          className={`category-tiles__item${active === tile.key ? ' is-active' : ''}`}
          aria-pressed={active === tile.key}
          onClick={() => onSelect(tile.key)}
        >
          <EditorialImage image={tile.image} className="category-tiles__image" />
          <span className="sr-only">
            {tile.label} — {tile.blurb}
          </span>
        </button>
      ))}
    </nav>
  )
}

export default CategoryTiles

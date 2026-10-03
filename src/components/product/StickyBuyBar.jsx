import { formatPrice } from '../../lib/formatPrice.js'
import './StickyBuyBar.css'

/**
 * @param {{
 *   visible: boolean,
 *   product: import('../../data/products.js').Product,
 *   selectedSize: string|null,
 *   soldOut: boolean,
 *   canAdd: boolean,
 *   justAdded: boolean,
 *   onAdd: () => void,
 *   onJumpToSizes: () => void,
 * }} props
 */
function StickyBuyBar({ visible, product, selectedSize, soldOut, canAdd, justAdded, onAdd, onJumpToSizes }) {
  return (
    <div className={`sticky-buy${visible ? ' sticky-buy--visible' : ''}`} aria-hidden={!visible}>
      <div className="container sticky-buy__inner">
        <div className="sticky-buy__info">
          <span className="sticky-buy__name">{product.name}</span>
          <span className="sticky-buy__price">{formatPrice(product.price)}</span>
        </div>

        {selectedSize ? (
          <button type="button" className="sticky-buy__size" onClick={onJumpToSizes}>
            Size {selectedSize}
          </button>
        ) : (
          <button type="button" className="sticky-buy__size sticky-buy__size--prompt" onClick={onJumpToSizes}>
            Select size
          </button>
        )}

        <button type="button" className="btn btn-primary sticky-buy__cta" disabled={!canAdd} onClick={onAdd}>
          {soldOut ? 'Sold out' : justAdded ? 'Added ✓' : 'Add to bag'}
        </button>
      </div>
    </div>
  )
}

export default StickyBuyBar

import { Link } from 'react-router-dom'
import Container from '../components/Container.jsx'
import Section from '../components/Section.jsx'
import Button from '../components/Button.jsx'
import { useCart } from '../context/CartContext.jsx'
import { formatPrice } from '../lib/formatPrice.js'
import './Cart.css'

function Cart() {
  const { lines, removeItem, updateQuantity, getLineStock, clearCart, subtotal } = useCart()

  if (lines.length === 0) {
    return (
      <Section>
        <Container>
          <p className="text-label">Bag</p>
          <h1 className="text-h1" style={{ marginTop: '1rem' }}>
            Your bag is empty.
          </h1>
          <p className="text-lead" style={{ marginTop: '1.5rem', maxWidth: '52ch' }}>
            Nothing here yet. Browse the collection and add something you actually want to wear.
          </p>
          <Button to="/shop" variant="primary" style={{ marginTop: '2rem' }}>
            Continue shopping
          </Button>
        </Container>
      </Section>
    )
  }

  return (
    <Section>
      <Container>
        <p className="text-label">Bag</p>
        <h1 className="text-h1" style={{ marginTop: '1rem' }}>
          Your bag
        </h1>

        <div className="cart-layout">
          <ul className="cart-lines">
            {lines.map((line) => {
              const stock = getLineStock(line)
              const atMaxStock = line.quantity >= stock
              return (
                <li key={line.lineId} className="cart-line">
                  <Link to={`/product/${line.slug}`} className="cart-line__image" aria-hidden="true">
                    {line.image ? (
                      <img src={line.image} alt="" />
                    ) : (
                      <span className="cart-line__image-placeholder" />
                    )}
                  </Link>

                  <div className="cart-line__info">
                    <Link to={`/product/${line.slug}`} className="cart-line__name link-underline">
                      {line.name}
                    </Link>
                    <p className="text-small cart-line__meta">
                      {line.productNumber} · SKU {line.sku} · Size {line.size}
                    </p>
                    <p className="text-small cart-line__price">{formatPrice(line.price)}</p>
                    {atMaxStock && (
                      <p className="text-small cart-line__stock-note">Max available quantity in your bag</p>
                    )}

                    <div className="cart-line__controls">
                      <div className="cart-line__stepper">
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${line.name}, size ${line.size}`}
                          onClick={() => updateQuantity(line.lineId, line.quantity - 1)}
                        >
                          −
                        </button>
                        <span aria-live="polite">{line.quantity}</span>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${line.name}, size ${line.size}`}
                          disabled={atMaxStock}
                          onClick={() => updateQuantity(line.lineId, line.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className="cart-line__remove link-underline"
                        aria-label={`Remove ${line.name}, size ${line.size} from bag`}
                        onClick={() => removeItem(line.lineId)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <span className="text-small cart-line__total">
                    {formatPrice(line.price * line.quantity)}
                  </span>
                </li>
              )
            })}
          </ul>

          <div className="cart-summary">
            <div className="cart-summary__row">
              <span className="text-label">Subtotal</span>
              <span className="text-h3">{formatPrice(subtotal)}</span>
            </div>
            <p className="text-small cart-summary__note">
              Shipping and taxes calculated at checkout.
            </p>
            <Button to="/checkout" variant="primary" block>
              Proceed to checkout
            </Button>
            <Button to="/shop" variant="ghost" block>
              Continue shopping
            </Button>
            <button type="button" className="cart-summary__clear" onClick={clearCart}>
              Clear bag
            </button>
          </div>
        </div>
      </Container>
    </Section>
  )
}

export default Cart

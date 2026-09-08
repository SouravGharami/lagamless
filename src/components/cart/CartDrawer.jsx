import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../../context/CartContext.jsx'
import { formatPrice } from '../../lib/formatPrice.js'
import './CartDrawer.css'

/**
 * Lightweight mini-cart / drawer. Opens automatically when an item is
 * added to the bag (see CartContext.addItem), and can also be dismissed
 * without navigating away — it never replaces the full /cart page, it's
 * just a fast "here's what's in your bag" preview.
 */
function CartDrawer() {
  const { lines, subtotal, drawerOpen, closeDrawer, removeItem, lastAddedLineId } = useCart()
  const navigate = useNavigate()
  const panelRef = useRef(null)
  const closeBtnRef = useRef(null)

  useEffect(() => {
    if (!drawerOpen) return undefined

    function onKeyDown(event) {
      if (event.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
    }
  }, [drawerOpen, closeDrawer])

  if (!drawerOpen) return null

  function goTo(path) {
    closeDrawer()
    navigate(path)
  }

  return (
    <div className="cart-drawer-root">
      <button
        type="button"
        className="cart-drawer__backdrop"
        aria-label="Close bag preview"
        onClick={closeDrawer}
      />
      <aside
        className="cart-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        ref={panelRef}
      >
        <div className="cart-drawer__header">
          <h2 className="text-h3">Your bag</h2>
          <button
            type="button"
            className="cart-drawer__close"
            aria-label="Close bag preview"
            onClick={closeDrawer}
            ref={closeBtnRef}
          >
            <CloseIcon />
          </button>
        </div>

        {lines.length === 0 ? (
          <div className="cart-drawer__empty">
            <p className="text-lead">Your bag is empty.</p>
            <button type="button" className="btn btn-primary" onClick={() => goTo('/shop')}>
              Continue shopping
            </button>
          </div>
        ) : (
          <>
            <ul className="cart-drawer__lines">
              {lines.map((line) => (
                <li
                  key={line.lineId}
                  className={`cart-drawer__line${line.lineId === lastAddedLineId ? ' cart-drawer__line--recent' : ''}`}
                >
                  <div className="cart-drawer__image">
                    {line.image ? (
                      <img src={line.image} alt="" />
                    ) : (
                      <span className="cart-drawer__image-placeholder" />
                    )}
                  </div>
                  <div className="cart-drawer__info">
                    <span className="cart-drawer__name">{line.name}</span>
                    <span className="text-small cart-drawer__meta">
                      Size {line.size} · Qty {line.quantity}
                    </span>
                    <span className="text-small cart-drawer__price">{formatPrice(line.price * line.quantity)}</span>
                  </div>
                  <button
                    type="button"
                    className="cart-drawer__remove"
                    aria-label={`Remove ${line.name}, size ${line.size} from bag`}
                    onClick={() => removeItem(line.lineId)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="cart-drawer__footer">
              <div className="cart-drawer__subtotal">
                <span className="text-label">Subtotal</span>
                <span className="text-h3">{formatPrice(subtotal)}</span>
              </div>
              <button type="button" className="btn btn-primary btn-block" onClick={() => goTo('/checkout')}>
                Checkout
              </button>
              <button type="button" className="btn btn-secondary btn-block" onClick={() => goTo('/cart')}>
                View bag
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="4" x2="14" y2="14" stroke="currentColor" strokeWidth="1.4" />
      <line x1="14" y1="4" x2="4" y2="14" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export default CartDrawer

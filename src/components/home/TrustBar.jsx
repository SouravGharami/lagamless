import Container from '../Container.jsx'
import './TrustBar.css'

// The one section every top Indian D2C streetwear site leads with, that
// this homepage was missing entirely: the four real, checkable reasons a
// first-time buyer trusts the checkout enough to type in a card number.
// Deliberately placed right under the hero — before any more brand story —
// because on a first visit this answers "is this safe to buy from" before
// the person has scrolled far enough to decide they even like the product.
const ITEMS = [
  { icon: 'fabric', title: 'Premium fabric', detail: 'Comfort that lasts' },
  { icon: 'layers', title: 'Two unique fabrics', detail: 'Cotton & acid wash' },
  { icon: 'truck', title: 'Pan India shipping', detail: 'Fast & reliable' },
  { icon: 'lock', title: 'Secure payments', detail: '100% safe' },
  { icon: 'exchange', title: 'Easy returns', detail: 'Hassle free' },
]

const ICONS = {
  fabric: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4l4-1.5L12 4l4-1.5L20 4v4l-3 1v11.5H7V9L4 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l9 4.8-9 4.8-9-4.8L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 12.8l9 4.8 9-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M3 17l9 4.8 9-4.8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2 6h11v9H2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M13 10h4l4 3.2V15h-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="6" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17.5" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  cod: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12.5" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 9.5h19" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  exchange: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 8h13l-3-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 16H7l3 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4.5" y="10.5" width="15" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 10.5v-3a4.5 4.5 0 0 1 9 0v3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="15.5" r="1.3" fill="currentColor" />
    </svg>
  ),
}

function TrustBar() {
  return (
    <div className="trust-bar">
      <Container>
        <ul className="trust-bar__grid">
          {ITEMS.map((item) => (
            <li key={item.title} className="trust-bar__item">
              <span className="trust-bar__icon">{ICONS[item.icon]}</span>
              <span className="trust-bar__copy">
                <span className="trust-bar__title">{item.title}</span>
                <span className="trust-bar__detail">{item.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </Container>
    </div>
  )
}

export default TrustBar

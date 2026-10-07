import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TeeTile from './TeeTile.jsx'
import './FreshRail.css'

/** "Just dropped" — a swipeable row of the newest tees, with arrows on desktop. */
function FreshRail({ items }) {
  const track = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: false })

  useEffect(() => {
    const node = track.current
    if (!node) return undefined
    const update = () =>
      setEdge({ start: node.scrollLeft < 8, end: node.scrollLeft + node.clientWidth >= node.scrollWidth - 8 })
    update()
    node.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      node.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [items])

  if (!items || items.length === 0) return null

  const step = (dir) => {
    const node = track.current
    if (node) node.scrollBy({ left: dir * node.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section className="fr" aria-labelledby="fr-title">
      <div className="container">
        <div className="fr__head">
          <div>
            <p className="fr__kicker">New this month</p>
            <h2 className="fr__title" id="fr-title">Just dropped</h2>
          </div>
          <div className="fr__nav">
            <Link to="/shop?collection=new-arrivals" className="fr__all">See all new</Link>
            <button type="button" onClick={() => step(-1)} disabled={edge.start} aria-label="Scroll back">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <button type="button" onClick={() => step(1)} disabled={edge.end} aria-label="Scroll forward">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </div>
      <ul className="fr__track" ref={track} tabIndex={0} aria-label="Newest tees, scroll sideways">
        {items.map((p) => (
          <li key={p.id} className="fr__item"><TeeTile product={p} /></li>
        ))}
      </ul>
    </section>
  )
}

export default FreshRail

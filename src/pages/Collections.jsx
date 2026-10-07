import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/Reveal.jsx'
import EditSwipe from '../components/collections/EditSwipe.jsx'
import CollectionShowcase from '../components/collections/CollectionShowcase.jsx'
import FreshRail from '../components/collections/FreshRail.jsx'
import { getAllProducts } from '../services/products.js'
import { getCollectionStats, productPhoto } from '../lib/collectionInsights.js'
import { COLLECTION_KINDS, COLLECTION_STORIES } from '../data/collectionStories.js'
import { formatPrice } from '../lib/formatPrice.js'
import './Collections.css'

function Collections() {
  const [products, setProducts] = useState(null)
  const [kind, setKind] = useState('all')

  useEffect(() => {
    document.title = 'Collections — LAGAMLESS'
    let cancelled = false
    getAllProducts().then((list) => {
      if (!cancelled) setProducts(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    if (!products) return null
    const map = {}
    for (const s of COLLECTION_STORIES) map[s.slug] = getCollectionStats(products, s.slug)
    // Style/culture collections have no campaign photo — borrow a product photo so the cover is never empty.
    for (const s of COLLECTION_STORIES) {
      if (!s.image && map[s.slug].thumbs.length === 0) {
        const any = products.map(productPhoto).find(Boolean)
        if (any) map[s.slug].thumbs = [any]
      }
    }
    return map
  }, [products])

  const entries = useMemo(
    () =>
      COLLECTION_STORIES.map((s, i) => ({ story: s, issue: i + 1 })).filter(
        ({ story }) => kind === 'all' || story.kind === kind,
      ),
    [kind],
  )

  const fresh = useMemo(() => {
    if (!products) return []
    const byDate = [...products].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    const flagged = byDate.filter((p) => p.isNewArrival)
    const list = flagged.length >= 4 ? flagged : [...flagged, ...byDate.filter((p) => !p.isNewArrival)]
    return list.slice(0, 10)
  }, [products])

  const live = stats ? COLLECTION_STORIES.filter((s) => stats[s.slug].count > 0).length : null
  const minPrice = products && products.length ? Math.min(...products.map((p) => p.price)) : null
  const marquee = COLLECTION_STORIES.map((s) => s.title)

  return (
    <main className="collections-page">
      <section className="ch" aria-labelledby="ch-title">
        <div className="ch__glow" aria-hidden="true" />
        <div className="container ch__inner">
          <p className="ch__kicker">The edit index</p>
          <h1 className="ch__title" id="ch-title">
            Collections<em>.</em>
          </h1>
          <div className="ch__row">
            <p className="ch__lede">
              Every LAGAMLESS tee belongs to a story. Browse the ten we’re telling right now, or swipe a few tees and let us find yours.
            </p>
            <div className="ch__actions">
              <a href="#finder" className="ch__btn ch__btn--solid">Swipe my edit</a>
              <a href="#index" className="ch__btn">Browse all {COLLECTION_STORIES.length}</a>
            </div>
          </div>

          <dl className="ch__stats">
            <div><dt>Collections</dt><dd>{COLLECTION_STORIES.length}</dd></div>
            <div><dt>Tees live</dt><dd>{products ? products.length : '—'}</dd></div>
            <div><dt>Starting at</dt><dd>{minPrice != null ? formatPrice(minPrice) : '—'}</dd></div>
          </dl>
        </div>

        <div className="ch__marquee" aria-hidden="true">
          <div className="ch__marquee-track">
            {[...marquee, ...marquee].map((t, i) => (
              <span key={i}>{t}<i /></span>
            ))}
          </div>
        </div>
      </section>

      <EditSwipe products={products} />

      <section className="ci" id="index" aria-labelledby="ci-title">
        <div className="container">
          <Reveal className="ci__head">
            <div>
              <h2 className="ci__title" id="ci-title">
                All collections{live != null && <small>{live} live</small>}
              </h2>
              <p className="ci__sub">Tap a slat to open it. Every one links straight to its tees.</p>
            </div>
            <div className="ci__chips" role="group" aria-label="Filter collections">
              {COLLECTION_KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  aria-pressed={kind === k.key}
                  className={`ci__chip${kind === k.key ? ' is-on' : ''}`}
                  onClick={() => setKind(k.key)}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </Reveal>

          <CollectionShowcase entries={entries} stats={stats} />
        </div>
      </section>

      <FreshRail items={fresh} />

      <section className="cx" aria-label="Shop everything">
        <div className="container cx__inner">
          <p className="cx__line">Can’t pick one? <em>Wear them all.</em></p>
          <Link to="/shop" className="cx__btn">
            Shop all T-shirts
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </Link>
        </div>
      </section>
    </main>
  )
}

export default Collections

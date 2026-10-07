import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice } from '../../lib/formatPrice.js'
import { productPhoto } from '../../lib/collectionInsights.js'
import './CollectionShowcase.css'

const canHover = () => window.matchMedia?.('(hover: hover) and (min-width: 900px)').matches

/**
 * The collection index as an expanding showcase. Desktop: a row of tall slats — hover, focus or tap one and it
 * opens to show the story, live numbers and three real tees you can jump straight into. Mobile: the same idea
 * as a vertical accordion, one open at a time.
 * `entries` = [{ story, issue }], `stats` = per-slug live numbers from the catalog (null while loading).
 */
function CollectionShowcase({ entries, stats }) {
  const [activeSlug, setActiveSlug] = useState(entries[0]?.story.slug)
  const hoverTimer = useRef(null)
  const listRef = useRef(null)

  // Filter changed → open the first collection that's still on screen.
  const entryKey = entries.map((e) => e.story.slug).join('|')
  useEffect(() => {
    if (!entries.some((e) => e.story.slug === activeSlug)) setActiveSlug(entries[0]?.story.slug)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey])

  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  function open(slug, { scroll = false } = {}) {
    setActiveSlug(slug)
    if (!scroll || canHover()) return
    // Phones: after the previous panel folds away, bring the opened one fully into view.
    window.setTimeout(() => {
      listRef.current?.querySelector(`[data-slug="${slug}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 460)
  }

  function onEnter(slug) {
    if (!canHover()) return
    clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setActiveSlug(slug), 70)
  }

  // Few slats (a filtered view) shouldn't be crushed to slivers next to one giant panel.
  const grow = entries.length <= 3 ? 2 : entries.length <= 5 ? 4 : 9

  return (
    <ul
      className="sc"
      ref={listRef}
      style={{ '--grow': grow }}
      onMouseLeave={() => clearTimeout(hoverTimer.current)}
    >
      {entries.map(({ story, issue }) => {
        const s = stats ? stats[story.slug] : null
        const active = story.slug === activeSlug
        const cover = story.image?.src || s?.thumbs?.[0] || null
        const empty = s && s.count === 0
        const panelId = `sc-panel-${story.slug}`
        const no = String(issue).padStart(2, '0')
        const peek = s ? s.items.slice(0, 3) : []

        return (
          <li
            key={story.slug}
            data-slug={story.slug}
            className={`sc__item${active ? ' is-active' : ''}${empty ? ' is-empty' : ''}`}
            style={{ '--focal': story.focal }}
            onMouseEnter={() => onEnter(story.slug)}
          >
            <div className="sc__bg" aria-hidden="true">
              {cover ? <img src={cover} alt="" loading="lazy" draggable="false" /> : <span className="sc__ph">LAGAMLESS</span>}
            </div>
            <div className="sc__shade" aria-hidden="true" />

            <button
              type="button"
              className="sc__tab"
              aria-expanded={active}
              aria-controls={panelId}
              onClick={() => open(story.slug, { scroll: true })}
              onFocus={() => open(story.slug)}
            >
              <span className="sc__no">{no}</span>
              <span className="sc__label">{story.title}</span>
              <span className="sc__count">{s ? `${s.count} ${s.count === 1 ? 'tee' : 'tees'}` : ''}</span>
              <span className="sc__chev" aria-hidden="true" />
            </button>

            <div className="sc__panel" id={panelId} role="region" aria-label={story.title} inert={!active}>
              <div className="sc__flags">
                {s && s.newCount > 0 && <span className="sc__flag">{s.newCount} new</span>}
                {empty && <span className="sc__flag sc__flag--soft">Drop incoming</span>}
              </div>

              <p className="sc__no-big" aria-hidden="true">{no}</p>
              <h3 className="sc__title">{story.title}</h3>
              <p className="sc__line">{story.line}</p>

              <dl className="sc__stats">
                {s ? (
                  <>
                    <div><dt>Tees</dt><dd>{s.count}</dd></div>
                    <div><dt>From</dt><dd>{s.from != null ? formatPrice(s.from) : '—'}</dd></div>
                    {s.swatches.length > 0 && (
                      <div>
                        <dt>Colours</dt>
                        <dd className="sc__sw">
                          {s.swatches.slice(0, 5).map((c) => <i key={c.hex} style={{ background: c.hex }} title={c.name} />)}
                        </dd>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="sc__skel" />
                )}
              </dl>

              {peek.length > 0 && (
                <ul className="sc__peek" aria-label={`Tees in ${story.title}`}>
                  {peek.map((p) => (
                    <li key={p.id}>
                      <Link to={`/product/${p.slug}`} tabIndex={active ? 0 : -1}>
                        {productPhoto(p) ? <img src={productPhoto(p)} alt="" loading="lazy" draggable="false" /> : <span />}
                        <b>{p.name}</b>
                        <em>{formatPrice(p.price)}</em>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <Link to={`/shop?collection=${story.slug}`} className="sc__go" tabIndex={active ? 0 : -1}>
                Open collection
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </Link>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default CollectionShowcase

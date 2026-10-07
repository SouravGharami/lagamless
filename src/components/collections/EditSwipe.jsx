import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import TeeTile from './TeeTile.jsx'
import { useWishlist } from '../../context/WishlistContext.jsx'
import { buildEdit, collectionScores, pickDeck, productPhoto } from '../../lib/collectionInsights.js'
import { formatPrice } from '../../lib/formatPrice.js'
import { getProductColors } from '../../lib/productColor.js'
import './EditSwipe.css'

const DECK_SIZE = 8
const THRESHOLD = 90
const MIN_FOR_EARLY = 3
const TONE_COPY = { dark: 'You lean dark', light: 'You lean light', colour: 'You lean colour-forward' }

/**
 * "Swipe your edit" — replaces the old three-chip quiz. Eight real tees from across the range, one at a time:
 * love it or pass (drag the card, tap the buttons, or use the arrow keys). Every love feeds a live taste map;
 * at the end we open the collection that fits and hand back the tees you picked plus more like them.
 */
function EditSwipe({ products }) {
  const [round, setRound] = useState(0)
  const [choices, setChoices] = useState([])
  const [finishedEarly, setFinishedEarly] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(null)
  const startX = useRef(null)
  const timer = useRef(null)

  const deck = useMemo(() => (products ? pickDeck(products, DECK_SIZE, round) : []), [products, round])
  const idx = choices.length
  const current = deck[idx]
  const done = deck.length > 0 && (idx >= deck.length || finishedEarly)

  const liked = useMemo(
    () => choices.filter((c) => c.like).map((c) => deck.find((p) => p.id === c.id)).filter(Boolean),
    [choices, deck],
  )
  const taste = useMemo(() => (products ? collectionScores(products, liked).slice(0, 3) : []), [products, liked])
  const edit = useMemo(() => (products && done ? buildEdit(products, liked) : null), [products, done, liked])

  useEffect(() => () => clearTimeout(timer.current), [])

  const decide = useCallback(
    (like) => {
      if (!current || leaving) return
      setLeaving(like ? 'like' : 'skip')
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      timer.current = setTimeout(
        () => {
          setChoices((c) => [...c, { id: current.id, like }])
          setLeaving(null)
          setDragX(0)
        },
        reduce ? 0 : 240,
      )
    },
    [current, leaving],
  )

  const undo = useCallback(() => {
    if (leaving) return
    setFinishedEarly(false)
    setChoices((c) => c.slice(0, -1))
  }, [leaving])

  const restart = useCallback(() => {
    clearTimeout(timer.current)
    setLeaving(null)
    setDragX(0)
    setChoices([])
    setFinishedEarly(false)
    setRound((r) => r + 1)
  }, [])

  function onPointerDown(e) {
    if (leaving || e.target.closest('a,button')) return
    startX.current = e.clientX
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setDragging(true)
  }
  function onPointerMove(e) {
    if (startX.current == null) return
    setDragX(e.clientX - startX.current)
  }
  function onPointerUp(e) {
    if (startX.current == null) return
    const dx = e.clientX - startX.current
    startX.current = null
    setDragging(false)
    if (Math.abs(dx) > THRESHOLD) decide(dx > 0)
    else setDragX(0)
  }
  function onKeyDown(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); decide(true) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); decide(false) }
    else if (e.key === 'Backspace' || e.key === 'ArrowUp') { e.preventDefault(); undo() }
  }

  const stack = deck.slice(idx, idx + 3)
  const likeStrength = Math.max(0, Math.min(1, dragX / THRESHOLD))
  const skipStrength = Math.max(0, Math.min(1, -dragX / THRESHOLD))
  const topWeight = taste[0]?.score || 1

  return (
    <section className="es" id="finder" aria-labelledby="es-title">
      <div className="container es__inner">
        {(() => {
          const playing = !!products && deck.length > 0 && !done
          return (
            <div className={`es__layout${playing ? ' is-playing' : ''}`}>
              <div className="es__left">
                {done ? (
                  <h2 className="visually-hidden" id="es-title">Your edit</h2>
                ) : (
                  <header className="es__head">
                    <p className="es__kicker">Build your edit</p>
                    <h2 className="es__title" id="es-title">
                      Swipe right on what you’d wear.
                    </h2>
                    <p className="es__lede">
                      Eight tees from across the range. Love it or pass — we read your taste and open the collection that fits you.
                    </p>
                  </header>
                )}

                {playing && (
                  <div className="es__side">
                    <div className="es__taste" aria-live="polite">
                      <p className="es__taste-title">Your taste, so far</p>
                      {taste.length === 0 ? (
                        <p className="es__taste-empty">Love a few tees and your taste map fills in here.</p>
                      ) : (
                        <ul>
                          {taste.map((t) => (
                            <li key={t.slug}>
                              <span>{t.title}</span>
                              <span className="es__bar"><i style={{ width: `${Math.max(12, (t.score / topWeight) * 100)}%` }} /></span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <p className="es__keys" aria-hidden="true"><kbd>←</kbd> pass <kbd>→</kbd> love <kbd>⌫</kbd> undo</p>
                  </div>
                )}
              </div>

              {!products && <div className="es__loading" aria-live="polite">Dealing the deck…</div>}

              {products && deck.length === 0 && (
                <div className="es__empty">
                  <p>The shelves are being restocked. Browse everything instead.</p>
                  <Link to="/shop" className="es__btn es__btn--solid">Shop all tees</Link>
                </div>
              )}

              {playing && (
                <div className="es__deck-col">
                  <div className="es__top">
                    <div className="es__progress" role="progressbar" aria-valuemin={0} aria-valuemax={deck.length} aria-valuenow={idx} aria-label="Cards swiped">
                      {deck.map((p, i) => (
                        <i key={p.id} className={i < idx ? (choices[i]?.like ? 'is-love' : 'is-pass') : i === idx ? 'is-now' : ''} />
                      ))}
                    </div>
                    <p className="es__count"><b>{Math.min(idx + 1, deck.length)}</b> of {deck.length}</p>
                  </div>

                  <div
                    className="es__deck"
                    tabIndex={0}
                    role="group"
                    aria-roledescription="card deck"
                    aria-label={`Tee ${idx + 1} of ${deck.length}. Use the right arrow to love it, the left arrow to pass.`}
                    onKeyDown={onKeyDown}
                  >
                    {[...stack].reverse().map((p) => {
                      const depth = stack.indexOf(p)
                      const top = depth === 0
                      const photo = productPhoto(p)
                      const colors = getProductColors(p)
                      const style = top
                        ? { '--x': leaving ? undefined : `${dragX}px`, '--r': `${dragX / 16}deg` }
                        : { '--depth': depth }
                      return (
                        <article
                          key={p.id}
                          className={`es__card${top ? ' is-top' : ''}${top && dragging ? ' is-dragging' : ''}${top && leaving ? ` is-${leaving}` : ''}`}
                          style={style}
                          aria-hidden={top ? undefined : 'true'}
                          onPointerDown={top ? onPointerDown : undefined}
                          onPointerMove={top ? onPointerMove : undefined}
                          onPointerUp={top ? onPointerUp : undefined}
                          onPointerCancel={top ? onPointerUp : undefined}
                        >
                          {photo ? <img src={photo} alt={top ? p.name : ''} draggable="false" /> : <span className="es__ph">LAGAMLESS</span>}
                          <div className="es__shade" />
                          {top && (
                            <>
                              <span className="es__stamp es__stamp--love" style={{ opacity: leaving === 'like' ? 1 : likeStrength }}>Love</span>
                              <span className="es__stamp es__stamp--pass" style={{ opacity: leaving === 'skip' ? 1 : skipStrength }}>Pass</span>
                            </>
                          )}
                          <div className="es__meta">
                            <h3>{p.name}</h3>
                            <p>
                              <span>{formatPrice(p.price)}</span>
                              {colors.length > 1 && <span>{colors.length} colours</span>}
                              {p.isNewArrival && <span className="es__new">New</span>}
                            </p>
                            {top && <Link to={`/product/${p.slug}`} className="es__peek">View tee</Link>}
                          </div>
                        </article>
                      )
                    })}
                  </div>

                  <div className="es__controls">
                    <button type="button" className="es__round es__round--pass" onClick={() => decide(false)} aria-label="Pass on this tee">
                      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" /></svg>
                    </button>
                    <button type="button" className="es__round es__round--love" onClick={() => decide(true)} aria-label="Love this tee">
                      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.3C1.7 8 3.5 4.8 6.8 4.8c1.9 0 3.5 1 5.2 3 1.7-2 3.3-3 5.2-3 3.3 0 5.1 3.2 4 6.4-1.7 4.7-9.2 9.3-9.2 9.3z" fill="currentColor" /></svg>
                    </button>
                  </div>

                  <div className="es__links">
                    <button type="button" className="es__link" onClick={undo} disabled={idx === 0}>Undo</button>
                    {idx >= MIN_FOR_EARLY && liked.length > 0 && (
                      <button type="button" className="es__link" onClick={() => setFinishedEarly(true)}>Show my edit now</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {edit && (
          <EditResult edit={edit} liked={liked} total={deck.length} onRestart={restart} />
        )}
      </div>
    </section>
  )
}

function EditResult({ edit, liked, total, onRestart }) {
  const { isSaved, toggle } = useWishlist()
  const unsaved = liked.filter((p) => !isSaved(p.id))
  const resultRef = useRef(null)

  useEffect(() => {
    resultRef.current?.focus({ preventScroll: true })
  }, [])

  if (!edit.top) {
    return (
      <div className="er er--none" ref={resultRef} tabIndex={-1}>
        <h3 className="er__title">Tough crowd.</h3>
        <p className="er__sub">You passed on all {total}. Take another hand, or skip the game and browse everything.</p>
        <div className="er__actions">
          <button type="button" className="es__btn es__btn--solid" onClick={onRestart}>Deal again</button>
          <Link to="/shop" className="es__btn">Shop all tees</Link>
        </div>
      </div>
    )
  }

  const { topStory, top } = edit
  const inTop = top.hits

  return (
    <div className="er" ref={resultRef} tabIndex={-1} aria-live="polite">
      <div className="er__lead">
        <p className="es__kicker">Your edit</p>
        <h3 className="er__title">{topStory.title}</h3>
        <p className="er__sub">
          {inTop} of your {liked.length} {liked.length === 1 ? 'love' : 'loves'} live here. {topStory.line}
          {edit.tone ? ` ${TONE_COPY[edit.tone]}.` : ''}
        </p>
        {edit.scores.length > 1 && (
          <p className="er__also">
            Also in your taste: {edit.scores.slice(1, 3).map((s) => s.title).join(' · ')}
          </p>
        )}
        <div className="er__actions">
          <Link to={`/shop?collection=${topStory.slug}`} className="es__btn es__btn--solid">
            Open {topStory.title}
          </Link>
          {unsaved.length > 0 && (
            <button type="button" className="es__btn" onClick={() => unsaved.forEach((p) => toggle(p.id))}>
              Save {unsaved.length === 1 ? 'this tee' : `all ${unsaved.length}`}
            </button>
          )}
          <button type="button" className="es__link" onClick={onRestart}>Deal again</button>
        </div>
      </div>

      <div className="er__picks">
        <p className="er__label">Your loves</p>
        <ul className="er__grid">
          {liked.map((p) => (
            <li key={p.id}><TeeTile product={p} tag="Loved" /></li>
          ))}
        </ul>
      </div>

      {edit.more.length > 0 && (
        <div className="er__more">
          <p className="er__label">More in {topStory.title}</p>
          <ul className="er__grid">
            {edit.more.map((p) => (
              <li key={p.id}><TeeTile product={p} /></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default EditSwipe

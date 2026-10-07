import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPrice } from '../../lib/formatPrice.js'
import './ShareButton.css'

const NOTE_PRESETS = [
  { label: 'Gift idea 🎁', text: 'I found the perfect gift idea ♥' },
  { label: 'For you 💛', text: 'This reminded me of you ♥' },
  { label: 'Thoughts?', text: 'What do you think of this one?' },
  { label: 'Birthday 🎂', text: 'Birthday idea? ★' },
]
const NOTE_MAX = 160

function Icon({ name }) {
  const p = { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
  switch (name) {
    case 'share':
      return (
        <svg {...p}>
          <circle cx="18" cy="5" r="2.6" />
          <circle cx="6" cy="12" r="2.6" />
          <circle cx="18" cy="19" r="2.6" />
          <path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2" />
        </svg>
      )
    case 'whatsapp':
      return (
        <svg {...p}>
          <path d="M3.5 20.5l1.3-4.4A8.5 8.5 0 1 1 8 19.3z" />
          <path d="M9 8.8c.3 2.6 2.7 5.1 5.4 5.6l1.1-1.2-2-1-.8.7c-.9-.4-1.7-1.2-2.1-2.1l.7-.8-1-2z" />
        </svg>
      )
    case 'telegram':
      return (
        <svg {...p}>
          <path d="M21 4L3 11.2l5.6 2L10.5 20l3-3.8 4.5 3.3z" />
          <path d="M8.6 13.2L21 4" />
        </svg>
      )
    case 'email':
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="M3.5 6.5L12 13l8.5-6.5" />
        </svg>
      )
    case 'sms':
      return (
        <svg {...p}>
          <path d="M4 5h16v11H9l-5 4z" />
          <path d="M8 9.5h8M8 12.5h5" />
        </svg>
      )
    case 'link':
      return (
        <svg {...p}>
          <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
          <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
        </svg>
      )
    case 'more':
      return (
        <svg {...p}>
          <circle cx="5" cy="12" r="1.3" fill="currentColor" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" />
          <circle cx="19" cy="12" r="1.3" fill="currentColor" />
        </svg>
      )
    case 'check':
      return (
        <svg {...p}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )
    case 'close':
      return (
        <svg {...p} width="18" height="18">
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      )
    default:
      return null
  }
}

const TEXT_ICON = { facebook: 'f', x: '𝕏' }

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}

/**
 * Share (and gift) a product. The trigger is a clearly labelled call-to-action row (not just an icon) so
 * shoppers notice it; it opens a bottom sheet on phones and a two-column dialog on desktop:
 * preview + personal note on one side, one-tap channels + copy link on the other.
 *
 * @param {{ product: import('../../data/products.js').Product, className?: string }} props
 */
function ShareButton({ product, className = '' }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState(NOTE_PRESETS[0].text)
  const [custom, setCustom] = useState(false) // "Write my own" chosen
  const [copied, setCopied] = useState(false)
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)
  const noteRef = useRef(null)
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  // Shared links point at /p/<slug>: a lightweight page that carries the product's rich preview card
  // (photo, name, price) for WhatsApp / Telegram / Facebook / iMessage and then opens the product page.
  const url = useMemo(() => {
    if (typeof window === 'undefined') return ''
    const site = (import.meta.env?.VITE_SITE_URL || '').trim().replace(/\/+$/, '')
    const origin = site || window.location.origin
    return product.slug ? `${origin}/p/${encodeURIComponent(product.slug)}` : `${origin}${window.location.pathname}`
  }, [open, product.slug]) // eslint-disable-line react-hooks/exhaustive-deps

  const image = useMemo(() => {
    const imgs = product.images || {}
    const key = ['main', 'front', 'model', 'back', 'side', 'detail', 'fabric'].find((k) => imgs[k]?.src)
    return key ? imgs[key].src : null
  }, [product])

  const price = formatPrice(product.price)
  // The note a person typed (or picked). The product card (photo, name, price) is added by the chat app itself
  // once the link is public; the text below makes the message look finished even before / without that card.
  const specs = [product.gsm > 0 ? `${product.gsm} GSM` : '', product.fit ? `${product.fit} fit` : ''].filter(Boolean).join(' · ')
  const noteText = note.trim()
  // Link sits on its own line, with nothing glued to it, so WhatsApp / iMessage turn it into a tappable link.
  const message = [
    noteText || 'Look what I found for you ♥',
    '',
    `✦ *${product.name}*`,
    `${price}${specs ? `  ·  ${specs}` : ''}`,
    '✔ Free shipping above ₹999  ·  COD available',
    '',
    '➜ Tap to view it',
    url,
    '',
    '_LAGAMLESS — Oversized is a culture_',
  ].join('\n')
  // Same message without the link, for apps that take the link as a separate field (Telegram, X, native share).
  const messageNoLink = message.split('\n➜')[0].trim()
  const subject = `${product.name} on LAGAMLESS`
  const activePreset = custom ? null : NOTE_PRESETS.find((n) => n.text === note)?.label ?? null

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function pickPreset(n) {
    setCustom(false)
    setNote(n.text)
  }

  function pickCustom() {
    setCustom(true)
    setNote('')
    // wait for the chip state to paint, then put the cursor in the box
    window.setTimeout(() => noteRef.current?.focus(), 30)
  }

  function onNoteChange(e) {
    const value = e.target.value.slice(0, NOTE_MAX)
    setNote(value)
    setCustom(!NOTE_PRESETS.some((n) => n.text === value))
  }

  // On phones the keyboard covers half the sheet: bring the box into the middle of what is left.
  function onNoteFocus() {
    window.setTimeout(() => noteRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 320)
  }

  useEffect(() => {
    if (!open) return undefined
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!copied) return undefined
    const t = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(t)
  }, [copied])

  const enc = encodeURIComponent
  const channels = [
    { id: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp', href: `https://api.whatsapp.com/send?text=${enc(message)}` },
    { id: 'telegram', label: 'Telegram', icon: 'telegram', href: `https://t.me/share/url?url=${enc(url)}&text=${enc(messageNoLink)}` },
    { id: 'facebook', label: 'Facebook', text: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(noteText || product.name)}` },
    { id: 'x', label: 'X', text: 'x', href: `https://twitter.com/intent/tweet?text=${enc(noteText || `${product.name} — ${price}`)}&url=${enc(url)}` },
    { id: 'email', label: 'Email', icon: 'email', href: `mailto:?subject=${enc(subject)}&body=${enc(message.replace(/[*_]/g, ''))}`, same: true },
    { id: 'sms', label: 'Message', icon: 'sms', href: `sms:?&body=${enc(message.replace(/[*_]/g, ''))}`, same: true },
  ]

  async function handleCopy() {
    const ok = await copyText(url)
    setCopied(ok)
  }

  async function handleNative() {
    try {
      await navigator.share({ title: subject, text: messageNoLink, url })
    } catch {
      /* dismissed by the user */
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`share-cta ${className}`.trim()}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <span className="share-cta__icon" aria-hidden="true">
          <Icon name="share" />
        </span>
        <span className="share-cta__text">
          <strong>Share or gift this</strong>
          <em>Send it to someone you love</em>
        </span>
        <span className="share-cta__arrow" aria-hidden="true">
          →
        </span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="share-modal" role="presentation">
            <button type="button" className="share-modal__backdrop" aria-label="Close share" onClick={close} tabIndex={-1} />
            <div
              className="share-modal__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="share-title"
              ref={dialogRef}
              tabIndex={-1}
            >
              <span className="share-modal__grab" aria-hidden="true" />
              <div className="share-modal__head">
                <div>
                  <p className="share-modal__eyebrow">Share · Gift it</p>
                  <h2 id="share-title" className="share-modal__title">
                    Send this to someone special
                  </h2>
                </div>
                <button type="button" className="share-modal__close" onClick={close} aria-label="Close">
                  <Icon name="close" />
                </button>
              </div>

              <div className="share-modal__cols">
                <section className="share-modal__col" aria-label="Your message">
                  <div className="share-card">
                    <div className="share-card__img">{image && <img src={image} alt="" loading="lazy" decoding="async" />}</div>
                    <div className="share-card__info">
                      <p className="share-card__brand">LAGAMLESS</p>
                      <p className="share-card__name">{product.name}</p>
                      <p className="share-card__price">{price}</p>
                    </div>
                  </div>

                  <label className="share-modal__label" htmlFor="share-note">
                    Add a personal note
                  </label>
                  <div className="share-modal__presets" role="group" aria-label="Quick notes">
                    {NOTE_PRESETS.map((n) => (
                      <button
                        key={n.label}
                        type="button"
                        aria-pressed={activePreset === n.label}
                        className={`share-modal__preset${activePreset === n.label ? ' share-modal__preset--on' : ''}`}
                        onClick={() => pickPreset(n)}
                      >
                        {n.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      aria-pressed={custom}
                      className={`share-modal__preset share-modal__preset--own${custom ? ' share-modal__preset--on' : ''}`}
                      onClick={pickCustom}
                    >
                      ✍️ Write my own
                    </button>
                  </div>
                  <div className="share-modal__note-wrap">
                    <textarea
                      id="share-note"
                      ref={noteRef}
                      className="share-modal__note"
                      rows={3}
                      maxLength={NOTE_MAX}
                      value={note}
                      onChange={onNoteChange}
                      onFocus={onNoteFocus}
                      placeholder="Write something sweet — it goes with the link…"
                    />
                    <span className="share-modal__counter" aria-hidden="true">
                      {note.length}/{NOTE_MAX}
                    </span>
                  </div>
                </section>

                <section className="share-modal__col" aria-label="Send it">
                  <p className="share-modal__label">Send it with</p>
                  <ul className="share-modal__channels">
                    {channels.map((c) => (
                      <li key={c.id}>
                        <a
                          className="share-chan"
                          href={c.href}
                          {...(c.same ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                          onClick={() => !c.same && window.setTimeout(close, 250)}
                        >
                          <span className={`share-chan__chip share-chan__chip--${c.id}`}>
                            {c.icon ? <Icon name={c.icon} /> : <b>{TEXT_ICON[c.text]}</b>}
                          </span>
                          <span className="share-chan__label">{c.label}</span>
                        </a>
                      </li>
                    ))}
                    {canNativeShare && (
                      <li>
                        <button type="button" className="share-chan" onClick={handleNative}>
                          <span className="share-chan__chip share-chan__chip--more">
                            <Icon name="more" />
                          </span>
                          <span className="share-chan__label">More apps</span>
                        </button>
                      </li>
                    )}
                  </ul>

                  <div className="share-link">
                    <input className="share-link__input" readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Product link" />
                    <button type="button" className={`share-link__btn${copied ? ' share-link__btn--ok' : ''}`} onClick={handleCopy}>
                      <Icon name={copied ? 'check' : 'link'} />
                      {copied ? 'Copied!' : 'Copy link'}
                    </button>
                  </div>
                  <p className="share-modal__hint" role="status">
                    {copied ? 'Link copied — paste it anywhere.' : 'Your note is included in WhatsApp, Telegram, X, Email and Message.'}
                  </p>
                </section>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export default ShareButton

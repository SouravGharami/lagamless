import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/Reveal.jsx'
import './ReturnPolicy.css'

/**
 * Return Policy (/policies/returns).
 *
 * The rules here mirror what the app really enforces:
 *   - 7-day window counted from delivery (supabase/functions/submit-return-request)
 *   - the return stages shown to customers (src/components/ReturnTimeline.jsx)
 *   - the reason lists (ReturnRequestDialog.jsx / lib/replacementStatus.js)
 *   - refunds: prepaid orders back through Razorpay, COD orders by manual UPI / bank transfer
 *   - replacements: after delivery, original goes back first, one live request per item, never refund + replace
 * If any of those change in the app, change them here too. Everything is plain data at the top of the file.
 */

const POLICY_UPDATED = 'October 2026'
const WINDOW_DAYS = 7

const RETURN_REASONS = [
  'Size doesn’t fit',
  'Wrong product received',
  'Damaged product',
  'Defective product',
  'Different from description',
  'Other',
]

const REPLACE_REASONS = ['Wrong size', 'Wrong color', 'Damaged product', 'Defective product', 'Wrong item received', 'Other']

const STEPS = [
  { t: 'Request', who: 'You', d: 'Open your delivered order and tap Return. Pick the item and a reason, add a note if you like.' },
  { t: 'Approved', who: 'Us', d: 'Our team reviews it. If it’s all in order, we approve the return.' },
  { t: 'Pickup', who: 'Both', status: 'Return Pickup Scheduled', d: 'We schedule a pickup of the item, so you don’t have to go anywhere. Hand it over in its original packaging.' },
  { t: 'Received', who: 'Us', status: 'Received', d: 'The parcel reaches our warehouse and we mark it as received.' },
  { t: 'Inspection', who: 'Us', d: 'We check the item is in the condition described in this policy.' },
  { t: 'Refund', who: 'Us', d: 'Inspection passed? The refund is processed right away.' },
  { t: 'Done', who: 'Us', status: 'Refund Completed', d: 'The money is on its way back to you. You’ll see “Refund Completed” on your order.' },
]

const CONDITIONS = [
  'Unwashed and unworn, apart from trying it on',
  'Original tags and packaging, where they came with the tee',
  'No stains, odours, perfume, or damage caused after delivery',
  'Prints, embroidery and stitching in the same state you received them',
]

const NOT_ELIGIBLE = [
  'Orders that haven’t been delivered yet',
  'Requests raised after the 7-day window has closed',
  'An item that already has a return, or a replacement, in progress',
  'Items that fail inspection (worn, washed, altered or damaged after delivery)',
]

const CLAUSES = [
  {
    t: 'Who this policy covers',
    p: [
      'This policy applies to every order placed on the LAGAMLESS website, whether you paid online or chose Cash on Delivery.',
      'By placing an order you agree to the terms below.',
    ],
  },
  {
    t: 'The 7-day return window',
    p: [
      'You can request a return within 7 days of your order being delivered. The 7 days are counted from the delivery time recorded for your order, to the hour, not to the end of the day.',
      'A return can only be raised for a delivered order. Requests made after the window has closed can’t be accepted, so please raise yours early.',
    ],
  },
  {
    t: 'Reasons we accept',
    p: ['When you request a return, you choose one of these reasons: ' + RETURN_REASONS.join(', ') + '.', 'Whichever you pick, the item still has to pass inspection (see clause 6).'],
  },
  {
    t: 'How to request a return',
    p: [
      'Go to Track your order, look up your delivered order with the email you used at checkout, and tap Return next to the item.',
      'If your order has more than one item, choose the one you’re returning. Each item can have only one return request, and you can follow its progress on the same screen.',
    ],
  },
  {
    t: 'Pickup',
    p: ['Once a return is approved, we schedule the pickup and the status on your order changes to Return Pickup Scheduled.', 'Please hand over the item in its original packaging, with tags where they came with it.'],
  },
  {
    t: 'Inspection',
    p: [
      'When the parcel reaches our warehouse we mark it Received and then inspect it. We check that the item is unwashed, unworn, undamaged and matches the condition in this policy.',
      'Items that pass inspection move to refund. Items that fail are rejected, and the reason is shown on your order.',
    ],
  },
  {
    t: 'If a return is rejected',
    p: [
      'A return can be declined at the request stage or after inspection. When it is, the status shows Return Request Rejected along with the reason.',
      'If you think we got it wrong, reach out to us with your order number and we’ll take another look.',
    ],
  },
  {
    t: 'Refund amount',
    p: ['Refunds are for the amount you paid for the order, in full. We don’t deduct anything for a return that passes inspection.', 'One return leads to one refund. A refund can’t be issued twice for the same return.'],
  },
  {
    t: 'How the refund reaches you',
    p: [
      'Paid online (cards, UPI, netbanking, wallets): the refund goes back to the same payment method you used, through our payment partner, Razorpay.',
      'Cash on Delivery: since you paid cash, there is no online payment to reverse. We send the refund ourselves by UPI or bank transfer, and we’ll contact you for the details.',
      'After we process a refund, how quickly it appears depends on your bank or payment provider.',
    ],
  },
  {
    t: 'Replacements',
    p: [
      'If the issue is the wrong size, wrong colour, a damaged or defective product, or the wrong item, you can ask for a replacement instead of a refund.',
      'A replacement can be requested once the order is delivered. We approve it, you send the original item back, we check it, and only then does the new one ship.',
      'An item can have one replacement request at a time. You can’t get both a refund and a replacement for the same item.',
    ],
  },
  {
    t: 'Damaged, defective or wrong items',
    p: [
      'If something arrives damaged, defective or isn’t what you ordered, please raise it as soon as you notice, and within the 7-day window. Photos of the item and the packaging help us sort it out faster.',
    ],
  },
  {
    t: 'Misuse of the policy',
    p: [
      'This policy exists for genuine returns. We may decline requests that show signs of misuse, such as worn or washed items, swapped items, or repeated claims that don’t add up.',
    ],
  },
  {
    t: 'Changes to this policy',
    p: ['We may update this policy from time to time. The version on this page when you place your order is the one that applies to it.'],
  },
]

const SECTIONS = [
  { id: 'window', label: 'Your window' },
  { id: 'process', label: 'How it works' },
  { id: 'options', label: 'Return or replace' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'terms', label: 'Full policy' },
  { id: 'help', label: 'Help' },
]

const HELP_CASES = [
  { id: 'fit', label: 'Size doesn’t fit', route: 'return', note: 'Send it back for a refund. Got a different size than you ordered? Choose “Wrong size” under Replace instead.' },
  { id: 'size', label: 'Wrong size sent', route: 'both', note: 'Replace it with the right size, or return it for a refund. Pick one. You can’t have both.' },
  { id: 'color', label: 'Wrong colour', route: 'replace', note: 'Ask for a replacement in the right colour. Your original goes back first, the new one ships after we check it.' },
  { id: 'wrong', label: 'Wrong item', route: 'both', note: 'Raise it as soon as you notice. We’ll either swap it for the right one or refund you, your call.' },
  { id: 'damaged', label: 'Arrived damaged', route: 'both', photos: true, note: 'Photos of the item and the packaging help us sort it out faster. Replace or refund, your call.' },
  { id: 'defect', label: 'Defective piece', route: 'both', photos: true, note: 'Print, stitching or fabric issue? Send photos, then replace or refund, your call.' },
  { id: 'desc', label: 'Not as described', route: 'return', note: 'Return it with the reason “Different from description”. The refund follows once it passes inspection.' },
  { id: 'other', label: 'Something else', route: 'both', note: 'Choose “Other”, add a note, and we’ll look at it. Either route is open to you.' },
]

const PACK_LIST = [
  'Item unwashed and unworn',
  'Original tags still attached',
  'Original packaging, if it came with it',
  'Photos taken if it’s damaged or defective',
  'Order number to hand',
]

const SELF_CHECK = [
  'My order has been delivered, and I’m within 7 days',
  'It’s unwashed and unworn, apart from trying it on',
  'The original tags and packaging are with it',
  'No stains, odours, perfume or damage since delivery',
  'Prints, embroidery and stitching look exactly as they arrived',
]

const REFUND_PATHS = {
  online: {
    label: 'Paid online',
    sub: 'Cards, UPI, netbanking, wallets',
    nodes: [
      { t: 'Inspection passed', d: 'We approve the refund for the full amount you paid.' },
      { t: 'Sent via Razorpay', d: 'The money goes back to the same payment method you used.' },
      { t: 'In your account', d: 'How fast it shows depends on your bank or payment provider.' },
    ],
    you: 'Nothing. No forms, no details to share.',
  },
  cod: {
    label: 'Cash on Delivery',
    sub: 'You paid cash at the door',
    nodes: [
      { t: 'Inspection passed', d: 'We approve the refund for the full amount you paid.' },
      { t: 'We contact you', d: 'We ask for your UPI ID or bank details, since there’s no online payment to reverse.' },
      { t: 'Sent by UPI / bank', d: 'We transfer it ourselves. Timing then depends on your bank.' },
    ],
    you: 'Keep your UPI ID or bank details ready.',
  },
}

const DAY = 86400000
const HOUR = 3600000
const MIN = 60000
const fmtDate = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const fmtTime = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
const pad = (n) => String(n).padStart(2, '0')
const toInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const icsStamp = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`

function useNow(interval = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

/** Live countdown: delivery date (+ optional time) → time left, to the hour. */
function WindowChecker() {
  const now = useNow()
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [copied, setCopied] = useState(false)

  let view = null
  if (date) {
    const [y, m, d] = date.split('-').map(Number)
    const [hh, mm] = time ? time.split(':').map(Number) : [0, 0]
    const delivered = new Date(y, m - 1, d, hh, mm)
    const deadline = new Date(delivered.getTime() + WINDOW_DAYS * DAY)
    const left = deadline.getTime() - now
    const elapsed = now - delivered.getTime()
    if (elapsed < 0) {
      view = { state: 'future', pct: 0, big: '—', unit: '', headline: 'That’s in the future', note: 'Pick the day your order was actually delivered.' }
    } else if (left <= 0) {
      view = {
        state: 'closed',
        pct: 100,
        big: '0',
        unit: 'days',
        headline: 'Window closed',
        note: 'Returns have to be requested within 7 days of delivery. If something was wrong with the item, message us.',
        deadline,
      }
    } else {
      const days = Math.floor(left / DAY)
      const hours = Math.floor((left % DAY) / HOUR)
      const mins = Math.floor((left % HOUR) / MIN)
      let state = 'open'
      let note = 'Plenty of time. Open your order and start the return whenever you’re ready.'
      if (left <= DAY) {
        state = 'last'
        note = 'Under a day left. Raise your return right now.'
      } else if (left <= 2 * DAY) {
        state = 'soon'
        note = 'Closing soon. Raise your return today to be safe.'
      }
      const big = days > 0 ? String(days) : String(hours)
      const unit = days > 0 ? (days === 1 ? 'day' : 'days') : hours === 1 ? 'hour' : 'hours'
      view = {
        state,
        pct: Math.min(100, (elapsed / (WINDOW_DAYS * DAY)) * 100),
        big,
        unit,
        sub: days > 0 ? `${hours}h ${pad(mins)}m` : `${mins}m`,
        headline: state === 'last' ? 'Last stretch' : state === 'soon' ? 'Closing soon' : 'You’re in time',
        note,
        deadline,
        left,
      }
    }
  }

  const R = 54
  const C = 2 * Math.PI * R
  const dayIndex = view && view.state !== 'future' ? Math.min(WINDOW_DAYS, Math.floor((view.pct / 100) * WINDOW_DAYS) + (view.pct >= 100 ? 0 : 1)) : 0

  const addReminder = () => {
    if (!view?.deadline) return
    let start = new Date(view.deadline.getTime() - DAY)
    if (start.getTime() < Date.now()) start = new Date(Date.now() + 5 * MIN)
    const end = new Date(start.getTime() + 30 * MIN)
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//LAGAMLESS//Returns//EN',
      'BEGIN:VEVENT',
      `UID:lagamless-return-${start.getTime()}@lagamless`,
      `DTSTAMP:${icsStamp(new Date())}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      'SUMMARY:Start your LAGAMLESS return',
      `DESCRIPTION:Your 7-day return window closes ${fmtDate(view.deadline)} at ${fmtTime(view.deadline)}. Open Track your order and tap Return.`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:LAGAMLESS return window closing',
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'lagamless-return-reminder.ics'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const copyDeadline = async () => {
    if (!view?.deadline) return
    const text = `My LAGAMLESS return window closes ${fmtDate(view.deadline)}, ${fmtTime(view.deadline)}.`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable — ignore */
    }
  }

  const canAct = view && (view.state === 'open' || view.state === 'soon' || view.state === 'last')

  return (
    <div className={`rp-card rp-check rp-spot${view ? ` rp-check--${view.state}` : ''}`}>
      <p className="rp-card__eyebrow">Window timer</p>
      <div className="rp-check__form">
        <div className="rp-field">
          <label htmlFor="rp-delivered">Delivered on</label>
          <input id="rp-delivered" type="date" value={date} max={toInput(new Date(now))} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="rp-field">
          <label htmlFor="rp-delivered-t">Time <i>(optional)</i></label>
          <input id="rp-delivered-t" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <button type="button" className="rp-chip-btn" onClick={() => { const n = new Date(); setDate(toInput(n)); setTime('') }}>Today</button>
      </div>

      <div className="rp-check__result" aria-live="polite">
        {!view && (
          <div className="rp-check__empty">
            <svg viewBox="0 0 120 120" className="rp-ring rp-ring--idle" aria-hidden="true">
              <circle cx="60" cy="60" r={R} className="rp-ring__track" />
              <circle cx="60" cy="60" r={R} className="rp-ring__idle" />
              <text x="60" y="68" textAnchor="middle" className="rp-ring__q">7</text>
            </svg>
            <p>Pick your delivery date. Add the time if you know it, since your 7 days are counted to the hour.</p>
          </div>
        )}
        {view && (
          <div className="rp-check__live">
            <div className="rp-ring-wrap">
              <svg viewBox="0 0 120 120" className="rp-ring" role="img" aria-label={`${view.big} ${view.unit} left`}>
                <circle cx="60" cy="60" r={R} className="rp-ring__track" />
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  className="rp-ring__fill"
                  strokeDasharray={C}
                  strokeDashoffset={C * (view.state === 'future' ? 1 : view.pct / 100)}
                  transform="rotate(-90 60 60)"
                />
              </svg>
              <div className="rp-ring__center">
                <b>{view.big}</b>
                <span>{view.unit}</span>
              </div>
            </div>
            <div className="rp-check__text">
              <p className="rp-check__headline">{view.headline}</p>
              {view.sub && <p className="rp-check__sub">{view.sub} to go</p>}
              {view.deadline && view.state !== 'future' && (
                <p className="rp-check__date">
                  {view.state === 'closed' ? 'Closed' : 'Closes'} <b>{fmtDate(view.deadline)}</b>, {fmtTime(view.deadline)}
                </p>
              )}
              <p className="rp-check__note">{view.note}</p>
            </div>
          </div>
        )}
        {view && view.state !== 'future' && (
          <ol className="rp-days" aria-label="Day by day">
            {Array.from({ length: WINDOW_DAYS }).map((_, i) => {
              const n = i + 1
              const cls = view.state === 'closed' ? 'is-used' : n < dayIndex ? 'is-used' : n === dayIndex ? 'is-now' : ''
              return (
                <li key={n} className={cls}>
                  <i />
                  <span>D{n}</span>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {canAct && (
        <div className="rp-check__actions">
          <button type="button" className="rp-chip-btn rp-chip-btn--solid" onClick={addReminder}>Add reminder to calendar</button>
          <button type="button" className="rp-chip-btn" onClick={copyDeadline}>{copied ? 'Copied ✓' : 'Copy deadline'}</button>
        </div>
      )}
    </div>
  )
}

/** Tick what's true → will it pass inspection? */
function SelfCheck() {
  const [on, setOn] = useState(() => new Set())
  const toggle = (i) =>
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  const total = SELF_CHECK.length
  const count = on.size
  const all = count === total
  const missing = SELF_CHECK.map((t, i) => (on.has(i) ? null : t)).filter(Boolean)

  return (
    <div className={`rp-card rp-self rp-spot${all ? ' is-ready' : ''}`}>
      <div className="rp-self__top">
        <p className="rp-card__eyebrow">Inspection self-check</p>
        <span className="rp-self__count">{count}/{total}</span>
      </div>
      <h3 className="rp-card__title">Will it pass?</h3>
      <div className="rp-meter" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={count} aria-label="Checks passed">
        <i style={{ width: `${(count / total) * 100}%` }} />
      </div>
      <ul className="rp-self__list">
        {SELF_CHECK.map((t, i) => (
          <li key={t}>
            <label className={on.has(i) ? 'is-on' : ''}>
              <input type="checkbox" checked={on.has(i)} onChange={() => toggle(i)} />
              <span className="rp-tick" aria-hidden="true" />
              <span>{t}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="rp-self__verdict" aria-live="polite">
        {count === 0 && <p>Tick everything that’s true for your item.</p>}
        {count > 0 && !all && (
          <p>
            <b>Not yet.</b> Items that fail inspection are rejected. Still to confirm: {missing[0].charAt(0).toLowerCase() + missing[0].slice(1)}
            {missing.length > 1 ? `, plus ${missing.length - 1} more` : ''}.
          </p>
        )}
        {all && (
          <>
            <p><b>Looks good.</b> Your item matches what we look for. Start the return from your order.</p>
            <Link to="/login" className="rp-btn rp-btn--solid rp-btn--sm">Start a return <span aria-hidden="true">→</span></Link>
          </>
        )}
      </div>
    </div>
  )
}

/** Clickable 7-step track with a detail panel. */
function Process() {
  const [i, setI] = useState(0)
  const s = STEPS[i]
  const onKey = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setI((v) => Math.min(STEPS.length - 1, v + 1)) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setI((v) => Math.max(0, v - 1)) }
  }
  return (
    <div className="rp-proc">
      <ol className="rp-track" style={{ '--p': i / (STEPS.length - 1) }} onKeyDown={onKey}>
        <span className="rp-track__line" aria-hidden="true"><i /></span>
        {STEPS.map((st, n) => (
          <li key={st.t} className={n < i ? 'is-done' : n === i ? 'is-now' : ''}>
            <button type="button" aria-current={n === i ? 'step' : undefined} aria-label={`Step ${n + 1}: ${st.t}`} onClick={() => setI(n)}>
              <span className="rp-track__n">{n < i ? '✓' : pad(n + 1)}</span>
              <span className="rp-track__t">{st.t}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="rp-card rp-proc__panel rp-spot" key={i} aria-live="polite">
        <span className="rp-proc__ghost" aria-hidden="true">{pad(i + 1)}</span>
        <div className="rp-proc__meta">
          <span className="rp-proc__step">Step {i + 1} of {STEPS.length}</span>
          <span className={`rp-who rp-who--${s.who.toLowerCase()}`}>{s.who === 'Both' ? 'You + us' : s.who === 'You' ? 'You do this' : 'We do this'}</span>
        </div>
        <h3>{s.t}</h3>
        <p>{s.d}</p>
        {s.status && (
          <p className="rp-proc__status"><span>On your order</span><b>{s.status}</b></p>
        )}
        <div className="rp-proc__nav">
          <button type="button" className="rp-chip-btn" disabled={i === 0} onClick={() => setI(i - 1)}>← Back</button>
          <button type="button" className="rp-chip-btn rp-chip-btn--solid" disabled={i === STEPS.length - 1} onClick={() => setI(i + 1)}>Next step →</button>
        </div>
      </div>
    </div>
  )
}

/** "What went wrong?" → the right route. */
function Helper() {
  const [id, setId] = useState(null)
  const c = HELP_CASES.find((x) => x.id === id)
  const routeLabel = { return: 'Return for a refund', replace: 'Replace it', both: 'Return or replace' }
  return (
    <div className="rp-card rp-help-tool rp-spot">
      <p className="rp-card__eyebrow">Not sure which?</p>
      <h3 className="rp-card__title">What went wrong?</h3>
      <div className="rp-cases" role="group" aria-label="What went wrong">
        {HELP_CASES.map((x) => (
          <button key={x.id} type="button" aria-pressed={id === x.id} className={id === x.id ? 'is-on' : ''} onClick={() => setId(id === x.id ? null : x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="rp-help-tool__out" aria-live="polite">
        {!c && <p className="rp-help-tool__hint">Tap what happened and we’ll point you to the right route.</p>}
        {c && (
          <>
            <p className="rp-help-tool__route"><span>Best route</span><b>{routeLabel[c.route]}</b></p>
            <p>{c.note}</p>
            {c.photos && <p className="rp-help-tool__photo">📷 Take photos of the item and the packaging before you raise it.</p>}
            <p className="rp-help-tool__fine">One item, one request: you can’t get both a refund and a replacement.</p>
          </>
        )}
      </div>
    </div>
  )
}

function PackList() {
  const [on, setOn] = useState(() => new Set())
  const toggle = (i) =>
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  const all = on.size === PACK_LIST.length
  return (
    <div className={`rp-card rp-pack rp-spot${all ? ' is-ready' : ''}`}>
      <div className="rp-self__top">
        <p className="rp-card__eyebrow">Before pickup day</p>
        <span className="rp-self__count">{on.size}/{PACK_LIST.length}</span>
      </div>
      <h3 className="rp-card__title">Pack it right</h3>
      <ul className="rp-self__list">
        {PACK_LIST.map((t, i) => (
          <li key={t}>
            <label className={on.has(i) ? 'is-on' : ''}>
              <input type="checkbox" checked={on.has(i)} onChange={() => toggle(i)} />
              <span className="rp-tick" aria-hidden="true" />
              <span>{t}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="rp-pack__done" aria-live="polite">{all ? 'Ready for the courier. We’ll handle the pickup.' : 'Tick each one as you pack.'}</p>
    </div>
  )
}

function RefundPath() {
  const [k, setK] = useState('online')
  const p = REFUND_PATHS[k]
  return (
    <div className="rp-refund-tool">
      <div className="rp-seg" role="tablist" aria-label="How did you pay?">
        {Object.entries(REFUND_PATHS).map(([key, v]) => (
          <button key={key} type="button" role="tab" aria-selected={k === key} className={k === key ? 'is-on' : ''} onClick={() => setK(key)}>
            <b>{v.label}</b>
            <span>{v.sub}</span>
          </button>
        ))}
      </div>
      <ol className="rp-path" key={k}>
        {p.nodes.map((n, idx) => (
          <li key={n.t} style={{ '--i': idx }}>
            <span className="rp-path__dot" aria-hidden="true">{idx + 1}</span>
            <div>
              <h4>{n.t}</h4>
              <p>{n.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="rp-path__you"><span>What you do</span>{p.you}</p>
    </div>
  )
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
function Highlight({ text, q }) {
  if (!q) return text
  const parts = text.split(new RegExp(`(${escapeRe(q)})`, 'ig'))
  return parts.map((part, i) => (part.toLowerCase() === q.toLowerCase() ? <mark key={i}>{part}</mark> : part))
}

function Clauses() {
  const [open, setOpen] = useState(() => new Set([0]))
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(-1)
  const q = query.trim()

  // Deep link: /policies/returns#clause-6 opens that clause.
  useEffect(() => {
    const m = /^#clause-(\d+)$/.exec(window.location.hash)
    if (!m) return
    const idx = Number(m[1]) - 1
    if (idx >= 0 && idx < CLAUSES.length) {
      setOpen(new Set([idx]))
      setTimeout(() => document.getElementById(`clause-${idx + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
    }
  }, [])

  const visible = CLAUSES.map((c, i) => ({ c, i })).filter(({ c }) => !q || (c.t + ' ' + c.p.join(' ')).toLowerCase().includes(q.toLowerCase()))
  const allOpen = open.size === CLAUSES.length
  const toggle = (i) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const copyLink = async (n) => {
    const url = `${window.location.origin}${window.location.pathname}#clause-${n}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(n)
      setTimeout(() => setCopied(-1), 1600)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="rp-clauses">
      <div className="rp-clauses__tools">
        <label className="rp-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="sr-only">Search the policy</span>
          <input type="search" placeholder="Search the policy: refund, pickup, COD…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" className="rp-chip-btn" onClick={() => setOpen(allOpen ? new Set() : new Set(CLAUSES.map((_, i) => i)))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <p className="rp-clauses__meta" aria-live="polite">
        {q ? `${visible.length} of ${CLAUSES.length} clauses match “${q}”` : `${CLAUSES.length} clauses · Updated ${POLICY_UPDATED}`}
      </p>
      {visible.length === 0 && <p className="rp-clauses__none">Nothing matches that. Try another word, or <a href="#help">talk to us</a>.</p>}
      <ol className="rp-clauses__list">
        {visible.map(({ c, i }) => {
          const isOpen = q ? true : open.has(i)
          return (
            <li key={c.t} id={`clause-${i + 1}`} className={`rp-clause${isOpen ? ' is-open' : ''}`}>
              <h3>
                <button type="button" className="rp-clause__head" aria-expanded={isOpen} aria-controls={`rp-clause-${i}`} onClick={() => toggle(i)}>
                  <span className="rp-clause__n">{pad(i + 1)}</span>
                  <span className="rp-clause__t"><Highlight text={c.t} q={q} /></span>
                  <span className="rp-clause__icon" aria-hidden="true" />
                </button>
              </h3>
              <div className="rp-clause__panel" id={`rp-clause-${i}`} role="region">
                <div className="rp-clause__inner">
                  {c.p.map((line) => (
                    <p key={line}><Highlight text={line} q={q} /></p>
                  ))}
                  <button type="button" className="rp-clause__link" onClick={() => copyLink(i + 1)}>
                    {copied === i + 1 ? 'Link copied ✓' : 'Copy link to this clause'}
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const WA = String(import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '').replace(/^00/, '')
const WA_NUMBER = /^[6-9]\d{9}$/.test(WA) ? `91${WA}` : WA
const WA_OK = /^\d{11,15}$/.test(WA_NUMBER) && !/0{8,}/.test(WA_NUMBER)

const TICKER = ['7 days from delivery', 'We arrange the pickup', 'Full refund of what you paid', 'Nothing deducted when it passes', 'Swap instead of return']

function ReturnPolicy() {
  const [active, setActive] = useState(SECTIONS[0].id)
  const navRef = useRef(null)
  const indexRef = useRef(null)

  useEffect(() => {
    document.title = 'Return Policy — LAGAMLESS'
  }, [])

  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-25% 0px -65% 0px' },
    )
    nodes.forEach((n) => observer.observe(n))
    return () => observer.disconnect()
  }, [])

  // Reading-progress hairline on the sticky index.
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const el = indexRef.current
      if (!el) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      el.style.setProperty('--read', max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4) : '0')
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Keep the active chip visible in the horizontal mobile bar.
  useEffect(() => {
    const el = navRef.current?.querySelector('[aria-current="true"]')
    if (el && navRef.current && navRef.current.scrollWidth > navRef.current.clientWidth) {
      navRef.current.scrollTo({ left: el.offsetLeft - 24, behavior: 'smooth' })
    }
  }, [active])

  // Cursor-follow glow on cards (fine pointers only; harmless elsewhere).
  const onMove = (e) => {
    if (e.pointerType === 'touch') return
    const card = e.target.closest?.('.rp-spot')
    if (!card) return
    const r = card.getBoundingClientRect()
    card.style.setProperty('--mx', `${e.clientX - r.left}px`)
    card.style.setProperty('--my', `${e.clientY - r.top}px`)
  }

  return (
    <main className="rp" onPointerMove={onMove}>
      {/* ---- Hero ---- */}
      <section className="rp-hero" aria-labelledby="rp-title">
        <span className="rp-hero__ghost" aria-hidden="true">7</span>
        <div className="container rp-hero__inner">
          <p className="rp-kicker rp-kicker--light"><span aria-hidden="true" />Policy · Returns &amp; refunds</p>
          <h1 className="rp-hero__title" id="rp-title">
            Changed your mind?<em>We’ve got you.</em>
          </h1>
          <p className="rp-hero__lede">
            Seven days to decide. A pickup we arrange. A full refund when the item checks out. Here’s everything, in plain words.
          </p>
          <ul className="rp-hero__facts">
            <li><b>7 days</b><span>from delivery to request</span></li>
            <li><b>We pick up</b><span>no trips to the courier</span></li>
            <li><b>Full refund</b><span>of what you paid</span></li>
          </ul>
          <div className="rp-hero__cta">
            <Link to="/login" className="rp-btn rp-btn--solid">Start a return <span aria-hidden="true">→</span></Link>
            <a href="#window" className="rp-btn">Check my window</a>
          </div>
        </div>
        <div className="rp-ticker" aria-hidden="true">
          <div className="rp-ticker__row">
            {[0, 1].map((k) => (
              <ul key={k}>
                {TICKER.map((t) => <li key={t + k}>{t}</li>)}
              </ul>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Section index ---- */}
      <nav className="rp-index" aria-label="On this page" ref={indexRef}>
        <div className="rp-index__scroll" ref={navRef}>
          <div className="container rp-index__inner">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined} className={active === s.id ? 'is-on' : ''}>
                {s.label}
              </a>
            ))}
          </div>
        </div>
        <span className="rp-index__read" aria-hidden="true" />
      </nav>

      <div className="container rp-body">
        {/* ---- Window ---- */}
        <section className="rp-sec" id="window" aria-labelledby="rp-window-t">
          <Reveal>
            <p className="rp-kicker"><span aria-hidden="true" />Your window</p>
            <h2 className="rp-h2" id="rp-window-t">How much time do I have?</h2>
            <p className="rp-lede">You have 7 days from delivery to request a return. Watch the clock, then check your item will pass.</p>
          </Reveal>
          <Reveal className="rp-grid2">
            <WindowChecker />
            <SelfCheck />
          </Reveal>
          <Reveal className="rp-eligible">
            <div className="rp-eligible__col rp-eligible__col--yes">
              <h3>What we look for</h3>
              <ul>{CONDITIONS.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
            <div className="rp-eligible__col rp-eligible__col--no">
              <h3>What can’t be returned</h3>
              <ul>{NOT_ELIGIBLE.map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          </Reveal>
        </section>

        {/* ---- Process ---- */}
        <section className="rp-sec" id="process" aria-labelledby="rp-process-t">
          <Reveal>
            <p className="rp-kicker"><span aria-hidden="true" />How it works</p>
            <h2 className="rp-h2" id="rp-process-t">From “I want to return this” to money back.</h2>
            <p className="rp-lede">Every step shows up live on your order, so you always know where your return is. Tap a step to see what happens.</p>
          </Reveal>
          <Reveal>
            <Process />
          </Reveal>
        </section>

        {/* ---- Return vs replace ---- */}
        <section className="rp-sec" id="options" aria-labelledby="rp-options-t">
          <Reveal>
            <p className="rp-kicker"><span aria-hidden="true" />Your options</p>
            <h2 className="rp-h2" id="rp-options-t">Return it, or swap it.</h2>
            <p className="rp-lede">Not the right fit? Pick whichever suits you. You can’t do both for the same item.</p>
          </Reveal>
          <Reveal className="rp-grid2">
            <Helper />
            <PackList />
          </Reveal>
          <div className="rp-options">
            <Reveal className="rp-opt rp-spot">
              <span className="rp-opt__tag">Option A</span>
              <h3>Return for a refund</h3>
              <p>Send it back and get your money back, once the item has passed inspection.</p>
              <p className="rp-opt__label">Reasons you can choose</p>
              <ul className="rp-pills">{RETURN_REASONS.map((r) => <li key={r}>{r}</li>)}</ul>
              <ul className="rp-opt__rules">
                <li>Within 7 days of delivery</li>
                <li>We arrange the pickup</li>
                <li>Refund after inspection</li>
              </ul>
            </Reveal>
            <Reveal className="rp-opt rp-opt--alt rp-spot" delay={90}>
              <span className="rp-opt__tag">Option B</span>
              <h3>Replace it</h3>
              <p>Wrong size, wrong colour, or a faulty piece? We’ll swap it for the right one.</p>
              <p className="rp-opt__label">Reasons you can choose</p>
              <ul className="rp-pills">{REPLACE_REASONS.map((r) => <li key={r}>{r}</li>)}</ul>
              <ul className="rp-opt__rules">
                <li>Available once your order is delivered</li>
                <li>You send the original back first</li>
                <li>New piece ships after we check it</li>
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ---- Refunds ---- */}
        <section className="rp-sec" id="refunds" aria-labelledby="rp-refunds-t">
          <Reveal>
            <p className="rp-kicker"><span aria-hidden="true" />Refunds</p>
            <h2 className="rp-h2" id="rp-refunds-t">Where your money goes.</h2>
            <p className="rp-lede">The full amount you paid. How it gets back to you depends on how you paid. Choose yours.</p>
          </Reveal>
          <Reveal>
            <RefundPath />
          </Reveal>
          <Reveal as="p" className="rp-footnote">
            Once we’ve processed the refund, the exact time it takes to show up depends on your bank or payment provider.
          </Reveal>
        </section>

        {/* ---- Full policy ---- */}
        <section className="rp-sec" id="terms" aria-labelledby="rp-terms-t">
          <Reveal>
            <p className="rp-kicker"><span aria-hidden="true" />The fine print</p>
            <h2 className="rp-h2" id="rp-terms-t">The full policy.</h2>
            <p className="rp-lede">Every clause, in one place. Search it, or link straight to the one you need.</p>
          </Reveal>
          <Clauses />
        </section>
      </div>

      {/* ---- Help ---- */}
      <section className="rp-help" id="help" aria-labelledby="rp-help-t">
        <div className="container rp-help__inner">
          <Reveal>
            <p className="rp-kicker rp-kicker--light"><span aria-hidden="true" />Still unsure?</p>
            <h2 className="rp-help__title" id="rp-help-t">Talk to a human<em>.</em></h2>
            <p className="rp-help__lede">Keep your order number handy and we’ll sort it out together.</p>
            <div className="rp-hero__cta">
              <Link to="/login" className="rp-btn rp-btn--solid">Track &amp; return my order <span aria-hidden="true">→</span></Link>
              {WA_OK && (
                <a
                  className="rp-btn"
                  href={`https://api.whatsapp.com/send?phone=${WA_NUMBER}&text=${encodeURIComponent('Hi LAGAMLESS, I have a question about returning an order.')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chat on WhatsApp
                </a>
              )}
            </div>
          </Reveal>
        </div>
      </section>
    </main>
  )
}

export default ReturnPolicy

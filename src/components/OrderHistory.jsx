import { useEffect, useMemo, useState } from 'react'
import Button from './Button.jsx'
import ReturnRequestDialog from './ReturnRequestDialog.jsx'
import ReturnTimeline, { RETURN_STATUS_LABELS } from './ReturnTimeline.jsx'
import ReplacementRequestDialog from './ReplacementRequestDialog.jsx'
import ReplacementTimeline from './ReplacementTimeline.jsx'
import OrderProgress from './OrderProgress.jsx'
import { formatPrice } from '../lib/formatPrice.js'
import { formatDate } from '../lib/formatDate.js'
import { getReplacementsByEmail } from '../services/replacements.js'
import { REPLACEMENT_STATUS_LABELS, isLiveReplacement } from '../lib/replacementStatus.js'
import '../pages/Auth.css'
import '../pages/OrderStatus.css'
import '../pages/OrderLookup.css'
import '../pages/TrackTheme.css'
import { ReturnIcon, SwapIcon } from './TrackIcons.jsx'
import ItemImage from './ItemImage.jsx'
import { fetchImagesByProductName } from '../services/itemImages.js'

const STATUS_LABEL = {
  pending: 'Payment pending',
  confirmed: 'Confirmed',
  paid: 'Paid',
  payment_failed: 'Payment failed',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

/** Colour tone for the status pill on an order card. */
function statusTone(status) {
  if (status === 'delivered' || status === 'paid') return 'good'
  if (status === 'cancelled' || status === 'payment_failed') return 'bad'
  if (status === 'shipped') return 'info'
  if (status === 'pending' || status === 'processing') return 'warn'
  return 'neutral'
}

function statusLabel(status) {
  return STATUS_LABEL[status] ?? status ?? 'Unknown'
}

/** A COD order is `pending` until we confirm it — that's "placed", not "Payment pending". */
function orderStatusLabel(order) {
  if (order.paymentMethod === 'cod' && order.status === 'pending') return 'Order placed'
  return statusLabel(order.status)
}

/**
 * True when a COD order's money has been received. Driven by the payment
 * status the admin sets by hand ("Mark paid"). If the server didn't send a
 * payment status at all (an older deployment of the lookup function), fall
 * back to the previous behaviour — delivered means paid — so nothing regresses.
 */
function isCodPaid(order) {
  if (order.paymentStatus == null) return order.status === 'delivered'
  return order.paymentStatus === 'paid'
}

/**
 * The note shown on a Cash on Delivery order telling the customer exactly what
 * they owe — or, once the store has recorded the payment, that it's settled.
 * Returns null for online-paid orders.
 *
 *  - cancelled            → nothing to pay
 *  - refunded             → refunded
 *  - paid                 → "Payment received" (the "you owe" wording is gone)
 *  - delivered, not paid  → "Payment pending" — they have the product, we have no payment yet
 *  - anything earlier     → "pay ₹X in cash when it arrives"
 */
function codPaymentNote(order) {
  if (order.paymentMethod !== 'cod') return null
  const amount = formatPrice(order.total ?? order.subtotal)
  if (order.status === 'cancelled') {
    return { tone: 'muted', text: 'Cash on Delivery — order cancelled, nothing to pay.' }
  }
  if (order.paymentStatus === 'refunded') {
    return { tone: 'muted', text: `Cash on Delivery — ${amount} refunded.` }
  }
  if (isCodPaid(order)) {
    const when = order.paidAt ? ` on ${formatDate(order.paidAt)}` : ''
    return { tone: 'paid', text: `✓ Payment received — ${amount} paid${when}. Thank you!` }
  }
  if (order.status === 'delivered') {
    return {
      tone: 'overdue',
      text: `Payment pending — please pay ${amount} for your delivered order.`,
    }
  }
  return { tone: 'due', text: `Cash on Delivery — pay ${amount} in cash when your order is delivered.` }
}

/** Return window: exactly 7 days from delivered_at. */
const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Whether the Return button should show for this order: status must be
 * 'delivered', delivered_at must be present, and it must be within 7
 * days of that timestamp. No delivered_at (e.g. old/legacy orders, or a
 * status change made before this column existed) means no button —
 * we never guess a delivery date.
 */
function isReturnEligible(order) {
  if (order.status !== 'delivered' || !order.deliveredAt) return false
  const deliveredAt = new Date(order.deliveredAt).getTime()
  if (Number.isNaN(deliveredAt)) return false
  return Date.now() - deliveredAt <= RETURN_WINDOW_MS
}

/**
 * Whether this order was ever delivered (status + delivered_at present),
 * independent of whether the 7-day return window is still open. Used to
 * gate the return-status display so "Return Request Initiated" keeps
 * showing even after the window that opened it has since closed — the
 * request itself doesn't expire just because the countdown for making a
 * *new* one did.
 */
function wasDelivered(order) {
  return order.status === 'delivered' && Boolean(order.deliveredAt)
}

/**
 * The single returns.status that represents this order's return, if one
 * can be determined: either every item shares the exact same status (an
 * order-level return sets the same status on every item — see
 * get-orders-by-email), or there's nothing to report. Different items
 * genuinely mid-return at different stages fall back to `null` here —
 * the per-item labels in the item list still show each one individually.
 */
function orderReturnStatus(order) {
  const items = order.items || []
  if (items.length === 0 || items.some((item) => !item.returnStatus)) return null
  const statuses = new Set(items.map((item) => item.returnStatus))
  return statuses.size === 1 ? items[0].returnStatus : null
}

/** The refund amount/date to show once orderReturnStatus() is 'refunded'
 * — every refunded item on an order carries the same figures (a return
 * is refunded as a whole, see initiate-return-refund/index.ts), so the
 * first refunded item's values represent the order. */
function orderRefundInfo(order) {
  const items = order.items || []
  const refundedItem = items.find((item) => item.returnStatus === 'refunded')
  if (!refundedItem) return null
  return { refundAmount: refundedItem.refundAmount, refundedAt: refundedItem.refundedAt }
}

/**
 * Whether at least one item on this order can still have a return
 * requested for it. True for an item-less order, so the Return button's
 * old whole-order behavior is unchanged when there's nothing to check
 * per item. A `rejected` return doesn't block a fresh request — matching
 * submit-return-request's own duplicate check, which only blocks while a
 * return is still `requested` — every other in-flight status does.
 */
function hasReturnableItem(order) {
  const items = order.items || []
  return items.length === 0 || items.some((item) => !item.returnStatus || item.returnStatus === 'rejected')
}

/**
 * Whether the "Replace" button should show for this order — a separate
 * workflow from Return above, and deliberately simpler: the order must be
 * marked DELIVERED (no delivery-date window), and at least one item must be
 * free of both a live replacement and a live return/refund. `rejected` never
 * blocks (matching how Return treats it). The edge functions re-check all of
 * this server-side; this only decides whether to draw the button.
 *
 * @param {object} order
 * @param {Map<string, object>} replacementByItem - latest replacement per order_item_id
 */
function hasReplaceableItem(order, replacementByItem) {
  if (order.status !== 'delivered') return false
  return (order.items || []).some((item) => {
    if (!item.id) return false
    const returnInFlight = item.returnStatus && item.returnStatus !== 'rejected'
    return !returnInFlight && !isLiveReplacement(replacementByItem.get(item.id))
  })
}

/**
 * The customer's list of orders (status, items, totals, tracking, returns).
 * Shared by the "Track your order" page (OrderLookup.jsx) and the signed-in
 * Account page, so both show identical order cards — including the
 * Cash on Delivery "pay this much on delivery" note.
 *
 * @param {object} props
 * @param {Array} props.orders - `orders` from get-orders-by-email
 * @param {string} props.customerEmail - email these orders belong to (used by the return form)
 * @param {() => void} [props.onRefresh] - called after a return is submitted so the list can reload
 */
function OrderHistory({ orders: rawOrders, customerEmail, onRefresh }) {
  const [returnOrder, setReturnOrder] = useState(null)

  // --- Product photos ------------------------------------------------------
  // get-orders-by-email sends `imageUrl` per item. For any item without one
  // (older deployment of that function, or an unlinked product) look the photo
  // up by product name from the public storefront tables. The merged orders
  // are what every card, the Return dialog and the Replace dialog read from.
  const [fallbackImages, setFallbackImages] = useState({})
  useEffect(() => {
    const missing = rawOrders.flatMap((o) => (o.items || []).filter((i) => !i.imageUrl).map((i) => i.product_name))
    if (missing.length === 0) return undefined
    let cancelled = false
    fetchImagesByProductName(missing)
      .then((map) => {
        if (!cancelled) setFallbackImages((prev) => ({ ...prev, ...map }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [rawOrders])

  const orders = useMemo(
    () =>
      rawOrders.map((order) => ({
        ...order,
        items: (order.items || []).map((item) => ({
          ...item,
          imageUrl: item.imageUrl || fallbackImages[item.product_name] || null,
        })),
      })),
    [rawOrders, fallbackImages],
  )

  // --- Replacements (separate workflow from returns) ----------------------
  // Loaded with their own edge function rather than folded into the orders
  // lookup, so nothing about the return data path changes. `null` = loading.
  // A failed load degrades to "no replacements known" — the Replace button
  // still works, and the server rejects a duplicate anyway.
  const [replacements, setReplacements] = useState(null)
  const [replaceOrder, setReplaceOrder] = useState(null)
  const [replacementsReload, setReplacementsReload] = useState(0)

  // Re-runs whenever the parent refreshes `orders` (tab refocus, "Refresh
  // status", after a return) or after a replacement is submitted, so statuses
  // an admin has moved on since are picked up without a manual reload.
  useEffect(() => {
    if (!customerEmail) return undefined
    let cancelled = false
    getReplacementsByEmail(customerEmail)
      .then((data) => {
        if (!cancelled) setReplacements(data.replacements ?? [])
      })
      .catch(() => {
        if (!cancelled) setReplacements((prev) => prev ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [customerEmail, rawOrders, replacementsReload])

  // Newest-first from the server, so the first one seen per item is its latest.
  const replacementByItem = new Map()
  for (const replacement of replacements ?? []) {
    if (replacement.orderItemId && !replacementByItem.has(replacement.orderItemId)) {
      replacementByItem.set(replacement.orderItemId, replacement)
    }
  }

  return (
    <div className="tk">
        <ul className="order-lookup-list">
          {orders.map((order) => (
            <li key={order.orderId} className="order-lookup-card">
              <div className="order-lookup-card__header">
                <div>
                  <p className="order-status__id">Order #{order.orderId}</p>
                  <p className="tk-order-date">
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    }) : ''}
                  </p>
                </div>
                <span className={`account-role-badge tk-pill tk-pill--${statusTone(order.status)}`}>
                  {orderStatusLabel(order)}
                </span>
              </div>

              <OrderProgress order={order} />

              {codPaymentNote(order) && (
                <p
                  className={`order-lookup-card__cod order-lookup-card__cod--${codPaymentNote(order).tone}`}
                  role="note"
                >
                  {codPaymentNote(order).text}
                </p>
              )}

              {/* Tracking info/CTA is only useful before the order has
                  arrived — once delivered, "track package" and the
                  courier/tracking-ID line have nothing left to show. */}
              {order.status !== 'delivered' && (order.trackingUrl || order.trackingCourier || order.trackingId) && (
                <div className="order-lookup-card__tracking">
                  <p className="text-small" style={{ color: 'var(--color-graphite)' }}>
                    {order.shippedAt
                      ? `Shipped ${new Date(order.shippedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}`
                      : 'Shipped'}
                    {order.trackingCourier ? ` via ${order.trackingCourier}` : ''}
                    {order.trackingId ? ` · Tracking ID ${order.trackingId}` : ''}
                  </p>
                  {order.trackingUrl && (
                    <a
                      href={order.trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary order-lookup-card__track-btn"
                    >
                      Track package
                    </a>
                  )}
                </div>
              )}

              <ul className="order-status__lines" style={{ marginTop: 'var(--space-4)' }}>
                {(order.items || []).map((item, i) => (
                  <li key={i} className="order-status__line tk-item">
                    <ItemImage src={item.imageUrl} alt={item.product_name} size="lg" />
                    <span className="tk-item__info">
                      <span className="tk-item__name">{item.product_name}</span>
                      <span className="tk-item__meta">
                        Size {item.size} · Qty {item.quantity}
                      </span>
                      {(item.returnStatus || replacementByItem.get(item.id)) && (
                        <span className="tk-item__badges">
                          {item.returnStatus && (
                            <span
                              className={
                                'account-role-badge' +
                                (item.returnStatus === 'rejected' ? ' account-role-badge--negative' : '')
                              }
                            >
                              {RETURN_STATUS_LABELS[item.returnStatus] ?? item.returnStatus}
                              {item.returnStatus === 'refunded' && item.refundAmount != null
                                ? ` · ${formatPrice(item.refundAmount)}`
                                : ''}
                            </span>
                          )}
                          {replacementByItem.get(item.id) && (
                            <span
                              className={
                                'account-role-badge' +
                                (replacementByItem.get(item.id).status === 'rejected' ? ' account-role-badge--negative' : '')
                              }
                            >
                              {REPLACEMENT_STATUS_LABELS[replacementByItem.get(item.id).status] ??
                                replacementByItem.get(item.id).status}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="tk-item__price">{formatPrice(item.line_total)}</span>
                  </li>
                ))}
              </ul>

              <div className="order-lookup-card__total">
                <span className="text-small">Total</span>
                <span className="text-h3">{formatPrice(order.total ?? order.subtotal)}</span>
              </div>

              {wasDelivered(order) && orderReturnStatus(order) ? (
                <div className="order-lookup-card__return order-lookup-card__return--timeline">
                  <ReturnTimeline
                    status={orderReturnStatus(order)}
                    refundAmount={orderRefundInfo(order)?.refundAmount}
                    refundedAt={orderRefundInfo(order)?.refundedAt}
                    items={order.items}
                  />
                </div>
              ) : (
                isReturnEligible(order) &&
                hasReturnableItem(order) && (
                  <div className="order-lookup-card__return">
                    <Button type="button" variant="secondary" onClick={() => setReturnOrder(order)}>
                      <ReturnIcon /> &nbsp;Return
                    </Button>
                  </div>
                )
              )}

              {/* Replacement — its own workflow, shown independently of Return.
                  Button: only once the order is DELIVERED. Status timeline:
                  for every item that has a replacement request. */}
              {(() => {
                const orderReplacements = (order.items || [])
                  .map((item) => ({ item, replacement: replacementByItem.get(item.id) }))
                  .filter(({ replacement }) => Boolean(replacement))
                const canReplace = replacements !== null && hasReplaceableItem(order, replacementByItem)
                if (orderReplacements.length === 0 && !canReplace) return null
                return (
                  <div className="order-lookup-card__replace">
                    {orderReplacements.map(({ item, replacement }) => (
                      <ReplacementTimeline
                        key={replacement.id}
                        replacement={replacement}
                        itemLabel={(order.items || []).length > 1 ? item.product_name : undefined}
                        itemImage={item.imageUrl}
                        itemName={item.product_name}
                      />
                    ))}
                    {canReplace && (
                      <div className="order-lookup-card__replace-actions">
                        <Button type="button" variant="secondary" onClick={() => setReplaceOrder(order)}>
                          <SwapIcon /> &nbsp;Replace
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })()}
            </li>
          ))}
        </ul>

      <ReplacementRequestDialog
        open={Boolean(replaceOrder)}
        order={replaceOrder}
        customerEmail={customerEmail}
        onClose={() => setReplaceOrder(null)}
        onSubmitted={() => setReplacementsReload((n) => n + 1)}
      />

      <ReturnRequestDialog
        open={Boolean(returnOrder)}
        order={returnOrder}
        customerEmail={customerEmail}
        onClose={() => setReturnOrder(null)}
        onSubmitted={onRefresh}
      />
    </div>
  )
}

export default OrderHistory

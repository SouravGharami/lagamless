import { useEffect, useMemo, useState } from 'react'
import {
  getCodPayment,
  getOrders,
  getOrdersRawCount,
  isCodUnpaid,
  setCodPaymentStatus,
  updateOrderStatus,
} from '../../services/adminOrders.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { formatPrice } from '../../lib/formatPrice.js'
import StatusBadge from '../components/StatusBadge.jsx'
import OrderItemThumb from '../components/OrderItemThumb.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import ShipmentDialog from '../components/ShipmentDialog.jsx'
import MarkPaidDialog from '../components/MarkPaidDialog.jsx'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'payment_failed', label: 'Payment failed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
]

// Statuses an admin can hand-pick from the row dropdown. `payment_failed` is
// left out on purpose — that's a gateway-driven state (Part 09/10), not
// something an admin sets by hand.
const ASSIGNABLE_STATUSES = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']

// An order in one of these states is done moving — cancelling it from here
// would be misleading (it's already delivered, or already cancelled).
const LOCKED_STATUSES = ['delivered', 'cancelled']

const PAYMENT_FILTERS = [
  { key: 'all', label: 'All payments' },
  { key: 'cod', label: 'Cash on Delivery' },
  { key: 'cod_unpaid', label: 'COD · unpaid' },
  { key: 'online', label: 'Paid online' },
]

/** True when the order's payment is Cash on Delivery. */
function isCodOrder(order) {
  return order.payments.some((p) => p.provider === 'cod')
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const METHOD_LABEL = { cash: 'Cash', upi: 'UPI', other: 'Other' }

/**
 * Payment column. Online (Razorpay) orders show the payment's own status.
 *
 * Cash-on-Delivery orders show a COD tag plus an explicit Unpaid / Paid badge
 * that follows `payments.status`, which the admin flips by hand with the
 * "Mark paid" button (delivery and payment are separate events — see
 * part-25-cod-manual-payment.sql). The note underneath says what's happening
 * with the money: due on delivery, delivered-but-not-received, received on a
 * date and how, or never collected because the order was cancelled.
 */
function PaymentCell({ order }) {
  const latest = order.payments[order.payments.length - 1]
  if (!latest) return <span className="text-small">Not available</span>

  if (latest.provider !== 'cod') return <StatusBadge status={latest.status} />

  const amount = formatPrice(latest.amount)
  let badge
  let note
  if (latest.status === 'refunded') {
    badge = <StatusBadge status="refunded" />
    note = `${amount} refunded`
  } else if (latest.status === 'paid') {
    badge = <StatusBadge status="paid" />
    note = [
      `${amount} received`,
      latest.paidAt ? formatDate(latest.paidAt) : null,
      latest.collectionMethod ? METHOD_LABEL[latest.collectionMethod] : null,
    ]
      .filter(Boolean)
      .join(' · ')
  } else if (order.status === 'cancelled' || order.status === 'payment_failed') {
    badge = <span className="admin-badge admin-badge--neutral">Not collected</span>
    note = 'Order cancelled'
  } else {
    badge = <span className="admin-badge admin-badge--warning">Unpaid</span>
    note = order.status === 'delivered' ? `${amount} delivered — not received yet` : `Collect ${amount} on delivery`
  }

  return (
    <>
      <span className="admin-badge admin-badge--neutral">COD</span> {badge}
      <br />
      <span className="text-small">{note}</span>
      {latest.status === 'paid' && latest.reference && (
        <>
          <br />
          <span className="text-small">Ref: {latest.reference}</span>
        </>
      )}
    </>
  )
}

/**
 * Real, Supabase-backed order management, fully wired to
 * `orders`/`order_items`/`payments`. Reading, searching, and filtering all
 * run against live data, and the status dropdown / Confirm / Cancel actions
 * below write straight back to `orders.status` under the "Admins can manage
 * orders" RLS policy (part-08b2a-admin-security.sql + the table grants in
 * part-13-orders-grants-fix.sql).
 *
 * If this table has zero rows, that's real: no checkout has completed
 * against this project yet. Run `supabase/part-14-sample-orders-seed.sql`
 * in the Supabase SQL editor to drop in sample rows across every status
 * for testing, or place a real test order from the storefront.
 */
function AdminOrders() {
  const { user, isAdmin } = useAuth()
  const [orders, setOrders] = useState(null) // null = still loading
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [payment, setPayment] = useState('all')
  const [rowError, setRowError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [savedId, setSavedId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null) // order pending a cancel confirmation
  const [shipmentTarget, setShipmentTarget] = useState(null) // order pending shipment tracking details
  const [payTarget, setPayTarget] = useState(null) // { order, mode: 'pay' | 'deliver' } pending payment details
  const [unpayTarget, setUnpayTarget] = useState(null) // order pending an "undo payment" confirmation

  // Only fires when `getOrders()` resolves with zero rows and no error —
  // i.e. the exact ambiguous case that prompted this page: is the table
  // really empty, or is something (a stray filter, an RLS mismatch between
  // the joined tables and `orders` itself) silently narrowing it? A plain,
  // no-join, count-only query is the simplest possible thing that can
  // still disagree with `getOrders()`, so if it comes back with a
  // different (higher) number, that tells you the join is the problem,
  // not the base table.
  const [rawCount, setRawCount] = useState(null) // null = not checked; number | 'error'

  function refresh() {
    return getOrders()
      .then((data) => {
        setOrders(data)
        setError(null)
      })
      .catch((err) => {
        setError(err.message)
        setOrders((prev) => prev ?? [])
      })
  }

  useEffect(() => {
    let cancelled = false
    getOrders()
      .then((data) => {
        if (cancelled) return
        setOrders(data)
        setError(null)
        if (data.length === 0) {
          // Empty, but no error — could genuinely be zero rows, or the
          // `order_items(*)`/`payments(*)` embed silently narrowing an
          // otherwise-visible set of orders. Cross-check with a plain
          // count so the empty state below can say which one it is.
          getOrdersRawCount().then((result) => {
            if (!cancelled) setRawCount(result.error ? 'error' : result.count)
          })
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setOrders([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = orders === null

  const filtered = useMemo(() => {
    if (!orders) return []
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      const matchesStatus = status === 'all' || order.status === status
      const cod = isCodOrder(order)
      const matchesPayment =
        payment === 'all' ||
        (payment === 'cod' ? cod : payment === 'cod_unpaid' ? isCodUnpaid(order) : !cod)
      const matchesSearch =
        !term ||
        order.id.toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.customerEmail || '').toLowerCase().includes(term) ||
        (order.shippingAddress?.phone || '').replace(/\s/g, '').includes(term.replace(/\s/g, ''))
      return matchesStatus && matchesPayment && matchesSearch
    })
  }, [orders, search, status, payment])

  // Money the store is still waiting for on COD orders — the "did I collect
  // that?" list. `deliveredUnpaid` is the urgent slice: the customer already
  // has the product but no payment has been recorded.
  const codSummary = useMemo(() => {
    const unpaid = (orders || []).filter(isCodUnpaid)
    const deliveredUnpaid = unpaid.filter((o) => o.status === 'delivered')
    const sum = (list) => list.reduce((t, o) => t + (getCodPayment(o)?.amount || 0), 0)
    return {
      unpaidCount: unpaid.length,
      unpaidAmount: sum(unpaid),
      deliveredUnpaidCount: deliveredUnpaid.length,
      deliveredUnpaidAmount: sum(deliveredUnpaid),
    }
  }, [orders])

  async function applyStatus(orderId, nextStatus, tracking) {
    setRowError(null)
    setSavingId(orderId)
    try {
      const updated = await updateOrderStatus(orderId, nextStatus, tracking)
      setOrders((prev) => (prev ? prev.map((o) => (o.id === orderId ? updated : o)) : prev))
      setSavedId(orderId)
      window.setTimeout(() => setSavedId((prev) => (prev === orderId ? null : prev)), 1500)
      return true
    } catch (err) {
      setRowError(err.message)
      // Data may have changed under us (e.g. permission actually denied) — resync with the server.
      await refresh()
      return false
    } finally {
      setSavingId(null)
    }
  }

  function handleDropdownChange(order, nextStatus) {
    if (nextStatus === order.status) return
    if (nextStatus === 'cancelled') {
      setCancelTarget(order)
      return
    }
    if (nextStatus === 'shipped') {
      setShipmentTarget(order)
      return
    }
    // COD + delivered: ask whether the cash came in too, instead of silently
    // leaving the order looking "done" while the money is still outstanding.
    if (nextStatus === 'delivered' && isCodUnpaid(order)) {
      setPayTarget({ order, mode: 'deliver' })
      return
    }
    applyStatus(order.id, nextStatus)
  }

  function confirmCancel() {
    if (!cancelTarget) return
    applyStatus(cancelTarget.id, 'cancelled')
    setCancelTarget(null)
  }

  // Fired both when moving an order to "shipped" for the first time, and
  // when an admin reopens the dialog later to fix a typo'd courier/id/link
  // on an order that's already shipped (status doesn't change either way).
  async function confirmShipment(tracking) {
    if (!shipmentTarget) return
    const ok = await applyStatus(shipmentTarget.id, 'shipped', tracking)
    if (ok) setShipmentTarget(null)
  }

  // Records (or undoes) the COD payment. In "deliver" mode the order is first
  // moved to delivered, then the payment is recorded — two writes, each atomic;
  // if the second fails the order is still correctly delivered and the row
  // simply keeps its "Mark paid" button.
  async function applyPayment(order, paid, details, alsoDeliver = false) {
    setRowError(null)
    setSavingId(order.id)
    try {
      if (alsoDeliver && order.status !== 'delivered') {
        const delivered = await updateOrderStatus(order.id, 'delivered')
        setOrders((prev) => (prev ? prev.map((o) => (o.id === order.id ? delivered : o)) : prev))
      }
      const updated = await setCodPaymentStatus(order.id, paid, details)
      setOrders((prev) => (prev ? prev.map((o) => (o.id === order.id ? updated : o)) : prev))
      setSavedId(order.id)
      window.setTimeout(() => setSavedId((prev) => (prev === order.id ? null : prev)), 1500)
      return true
    } catch (err) {
      setRowError(err.message)
      await refresh()
      return false
    } finally {
      setSavingId(null)
    }
  }

  async function confirmPay(details) {
    if (!payTarget) return
    const ok = await applyPayment(payTarget.order, true, details, payTarget.mode === 'deliver')
    if (ok) setPayTarget(null)
  }

  async function deliverWithoutPayment() {
    if (!payTarget) return
    const order = payTarget.order
    setPayTarget(null)
    await applyStatus(order.id, 'delivered')
  }

  async function confirmUnpay() {
    if (!unpayTarget) return
    const order = unpayTarget
    setUnpayTarget(null)
    await applyPayment(order, false)
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Orders</h1>
          <p className="text-small">
            Connected live to Supabase. Orders appear here as soon as a customer starts checkout — if the list
            is empty, no order has been placed against this project yet.
          </p>
          <p className="text-small">
            Signed in as {user?.email || 'unknown'} · admin check: {isAdmin === true ? 'confirmed admin' : isAdmin === false ? 'NOT admin — this is why the list is empty' : 'still checking…'}
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          className="input admin-toolbar__search"
          placeholder="Search by order ID, customer name, email, or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search orders"
        />
        <div className="admin-filter-row" role="group" aria-label="Filter orders by status">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={'admin-filter-chip' + (status === f.key ? ' admin-filter-chip--active' : '')}
              onClick={() => setStatus(f.key)}
              aria-pressed={status === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="admin-filter-row" role="group" aria-label="Filter orders by payment method">
          {PAYMENT_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={'admin-filter-chip' + (payment === f.key ? ' admin-filter-chip--active' : '')}
              onClick={() => setPayment(f.key)}
              aria-pressed={payment === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {codSummary.unpaidCount > 0 && (
        <div className="admin-cod-banner" role="status">
          <span>
            <strong>{codSummary.unpaidCount}</strong> COD {codSummary.unpaidCount === 1 ? 'order' : 'orders'} unpaid ·{' '}
            <strong>{formatPrice(codSummary.unpaidAmount)}</strong> to collect
            {codSummary.deliveredUnpaidCount > 0 && (
              <>
                {' '}— <strong>{codSummary.deliveredUnpaidCount}</strong> already delivered (
                {formatPrice(codSummary.deliveredUnpaidAmount)})
              </>
            )}
          </span>
          <button
            type="button"
            className="btn btn-secondary admin-order-actions__btn"
            onClick={() => {
              setPayment('cod_unpaid')
              setStatus('all')
            }}
          >
            Show unpaid
          </button>
        </div>
      )}

      {error && (
        <p className="admin-form__summary" role="alert">
          {error}
        </p>
      )}
      {rowError && (
        <p className="admin-form__summary" role="alert">
          {rowError}
        </p>
      )}

      {loading ? (
        <p className="text-small">Loading orders…</p>
      ) : filtered.length === 0 ? (
        <div className="admin-empty-state">
          <p className="text-lead">{orders.length === 0 ? 'No orders yet.' : 'No orders match this view.'}</p>
          <p className="text-small">
            {orders.length === 0
              ? rawCount === 'error'
                ? "Couldn't even get a plain row count — check the error banner above for the exact reason."
                : typeof rawCount === 'number' && rawCount > 0
                  ? `Odd: a plain count says ${rawCount} order row(s) actually exist, but the full query returned none — that points at the order_items/payments join, not the orders table itself. Run supabase/part-15-orders-diagnostic-and-fix.sql and check its B3 result for order_items/payments policies.`
                  : isAdmin === false
                    ? "Your account isn't flagged as admin in profiles.role, so the RLS policy correctly shows you nothing. Promote your account per supabase/SETUP.md §11, then sign out and back in."
                    : "This project's orders table has no rows yet — place a test checkout, or run supabase/part-14-sample-orders-seed.sql in the Supabase SQL editor, to see them here. If you're sure rows exist, run supabase/part-15-orders-diagnostic-and-fix.sql to check grants/policies/admin status directly."
              : 'Try a different search term or status filter.'}
          </p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Order #</th>
                <th scope="col">Customer</th>
                <th scope="col">Date</th>
                <th scope="col">Items</th>
                <th scope="col">Total</th>
                <th scope="col">Payment</th>
                <th scope="col">Status</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => {
                const locked = LOCKED_STATUSES.includes(order.status)
                const isSaving = savingId === order.id
                return (
                  <tr key={order.id}>
                    <td>#{order.id.slice(0, 8).toUpperCase()}</td>
                    <td>
                      {order.customerName || 'Guest'}
                      {order.customerEmail && (
                        <>
                          <br />
                          <span className="text-small">{order.customerEmail}</span>
                        </>
                      )}
                      {order.shippingAddress?.phone && (
                        <>
                          <br />
                          <span className="text-small">{order.shippingAddress.phone}</span>
                        </>
                      )}
                      {order.shippingAddress?.addressLine1 && (
                        <>
                          <br />
                          <span className="text-small">
                            {[
                              order.shippingAddress.addressLine1,
                              order.shippingAddress.addressLine2,
                              order.shippingAddress.city,
                              order.shippingAddress.state,
                              order.shippingAddress.postalCode,
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </>
                      )}
                    </td>
                    <td>{formatDate(order.createdAt)}</td>
                    <td>
                      {order.items.length === 0
                        ? '—'
                        : order.items.map((item) => (
                            <div key={item.id} className="admin-order-item text-small">
                              <OrderItemThumb src={item.imageUrl} alt={item.productName} />
                              <span>
                                {item.quantity}× {item.productName}
                                {item.size ? ` (${item.size})` : ''}
                              </span>
                            </div>
                          ))}
                    </td>
                    <td>
                      {order.total !== null ? formatPrice(order.total) : `${formatPrice(order.subtotal)} (subtotal)`}
                      {order.deliveryMethod === 'express' && (
                        <>
                          <br />
                          <span className="text-small">Express delivery</span>
                        </>
                      )}
                    </td>
                    <td>
                      <PaymentCell order={order} />
                    </td>
                    <td>
                      <StatusBadge status={order.status} />
                      {order.status === 'shipped' && (order.trackingCourier || order.trackingId || order.trackingUrl) && (
                        <button
                          type="button"
                          className="admin-order-tracking"
                          onClick={() => setShipmentTarget(order)}
                        >
                          {[order.trackingCourier, order.trackingId].filter(Boolean).join(' · ') || 'Tracking link set'}
                          {' '}— edit
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="admin-order-actions">
                        {isCodUnpaid(order) && (
                          <button
                            type="button"
                            className="btn btn-primary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => setPayTarget({ order, mode: 'pay' })}
                          >
                            Mark paid
                          </button>
                        )}
                        {getCodPayment(order)?.status === 'paid' && order.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="admin-order-tracking"
                            disabled={isSaving}
                            onClick={() => setUnpayTarget(order)}
                          >
                            Undo payment
                          </button>
                        )}
                        {order.status === 'pending' && (
                          <button
                            type="button"
                            className="btn btn-secondary admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => applyStatus(order.id, 'confirmed')}
                          >
                            Confirm
                          </button>
                        )}
                        <select
                          className="input admin-table__input admin-order-actions__select"
                          value={order.status}
                          disabled={isSaving || locked}
                          onChange={(e) => handleDropdownChange(order, e.target.value)}
                          aria-label={`Change status for order #${order.id.slice(0, 8).toUpperCase()}`}
                        >
                          {(ASSIGNABLE_STATUSES.includes(order.status)
                            ? ASSIGNABLE_STATUSES
                            : [order.status, ...ASSIGNABLE_STATUSES]
                          ).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_FILTERS.find((f) => f.key === s)?.label || s}
                            </option>
                          ))}
                        </select>
                        {!locked && order.status !== 'cancelled' && (
                          <button
                            type="button"
                            className="btn admin-btn-danger admin-order-actions__btn"
                            disabled={isSaving}
                            onClick={() => setCancelTarget(order)}
                          >
                            Cancel
                          </button>
                        )}
                        {isSaving && <span className="text-small">Saving…</span>}
                        {savedId === order.id && !isSaving && <span className="text-small">Saved</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancel this order?"
        description={
          cancelTarget
            ? `Order #${cancelTarget.id.slice(0, 8).toUpperCase()} for ${
                cancelTarget.customerName || cancelTarget.customerEmail || 'this customer'
              } will be marked cancelled and any stock it was holding goes back into inventory. Cancelled orders can't be reopened.${
                getCodPayment(cancelTarget)?.status === 'paid'
                  ? ' Heads up: this order is marked as PAID — remember to refund the customer yourself.'
                  : ''
              }`
            : ''
        }
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        destructive
        onConfirm={confirmCancel}
        onCancel={() => setCancelTarget(null)}
      />

      <MarkPaidDialog
        open={Boolean(payTarget)}
        mode={payTarget?.mode}
        order={payTarget?.order ?? null}
        saving={Boolean(payTarget) && savingId === payTarget.order.id}
        onConfirm={confirmPay}
        onDeliverOnly={deliverWithoutPayment}
        onCancel={() => setPayTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(unpayTarget)}
        title="Undo this payment?"
        description={
          unpayTarget
            ? `Order #${unpayTarget.id.slice(0, 8).toUpperCase()} goes back to Unpaid, and the customer will see the amount as due again. Only do this if you marked it paid by mistake.`
            : ''
        }
        confirmLabel="Mark unpaid"
        cancelLabel="Keep paid"
        onConfirm={confirmUnpay}
        onCancel={() => setUnpayTarget(null)}
      />

      <ShipmentDialog
        open={Boolean(shipmentTarget)}
        order={shipmentTarget}
        saving={Boolean(shipmentTarget) && savingId === shipmentTarget.id}
        onConfirm={confirmShipment}
        onCancel={() => setShipmentTarget(null)}
      />
    </div>
  )
}

export default AdminOrders

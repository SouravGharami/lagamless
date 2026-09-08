import { useEffect, useMemo, useState } from 'react'
import { getOrders } from '../../services/adminOrders.js'
import { formatPrice } from '../../lib/formatPrice.js'
import StatusBadge from '../components/StatusBadge.jsx'

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
]

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Payment status is derived from the (currently unused, Part 09) `payments` table. */
function PaymentCell({ order }) {
  const latest = order.payments[order.payments.length - 1]
  if (!latest) return <span className="text-small">Not available</span>
  return <StatusBadge status={latest.status} />
}

/**
 * Real, Supabase-backed order management. There is no checkout write path
 * yet (Part 09), so an empty list here is expected and correct — this
 * page never fabricates sample rows to look busier than the data actually
 * is. It IS fully wired to `orders`/`order_items`/`payments`, ready for
 * real rows the moment checkout starts creating them.
 */
function AdminOrders() {
  const [orders, setOrders] = useState(null) // null = still loading
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')

  useEffect(() => {
    let cancelled = false
    getOrders()
      .then((data) => {
        if (!cancelled) {
          setOrders(data)
          setError(null)
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
      const matchesSearch =
        !term ||
        order.id.toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.customerEmail || '').toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [orders, search, status])

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Orders</h1>
          <p className="text-small">
            Connected live to Supabase. Checkout does not create real orders yet, so an empty list is expected
            until that lands in a later part.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          className="input admin-toolbar__search"
          placeholder="Search by order ID, customer name, or email"
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
      </div>

      {error && (
        <p className="admin-form__summary" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-small">Loading orders…</p>
      ) : filtered.length === 0 ? (
        <div className="admin-empty-state">
          <p className="text-lead">{orders.length === 0 ? 'No orders yet.' : 'No orders match this view.'}</p>
          <p className="text-small">
            {orders.length === 0
              ? 'Real orders will appear here once checkout is connected to order creation in a later part.'
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
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
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
                  </td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>
                    {order.items.length === 0
                      ? '—'
                      : order.items.map((item) => (
                          <div key={item.id} className="text-small">
                            {item.quantity}× {item.productName}
                            {item.size ? ` (${item.size})` : ''}
                          </div>
                        ))}
                  </td>
                  <td>
                    {order.total !== null ? formatPrice(order.total) : `${formatPrice(order.subtotal)} (subtotal)`}
                  </td>
                  <td>
                    <PaymentCell order={order} />
                  </td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminOrders

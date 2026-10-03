import { useEffect, useMemo, useState } from 'react'
import { getCustomers } from '../../services/adminCustomers.js'
import { formatPrice } from '../../lib/formatPrice.js'
import StatusBadge from '../components/StatusBadge.jsx'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Real, Supabase-backed customer list, reading `profiles` under the
 * admin-scoped RLS policy added in Part 08B-2A. Email is intentionally
 * never shown here — see `services/adminCustomers.js` for why (it lives
 * in `auth.users`, which this frontend must never query directly).
 */
function AdminCustomers() {
  const [customers, setCustomers] = useState(null) // null = still loading
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    getCustomers()
      .then((data) => {
        if (!cancelled) {
          setCustomers(data)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setCustomers([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = customers === null

  const filtered = useMemo(() => {
    if (!customers) return []
    const term = search.trim().toLowerCase()
    if (!term) return customers
    return customers.filter((c) => (c.fullName || '').toLowerCase().includes(term))
  }, [customers, search])

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Customers</h1>
          <p className="text-small">
            Connected live to Supabase Auth profiles. Email addresses aren't shown here — they live in Supabase
            Auth, not the customer-facing <code>profiles</code> table, and this admin panel never queries
            <code> auth.users</code> directly from the browser.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          className="input admin-toolbar__search"
          placeholder="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search customers"
        />
      </div>

      {error && (
        <p className="admin-form__summary" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-small">Loading customers…</p>
      ) : filtered.length === 0 ? (
        <div className="admin-empty-state">
          <p className="text-lead">{customers.length === 0 ? 'No customers yet.' : 'No customers match this search.'}</p>
          <p className="text-small">
            {customers.length === 0
              ? 'Customer accounts will appear here as people sign up on the storefront.'
              : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Phone</th>
                <th scope="col">Orders</th>
                <th scope="col">Total spent</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.fullName || 'Unnamed customer'}</td>
                  <td>
                    <StatusBadge status={customer.role} />
                  </td>
                  <td>{customer.phone || '—'}</td>
                  <td>{customer.orderCount}</td>
                  <td>{customer.orderCount > 0 ? formatPrice(customer.totalSpent) : '—'}</td>
                  <td>{formatDate(customer.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminCustomers

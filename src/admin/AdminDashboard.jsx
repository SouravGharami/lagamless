import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProducts } from '../services/adminProducts.js'
import { getCustomerCount } from '../services/adminCustomers.js'
import { getOrders } from '../services/adminOrders.js'
import { formatPrice } from '../lib/formatPrice.js'
import { getAvailability } from '../data/products.js'

function AdminDashboard() {
  const [products, setProducts] = useState(null)
  const [productsError, setProductsError] = useState(null)
  const [customerCount, setCustomerCount] = useState(null)
  const [customerCountError, setCustomerCountError] = useState(null)
  const [orders, setOrders] = useState(null)
  const [ordersError, setOrdersError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getProducts()
      .then((data) => {
        if (!cancelled) {
          setProducts(data)
          setProductsError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProductsError(err.message)
          setProducts([])
        }
      })
    getCustomerCount()
      .then((count) => {
        if (!cancelled) {
          setCustomerCount(count)
          setCustomerCountError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCustomerCountError(err.message)
          setCustomerCount(null)
        }
      })
    getOrders()
      .then((data) => {
        if (!cancelled) {
          setOrders(data)
          setOrdersError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setOrdersError(err.message)
          setOrders(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const productsLoading = products === null
  const totalProducts = products?.length ?? 0
  const published = products?.filter((p) => p.status === 'published').length ?? 0
  const lowStock = products?.filter((p) => getAvailability(p) === 'low-stock').length ?? 0
  const outOfStock = products?.filter((p) => getAvailability(p) === 'sold-out').length ?? 0

  // Order figures come straight from the orders/payments rows. "COD to collect"
  // is cash still owed on Cash-on-Delivery orders — every non-cancelled COD
  // order whose payment you haven't marked paid yet, INCLUDING delivered ones
  // still waiting for the money. Revenue counts only payments actually marked
  // paid (for COD: when you click "Mark paid" on the Orders page).
  const ordersLoading = orders === null && !ordersError
  const totalOrders = orders?.length ?? 0
  const pendingOrders = orders?.filter((o) => o.status === 'pending').length ?? 0
  const codToCollect =
    orders
      ?.filter((o) => !['cancelled', 'payment_failed'].includes(o.status))
      .flatMap((o) => o.payments)
      .filter((p) => p.provider === 'cod' && p.status === 'pending')
      .reduce((sum, p) => sum + p.amount, 0) ?? 0
  const revenue =
    orders?.flatMap((o) => o.payments).filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0) ?? 0

  return (
    <div>
      <h1 className="text-h2">Dashboard</h1>
      <p className="text-lead" style={{ marginTop: '1rem' }}>
        Store overview, drawn live from Supabase. Every figure is counted from real orders and payments — nothing is
        estimated.
      </p>

      {productsError && (
        <p className="admin-form__summary" role="alert">
          Product stats: {productsError}
        </p>
      )}
      {ordersError && (
        <p className="admin-form__summary" role="alert">
          Order stats: {ordersError}
        </p>
      )}
      {customerCountError && (
        <p className="admin-form__summary" role="alert">
          Customer count: {customerCountError}
        </p>
      )}

      <div className="admin__stat-grid">
        <div className="card admin__stat">
          <span className="text-label">Total products</span>
          <span className="text-h2">{productsLoading ? '—' : totalProducts}</span>
        </div>
        <div className="card admin__stat">
          <span className="text-label">Published products</span>
          <span className="text-h2">{productsLoading ? '—' : published}</span>
        </div>
        <div className="card admin__stat">
          <span className="text-label">Low-stock products</span>
          <span className="text-h2">{productsLoading ? '—' : lowStock}</span>
        </div>
        <div className="card admin__stat">
          <span className="text-label">Out-of-stock products</span>
          <span className="text-h2">{productsLoading ? '—' : outOfStock}</span>
        </div>
        <div className="card admin__stat">
          <span className="text-label">Total customers</span>
          <span className="text-h2">{customerCount === null ? '—' : customerCount}</span>
        </div>
        <div className="card admin__stat">
          <span className="text-label">Total orders</span>
          <span className="text-h2">{ordersLoading ? '—' : totalOrders}</span>
        </div>
        <div className="card admin__stat">
          <span className="text-label">Pending orders</span>
          <span className="text-h2">{ordersLoading ? '—' : pendingOrders}</span>
        </div>
        <div className="card admin__stat">
          <span className="text-label">COD cash to collect</span>
          <span className="text-h2">{ordersLoading ? '—' : formatPrice(codToCollect)}</span>
        </div>
        <div className="card admin__stat">
          <span className="text-label">Revenue (captured payments)</span>
          <span className="text-h2">{ordersLoading ? '—' : formatPrice(revenue)}</span>
        </div>
      </div>

      <div className="admin-dashboard__links">
        <Link to="/admin/products" className="btn btn-secondary">
          Manage products
        </Link>
        <Link to="/admin/inventory" className="btn btn-secondary">
          Manage inventory
        </Link>
        <Link to="/admin/products/new" className="btn btn-secondary">
          Add a product
        </Link>
      </div>
    </div>
  )
}

export default AdminDashboard

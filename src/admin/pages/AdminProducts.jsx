import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getProducts, deleteProduct, duplicateProduct } from '../../services/adminProducts.js'
import { getAvailability } from '../../data/products.js'
import { getPlacementLabels } from '../../data/collections.js'
import { formatPrice } from '../../lib/formatPrice.js'
import StatusBadge from '../components/StatusBadge.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'featured', label: 'Featured' },
  { key: 'new-arrival', label: 'New arrival' },
  { key: 'low-stock', label: 'Low stock' },
  { key: 'out-of-stock', label: 'Out of stock' },
]

function AdminProducts() {
  const [products, setProducts] = useState(null) // null = still loading
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)

  function refresh() {
    return getProducts()
      .then((data) => {
        setError(null)
        setProducts(data)
      })
      .catch((err) => {
        setError(err.message)
        setProducts([])
      })
  }

  useEffect(() => {
    let cancelled = false
    getProducts()
      .then((data) => {
        if (!cancelled) setProducts(data)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message)
          setProducts([])
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const loading = products === null

  const filtered = useMemo(() => {
    if (!products) return []
    const term = search.trim().toLowerCase()
    return products.filter((p) => {
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        p.productNumber.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term)
      if (!matchesSearch) return false

      const availability = getAvailability(p)
      switch (filter) {
        case 'published':
          return p.status === 'published'
        case 'draft':
          return p.status === 'draft'
        case 'featured':
          return p.isFeatured
        case 'new-arrival':
          return p.isNewArrival
        case 'low-stock':
          return availability === 'low-stock'
        case 'out-of-stock':
          return availability === 'sold-out'
        default:
          return true
      }
    })
  }, [products, search, filter])

  async function handleDuplicate(product) {
    try {
      setError(null)
      await duplicateProduct(product.id)
      setNotice(`Duplicated "${product.name}" as a new draft.`)
      await refresh()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return
    try {
      setError(null)
      await deleteProduct(pendingDelete.id)
      setNotice(`Deleted "${pendingDelete.name}".`)
      setPendingDelete(null)
      await refresh()
    } catch (err) {
      setError(err.message)
      setPendingDelete(null)
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Products</h1>
          <p className="text-small">{filtered.length} of {products?.length ?? 0} products</p>
        </div>
        <Link to="/admin/products/new" className="btn btn-primary">
          Add product
        </Link>
      </div>

      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className="admin-form__summary" role="alert">
          {error}
        </p>
      )}

      <div className="admin-toolbar">
        <input
          type="search"
          className="input admin-toolbar__search"
          placeholder="Search by name, product number, or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
        <div className="admin-filter-row" role="group" aria-label="Filter products">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={'admin-filter-chip' + (filter === f.key ? ' admin-filter-chip--active' : '')}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-small">Loading products…</p>
      ) : filtered.length === 0 ? (
        <div className="admin-empty-state">
          <p className="text-lead">No products match this view.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table admin-products-table">
            <thead>
              <tr>
                <th scope="col">Image</th>
                <th scope="col">Product</th>
                <th scope="col">Price</th>
                <th scope="col">Status</th>
                <th scope="col">Inventory</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const availability = getAvailability(product)
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="admin-products-table__thumb">
                        {product.images?.main?.src ? (
                          <img src={product.images.main.src} alt={product.images.main.alt} />
                        ) : (
                          <span className="text-label">No image</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="admin-products-table__name">{product.name}</div>
                      <div className="text-small">
                        {product.productNumber} · {product.sku}
                      </div>
                      {/* Where this product is tagged to appear — see "Where this product appears" in the form. */}
                      <div className="text-small admin-products-table__placement">
                        {getPlacementLabels(product).join(', ') || 'Not tagged — only in All T-Shirts'}
                      </div>
                    </td>
                    <td>{formatPrice(product.price)}</td>
                    <td>
                      <div className="admin-products-table__badges">
                        <StatusBadge status={product.status} />
                        <StatusBadge status={availability} />
                      </div>
                    </td>
                    <td>{product.variants.reduce((sum, v) => sum + v.stock, 0)} units</td>
                    <td>
                      <div className="admin-row-actions">
                        <Link to={`/admin/products/${product.id}/edit`} className="btn-ghost admin-row-actions__btn">
                          Edit
                        </Link>
                        <Link to={`/product/${product.slug}`} className="btn-ghost admin-row-actions__btn" target="_blank" rel="noreferrer">
                          View
                        </Link>
                        <button
                          type="button"
                          className="btn-ghost admin-row-actions__btn"
                          onClick={() => handleDuplicate(product)}
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          className="btn-ghost admin-row-actions__btn admin-row-actions__btn--danger"
                          onClick={() => setPendingDelete(product)}
                        >
                          Delete
                        </button>
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
        open={!!pendingDelete}
        title="Delete product?"
        description={`This will permanently remove "${pendingDelete?.name}" from the catalog. This action cannot be easily undone.`}
        confirmLabel="Delete product"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

export default AdminProducts

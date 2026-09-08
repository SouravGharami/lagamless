import { useEffect, useMemo, useState } from 'react'
import { getProducts, updateInventory } from '../../services/adminProducts.js'
import { getSizeAvailability } from '../../data/products.js'
import StatusBadge from '../components/StatusBadge.jsx'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in-stock', label: 'In stock' },
  { key: 'low-stock', label: 'Low stock' },
  { key: 'sold-out', label: 'Out of stock' },
]

function AdminInventory() {
  const [products, setProducts] = useState(null) // null = still loading
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [savedRowKey, setSavedRowKey] = useState(null)
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

  const rows = useMemo(() => {
    if (!products) return []
    const term = search.trim().toLowerCase()
    const list = []
    for (const product of products) {
      for (const variant of product.variants) {
        const matchesSearch =
          !term ||
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term)
        const status = getSizeAvailability(product, variant.size)
        const matchesFilter = filter === 'all' || status === filter
        if (matchesSearch && matchesFilter) {
          list.push({ product, variant, status })
        }
      }
    }
    return list
  }, [products, search, filter])

  async function handleStockChange(productId, size, value) {
    const stock = Math.max(0, Number(value) || 0)
    try {
      setError(null)
      await updateInventory(productId, size, stock)
      await refresh()
      setSavedRowKey(`${productId}-${size}`)
      window.setTimeout(() => setSavedRowKey(null), 1500)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Inventory</h1>
          <p className="text-small">
            Stock updates here write directly to the same catalog the storefront reads from.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          type="search"
          className="input admin-toolbar__search"
          placeholder="Search by product name or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search inventory"
        />
        <div className="admin-filter-row" role="group" aria-label="Filter inventory">
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

      {error && (
        <p className="admin-form__summary" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-small">Loading inventory…</p>
      ) : rows.length === 0 ? (
        <div className="admin-empty-state">
          <p className="text-lead">No inventory rows match this view.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">SKU</th>
                <th scope="col">Size</th>
                <th scope="col">Status</th>
                <th scope="col">Available quantity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ product, variant, status }) => {
                const rowKey = `${product.id}-${variant.size}`
                return (
                  <tr key={rowKey}>
                    <td>{product.name}</td>
                    <td>{product.sku}</td>
                    <td>{variant.size}</td>
                    <td>
                      <StatusBadge status={status} />
                    </td>
                    <td>
                      <div className="admin-inventory__qty">
                        <input
                          type="number"
                          min="0"
                          className="input admin-table__input"
                          defaultValue={variant.stock}
                          aria-label={`Stock for ${product.name}, size ${variant.size}`}
                          onBlur={(e) => handleStockChange(product.id, variant.size, e.target.value)}
                        />
                        {savedRowKey === rowKey && <span className="text-small">Saved</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminInventory

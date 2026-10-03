import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import ProductForm from '../components/ProductForm.jsx'
import { getProduct, updateProduct } from '../../services/adminProducts.js'

function AdminProductEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(undefined) // undefined = loading, null = not found
  const [serverError, setServerError] = useState(null)
  const [loadError, setLoadError] = useState(null)

  useEffect(() => {
    let active = true
    getProduct(id)
      .then((result) => {
        if (active) setProduct(result ?? null)
      })
      .catch((err) => {
        if (active) {
          setLoadError(err.message)
          setProduct(null)
        }
      })
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(data) {
    try {
      setServerError(null)
      await updateProduct(id, data)
      navigate('/admin/products')
    } catch (error) {
      setServerError(error.message)
    }
  }

  if (product === undefined) {
    return <p className="text-small">Loading product…</p>
  }

  if (product === null) {
    return (
      <div className="admin-empty-state">
        <p className="text-lead">{loadError || 'Product not found.'}</p>
        <Link to="/admin/products" className="btn btn-secondary">
          Back to products
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Edit product</h1>
          <p className="text-small">{product.productNumber} · {product.sku}</p>
        </div>
      </div>
      <ProductForm
        key={product.id}
        initialProduct={product}
        onSubmit={handleSubmit}
        submitLabel="Save changes"
        serverError={serverError}
      />
    </div>
  )
}

export default AdminProductEdit

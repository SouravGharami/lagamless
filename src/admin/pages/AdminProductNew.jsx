import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ProductForm from '../components/ProductForm.jsx'
import { createProduct } from '../../services/adminProducts.js'

function AdminProductNew() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState(null)

  async function handleSubmit(data) {
    try {
      setServerError(null)
      await createProduct(data)
      navigate('/admin/products')
    } catch (error) {
      setServerError(error.message)
    }
  }

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="text-h2">Add product</h1>
          <p className="text-small">Saved directly to Supabase — products, sizes/stock, and images all persist immediately.</p>
        </div>
      </div>
      <ProductForm onSubmit={handleSubmit} submitLabel="Create product" serverError={serverError} />
    </div>
  )
}

export default AdminProductNew

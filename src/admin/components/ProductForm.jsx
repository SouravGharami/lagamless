import { useMemo, useState } from 'react'
import {
  validateProductForm,
  SIZE_OPTIONS,
  emptyMeasurement,
  IMAGE_SLOTS,
} from '../lib/productFormValidation.js'
import { getCategories } from '../../data/products.js'
import ImageSlotManager from './ImageSlotManager.jsx'
import Field from './Field.jsx'

function emptyImages() {
  return Object.fromEntries(
    IMAGE_SLOTS.map(({ key, label }) => [
      key,
      { src: null, alt: `Product ${label.toLowerCase()} image`, id: null, storagePath: null, pendingFile: null, removed: false },
    ]),
  )
}

/** Converts a stored Product into this form's flat, string-friendly shape. */
function productToFormState(product) {
  if (!product) {
    return {
      name: '',
      productNumber: '',
      sku: '',
      slug: '',
      category: '',
      tags: '',
      price: '',
      compareAtPrice: '',
      description: '',
      story: '',
      fabric: '',
      gsm: '',
      fit: '',
      care: '',
      construction: '',
      design: '',
      stylingNote: '',
      sizes: [],
      variants: [],
      measurements: {},
      images: emptyImages(),
      status: 'draft',
      isFeatured: false,
      isNewArrival: false,
    }
  }
  return {
    name: product.name,
    productNumber: product.productNumber,
    sku: product.sku,
    slug: product.slug,
    category: product.category,
    tags: (product.tags || []).join(', '),
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? '',
    description: product.description,
    story: product.story || '',
    fabric: product.fabric || '',
    gsm: product.gsm ?? '',
    fit: product.fit || '',
    care: product.care || '',
    construction: product.construction || '',
    design: product.design || '',
    stylingNote: product.stylingNote || '',
    sizes: [...(product.sizes || [])],
    variants: (product.variants || []).map((v) => ({ ...v })),
    measurements: Object.fromEntries(
      Object.entries(product.measurements || {}).map(([size, m]) => [size, { ...m }]),
    ),
    images: product.images
      ? Object.fromEntries(
          Object.entries(product.images).map(([slot, img]) => [
            slot,
            {
              src: img.src ?? null,
              alt: img.alt ?? '',
              id: img.id ?? null,
              storagePath: img.storagePath ?? null,
              pendingFile: null,
              removed: false,
            },
          ]),
        )
      : emptyImages(),
    status: product.status,
    isFeatured: !!product.isFeatured,
    isNewArrival: !!product.isNewArrival,
  }
}

/** Converts this form's state back into the Product shape the catalog expects. */
function formStateToProduct(form) {
  return {
    name: form.name.trim(),
    productNumber: form.productNumber.trim(),
    sku: form.sku.trim(),
    slug: form.slug.trim(),
    category: form.category.trim(),
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    price: Number(form.price),
    compareAtPrice: form.compareAtPrice === '' ? null : Number(form.compareAtPrice),
    description: form.description.trim(),
    story: form.story.trim(),
    fabric: form.fabric.trim(),
    gsm: form.gsm === '' ? 0 : Number(form.gsm),
    fit: form.fit.trim(),
    care: form.care.trim(),
    construction: form.construction.trim(),
    design: form.design.trim(),
    stylingNote: form.stylingNote.trim(),
    sizes: form.sizes,
    variants: form.variants.map((v) => ({ size: v.size, stock: Number(v.stock) || 0 })),
    measurements: form.measurements,
    images: form.images,
    status: form.status,
    isFeatured: form.isFeatured,
    isNewArrival: form.isNewArrival,
  }
}

/**
 * @param {object} props
 * @param {import('../../data/products.js').Product} [props.initialProduct] - present when editing
 * @param {(product: object) => Promise<void>} props.onSubmit
 * @param {string} props.submitLabel
 * @param {string | null} [props.serverError] - error from the last submit attempt (e.g. duplicate SKU)
 */
function ProductForm({ initialProduct, onSubmit, submitLabel, serverError }) {
  const [form, setForm] = useState(() => productToFormState(initialProduct))
  const [touched, setTouched] = useState({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const categoryOptions = useMemo(() => getCategories(), [])

  const { errors } = useMemo(() => validateProductForm(form), [form])

  function showError(field) {
    return (touched[field] || submitAttempted) && errors[field]
  }

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function markTouched(field) {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  function toggleSize(size) {
    setForm((prev) => {
      const has = prev.sizes.includes(size)
      const sizes = has ? prev.sizes.filter((s) => s !== size) : [...prev.sizes, size]
      const variants = has
        ? prev.variants.filter((v) => v.size !== size)
        : [...prev.variants, { size, stock: 0 }]
      const measurements = { ...prev.measurements }
      if (has) {
        delete measurements[size]
      } else {
        measurements[size] = emptyMeasurement()
      }
      return { ...prev, sizes, variants, measurements }
    })
  }

  function updateVariantStock(size, stock) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v) => (v.size === size ? { ...v, stock } : v)),
    }))
  }

  function updateMeasurement(size, field, value) {
    setForm((prev) => ({
      ...prev,
      measurements: {
        ...prev.measurements,
        [size]: { ...prev.measurements[size], [field]: value },
      },
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitAttempted(true)
    const { valid } = validateProductForm(form)
    if (!valid) return

    setSubmitting(true)
    try {
      await onSubmit(formStateToProduct(form))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit} noValidate>
      {submitAttempted && Object.keys(errors).length > 0 && (
        <p className="admin-form__summary" role="alert">
          Please fix the highlighted fields before saving.
        </p>
      )}
      {serverError && (
        <p className="admin-form__summary" role="alert">
          {serverError}
        </p>
      )}

      <fieldset className="admin-form__section">
        <legend className="text-h3">Basic information</legend>
        <div className="admin-form__grid">
          <Field label="Product name" required error={showError('name')} onBlur={() => markTouched('name')}>
            <input
              className="input"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
            />
          </Field>
          <Field
            label="Product number"
            required
            error={showError('productNumber')}
            onBlur={() => markTouched('productNumber')}
          >
            <input
              className="input"
              placeholder="LAGAMLESS 007"
              value={form.productNumber}
              onChange={(e) => update('productNumber', e.target.value)}
            />
          </Field>
          <Field label="SKU" required error={showError('sku')} onBlur={() => markTouched('sku')}>
            <input className="input" value={form.sku} onChange={(e) => update('sku', e.target.value)} />
          </Field>
          <Field label="Slug" hint="Leave blank to generate from the name.">
            <input
              className="input"
              placeholder="lagamless-007"
              value={form.slug}
              onChange={(e) => update('slug', e.target.value)}
            />
          </Field>
          <Field
            label="Category"
            required
            error={showError('category')}
            onBlur={() => markTouched('category')}
          >
            <input
              className="input"
              list="admin-category-options"
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
            />
            <datalist id="admin-category-options">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Tags" hint="Comma-separated.">
            <input className="input" value={form.tags} onChange={(e) => update('tags', e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="admin-form__section">
        <legend className="text-h3">Pricing</legend>
        <div className="admin-form__grid">
          <Field label="Price (₹)" required error={showError('price')} onBlur={() => markTouched('price')}>
            <input
              type="number"
              min="0"
              className="input"
              value={form.price}
              onChange={(e) => update('price', e.target.value)}
            />
          </Field>
          <Field
            label="Compare-at price (₹)"
            hint="Optional. Shown struck through when higher than price."
            error={showError('compareAtPrice')}
            onBlur={() => markTouched('compareAtPrice')}
          >
            <input
              type="number"
              min="0"
              className="input"
              value={form.compareAtPrice}
              onChange={(e) => update('compareAtPrice', e.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="admin-form__section">
        <legend className="text-h3">Product content</legend>
        <Field
          label="Description"
          required
          error={showError('description')}
          onBlur={() => markTouched('description')}
        >
          <textarea
            className="input admin-form__textarea"
            rows={2}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </Field>
        <Field label="Product story" hint="Longer editorial/brand copy.">
          <textarea
            className="input admin-form__textarea"
            rows={4}
            value={form.story}
            onChange={(e) => update('story', e.target.value)}
          />
        </Field>
      </fieldset>

      <fieldset className="admin-form__section">
        <legend className="text-h3">Product details</legend>
        <div className="admin-form__grid">
          <Field label="Fabric">
            <input className="input" value={form.fabric} onChange={(e) => update('fabric', e.target.value)} />
          </Field>
          <Field label="GSM" error={showError('gsm')} onBlur={() => markTouched('gsm')}>
            <input
              type="number"
              min="0"
              className="input"
              value={form.gsm}
              onChange={(e) => update('gsm', e.target.value)}
            />
          </Field>
          <Field label="Fit">
            <input
              className="input"
              list="admin-fit-options"
              value={form.fit}
              onChange={(e) => update('fit', e.target.value)}
            />
            <datalist id="admin-fit-options">
              <option value="Oversized" />
              <option value="Boxy" />
              <option value="Relaxed" />
              <option value="Tapered" />
            </datalist>
          </Field>
          <Field label="Care">
            <input className="input" value={form.care} onChange={(e) => update('care', e.target.value)} />
          </Field>
          <Field label="Construction">
            <input
              className="input"
              value={form.construction}
              onChange={(e) => update('construction', e.target.value)}
            />
          </Field>
          <Field label="Design note">
            <input className="input" value={form.design} onChange={(e) => update('design', e.target.value)} />
          </Field>
          <Field label="Styling note">
            <input
              className="input"
              value={form.stylingNote}
              onChange={(e) => update('stylingNote', e.target.value)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="admin-form__section">
        <legend className="text-h3">Sizes, measurements &amp; inventory</legend>
        {showError('sizes') && (
          <p className="admin-field__error" role="alert">
            {errors.sizes}
          </p>
        )}
        <div className="admin-size-toggles" role="group" aria-label="Available sizes">
          {SIZE_OPTIONS.map((size) => (
            <label key={size} className="admin-size-toggle">
              <input
                type="checkbox"
                checked={form.sizes.includes(size)}
                onChange={() => {
                  toggleSize(size)
                  markTouched('sizes')
                }}
              />
              {size}
            </label>
          ))}
        </div>

        {form.sizes.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Chest (in)</th>
                  <th scope="col">Length (in)</th>
                  <th scope="col">Shoulder (in)</th>
                </tr>
              </thead>
              <tbody>
                {form.sizes.map((size) => {
                  const variant = form.variants.find((v) => v.size === size) || { stock: 0 }
                  const measurement = form.measurements[size] || emptyMeasurement()
                  return (
                    <tr key={size}>
                      <th scope="row">{size}</th>
                      <td>
                        <input
                          type="number"
                          min="0"
                          className="input admin-table__input"
                          aria-label={`Stock for size ${size}`}
                          value={variant.stock}
                          onChange={(e) => updateVariantStock(size, e.target.value)}
                        />
                      </td>
                      {['chest', 'length', 'shoulder'].map((dim) => (
                        <td key={dim}>
                          <input
                            type="number"
                            min="0"
                            className="input admin-table__input"
                            aria-label={`${dim} for size ${size}`}
                            value={measurement[dim]}
                            onChange={(e) => updateMeasurement(size, dim, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>

      <fieldset className="admin-form__section">
        <legend className="text-h3">Images</legend>
        <p className="text-small">
          Choose a file to replace a slot, or mark one for removal — uploads, edits, and deletions are
          sent to Supabase Storage when you save this product below.
        </p>
        <ImageSlotManager images={form.images} onChange={(images) => update('images', images)} />
      </fieldset>

      <fieldset className="admin-form__section">
        <legend className="text-h3">Publishing</legend>
        <div className="admin-publish-toggles">
          <label className="admin-radio">
            <input
              type="radio"
              name="status"
              checked={form.status === 'draft'}
              onChange={() => update('status', 'draft')}
            />
            Draft
          </label>
          <label className="admin-radio">
            <input
              type="radio"
              name="status"
              checked={form.status === 'published'}
              onChange={() => update('status', 'published')}
            />
            Published
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={(e) => update('isFeatured', e.target.checked)}
            />
            Featured
          </label>
          <label className="admin-checkbox">
            <input
              type="checkbox"
              checked={form.isNewArrival}
              onChange={(e) => update('isNewArrival', e.target.checked)}
            />
            New arrival
          </label>
        </div>
      </fieldset>

      <div className="admin-form__actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export default ProductForm

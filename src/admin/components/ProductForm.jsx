import { useEffect, useMemo, useState } from 'react'
import {
  validateProductForm,
  SIZE_OPTIONS,
  emptyMeasurement,
  IMAGE_SLOTS,
} from '../lib/productFormValidation.js'
import { getCategories } from '../../data/products.js'
import { COLLECTIONS, COLLECTION_GROUPS, HOMEPAGE_FEATURED_LIMIT, getPlacementLabels } from '../../data/collections.js'
import ImageSlotManager from './ImageSlotManager.jsx'
import Field from './Field.jsx'
import { resolveColorName, extractDominantColor, nearestColorName } from '../../lib/colorNaming.js'

/** ['A'] -> 'A', ['A', 'B'] -> 'A and B', ['A', 'B', 'C'] -> 'A, B and C' */
function joinWithAnd(items) {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

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
      collections: [],
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
      colors: [],
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
    collections: [...(product.collections || [])],
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
    colors: (product.colors || []).map((c) => ({ name: c.name, hex: c.hex })),
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
    collections: form.collections,
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
    // Only fully-filled rows are kept — a half-filled row (e.g. a name
    // typed but no hex chosen yet) is dropped rather than saved, since
    // validateProductForm blocks submit on it anyway; this is just a
    // defensive second guard.
    colors: (form.colors || [])
      .map((c) => ({ name: c.name.trim(), hex: c.hex }))
      .filter((c) => c.name && /^#[0-9a-f]{6}$/i.test(c.hex || '')),
    status: form.status,
    isFeatured: form.isFeatured,
    isNewArrival: form.isNewArrival,
  }
}

/**
 * @param {object} props
 * @param {import('../../data/products.js').Product} [props.initialProduct] - present when editing
 * @param {object} [props.initialFormState] - present when restoring a saved draft (new-product
 *   flow only). Already in this form's flat shape (see `productToFormState`) — takes precedence
 *   over `initialProduct` so a restored draft is never clobbered by the empty default. Only read
 *   once, on mount (lazy `useState` initializer) — same as `initialProduct` always was.
 * @param {(form: object) => void} [props.onFormChange] - fired whenever `form` changes (including
 *   the very first render), so a parent (e.g. `AdminProductNew`) can autosave a draft. Optional —
 *   `AdminProductEdit` doesn't pass this, since edit-in-progress state is intentionally not drafted.
 * @param {(product: object) => Promise<void>} props.onSubmit
 * @param {string} props.submitLabel
 * @param {string | null} [props.serverError] - error from the last submit attempt (e.g. duplicate SKU)
 */
function ProductForm({ initialProduct, initialFormState, onFormChange, onSubmit, submitLabel, serverError }) {
  const [form, setForm] = useState(() =>
    // A restored draft saved before "store placement" existed has no
    // `collections`; layering it over the blank default keeps it valid.
    initialFormState ? { ...productToFormState(null), ...initialFormState } : productToFormState(initialProduct),
  )

  // Lets a parent mirror form state into a draft (or anywhere else)
  // without ProductForm knowing anything about localStorage/drafts
  // itself — it just reports every change. `onFormChange` is expected to
  // be a stable callback (see AdminProductNew's use of
  // `createDraftAutosaver`); if it isn't, this still only re-runs when
  // `form` itself changes, never in a loop.
  useEffect(() => {
    onFormChange?.(form)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])
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

  // ---- Store placement -----------------------------------------------------
  // "New Arrivals" is backed by the existing `isNewArrival` flag; every other
  // category is a slug in `form.collections`. Slugs the form doesn't know
  // about are left untouched.
  function isCollectionOn(collection) {
    return collection.flag ? !!form[collection.flag] : form.collections.includes(collection.slug)
  }

  function toggleCollection(collection) {
    setForm((prev) => {
      if (collection.flag) return { ...prev, [collection.flag]: !prev[collection.flag] }
      const has = prev.collections.includes(collection.slug)
      const collections = has
        ? prev.collections.filter((slug) => slug !== collection.slug)
        : [...prev.collections, collection.slug]
      return { ...prev, collections }
    })
  }

  const placementLabels = getPlacementLabels(form)

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

  // ---- Colors (Part 12) -----------------------------------------------------
  // Purely a list of { name, hex } — no per-color photo, no per-color stock.
  // The storefront treats index 0 as "matches the uploaded photos as-is"
  // and recolors those same photos for every other entry (see
  // src/components/product/ProductGallery.jsx), so ordering here matters:
  // put the color the photos were actually shot in first.
  function addColor() {
    setForm((prev) => ({ ...prev, colors: [...prev.colors, { name: '', hex: '#0c0c0b' }] }))
  }

  // Typing a name auto-fills the swatch with whatever color that word
  // actually means (see resolveColorName) — the admin only needs the
  // manual color picker for a shade that doesn't have a name, or to
  // fine-tune a match that's close but not quite right. Editing the swatch
  // by hand always wins over the auto-match, so a manual tweak sticks even
  // if the admin keeps typing in the name field afterwards.
  function updateColor(index, field, value) {
    setForm((prev) => ({
      ...prev,
      colors: prev.colors.map((c, i) => {
        if (i !== index) return c
        if (field === 'name') {
          const matched = !c.hexIsManual ? resolveColorName(value) : null
          return { ...c, name: value, hex: matched ?? c.hex, hexMatched: Boolean(matched) }
        }
        if (field === 'hex') {
          return { ...c, hex: value, hexIsManual: true, hexMatched: false }
        }
        return { ...c, [field]: value }
      }),
    }))
  }

  function removeColor(index) {
    setForm((prev) => ({ ...prev, colors: prev.colors.filter((_, i) => i !== index) }))
  }

  function moveColor(index, direction) {
    setForm((prev) => {
      const next = [...prev.colors]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...prev, colors: next }
    })
  }

  // ---- Identify a color from a photo ----------------------------------
  // Standalone tool below the color list: upload any garment photo, sample
  // its dominant color client-side, and offer to add it as a new color
  // entry (or just read off the hex/name if the admin only wants to know
  // what to type elsewhere). Nothing here is saved until "Add this color"
  // is clicked.
  const [detector, setDetector] = useState(null) // { previewUrl, status, hex, name, error }

  async function handleDetectFile(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // allow re-selecting the same file later
    if (!file) return

    const previewUrl = URL.createObjectURL(file)
    setDetector({ previewUrl, status: 'loading' })
    try {
      const hex = await extractDominantColor(file)
      setDetector({ previewUrl, status: 'done', hex, name: nearestColorName(hex) })
    } catch (err) {
      setDetector({ previewUrl, status: 'error', error: err.message })
    }
  }

  function addDetectedColor() {
    if (!detector || detector.status !== 'done') return
    setForm((prev) => ({
      ...prev,
      colors: [...prev.colors, { name: detector.name, hex: detector.hex }],
    }))
    URL.revokeObjectURL(detector.previewUrl)
    setDetector(null)
  }

  function dismissDetector() {
    if (detector?.previewUrl) URL.revokeObjectURL(detector.previewUrl)
    setDetector(null)
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
            hint="Product type, e.g. Tees. Powers the Filters panel and “related products”."
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
        <legend className="text-h3">Where this product appears</legend>
        <p className="text-small admin-placement__intro">
          Tick every place this product should show up on the store. Nothing is added automatically.
        </p>
        {form.status !== 'published' && (
          <p className="admin-placement__notice text-small" role="note">
            This product is a draft, so it won’t show anywhere yet. Set it to <strong>Published</strong> in the
            Publishing section below.
          </p>
        )}

        <div className="admin-placement__group">
          <div className="admin-placement__heading">
            <h3 className="text-label">Homepage — Featured Tees</h3>
            <p className="text-small">
              The homepage shows the {HOMEPAGE_FEATURED_LIMIT} newest products ticked here.
            </p>
          </div>
          <div className="admin-placement__chips">
            <label className={'admin-tag-toggle' + (form.isFeatured ? ' admin-tag-toggle--on' : '')}>
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => update('isFeatured', e.target.checked)}
              />
              <span aria-hidden="true" className="admin-tag-toggle__mark">
                {form.isFeatured ? '✓' : '+'}
              </span>
              Show in Featured Tees
            </label>
          </div>
        </div>

        {COLLECTION_GROUPS.map((group) => (
          <div className="admin-placement__group" key={group.key}>
            <div className="admin-placement__heading">
              <h3 className="text-label">{group.title}</h3>
              <p className="text-small">{group.hint}</p>
            </div>
            <div className="admin-placement__chips">
              {COLLECTIONS.filter((c) => c.group === group.key).map((collection) => {
                const on = isCollectionOn(collection)
                return (
                  <label
                    key={collection.slug}
                    className={'admin-tag-toggle' + (on ? ' admin-tag-toggle--on' : '')}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggleCollection(collection)} />
                    <span aria-hidden="true" className="admin-tag-toggle__mark">
                      {on ? '✓' : '+'}
                    </span>
                    {collection.label}
                  </label>
                )
              })}
            </div>
          </div>
        ))}

        <p className="admin-placement__summary text-small" aria-live="polite">
          {placementLabels.length > 0 ? (
            <>
              <strong>Will appear in:</strong> {joinWithAnd([...placementLabels, 'All T-Shirts (Shop page)'])}.
            </>
          ) : (
            <>
              <strong>Not tagged yet.</strong> This product will only show under All T-Shirts on the Shop page.
            </>
          )}
        </p>
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
        <legend className="text-h3">Colors</legend>
        <p className="text-small">
          Optional. List every color this product is actually available in — one photo set covers
          all of them. The storefront shows the first color exactly as photographed, and recolors
          those same photos on the fly for every other one (see the shopper-facing color swatches
          on the product page). Leave this empty and the product keeps its old single color, parsed
          from its name.
        </p>

        {form.colors.length > 0 && (
          <div className="admin-color-list">
            {form.colors.map((color, index) => (
              <div className="admin-color-row" key={index}>
                <div className="admin-color-row__swatch-block">
                  <input
                    type="color"
                    className="admin-color-row__swatch"
                    value={/^#[0-9a-f]{6}$/i.test(color.hex) ? color.hex : '#0c0c0b'}
                    onChange={(e) => updateColor(index, 'hex', e.target.value)}
                    aria-label={`Color swatch ${index + 1}`}
                  />
                  <span className="admin-color-row__hexvalue">{color.hex}</span>
                </div>
                <Field
                  label={index === 0 ? 'Color name (as photographed)' : 'Color name'}
                  error={showError(`color-${index}-name`)}
                  onBlur={() => markTouched(`color-${index}-name`)}
                >
                  <input
                    className="input"
                    placeholder="e.g. Stone, Red, #7a2f2f"
                    value={color.name}
                    onChange={(e) => updateColor(index, 'name', e.target.value)}
                  />
                  {color.name.trim() && (
                    <p
                      className={`admin-color-row__match${
                        color.hexMatched ? ' admin-color-row__match--ok' : ''
                      }`}
                    >
                      {color.hexMatched
                        ? 'Matched automatically — adjust the swatch if it\u2019s not quite right.'
                        : color.hexIsManual
                          ? 'Custom swatch — set by hand.'
                          : 'Not a recognized color name — pick the swatch manually.'}
                    </p>
                  )}
                </Field>
                <div className="admin-color-row__actions">
                  <button
                    type="button"
                    className="btn-ghost admin-color-row__btn"
                    onClick={() => moveColor(index, -1)}
                    disabled={index === 0}
                    aria-label="Move color up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn-ghost admin-color-row__btn"
                    onClick={() => moveColor(index, 1)}
                    disabled={index === form.colors.length - 1}
                    aria-label="Move color down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-ghost admin-color-row__btn"
                    onClick={() => removeColor(index)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button type="button" className="btn btn-secondary" onClick={addColor}>
          Add color
        </button>

        <div className="admin-color-detector">
          <h3 className="text-h3">Identify a color from a photo</h3>
          <p className="text-small">
            Upload a photo of the garment and this reads off its dominant color — handy when you
            know the shade but not what to call it, or want a second opinion on a name you typed
            above. It samples the center of the photo, so a clear, centered shot works best.
          </p>

          <label className="admin-color-detector__upload">
            <input type="file" accept="image/*" onChange={handleDetectFile} hidden />
            <span className="btn btn-secondary">Upload a photo</span>
          </label>

          {detector && (
            <div className="admin-color-detector__result">
              <img
                src={detector.previewUrl}
                alt="Uploaded garment for color detection"
                className="admin-color-detector__preview"
              />

              {detector.status === 'loading' && (
                <p className="text-small">Reading the photo…</p>
              )}

              {detector.status === 'error' && (
                <div>
                  <p className="admin-color-row__match">{detector.error}</p>
                  <button type="button" className="btn-ghost admin-color-row__btn" onClick={dismissDetector}>
                    Dismiss
                  </button>
                </div>
              )}

              {detector.status === 'done' && (
                <div className="admin-color-detector__answer">
                  <span
                    className="admin-color-row__swatch admin-color-detector__swatch"
                    style={{ backgroundColor: detector.hex }}
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-small" style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>
                      {detector.name}
                    </p>
                    <p className="admin-color-row__hexvalue">{detector.hex}</p>
                  </div>
                  <div className="admin-color-row__actions">
                    <button type="button" className="btn btn-secondary" onClick={addDetectedColor}>
                      Add this color
                    </button>
                    <button
                      type="button"
                      className="btn-ghost admin-color-row__btn"
                      onClick={dismissDetector}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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

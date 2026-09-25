/**
 * Pure, framework-agnostic validation for the admin ProductForm — same
 * pattern as src/lib/checkoutValidation.js. No React or DOM dependency,
 * so it's independently testable.
 */

/**
 * @param {object} form
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateProductForm(form) {
  const errors = {}

  if (!form.name || !form.name.trim()) {
    errors.name = 'Product name is required.'
  }

  if (!form.productNumber || !form.productNumber.trim()) {
    errors.productNumber = 'Product number is required.'
  }

  if (!form.sku || !form.sku.trim()) {
    errors.sku = 'SKU is required.'
  }

  if (!form.description || !form.description.trim()) {
    errors.description = 'Description is required.'
  }

  if (!form.category || !form.category.trim()) {
    errors.category = 'Category is required.'
  }

  const price = Number(form.price)
  if (form.price === '' || form.price === null || form.price === undefined) {
    errors.price = 'Price is required.'
  } else if (Number.isNaN(price) || price <= 0) {
    errors.price = 'Price must be a number greater than 0.'
  }

  if (form.compareAtPrice !== '' && form.compareAtPrice !== null && form.compareAtPrice !== undefined) {
    const compareAt = Number(form.compareAtPrice)
    if (Number.isNaN(compareAt) || compareAt <= 0) {
      errors.compareAtPrice = 'Compare-at price must be a number greater than 0.'
    } else if (!Number.isNaN(price) && compareAt <= price) {
      errors.compareAtPrice = 'Compare-at price should be higher than the price, to show a discount.'
    }
  }

  if (!form.sizes || form.sizes.length === 0) {
    errors.sizes = 'Select at least one size.'
  }

  if (form.variants) {
    for (const variant of form.variants) {
      const stock = Number(variant.stock)
      if (variant.stock === '' || Number.isNaN(stock) || stock < 0) {
        errors[`stock-${variant.size}`] = `Stock for size ${variant.size} must be 0 or greater.`
      }
    }
  }

  // GSM is optional — blank is saved as 0 (see formStateToProduct in
  // ProductForm.jsx). Only an actual negative / non-numeric value is an error.
  if (form.gsm !== '' && form.gsm !== null && form.gsm !== undefined) {
    const gsm = Number(form.gsm)
    if (Number.isNaN(gsm) || gsm < 0) {
      errors.gsm = 'GSM cannot be negative.'
    }
  }

  // Colors (Part 12) are entirely optional — a product with none just
  // falls back to its legacy name-parsed single color on the storefront.
  // Any row that IS added must be complete and not collide with another
  // row on the same product (the DB's unique (product_id, name)
  // constraint would reject a save with duplicate names anyway; catching
  // it here gives the admin an inline error instead of a save-time one).
  if (form.colors && form.colors.length) {
    const seenNames = new Set()
    form.colors.forEach((color, index) => {
      const name = (color.name || '').trim()
      if (!name) {
        errors[`color-${index}-name`] = 'Color name is required.'
      } else {
        const key = name.toLowerCase()
        if (seenNames.has(key)) {
          errors[`color-${index}-name`] = 'Each color needs a distinct name.'
        }
        seenNames.add(key)
      }
      if (!/^#[0-9a-f]{6}$/i.test(color.hex || '')) {
        errors[`color-${index}-hex`] = 'Pick a color for this swatch.'
      }
    })
  }

  return { valid: Object.keys(errors).length === 0, errors }
}

/** Fixed candidate size list the admin can toggle on/off for a product. */
export const SIZE_OPTIONS = ['S', 'M', 'L', 'XL', 'XXL']

/** Empty measurement row, used when a size is newly added to a product. */
export function emptyMeasurement() {
  return { chest: 0, length: 0, shoulder: 0 }
}

export const IMAGE_SLOTS = [
  { key: 'main', label: 'Main' },
  { key: 'front', label: 'Front' },
  { key: 'back', label: 'Back' },
  { key: 'model', label: 'Model' },
  { key: 'detail', label: 'Detail' },
  { key: 'fabric', label: 'Fabric' },
]

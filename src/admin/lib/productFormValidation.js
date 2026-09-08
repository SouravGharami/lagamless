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

  if (!form.gsm || Number(form.gsm) < 0) {
    if (form.gsm !== 0 && form.gsm !== '0' && (form.gsm === '' || Number(form.gsm) < 0)) {
      errors.gsm = 'GSM cannot be negative.'
    }
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

/**
 * Checkout form validation — pure functions, no React/DOM dependency, so
 * they're trivially testable and reusable if a second form (e.g. account
 * address book, later) needs the same rules.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Standard 10-digit Indian mobile number, starting 6-9. Accepts an
// optional +91 / 91 country-code prefix and common human formatting
// (spaces, hyphens) — practical rather than overly restrictive, per the
// brief: "97XXXXXXXX", "+91 98765 43210", "091-98765-43210", etc. all pass.
const INDIAN_PHONE_RE = /^(?:\+?91[\s-]?)?[6-9]\d{9}$/

// Indian PIN codes are six digits and never start with 0.
const INDIAN_PIN_RE = /^[1-9]\d{5}$/

export function validateEmail(value) {
  if (!value || !value.trim()) return 'Email is required.'
  if (!EMAIL_RE.test(value.trim())) return 'Enter a valid email address.'
  return null
}

export function validateIndianPhone(value) {
  if (!value || !value.trim()) return 'Phone number is required.'
  const digitsOnly = value.replace(/[\s-]/g, '')
  if (!INDIAN_PHONE_RE.test(digitsOnly)) {
    return 'Enter a valid 10-digit Indian mobile number.'
  }
  return null
}

export function validateIndianPinCode(value) {
  if (!value || !value.trim()) return 'PIN code is required.'
  if (!INDIAN_PIN_RE.test(value.trim())) {
    return 'Enter a valid 6-digit PIN code.'
  }
  return null
}

function requiredField(value, label) {
  if (!value || !value.trim()) return `${label} is required.`
  return null
}

/**
 * @typedef {Object} CheckoutFormValues
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} email
 * @property {string} phone
 * @property {string} addressLine1
 * @property {string} addressLine2
 * @property {string} city
 * @property {string} state
 * @property {string} postalCode
 * @property {string} country
 */

/** @returns {CheckoutFormValues} */
export function getEmptyCheckoutForm() {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
  }
}

/**
 * Validates the full checkout form.
 * @param {CheckoutFormValues} form
 * @returns {{valid: boolean, errors: Record<string, string>}}
 */
export function validateCheckoutForm(form) {
  const errors = {}

  const firstName = requiredField(form.firstName, 'First name')
  if (firstName) errors.firstName = firstName

  const lastName = requiredField(form.lastName, 'Last name')
  if (lastName) errors.lastName = lastName

  const email = validateEmail(form.email)
  if (email) errors.email = email

  const phone = validateIndianPhone(form.phone)
  if (phone) errors.phone = phone

  const addressLine1 = requiredField(form.addressLine1, 'Address line 1')
  if (addressLine1) errors.addressLine1 = addressLine1

  const city = requiredField(form.city, 'City')
  if (city) errors.city = city

  const state = requiredField(form.state, 'State')
  if (state) errors.state = state

  const postalCode = validateIndianPinCode(form.postalCode)
  if (postalCode) errors.postalCode = postalCode

  const country = requiredField(form.country, 'Country')
  if (country) errors.country = country

  return { valid: Object.keys(errors).length === 0, errors }
}

/**
 * Builds the conceptual checkout payload described in the Part 06 brief —
 * shaped so it can become a real order once Supabase + payment are wired
 * up. This is never sent anywhere in this part; it's assembled purely so
 * the "Continue to payment" step has something concrete to hand off to
 * later.
 *
 * @param {CheckoutFormValues} form
 * @param {import('../context/CartContext.jsx').CartLine[]} lines
 * @param {{subtotal: number, shipping: number|null, discount: number, total: number|null}} totals
 */
export function buildCheckoutPayload(form, lines, totals) {
  return {
    customer: {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    },
    shippingAddress: {
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      postalCode: form.postalCode.trim(),
      country: form.country.trim(),
    },
    items: lines.map((line) => ({
      productId: line.productId,
      productNumber: line.productNumber,
      sku: line.sku,
      name: line.name,
      size: line.size,
      quantity: line.quantity,
      unitPrice: line.price,
      lineTotal: line.price * line.quantity,
    })),
    totals,
  }
}

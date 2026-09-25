/**
 * Formats a price in paise/rupees as an INR display string.
 * @param {number} amount - price in rupees
 * @returns {string}
 */
export function formatPrice(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

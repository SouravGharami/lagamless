/**
 * Converts a string into a URL-safe slug.
 * @param {string} value
 * @returns {string}
 */
export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

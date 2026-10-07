/**
 * Where each gallery photo's own garment mask lives.
 *
 * Every product photo gets a mask PNG (white = T-shirt, black = everything else) stored in the same Storage bucket,
 * right next to the photo, under a name derived from the photo's name:
 *
 *   <productId>/front-1712345678.jpg   ->   <productId>/front-1712345678.garment-mask-v2.png
 *
 * Deriving the name (instead of adding a database column) means no migration is needed, a duplicated product — which
 * points at the same photo file — automatically points at the same mask, and replacing a photo (new file name) can
 * never leave the old mask attached to the new picture.
 */
// v2: masks saved by the earlier detector could mark the PRINT as "the shirt" (colour switch then recoloured the artwork, not the
// fabric). A new name makes those old files unused: the storefront re-detects instantly, and the next product save writes fresh masks.
const SUFFIX = '.garment-mask-v2.png'
const EXT = /\.[a-z0-9]{2,5}(?=($|\?|#))/i

/** '<id>/front-123.jpg' -> '<id>/front-123.garment-mask.png' (null for empty input). */
export function garmentMaskPathFor(storagePath) {
  if (!storagePath || typeof storagePath !== 'string') return null
  const bare = storagePath.split(/[?#]/)[0]
  return EXT.test(bare) ? bare.replace(EXT, SUFFIX) : bare + SUFFIX
}

/** Public photo URL -> public mask URL (null for blob:/data: URLs, which are not saved photos). */
export function garmentMaskUrlFor(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return null
  if (/^(blob:|data:)/i.test(imageUrl)) return null
  const [base] = imageUrl.split(/[?#]/)
  return EXT.test(base) ? base.replace(EXT, SUFFIX) : base + SUFFIX
}

/** Bucket-relative storage path from a Supabase public URL (null when it is not one). */
export function storagePathFromPublicUrl(imageUrl, bucket = 'product-images') {
  if (!imageUrl) return null
  const marker = `/object/public/${bucket}/`
  const at = imageUrl.indexOf(marker)
  if (at === -1) return null
  return decodeURIComponent(imageUrl.slice(at + marker.length).split(/[?#]/)[0])
}

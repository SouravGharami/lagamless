/**
 * STEP 3 — asset ADAPTER layer (provider-neutral).
 *
 * Mockup Studio keeps assets as Blobs / Files / session object URLs. A future provider may want a File, a
 * remote URL, or (worst case) a data URL. Those conversions live HERE, on demand, so nothing provider-specific
 * ever leaks into HumanModelStudio or the compositor, and big base64 strings are never held in React state.
 *
 * Remote URLs require an injected `uploader` (blob -> Promise<url>) that talks to OUR backend / storage; this
 * file contains no endpoint, no credentials and no vendor code.
 */

export const ASSET_FORMAT = Object.freeze({
  BLOB: 'blob',
  FILE: 'file',
  OBJECT_URL: 'object_url',
  REMOTE_URL: 'remote_url',
  DATA_URL: 'data_url',
})

export class AssetAdapterError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AssetAdapterError'
    this.code = code
  }
}

/** Flat, ordered list of every image a provider will receive: [{ role, name, blob, width, height, mimeType, objectUrl }]. */
export function listGenerationImages(assets) {
  const out = []
  const h = assets?.humanModel
  if (h?.blob) out.push({ role: 'human_model', name: h.fileName, blob: h.blob, width: h.width, height: h.height, mimeType: h.mimeType, objectUrl: h.objectUrl ?? null })
  const views = assets?.garment?.views ?? {}
  for (const [view, g] of Object.entries(views)) {
    out.push({ role: `garment_${view.toLowerCase()}`, name: `garment-${view.toLowerCase()}.png`, blob: g.blob, width: g.width, height: g.height, mimeType: g.mimeType, objectUrl: g.objectUrl ?? null })
  }
  return out
}

const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('Could not read the image.'))
    reader.readAsDataURL(blob)
  })

/**
 * Converts one image from listGenerationImages() into the representation a provider asks for.
 * DATA_URL is explicit and on-demand only (it materialises base64 just for the moment of the call).
 */
export async function resolveImage(image, format, { uploader } = {}) {
  if (!image?.blob) throw new AssetAdapterError('NO_BLOB', `"${image?.role ?? 'image'}" has no image data.`)
  switch (format) {
    case ASSET_FORMAT.BLOB:
      return image.blob
    case ASSET_FORMAT.FILE:
      return new File([image.blob], image.name || `${image.role}.png`, { type: image.mimeType || image.blob.type })
    case ASSET_FORMAT.OBJECT_URL:
      if (!image.objectUrl) throw new AssetAdapterError('NO_OBJECT_URL', `"${image.role}" has no live object URL.`)
      return image.objectUrl
    case ASSET_FORMAT.DATA_URL:
      return readAsDataUrl(image.blob)
    case ASSET_FORMAT.REMOTE_URL: {
      if (typeof uploader !== 'function') throw new AssetAdapterError('UPLOADER_REQUIRED', 'A remote URL needs an uploader that stores the image through the backend.')
      const url = await uploader(image.blob, { name: image.name, mimeType: image.mimeType, role: image.role })
      if (typeof url !== 'string' || !url) throw new AssetAdapterError('UPLOAD_FAILED', `The uploader returned no URL for "${image.role}".`)
      return url
    }
    default:
      throw new AssetAdapterError('UNKNOWN_FORMAT', `Unknown asset format "${format}".`)
  }
}

/** Resolves every image at once: { [role]: representation }. */
export async function resolveAllImages(assets, format, options) {
  const images = listGenerationImages(assets)
  const values = await Promise.all(images.map((img) => resolveImage(img, format, options)))
  return Object.fromEntries(images.map((img, i) => [img.role, values[i]]))
}

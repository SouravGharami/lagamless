/**
 * Human Model Studio — the stable internal representation of the uploaded human/model image.
 *
 *   {
 *     id, sourceType: 'uploaded', fileName, mimeType, width, height, fileSize,
 *     previewUrl, sourceUrl,          // blob: object URLs owned by this asset (see releaseHumanModelAsset)
 *     createdAt,
 *     validation: { ok, errors[], warnings[] },
 *     quality:    { level, warnings[], facts },   // non-destructive, from humanModelQuality.js
 *     file,                           // the original File/Blob — what a provider adapter uploads (no base64 anywhere)
 *     metadata: { aspectRatio, megapixels, hasAlpha, lastModified }
 *   }
 *
 * No base64 is ever stored. `previewUrl` and `sourceUrl` currently point at the SAME object URL (the
 * full-resolution file); they are separate fields so a later step can give the UI a downscaled preview
 * without touching anything that reads `sourceUrl`.
 */

let counter = 0

export function newHumanModelId() {
  counter += 1
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `humanmodel-${counter}-${rand}`
}

/**
 * @param {object} p
 * @param {File|Blob} p.file      the picked file (kept by reference)
 * @param {string}    p.url       object URL created for it (ownership passes to the asset)
 */
export function createHumanModelAsset({ file, url, mimeType, width, height, validation, quality, pixels = null, now = new Date() }) {
  return {
    id: newHumanModelId(),
    sourceType: 'uploaded',
    fileName: file?.name || 'model',
    mimeType,
    width,
    height,
    fileSize: file?.size ?? 0,
    previewUrl: url,
    sourceUrl: url,
    createdAt: now.toISOString(),
    validation: { ok: validation.ok, errors: validation.errors, warnings: validation.warnings },
    quality,
    file,
    metadata: {
      aspectRatio: quality?.facts?.aspectRatio ?? (height > 0 ? Number((width / height).toFixed(3)) : null),
      megapixels: quality?.facts?.megapixels ?? null,
      hasAlpha: pixels?.hasAlpha ?? null,
      lastModified: file?.lastModified ?? null,
    },
  }
}

/** Every distinct object URL the asset owns (previewUrl/sourceUrl are often the same one). */
export function humanModelAssetUrls(asset) {
  return [...new Set([asset?.previewUrl, asset?.sourceUrl].filter((u) => typeof u === 'string' && u.startsWith('blob:')))]
}

/** Revokes the asset's object URLs exactly once each. Safe on null / already-released assets. */
export function releaseHumanModelAsset(asset) {
  humanModelAssetUrls(asset).forEach((u) => URL.revokeObjectURL(u))
}

/** True for a structurally usable asset (used by readiness; an asset with validation errors is never ready). */
export function isHumanModelAssetUsable(asset) {
  return !!asset && !!asset.sourceUrl && asset.width > 0 && asset.height > 0 && asset.validation?.ok !== false
}

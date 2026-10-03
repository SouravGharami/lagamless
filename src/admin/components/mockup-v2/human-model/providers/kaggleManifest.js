/**
 * Kaggle batch workflow — manifest export and result import. NO network, NO credentials, NO database access.
 *
 * The same normalized job fields the live provider receives ({ personImage, garmentImage, garmentType, view, metadata,
 * options }) are written to a manifest. A Kaggle notebook reads the manifest, runs the reviewed VTON model on Kaggle's free
 * GPU and writes results.json + images. The admin downloads those and imports them here. Transfer is manual: nothing
 * secret has to be given to Kaggle (no Supabase key, no signed-URL, no token).
 *
 * Manifest  : { format:'lagamless-vton-batch', schemaVersion:1, createdAt, jobs:[{ jobId, productId, color, view, garmentType,
 *               personImage:'images/<id>_person.<ext>', garmentImage:'images/<id>_garment.png', metadata, options }] }
 * Results   : { format:'lagamless-vton-results', schemaVersion:1, results:[{ jobId, success, image:'<file in results/>', error,
 *               productId, view, sourceGarmentId, humanModelId, model:{…}, gpuSeconds }] }
 */
import { PROVIDER_IDS } from './providerTypes.js'

export const MANIFEST_FORMAT = 'lagamless-vton-batch'
export const RESULTS_FORMAT = 'lagamless-vton-results'
export const MANIFEST_VERSION = 1

const extFor = (type) => (type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png')

/** @param jobs queue jobs: { jobId, productId, view, garmentType, metadata, options, personBlob, garmentBlob } */
export function buildBatchManifest(jobs, { now = new Date() } = {}) {
  const files = []
  const entries = jobs.map((j) => {
    const personPath = `images/${j.jobId}_person.${extFor(j.personBlob.type)}`
    const garmentPath = `images/${j.jobId}_garment.${extFor(j.garmentBlob.type)}`
    files.push({ name: personPath, blob: j.personBlob }, { name: garmentPath, blob: j.garmentBlob })
    return {
      jobId: j.jobId,
      productId: j.productId ?? null,
      color: j.metadata?.color ?? null,
      view: j.view,
      garmentType: j.garmentType ?? 'tops',
      personImage: personPath,
      garmentImage: garmentPath,
      metadata: j.metadata ?? {},
      options: { ...j.options },
    }
  })
  const manifest = { format: MANIFEST_FORMAT, schemaVersion: MANIFEST_VERSION, provider: PROVIDER_IDS.KAGGLE, createdAt: now.toISOString(), jobs: entries }
  return { manifest, files }
}

/* ------------------------------------------------------------ minimal ZIP (stored, no compression) */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Builds a ZIP Blob from [{ name, data: Uint8Array }]. Entries are stored uncompressed (images are already compressed). */
export function buildZip(entries) {
  const enc = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBytes = enc.encode(name)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true)
    local.setUint16(10, 0, true); local.setUint16(12, 0x21, true); local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameBytes.length, true); local.setUint16(28, 0, true)
    parts.push(local.buffer, nameBytes, data)
    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true)
    cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true); cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true)
    cen.setUint16(28, nameBytes.length, true); cen.setUint32(42, offset, true)
    central.push(cen.buffer, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const centralSize = central.reduce((n, p) => n + (p.byteLength ?? p.length), 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true)
  end.setUint32(12, centralSize, true); end.setUint32(16, offset, true)
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
}

/** Manifest + images -> one ZIP Blob (upload it to Kaggle as a PRIVATE dataset). */
export async function buildBatchZip(jobs, options) {
  const { manifest, files } = buildBatchManifest(jobs, options)
  const enc = new TextEncoder()
  const entries = [{ name: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2)) }]
  for (const f of files) entries.push({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })
  return { zip: buildZip(entries), manifest }
}

/* ------------------------------------------------------------ result import */

/**
 * Matches the files the admin selected (results.json + images) into importable results. Nothing is fetched.
 * Returns { items:[{ jobId, productId, view, sourceGarmentId, humanModelId, blob, model, gpuSeconds }], problems:[string] }.
 */
export async function parseBatchResults(fileList) {
  const files = Array.from(fileList ?? [])
  const manifestFile = files.find((f) => /(^|\/)results\.json$/i.test(f.webkitRelativePath || f.name) || f.name.toLowerCase() === 'results.json')
  if (!manifestFile) return { items: [], problems: ['results.json was not selected. Select results.json together with the result images.'] }
  let doc
  try {
    doc = JSON.parse(await manifestFile.text())
  } catch {
    return { items: [], problems: ['results.json could not be read.'] }
  }
  if (doc?.format !== RESULTS_FORMAT || !Array.isArray(doc.results)) return { items: [], problems: ['This is not a LAGAMLESS VTON results file.'] }

  const byName = new Map(files.map((f) => [f.name, f]))
  const items = []
  const problems = []
  for (const r of doc.results) {
    if (!r?.jobId) { problems.push('A result without a job id was skipped.'); continue }
    if (r.success !== true) { problems.push(`Job ${r.jobId}: the Kaggle worker reported a failure.`); continue }
    const name = String(r.image ?? '').split('/').pop()
    const blob = byName.get(name)
    if (!blob) { problems.push(`Job ${r.jobId}: image "${name}" was not selected.`); continue }
    if (!blob.type.startsWith('image/') || blob.size === 0) { problems.push(`Job ${r.jobId}: "${name}" is not a valid image.`); continue }
    items.push({
      jobId: r.jobId, productId: r.productId ?? null, view: r.view ?? null, sourceGarmentId: r.sourceGarmentId ?? null,
      humanModelId: r.humanModelId ?? null, blob, model: r.model ?? null, gpuSeconds: Number.isFinite(r.gpuSeconds) ? r.gpuSeconds : null,
    })
  }
  return { items, problems }
}

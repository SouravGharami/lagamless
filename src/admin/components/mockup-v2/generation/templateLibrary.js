/**
 * Step 5-2 — REAL PHOTO TEMPLATE LIBRARY (framework-free, no network, no DOM).
 *
 * Holds the reusable photographic templates and keeps the shared 5-1 `templateRegistry` in sync so the
 * existing generation model (`resolveTemplate`, `buildMockupProject`, the reducer) sees them. It does
 * not define a second template shape: every entry is a 5-1 `MockupTemplate` (see templateModel.js).
 *
 * Persistence is delegated to a BACKEND so the same code runs with Supabase or in-session only:
 *   { persistent: boolean,
 *     list(): Promise<templateInput[]>,
 *     storeImage(asset, { hash, id, reuse }): Promise<{ url, path|null }>,   // uploads at most once per hash
 *     insert(template): Promise<void>,
 *     patch(id, { template?, kind?: 'photo'|'active', deleted? }): Promise<void>,
 *     releaseImage?(path, exceptId): Promise<void> }
 *
 * Photos are stored exactly as uploaded: nothing is recoloured, stylised, upscaled or generated.
 */
import { createTemplate, withTemplateUpdates, TEMPLATE_SOURCE_TYPES, ASSET_KINDS } from './templateModel.js'
import { isAngle } from './mockupAngles.js'
import { templateRegistry } from './templateRegistry.js'

export const ANGLE_FILTER_ALL = 'ALL'
export const GARMENT_FILTER_ALL = 'ALL'

/** Library entries filtered by angle and garment. Entries are `{ template, persisted }`. */
export function filterTemplates(entries, { angle = ANGLE_FILTER_ALL, garment = GARMENT_FILTER_ALL } = {}) {
  return entries.filter(({ template: t }) => (angle === ANGLE_FILTER_ALL || t.angle === angle) && (garment === GARMENT_FILTER_ALL || t.garmentType === garment))
}

/** Templates a person may pick as a normal choice: active and usable. */
export const selectableEntries = (entries) => entries.filter(({ template: t }) => t.active !== false)

const uuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16) })

/** SHA-256 hex of the file bytes, or null when the browser cannot hash (then no de-duplication happens). */
export async function hashFile(file) {
  try {
    if (!file?.arrayBuffer || typeof crypto === 'undefined' || !crypto.subtle) return null
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

/** Session-only backend: nothing leaves the browser. Used when Supabase is unavailable. */
export function createMemoryBackend() {
  return {
    persistent: false,
    async list() { return [] },
    async storeImage(asset, { reuse }) { return reuse ? { url: reuse.url, path: reuse.ref ?? null } : { url: asset.url, path: null } },
    async insert() {},
    async patch() {},
  }
}

const imageInfoFor = (asset, hash) => ({ width: asset.width, height: asset.height, fileType: asset.file?.type || null, bytes: asset.file?.size ?? null, contentHash: hash })
const isBlob = (url) => typeof url === 'string' && url.startsWith('blob:')

export function createTemplateLibrary({ backend, fallbackBackend = null, registry = templateRegistry, hash = hashFile, newId = uuid } = {}) {
  let activeBackend = backend
  let entries = []
  let snapshot = { status: 'idle', error: null, notice: null, entries, persistent: !!backend.persistent }
  let loading = null
  const listeners = new Set()

  function emit(patch = {}) {
    snapshot = { ...snapshot, ...patch, entries, persistent: !!activeBackend.persistent }
    listeners.forEach((l) => l())
  }
  function setEntries(next) {
    entries = next
    registry.clear()
    entries.forEach((e) => registry.upsert(e.template))
  }
  const find = (id) => entries.find((e) => e.template.id === id) || null
  const entryFor = (template) => ({ template, persisted: !!activeBackend.persistent })
  const sameHash = (h, exceptId) => (h ? entries.find((e) => e.template.imageInfo.contentHash === h && e.template.id !== exceptId) || null : null)

  async function load({ force = false } = {}) {
    if (loading) return loading
    if (snapshot.status === 'ready' && !force) return
    emit({ status: 'loading', error: null })
    loading = (async () => {
      try {
        const inputs = await activeBackend.list()
        const list = []
        for (const input of inputs) {
          try { list.push(entryFor(createTemplate(input))) } catch { /* a malformed row is skipped, never shown half-built */ }
        }
        list.sort((a, b) => (a.template.createdAt < b.template.createdAt ? 1 : -1))
        setEntries(list)
        emit({ status: 'ready' })
      } catch (err) {
        if (fallbackBackend && activeBackend !== fallbackBackend) {
          activeBackend = fallbackBackend
          setEntries([])
          emit({ status: 'ready', notice: `Template storage is not available (${err?.message || 'unknown error'}). Templates will only be kept while this page is open.` })
        } else {
          emit({ status: 'error', error: err?.message || 'Could not load templates.' })
        }
      } finally {
        loading = null
      }
    })()
    return loading
  }

  /**
   * @param asset  { url, file, name, width, height } from readImageFile()
   * @param fields { name, description, angle, garmentType, colors, supportedRegions }
   */
  async function addTemplate(asset, fields) {
    if (!asset?.url || !asset.width || !asset.height) throw new Error('Choose a photo first.')
    if (!isAngle(fields?.angle)) throw new Error('Choose which angle the photo shows.')
    const name = (fields.name ?? '').trim()
    if (!name) throw new Error('Enter a template name.')
    const id = newId()
    const h = await hash(asset.file)
    const dup = sameHash(h)
    const stored = await activeBackend.storeImage(asset, { hash: h, id, reuse: dup ? dup.template.source : null })
    if (stored.url !== asset.url && isBlob(asset.url)) URL.revokeObjectURL(asset.url) // the local preview is no longer needed
    const template = createTemplate({
      id, name,
      description: fields.description ?? '',
      angle: fields.angle,
      garmentType: fields.garmentType,
      colors: fields.colors,
      supportedRegions: fields.supportedRegions,
      sourceType: activeBackend.persistent ? TEMPLATE_SOURCE_TYPES.STORED_TEMPLATE : TEMPLATE_SOURCE_TYPES.UPLOADED_PHOTO,
      assetKind: ASSET_KINDS.REAL_PHOTO,
      source: { url: stored.url, ref: stored.path, width: asset.width, height: asset.height },
      previewImage: stored.url,
      imageInfo: imageInfoFor(asset, h),
    })
    await activeBackend.insert(template)
    setEntries([entryFor(template), ...entries])
    emit()
    return template
  }

  /** Swaps ONLY the photograph. Name, angle, colours, regions, active flag and id are kept. */
  async function replacePhoto(id, asset) {
    const entry = find(id)
    if (!entry) throw new Error('That template no longer exists.')
    if (!asset?.url || !asset.width || !asset.height) throw new Error('Choose a photo first.')
    const old = entry.template
    const h = await hash(asset.file)
    if (h && h === old.imageInfo.contentHash) {
      if (isBlob(asset.url)) URL.revokeObjectURL(asset.url)
      return { template: old, unchanged: true }
    }
    const dup = sameHash(h, id)
    const stored = await activeBackend.storeImage(asset, { hash: h, id, reuse: dup ? dup.template.source : null })
    if (stored.url !== asset.url && isBlob(asset.url)) URL.revokeObjectURL(asset.url)
    const next = withTemplateUpdates(old, {
      source: { url: stored.url, ref: stored.path, width: asset.width, height: asset.height },
      previewImage: stored.url,
      imageInfo: imageInfoFor(asset, h),
    })
    await activeBackend.patch(id, { template: next, kind: 'photo' })
    setEntries(entries.map((e) => (e.template.id === id ? entryFor(next) : e)))
    emit()
    if (old.source.ref && old.source.ref !== stored.path) activeBackend.releaseImage?.(old.source.ref, id).catch(() => {})
    return { template: next, unchanged: false }
  }

  async function setActive(id, active) {
    const entry = find(id)
    if (!entry) throw new Error('That template no longer exists.')
    const next = withTemplateUpdates(entry.template, { active: !!active })
    await activeBackend.patch(id, { template: next, kind: 'active' })
    setEntries(entries.map((e) => (e.template.id === id ? entryFor(next) : e)))
    emit()
    return next
  }

  /** Soft delete: the row and file are kept (deleted_at), the template just leaves the library. */
  async function removeTemplate(id) {
    if (!find(id)) return
    await activeBackend.patch(id, { deleted: true })
    setEntries(entries.filter((e) => e.template.id !== id))
    emit()
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    getSnapshot: () => snapshot,
    load, addTemplate, replacePhoto, setActive, removeTemplate,
    get: (id) => find(id)?.template ?? null,
    clearNotice: () => emit({ notice: null }),
  }
}

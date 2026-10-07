import { supabase, isSupabaseConfigured, getProductImagePublicUrl, PRODUCT_IMAGES_BUCKET } from '../lib/supabase.js'
import { uploadProductImageAtPath, deleteProductImageFiles } from './productImages.js'
import {
  extForType, hashBlob, isOwnedMockupPath, mapMockupRow, mockupImagePath, mockupSourcePath, moveId, nextMainAfterRemoval,
  planInsertOrder, sortMockups,
} from '../admin/components/mockup-v2/gallery/galleryModel.js'

/**
 * Admin Mockup Gallery persistence (Step 5-5): `product_mockups` rows + files in the existing `product-images` bucket
 * under `mockups/<product_id>/`. Admin-only by RLS (Part 31). This module renders nothing — regeneration lives in
 * mockup-v2/gallery/mockupRender.js and calls back into here to store the result.
 */

export class MockupError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MockupError'
    this.code = code
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured) throw new MockupError('NOT_CONFIGURED', 'Supabase is not configured — see supabase/SETUP.md.')
}

/**
 * Message safe to show an admin. Errors this app authored (MockupError / CompositeError) already read well and pass through;
 * anything else (Supabase/Postgres/Storage errors, TypeErrors, network failures) is replaced so raw database text, table
 * names and paths never reach the screen. The original error is still logged for developers.
 */
export function friendlyMockupError(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.name === 'MockupError' || err?.name === 'CompositeError') return err.message || fallback
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'You appear to be offline. Check your connection and try again.'
  if (err?.code === '42501' || /row-level security|permission denied|not authorized|jwt/i.test(err?.message || '')) return 'You do not have permission to do that. Sign in again as an admin and retry.'
  console.error('[mockups]', err)
  return fallback
}

const TABLE = 'product_mockups'

// One in-flight mutation per key: a double click can never create two records or two uploads for the same operation.
const inFlight = new Set()
async function once(key, fn) {
  if (inFlight.has(key)) throw new MockupError('BUSY', 'That action is already in progress.')
  inFlight.add(key)
  try {
    return await fn()
  } finally {
    inFlight.delete(key)
  }
}

export async function listMockups(productId) {
  requireSupabase()
  const { data, error } = await supabase.from(TABLE).select('*').eq('product_id', productId)
  if (error) throw error
  return sortMockups((data || []).map(mapMockupRow))
}

/** Stores one source file (photo / mask / artwork), named by content hash so identical bytes are stored once. */
export async function uploadMockupSource(productId, blob) {
  requireSupabase()
  const path = mockupSourcePath(productId, await hashBlob(blob), extForType(blob.type))
  await uploadProductImageAtPath(path, blob)
  return path
}

/** Deletes files only if they are inside this product's mockups/ folder AND no other row still references them. */
async function deleteUnreferencedFiles(productId, paths, { exceptId } = {}) {
  const doomed = []
  for (const path of new Set((paths || []).filter(Boolean))) {
    if (!isOwnedMockupPath(productId, path)) continue
    let img = supabase.from(TABLE).select('id').eq('image_path', path).limit(1)
    let src = supabase.from(TABLE).select('id').contains('source_paths', [path]).limit(1)
    if (exceptId) { img = img.neq('id', exceptId); src = src.neq('id', exceptId) }
    const [a, b] = await Promise.all([img, src])
    if (a.error || b.error) continue // when unsure, keep the file
    if (!a.data?.length && !b.data?.length) doomed.push(path)
  }
  if (doomed.length) await deleteProductImageFiles(doomed).catch(() => {}) // best effort: the DB is already consistent
}

async function persistOrder(productId, ids) {
  const { error } = await supabase.rpc('reorder_product_mockups', { p_product_id: productId, p_ids: ids })
  if (error) throw error
}

/**
 * Adds a mockup for a view. Fails with VIEW_EXISTS instead of creating a duplicate (use replaceMockupImage).
 * The first mockup of a product becomes MAIN; later ones never take it over.
 */
export function createMockup({ productId, view, blob, width, height, renderConfig = null, sourcePaths = [], origin = 'studio' }) {
  return once(`create:${productId}:${view}`, async () => {
    requireSupabase()
    const existing = await listMockups(productId)
    if (existing.some((m) => m.viewType === view)) throw new MockupError('VIEW_EXISTS', 'This view already has a mockup.')
    const path = mockupImagePath(productId, view, extForType(blob.type))
    const { publicUrl } = await uploadProductImageAtPath(path, blob)
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        product_id: productId, view_type: view, image_path: path, image_url: publicUrl, width, height,
        is_main: !existing.some((m) => m.isMain), sort_order: existing.length, origin, render_config: renderConfig, source_paths: sourcePaths,
      })
      .select('*')
      .single()
    if (error) {
      await deleteProductImageFiles([path]).catch(() => {})
      if (error.code === '23505') throw new MockupError('VIEW_EXISTS', 'This view already has a mockup.')
      throw error
    }
    const created = mapMockupRow(data)
    await persistOrder(productId, planInsertOrder(existing, created))
    return created
  })
}

/** Swaps the image of ONE record. View, order, main flag and product stay exactly as they were. */
export function replaceMockupImage(mockup, { blob, width, height, renderConfig, sourcePaths, origin }) {
  return once(`update:${mockup.id}`, async () => {
    requireSupabase()
    const path = mockupImagePath(mockup.productId, mockup.viewType, extForType(blob.type))
    const { publicUrl } = await uploadProductImageAtPath(path, blob)
    const patch = { image_path: path, image_url: publicUrl, width, height, origin }
    if (renderConfig !== undefined) { patch.render_config = renderConfig; patch.source_paths = sourcePaths ?? [] }
    const { data, error } = await supabase.from(TABLE).update(patch).eq('id', mockup.id).eq('product_id', mockup.productId).select('*').single()
    if (error) {
      await deleteProductImageFiles([path]).catch(() => {})
      throw error
    }
    await deleteUnreferencedFiles(mockup.productId, [mockup.imagePath, ...(renderConfig !== undefined ? mockup.sourcePaths : [])])
    return mapMockupRow(data)
  })
}

/** Removes one record. If it was MAIN, the next mockup in gallery order becomes MAIN. Product, other mockups and source templates are untouched. */
export function removeMockup(mockup, all) {
  return once(`update:${mockup.id}`, async () => {
    requireSupabase()
    const successor = nextMainAfterRemoval(all, mockup.id)
    const { error } = await supabase.from(TABLE).delete().eq('id', mockup.id).eq('product_id', mockup.productId)
    if (error) throw error
    if (successor) await setMainMockup(successor, { skipGuard: true })
    await deleteUnreferencedFiles(mockup.productId, [mockup.imagePath, ...mockup.sourcePaths])
    return successor
  })
}

export function setMainMockup(id, { skipGuard = false } = {}) {
  const run = async () => {
    requireSupabase()
    const { error } = await supabase.rpc('set_main_product_mockup', { p_mockup_id: id })
    if (error) throw error
  }
  return skipGuard ? run() : once(`main:${id}`, run)
}

export function moveMockup(productId, all, id, delta) {
  return once(`order:${productId}`, async () => {
    requireSupabase()
    const ids = moveId(sortMockups(all).map((m) => m.id), id, delta)
    if (ids) await persistOrder(productId, ids)
  })
}

export const mockupSourceUrl = (path) => getProductImagePublicUrl(path)

/** Downloads a stored mockup file (authenticated Storage read — no CORS dependency). */
export async function downloadMockupBlob(path) {
  requireSupabase()
  const { data, error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).download(path)
  if (error || !data) throw new MockupError('DOWNLOAD_FAILED', 'The mockup file could not be read from storage.')
  return data
}

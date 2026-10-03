import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { uploadProductImageAtPath, deleteProductImageFiles, saveProductImageRecord, updateProductImageRecord } from './productImages.js'

/**
 * Generated human-model mockups (Step 4). Separate, ADMIN-ONLY records (Part 32) stored in the existing `product-images`
 * bucket under `generated-mockups/<product_id>/`. They never touch the studio render (`product_mockups`), the artwork, the
 * product source images or the storefront — until the admin explicitly calls `addToProductImages`.
 */

const TABLE = 'generated_model_mockups'
const VIEW_SET = new Set(['front', 'three_quarter_front', 'side', 'back', 'three_quarter_back', 'detail'])

export class GeneratedMockupError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'GeneratedMockupError'
    this.code = code
  }
}

function requireSupabase() {
  if (!isSupabaseConfigured) throw new GeneratedMockupError('NOT_CONFIGURED', 'Supabase is not configured — see supabase/SETUP.md.')
}

/** Message safe for an admin; raw database text never reaches the screen. */
export function friendlyGeneratedMockupError(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.name === 'GeneratedMockupError') return err.message
  if (err?.code === '42P01' || err?.code === 'PGRST205' || /schema cache|generated_model_mockups.*(does not exist|not find)/i.test(err?.message || '')) {
    return 'The generated-mockups table is missing. Run supabase/part-32-generated-model-mockups-repair.sql once in the Supabase SQL Editor, then retry.'
  }
  if (err?.code === '42883' || err?.code === 'PGRST202') return 'A generated-mockups database function is missing. Run supabase/part-32-generated-model-mockups-repair.sql once in the Supabase SQL Editor.'
  if (err?.code === '42501' || /row-level security|permission denied|jwt/i.test(err?.message || '')) return 'You do not have permission to do that. Sign in again as an admin and retry.'
  if (/bucket not found/i.test(err?.message || '')) return 'The product-images storage bucket was not found. Check the Supabase storage setup.'
  if (err?.statusCode === '413' || /payload too large|exceeded the maximum/i.test(err?.message || '')) return 'The generated image is too large to upload.'
  if (err?.name === 'StorageApiError' || err?.name === 'StorageUnknownError' || /storage|upload/i.test(err?.message || '')) return 'The generated image could not be uploaded to storage. Check your connection and admin sign-in, then retry.'
  console.error('[generated-mockups]', err)
  return fallback
}

export function mapRow(r) {
  return {
    id: r.id, productId: r.product_id, sourceGarmentId: r.source_garment_id, humanModelId: r.human_model_id, provider: r.provider,
    providerJobId: r.provider_job_id, view: r.view, imagePath: r.image_path, imageUrl: r.image_url, width: r.width, height: r.height,
    status: r.status, approved: r.approved === true, priority: r.priority ?? null, isMain: r.is_main === true,
    promotedImageId: r.promoted_image_id ?? null, createdAt: r.created_at,
  }
}

/** Admin order: main first, then by priority (nulls last), then newest. */
export function sortGenerated(rows) {
  return [...rows].sort((a, b) => Number(b.isMain) - Number(a.isMain) || (a.priority ?? Infinity) - (b.priority ?? Infinity) || String(b.createdAt).localeCompare(String(a.createdAt)))
}

export async function listGeneratedMockups(productId) {
  requireSupabase()
  const { data, error } = await supabase.from(TABLE).select('*').eq('product_id', productId)
  if (error) throw error
  return sortGenerated((data || []).map(mapRow))
}

const extFor = (type) => (type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png')
const pathFor = (productId, view, type) => `generated-mockups/${productId}/${view}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${extFor(type)}`

/** Uploads the generated image and stores its record. `approve` saves it as approved in one step. */
export async function saveGeneratedMockup({ productId, view, blob, width = null, height = null, provider, providerJobId = null, sourceGarmentId = null, humanModelId = null, approve = false }) {
  requireSupabase()
  if (!productId) throw new GeneratedMockupError('NO_PRODUCT', 'Save the product first, then approve the mockup.')
  if (!VIEW_SET.has(view)) throw new GeneratedMockupError('BAD_VIEW', 'Unknown model view.')
  if (!(blob instanceof Blob) || blob.size === 0) throw new GeneratedMockupError('BAD_IMAGE', 'The generated image is not valid.')
  const path = pathFor(productId, view, blob.type)
  const { publicUrl } = await uploadProductImageAtPath(path, blob)
  const existing = approve ? await listGeneratedMockups(productId) : []
  const nextPriority = approve ? Math.max(0, ...existing.map((m) => m.priority ?? 0)) + 1 : null
  const { data, error } = await supabase.from(TABLE).insert({
    product_id: productId, source_garment_id: sourceGarmentId, human_model_id: humanModelId, provider, provider_job_id: providerJobId, view,
    image_path: path, image_url: publicUrl, width, height, status: approve ? 'approved' : 'pending', approved: approve, priority: nextPriority,
  }).select('*').single()
  if (error) {
    await deleteProductImageFiles([path]).catch(() => {})
    throw error
  }
  return mapRow(data)
}

export async function setGeneratedStatus(id, status) {
  requireSupabase()
  if (!['pending', 'approved', 'rejected'].includes(status)) throw new GeneratedMockupError('BAD_STATUS', 'Unknown status.')
  const patch = { status, approved: status === 'approved' }
  if (status !== 'approved') { patch.is_main = false; patch.priority = null }
  const { data, error } = await supabase.from(TABLE).update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return mapRow(data)
}

export async function setMainGeneratedMockup(id) {
  requireSupabase()
  const { error } = await supabase.rpc('set_main_generated_mockup', { p_mockup_id: id })
  if (error) throw error
}

/** Persists the admin's manual order of approved mockups exactly as given (priority 1, 2, 3, … with no maximum). */
export async function reorderGeneratedMockups(productId, orderedIds) {
  requireSupabase()
  const { error } = await supabase.rpc('reorder_generated_mockups', { p_product_id: productId, p_ids: orderedIds })
  if (error) throw error
}

export function moveGenerated(rows, id, delta) {
  const ids = sortGenerated(rows).filter((m) => m.approved).map((m) => m.id)
  const i = ids.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= ids.length) return null
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return ids
}

/** Deletes the record and its file — unless the file is referenced by a product image (then only the record is removed). */
export async function deleteGeneratedMockup(mockup) {
  requireSupabase()
  const { error } = await supabase.from(TABLE).delete().eq('id', mockup.id).eq('product_id', mockup.productId)
  if (error) throw error
  if (!mockup.promotedImageId) await deleteProductImageFiles([mockup.imagePath]).catch(() => {})
}

/**
 * The deliberate hand-off into the EXISTING product image workflow (productImages.js → `product_images`).
 *  slot 'main'  : points the product's `main` image row at this mockup (the previous file stays in Storage, untouched)
 *  slot 'model' : adds a `model` image row whose sort_order is the admin's priority
 * The row stores only the public URL (no storage_path), exactly like "Duplicate product", so deleting a product image can
 * never delete the generated file. Returns the product_images id.
 */
export async function addToProductImages(mockup, { slot = 'model', priority = mockup.priority ?? 1 } = {}) {
  requireSupabase()
  if (!mockup.approved) throw new GeneratedMockupError('NOT_APPROVED', 'Approve the mockup before adding it to the product images.')
  const altText = `Model wearing the T-shirt — ${mockup.view.replaceAll('_', ' ')}`
  let imageId
  if (slot === 'main') {
    const { data: rows, error } = await supabase.from('product_images').select('id').eq('product_id', mockup.productId).eq('image_type', 'main').limit(1)
    if (error) throw error
    if (rows?.length) {
      imageId = rows[0].id
      await updateProductImageRecord(imageId, { imageUrl: mockup.imageUrl, storagePath: null, altText, sortOrder: 0 })
    } else {
      await saveProductImageRecord(mockup.productId, 'main', { imageUrl: mockup.imageUrl, altText, sortOrder: 0 })
    }
  } else {
    await saveProductImageRecord(mockup.productId, 'model', { imageUrl: mockup.imageUrl, altText, sortOrder: priority })
  }
  if (!imageId) {
    const { data: rows } = await supabase.from('product_images').select('id').eq('product_id', mockup.productId).eq('image_url', mockup.imageUrl).order('created_at', { ascending: false }).limit(1)
    imageId = rows?.[0]?.id ?? null
  }
  if (imageId) await supabase.from(TABLE).update({ promoted_image_id: imageId }).eq('id', mockup.id)
  return imageId
}

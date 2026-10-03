import { supabase, isSupabaseConfigured, PRODUCT_IMAGES_BUCKET, getProductImagePublicUrl } from '../lib/supabase.js'
import { templateToRow, rowToTemplateInput, photoPatchToRow } from '../admin/components/mockup-v2/generation/templateRecord.js'
import { extensionForType } from '../admin/components/mockup-v2/generation/templateImageInfo.js'

/**
 * Persistence for the real-photo template library (Step 5-2).
 *
 * - Photographs go into the EXISTING `product-images` bucket under `mockup-templates/`, so the existing
 *   storage policies (public read, admin-only write) apply unchanged. No new bucket, no new provider.
 * - Files are named by content hash: uploading the same photo again reuses the stored file.
 * - Rows live in `mockup_templates` (supabase/part-30-mockup-templates.sql); RLS is admin-only.
 * - Only the public anon key is used (via lib/supabase.js). No secret exists in this file.
 */
const TABLE = 'mockup_templates'
const PREFIX = 'mockup-templates'

const requireSupabase = () => {
  if (!isSupabaseConfigured || !supabase) throw new Error('Supabase is not configured — see supabase/SETUP.md.')
}

const isAlreadyExists = (error) => error?.statusCode === '409' || error?.statusCode === 409 || /already exists|duplicate/i.test(error?.message || '')

export function createSupabaseTemplateBackend() {
  return {
    persistent: true,

    async list() {
      requireSupabase()
      const { data, error } = await supabase.from(TABLE).select('*').is('deleted_at', null).order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(rowToTemplateInput)
    },

    /** Uploads at most once per content hash. `reuse` = an already-stored source for identical bytes. */
    async storeImage(asset, { hash, id, reuse }) {
      requireSupabase()
      if (reuse?.url) return { url: reuse.url, path: reuse.ref ?? null }
      const type = asset.file?.type || 'image/jpeg'
      const path = `${PREFIX}/${hash ?? id}.${extensionForType(type)}`
      const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).upload(path, asset.file, { upsert: false, cacheControl: '31536000', contentType: type })
      if (error && !isAlreadyExists(error)) throw error // "already exists" = identical bytes were uploaded before: reuse them
      return { url: getProductImagePublicUrl(path), path }
    },

    async insert(template) {
      requireSupabase()
      const { error } = await supabase.from(TABLE).insert(templateToRow(template))
      if (error) throw error
    },

    async patch(id, { template, kind, deleted }) {
      requireSupabase()
      let payload
      if (deleted) payload = { deleted_at: new Date().toISOString() }
      else payload = kind === 'photo' ? photoPatchToRow(template) : { active: template.active }
      const { error } = await supabase.from(TABLE).update(payload).eq('id', id)
      if (error) throw error
    },

    /** Best-effort: removes a replaced photo only if no other row (including soft-deleted ones) still points at it. */
    async releaseImage(path, exceptId) {
      if (!path || !supabase) return
      const { count, error } = await supabase.from(TABLE).select('id', { count: 'exact', head: true }).eq('source_path', path).neq('id', exceptId)
      if (error || count > 0) return
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path])
    },
  }
}

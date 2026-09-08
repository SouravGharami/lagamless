import { createClient } from '@supabase/supabase-js'

/**
 * Supabase client for the LAGAMLESS storefront + admin panel.
 *
 * SECURITY:
 * - Only the public/anon key is ever read here. It is safe to ship in
 *   frontend bundles because access is (and must remain) governed by
 *   Postgres Row Level Security policies, not by keeping this key secret.
 * - The service-role key must NEVER be added to this file, to any other
 *   frontend file, or to a VITE_-prefixed env var (Vite inlines anything
 *   prefixed VITE_ directly into the client bundle). See supabase/SETUP.md.
 *
 * CONFIGURATION:
 * Set these in a local `.env` file (see `.env.example`):
 *   VITE_SUPABASE_URL=
 *   VITE_SUPABASE_ANON_KEY=
 *
 * FALLBACK:
 * Parts 01–07 of this project ran entirely on local in-memory data
 * (src/data/products.js) with no backend at all. To keep the project
 * runnable out of the box — and to avoid a hard crash for anyone who
 * hasn't configured Supabase yet — `isSupabaseConfigured` is exported so
 * the service layer (src/services/*) can fall back to the local catalog
 * when the env vars are missing, rather than throwing on startup.
 */

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * The Supabase client. `null` when the project has not been configured
 * yet (missing env vars) — always check `isSupabaseConfigured` (or that
 * this is non-null) before using it.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

/** Name of the Supabase Storage bucket used for product photography. */
export const PRODUCT_IMAGES_BUCKET = 'product-images'

/**
 * Builds a public URL for a file stored in the product-images bucket.
 * @param {string} storagePath - path within the bucket, e.g. "lagamless-001/front.jpg"
 * @returns {string | null}
 */
export function getProductImagePublicUrl(storagePath) {
  if (!supabase || !storagePath) return null
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath)
  return data?.publicUrl ?? null
}

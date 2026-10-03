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
 * Supabase rolled out a new API key format in 2025. VITE_SUPABASE_ANON_KEY
 * accepts EITHER the legacy `anon` JWT (eyJ...) OR the new "Publishable
 * key" (sb_publishable_...) shown on newer projects' Settings → API Keys
 * page — supabase-js treats them identically. Never put the "Secret key"
 * (sb_secret_...) or the legacy `service_role` key here or in any other
 * VITE_-prefixed variable; see supabase/SETUP.md.
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

// Guards against the single most damaging copy-paste mistake the new
// (2025+) Supabase API Keys dashboard makes easy: the "Secret keys"
// section sits right next to "Publishable key" on the same page, and a
// secret key (like the legacy service_role key) bypasses Row Level
// Security entirely. VITE_-prefixed env vars are bundled straight into
// the JS shipped to every visitor's browser, so shipping this by mistake
// would hand every visitor full read/write access to the whole database.
// Fail loudly at startup rather than silently exposing it.
if (supabaseAnonKey?.startsWith('sb_secret_')) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY is set to a Secret key (sb_secret_...). ' +
      'That key bypasses Row Level Security and must never be shipped to the browser. ' +
      'Use the "Publishable key" (sb_publishable_...) from Settings → API Keys instead — see supabase/SETUP.md.',
  )
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * The Supabase client. `null` when the project has not been configured
 * yet (missing env vars) — always check `isSupabaseConfigured` (or that
 * this is non-null) before using it.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Explicit (not just relying on supabase-js defaults) because
        // admin session persistence across tab switches/reloads depends
        // on all three of these — see supabase/... and
        // src/context/AuthContext.jsx for how the client consumes them.
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
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

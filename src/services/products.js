import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { mapSupabaseProduct } from '../lib/mapSupabaseProduct.js'
import {
  getPublishedProducts,
  getFeaturedProducts as getFeaturedLocal,
  getCategories as getCategoriesLocal,
  getAllSizes as getAllSizesLocal,
} from '../data/products.js'

/**
 * Product service — the seam between the UI (Shop, Product, ProductCard,
 * homepage) and the data source.
 *
 * Part 08A: backed by Supabase (`products` + `product_images` +
 * `product_variants`) when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`
 * are configured. Falls back to the local in-memory catalog
 * (`src/data/products.js`) when they are not, or if a Supabase query
 * fails — so the project keeps running out of the box, and one bad
 * network call never leaves the storefront blank. See supabase/SETUP.md.
 *
 * Every function keeps the exact signature and return shape it had in
 * Part 07, so no page or component needed to change.
 */

const PRODUCT_SELECT = '*, product_images(*), product_variants(*)'

/** @returns {Promise<import('../data/products.js').Product[]>} */
export async function getAllProducts() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data.map(mapSupabaseProduct)
    } catch (err) {
      console.error('getAllProducts: Supabase query failed, using local catalog.', err)
    }
  }
  return getPublishedProducts()
}

/**
 * @param {string} slug
 * @returns {Promise<import('../data/products.js').Product | undefined>}
 */
export async function getProductBySlug(slug) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('status', 'published')
        .eq('slug', slug)
        .maybeSingle()
      if (error) throw error
      return data ? mapSupabaseProduct(data) : undefined
    } catch (err) {
      console.error('getProductBySlug: Supabase query failed, using local catalog.', err)
    }
  }
  return getPublishedProducts().find((p) => p.slug === slug)
}

/**
 * @param {number} [count]
 * @returns {Promise<import('../data/products.js').Product[]>}
 */
export async function getFeaturedProducts(count = 4) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(count)
      if (error) throw error
      return data.map(mapSupabaseProduct)
    } catch (err) {
      console.error('getFeaturedProducts: Supabase query failed, using local catalog.', err)
    }
  }
  return getFeaturedLocal(count)
}

/**
 * Products related to a given product — same category, excluding itself.
 * @param {import('../data/products.js').Product} product
 * @param {number} [count]
 * @returns {Promise<import('../data/products.js').Product[]>}
 */
export async function getRelatedProducts(product, count = 4) {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('status', 'published')
        .eq('category', product.category)
        .neq('id', product.id)
        .limit(count)
      if (error) throw error
      return data.map(mapSupabaseProduct)
    } catch (err) {
      console.error('getRelatedProducts: Supabase query failed, using local catalog.', err)
    }
  }
  const related = getPublishedProducts().filter(
    (p) => p.category === product.category && p.id !== product.id,
  )
  return related.slice(0, count)
}

/** @returns {Promise<string[]>} */
export async function getCategories() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .eq('status', 'published')
      if (error) throw error
      const seen = new Set()
      const categories = []
      for (const row of data) {
        if (row.category && !seen.has(row.category)) {
          seen.add(row.category)
          categories.push(row.category)
        }
      }
      return categories
    } catch (err) {
      console.error('getCategories: Supabase query failed, using local catalog.', err)
    }
  }
  return getCategoriesLocal()
}

/** @returns {Promise<string[]>} */
export async function getAllSizes() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('product_variants')
        .select('size, products!inner(status)')
        .eq('products.status', 'published')
      if (error) throw error
      const order = ['S', 'M', 'L', 'XL', 'XXL']
      const present = new Set(data.map((row) => row.size))
      return order.filter((size) => present.has(size))
    } catch (err) {
      console.error('getAllSizes: Supabase query failed, using local catalog.', err)
    }
  }
  return getAllSizesLocal()
}

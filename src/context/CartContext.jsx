import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getProductById, getVariantStock } from '../data/products.js'

/**
 * Cart context — centralized, localStorage-persisted cart state for the
 * whole app (Navbar, Product page, Cart page, and eventually Checkout).
 *
 * A cart line is uniquely identified by `productId + size` (the same
 * product in two sizes is two lines; adding the same product + size again
 * increases quantity instead of duplicating a line).
 *
 * Every mutation is checked against the *current* catalog stock
 * (`data/products.js`) — not a stock number frozen on the line — so the
 * cart can never hold more than what's actually available, even if stock
 * changed since the item was added.
 *
 * @typedef {Object} CartLine
 * @property {string} lineId - `${productId}__${size}`
 * @property {string} productId
 * @property {string} productNumber
 * @property {string} sku
 * @property {string} name
 * @property {string} slug
 * @property {string|null} image
 * @property {string} size
 * @property {number} price - unit price at time of adding
 * @property {number} quantity
 */

const CartContext = createContext(null)
const STORAGE_KEY = 'lagamless.cart.v1'

/**
 * Reads and sanitizes persisted cart data. Handles missing storage,
 * malformed JSON, and a non-array payload without ever throwing — a bad
 * value here should never crash the app, it should just start empty.
 */
function readInitialCart() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPlausibleLine)
  } catch {
    return []
  }
}

/** Shape-check a persisted line before trusting it at all. */
function isPlausibleLine(line) {
  return (
    line &&
    typeof line === 'object' &&
    typeof line.lineId === 'string' &&
    typeof line.productId === 'string' &&
    typeof line.size === 'string' &&
    typeof line.quantity === 'number' &&
    line.quantity > 0
  )
}

/**
 * Reconciles persisted/loaded lines against the live product catalog:
 * - drops lines whose product no longer exists or is unpublished
 * - drops lines whose size no longer exists on the product
 * - drops lines whose size is now fully sold out
 * - clamps quantity down to current stock if stock dropped below it
 * - refreshes name/image/price/productNumber/sku from the live product,
 *   so a cart line never shows stale info if the catalog changed
 *
 * Returns both the cleaned lines and whether anything actually changed,
 * so the caller can skip a redundant localStorage write.
 */
function reconcileWithCatalog(lines) {
  let changed = false
  const next = []

  for (const line of lines) {
    const product = getProductById(line.productId)
    if (!product) {
      changed = true
      continue
    }
    const stock = getVariantStock(product, line.size)
    if (stock <= 0) {
      changed = true
      continue
    }
    const quantity = Math.min(line.quantity, stock)
    const refreshed = {
      lineId: line.lineId,
      productId: product.id,
      productNumber: product.productNumber,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      image: product.images?.main?.src ?? null,
      size: line.size,
      price: product.price,
      quantity,
    }
    if (
      quantity !== line.quantity ||
      refreshed.name !== line.name ||
      refreshed.price !== line.price ||
      refreshed.image !== line.image ||
      refreshed.sku !== line.sku ||
      refreshed.productNumber !== line.productNumber
    ) {
      changed = true
    }
    next.push(refreshed)
  }

  return { lines: next, changed }
}

export function CartProvider({ children }) {
  const [lines, setLines] = useState(() => reconcileWithCatalog(readInitialCart()).lines)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [lastAddedLineId, setLastAddedLineId] = useState(null)

  // Persist on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
    } catch {
      // Storage can fail (private browsing, quota) — cart still works for
      // the current session, it just won't persist across reloads.
    }
  }, [lines])

  // Re-validate against the catalog once on mount (covers stock that may
  // have "changed" between visits in this demo, e.g. a re-seed) and again
  // whenever the tab regains focus/visibility — cheap, and keeps a
  // long-lived tab from holding an item that quietly sold out elsewhere.
  useEffect(() => {
    function revalidate() {
      setLines((prev) => {
        const { lines: cleaned, changed } = reconcileWithCatalog(prev)
        return changed ? cleaned : prev
      })
    }
    document.addEventListener('visibilitychange', revalidate)
    return () => document.removeEventListener('visibilitychange', revalidate)
  }, [])

  /**
   * Adds a product + size to the cart, capped at available stock.
   *
   * @param {import('../data/products.js').Product} product
   * @param {string} size
   * @param {number} [quantity]
   * @returns {{status: 'added'|'increased'|'capped'|'unavailable', quantityAdded: number, message: string|null}}
   */
  const addItem = useCallback((product, size, quantity = 1) => {
    const stock = getVariantStock(product, size)
    if (stock <= 0) {
      return { status: 'unavailable', quantityAdded: 0, message: 'That size just sold out.' }
    }

    const lineId = `${product.id}__${size}`
    let result = { status: 'added', quantityAdded: 0, message: null }

    setLines((prev) => {
      const existing = prev.find((line) => line.lineId === lineId)
      const currentQty = existing ? existing.quantity : 0
      const room = Math.max(stock - currentQty, 0)
      const toAdd = Math.min(quantity, room)

      if (toAdd <= 0) {
        result = {
          status: 'capped',
          quantityAdded: 0,
          message: `You already have the most we have in stock for size ${size} in your bag.`,
        }
        return prev
      }

      const capped = toAdd < quantity
      result = {
        status: existing ? 'increased' : capped ? 'capped' : 'added',
        quantityAdded: toAdd,
        message: capped ? `Only ${stock} left in size ${size} — added what's available.` : null,
      }

      if (existing) {
        return prev.map((line) =>
          line.lineId === lineId ? { ...line, quantity: line.quantity + toAdd } : line,
        )
      }

      return [
        ...prev,
        {
          lineId,
          productId: product.id,
          productNumber: product.productNumber,
          sku: product.sku,
          name: product.name,
          slug: product.slug,
          image: product.images?.main?.src ?? null,
          size,
          price: product.price,
          quantity: toAdd,
        },
      ]
    })

    setLastAddedLineId(lineId)
    setDrawerOpen(true)

    return result
  }, [])

  const removeItem = useCallback((lineId) => {
    setLines((prev) => prev.filter((line) => line.lineId !== lineId))
  }, [])

  /**
   * Sets a line's quantity directly, clamped to `[0, currentStock]`.
   * A quantity of 0 (or below) removes the line.
   */
  const updateQuantity = useCallback((lineId, quantity) => {
    setLines((prev) => {
      if (quantity <= 0) return prev.filter((line) => line.lineId !== lineId)
      return prev.map((line) => {
        if (line.lineId !== lineId) return line
        const product = getProductById(line.productId)
        const stock = product ? getVariantStock(product, line.size) : line.quantity
        return { ...line, quantity: Math.min(quantity, stock) }
      })
    })
  }, [])

  /** Current available stock for a line, so the Cart page can disable "+" at the right point. */
  const getLineStock = useCallback((line) => {
    const product = getProductById(line.productId)
    return product ? getVariantStock(product, line.size) : line.quantity
  }, [])

  const clearCart = useCallback(() => setLines([]), [])
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const openDrawer = useCallback(() => setDrawerOpen(true), [])

  const totalItems = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines])
  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.price * line.quantity, 0), [lines])

  const value = useMemo(
    () => ({
      lines,
      addItem,
      removeItem,
      updateQuantity,
      getLineStock,
      clearCart,
      totalItems,
      subtotal,
      drawerOpen,
      openDrawer,
      closeDrawer,
      lastAddedLineId,
    }),
    [
      lines,
      addItem,
      removeItem,
      updateQuantity,
      getLineStock,
      clearCart,
      totalItems,
      subtotal,
      drawerOpen,
      openDrawer,
      closeDrawer,
      lastAddedLineId,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}

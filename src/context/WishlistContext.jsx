import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Wishlist context — lightweight, localStorage-persisted "saved items"
 * list, the same storage pattern CartContext already uses. Stores product
 * ids only (not full product snapshots) so it always reflects live
 * price/availability whenever a saved product is looked up again — a
 * wishlist that silently goes stale (old price, since-removed product) is
 * worse than no wishlist at all.
 */

const WishlistContext = createContext(null)
const STORAGE_KEY = 'lagamless.wishlist.v1'

function readInitial() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function WishlistProvider({ children }) {
  const [ids, setIds] = useState(readInitial)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
    } catch {
      // Storage can fail (private browsing, quota) — the wishlist just
      // won't persist across reloads in that case, which is an acceptable
      // degradation rather than something worth surfacing to the user.
    }
  }, [ids])

  const toggle = useCallback((productId) => {
    setIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    )
  }, [])

  const isSaved = useCallback((productId) => ids.includes(productId), [ids])

  const value = useMemo(
    () => ({ ids, count: ids.length, toggle, isSaved }),
    [ids, toggle, isSaved],
  )

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used within a WishlistProvider')
  return ctx
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './WishlistToast.css'

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

  // Keep several open tabs in step (a heart tapped in one tab shows in the others).
  useEffect(() => {
    const onStorage = (e) => { if (e.key === STORAGE_KEY) setIds(readInitial()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Visible confirmation: the heart used to turn red and nothing else happened.
  const [toast, setToast] = useState(null) // { id, saved, key }
  const toastTimer = useRef(null)
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const showToast = useCallback((productId, saved) => {
    clearTimeout(toastTimer.current)
    setToast({ id: productId, saved, key: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const toggle = useCallback((productId) => {
    const willSave = !ids.includes(productId)
    setIds((prev) => (prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]))
    showToast(productId, willSave)
  }, [ids, showToast])

  const remove = useCallback((productId) => setIds((prev) => prev.filter((id) => id !== productId)), [])
  const clear = useCallback(() => setIds([]), [])

  const isSaved = useCallback((productId) => ids.includes(productId), [ids])

  const value = useMemo(
    () => ({ ids, count: ids.length, toggle, remove, clear, isSaved }),
    [ids, toggle, remove, clear, isSaved],
  )

  return (
    <WishlistContext.Provider value={value}>
      {children}
      {toast && (
        <div className="wishlist-toast" role="status" aria-live="polite" key={toast.key}>
          <span className="wishlist-toast__text">{toast.saved ? 'Added to your wishlist' : 'Removed from your wishlist'}</span>
          {toast.saved ? (
            <Link to="/wishlist" className="wishlist-toast__action" onClick={() => setToast(null)}>View</Link>
          ) : (
            <button type="button" className="wishlist-toast__action" onClick={() => { setIds((prev) => (prev.includes(toast.id) ? prev : [...prev, toast.id])); setToast(null) }}>Undo</button>
          )}
        </div>
      )}
    </WishlistContext.Provider>
  )
}

export function useWishlist() {
  const ctx = useContext(WishlistContext)
  if (!ctx) throw new Error('useWishlist must be used within a WishlistProvider')
  return ctx
}

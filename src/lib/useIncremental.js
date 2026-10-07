import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Show a long list a batch at a time; more is revealed as the shopper scrolls near the bottom.
 *
 *   const { visible, hasMore, loading, sentinelRef, loadMore } = useIncremental(items, { step: 8, resetKey })
 *
 * Put `sentinelRef` on an empty element right after the list. `resetKey` (any string) sends the list back
 * to the first batch whenever filters/search change. `delay` gives the "loading" skeleton a moment to be seen.
 */
export function useIncremental(items, { step = 8, resetKey = '', rootMargin = '500px 0px', delay = 250 } = {}) {
  const [state, setState] = useState({ key: resetKey, count: step })
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)
  const count = state.key === resetKey ? state.count : step
  const total = items.length
  const hasMore = count < total

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return
    setLoading(true)
    timer.current = window.setTimeout(() => {
      setState((s) => ({ key: resetKey, count: (s.key === resetKey ? s.count : step) + step }))
      setLoading(false)
    }, delay)
  }, [loading, hasMore, resetKey, step, delay])

  const [node, setNode] = useState(null)
  const sentinelRef = useCallback((el) => setNode(el), [])

  useEffect(() => {
    if (!node || !hasMore) return undefined
    if (typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, hasMore, loadMore, rootMargin, count])

  return { visible: items.slice(0, count), hasMore, loading, sentinelRef, loadMore, total, shown: Math.min(count, total) }
}

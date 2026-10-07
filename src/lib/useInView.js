import { useCallback, useEffect, useState } from 'react'

/**
 * Tells you when an element is (almost) on screen.
 *
 *   const [ref, inView] = useInView({ rootMargin: '600px 0px', once: true })
 *   <div ref={ref}>…</div>
 *
 * `rootMargin` makes it fire BEFORE the element is actually visible, so the content is ready by the
 * time the shopper gets there. `once` (default) stays true after the first sighting. Without
 * IntersectionObserver support it reports true straight away, so nothing is ever left unloaded.
 */
export function useInView({ rootMargin = '400px 0px', once = true } = {}) {
  const [node, setNode] = useState(null)
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined')
  const ref = useCallback((el) => setNode(el), [])

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (once) observer.disconnect()
        } else if (!once) {
          setInView(false)
        }
      },
      { rootMargin },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, rootMargin, once])

  return [ref, inView]
}

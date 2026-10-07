import { Suspense } from 'react'
import { useInView } from '../lib/useInView.js'

/**
 * Renders its children (and so starts their code download + data fetching) only once the placeholder
 * is near the viewport. Use it around below-the-fold sections together with React.lazy:
 *
 *   const Reviews = lazy(() => import('./Reviews.jsx'))
 *   <OnScroll minHeight="30rem"><Reviews /></OnScroll>
 *
 * `minHeight` reserves space so the page doesn't jump when the section arrives.
 */
function OnScroll({ children, minHeight = '24rem', rootMargin = '700px 0px', fallback = null, className = '' }) {
  const [ref, inView] = useInView({ rootMargin })
  return (
    <div ref={ref} className={className} style={inView ? undefined : { minHeight }}>
      {inView ? <Suspense fallback={fallback ?? <div style={{ minHeight }} aria-hidden="true" />}>{children}</Suspense> : null}
    </div>
  )
}

export default OnScroll

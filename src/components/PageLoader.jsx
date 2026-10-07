/** Shown while a page's code downloads (route-level lazy loading). Keeps the navbar/footer in place. */
function PageLoader({ full = false }) {
  return (
    <div className={`page-loader${full ? ' page-loader--full' : ''}`} role="status" aria-live="polite">
      <span className="page-loader__bar" aria-hidden="true" />
      <span className="visually-hidden">Loading…</span>
    </div>
  )
}

export default PageLoader

import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * React Router does not reset scroll position on navigation — the new
 * page mounts wherever the browser happened to be scrolled to on the
 * previous page, which is why opening a product or moving between pages
 * can dump the user near the footer. This drops scroll to the top on
 * every path change so every navigation starts from the top of the page.
 *
 * Rendered once, inside <BrowserRouter>, above <Routes>.
 */
function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

export default ScrollToTop

import { lazy, Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from './TopBar.jsx'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'
import WhatsAppButton from './WhatsAppButton.jsx'
import BottomNav from './BottomNav.jsx'
import PageLoader from './PageLoader.jsx'

// Not needed for first paint — fetched in the background right after the page is up.
const CartDrawer = lazy(() => import('./cart/CartDrawer.jsx'))
const MobileSearchOverlay = lazy(() => import('./MobileSearchOverlay.jsx'))

function SiteLayout() {
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <>
      <TopBar onSearchClick={() => setSearchOpen(true)} />
      <Navbar />
      {/* Navbar is `position: sticky` (see Navbar.css) so it stays pinned
          under the topbar once TopBar scrolls out of view — no spacer
          needed since it stays in normal document flow. */}
      <main className="has-bottom-nav">
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <Suspense fallback={null}>
        <CartDrawer />
      </Suspense>
      <WhatsAppButton />
      {/* Mobile-only app shell: fixed bottom tab bar + full-screen search.
          Both are hidden entirely at the desktop breakpoint (see their own
          CSS), so nothing here changes the laptop/desktop experience. */}
      <BottomNav onSearchClick={() => setSearchOpen(true)} />
      <Suspense fallback={null}>
        <MobileSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      </Suspense>
    </>
  )
}

export default SiteLayout

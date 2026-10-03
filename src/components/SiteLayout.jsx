import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from './TopBar.jsx'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'
import CartDrawer from './cart/CartDrawer.jsx'
import WhatsAppButton from './WhatsAppButton.jsx'
import BottomNav from './BottomNav.jsx'
import MobileSearchOverlay from './MobileSearchOverlay.jsx'

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
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <WhatsAppButton />
      {/* Mobile-only app shell: fixed bottom tab bar + full-screen search.
          Both are hidden entirely at the desktop breakpoint (see their own
          CSS), so nothing here changes the laptop/desktop experience. */}
      <BottomNav onSearchClick={() => setSearchOpen(true)} />
      <MobileSearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}

export default SiteLayout

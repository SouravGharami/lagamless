import { Outlet } from 'react-router-dom'
import TopBar from './TopBar.jsx'
import Navbar from './Navbar.jsx'
import Footer from './Footer.jsx'
import CartDrawer from './cart/CartDrawer.jsx'
import WhatsAppButton from './WhatsAppButton.jsx'

function SiteLayout() {
  return (
    <>
      <TopBar />
      <Navbar />
      {/* Navbar is `position: sticky` (see Navbar.css) so it stays pinned
          under the topbar once TopBar scrolls out of view — no spacer
          needed since it stays in normal document flow. */}
      <main>
        <Outlet />
      </main>
      <Footer />
      <CartDrawer />
      <WhatsAppButton />
    </>
  )
}

export default SiteLayout

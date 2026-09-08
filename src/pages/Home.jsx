import Hero from '../components/home/Hero.jsx'
import BrandStatement from '../components/home/BrandStatement.jsx'
import FeaturedProducts from '../components/home/FeaturedProducts.jsx'
import ProductPhilosophy from '../components/home/ProductPhilosophy.jsx'
import OversizedChoice from '../components/home/OversizedChoice.jsx'
import Manifesto from '../components/home/Manifesto.jsx'
import CampaignEditorial from '../components/home/CampaignEditorial.jsx'
import ShopCTA from '../components/home/ShopCTA.jsx'

/**
 * Homepage. Composed entirely from src/components/home/* section
 * components — Navbar and Footer are rendered once by SiteLayout and are
 * not duplicated here. See BUILD_STATUS.md for the full section-by-section
 * breakdown.
 */
function Home() {
  return (
    <>
      <Hero />
      <BrandStatement />
      <FeaturedProducts />
      <ProductPhilosophy />
      <OversizedChoice />
      <Manifesto />
      <CampaignEditorial />
      <ShopCTA />
    </>
  )
}

export default Home

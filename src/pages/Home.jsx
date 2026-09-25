import Hero from '../components/home/Hero.jsx'
import TrustBar from '../components/home/TrustBar.jsx'
import CollectionGrid from '../components/home/CollectionGrid.jsx'
import CultureManifesto from '../components/home/CultureManifesto.jsx'
import FeaturedProducts from '../components/home/FeaturedProducts.jsx'
import SocialProof from '../components/home/SocialProof.jsx'
import ShopCTA from '../components/home/ShopCTA.jsx'
import Newsletter from '../components/home/Newsletter.jsx'

/**
 * Homepage. Composed entirely from src/components/home/* section
 * components — Navbar and Footer are rendered once by SiteLayout and are
 * not duplicated here.
 *
 * Redesigned to match the LAGAMLESS reference layout:
 *   01 Hero — split brand statement + campaign photo ->
 *   02 Trust bar — fabric / shipping / payments / returns USPs ->
 *   03 Collection strip — "for everyone" 7-tile mood grid ->
 *   04 Tradition Meets Today — Durga Puja capsule editorial ->
 *   05 Featured tees — homepage product wall ->
 *   06 Real people, real stories — UGC photo strip ->
 *   07 A culture that goes beyond trends — closing statement banner ->
 *   08 Join the movement — newsletter capture.
 */
function Home() {
  return (
    <>
      <Hero />
      <TrustBar />
      <CollectionGrid />
      <CultureManifesto />
      <FeaturedProducts />
      <SocialProof />
      <ShopCTA />
      <Newsletter />
    </>
  )
}

export default Home

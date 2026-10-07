import { lazy } from 'react'
import OnScroll from '../components/OnScroll.jsx'
import Hero from '../components/home/Hero.jsx'
import TrustBar from '../components/home/TrustBar.jsx'

// Everything below the hero loads as the shopper scrolls toward it: its code downloads and (for the
// product wall) its data is fetched only when it gets close, instead of everything at once.
const CollectionGrid = lazy(() => import('../components/home/CollectionGrid.jsx'))
const CultureManifesto = lazy(() => import('../components/home/CultureManifesto.jsx'))
const FeaturedProducts = lazy(() => import('../components/home/FeaturedProducts.jsx'))
const SocialProof = lazy(() => import('../components/home/SocialProof.jsx'))
const ShopCTA = lazy(() => import('../components/home/ShopCTA.jsx'))
const Newsletter = lazy(() => import('../components/home/Newsletter.jsx'))

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
      <OnScroll minHeight="28rem" rootMargin="500px 0px">
        <CollectionGrid />
      </OnScroll>
      <OnScroll minHeight="32rem">
        <CultureManifesto />
      </OnScroll>
      <OnScroll minHeight="60rem">
        <FeaturedProducts />
      </OnScroll>
      <OnScroll minHeight="30rem">
        <SocialProof />
      </OnScroll>
      <OnScroll minHeight="24rem">
        <ShopCTA />
      </OnScroll>
      <OnScroll minHeight="20rem">
        <Newsletter />
      </OnScroll>
    </>
  )
}

export default Home

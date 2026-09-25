import './ShopCTA.css'

/**
 * Closing beat of the homepage — a single pre-composed campaign banner
 * (headline, photo, copy, "Our story" CTA and handwritten tagline are all
 * baked into the image itself), so this just needs to render full-bleed
 * with no overlaid copy on top of it.
 */
function ShopCTA() {
  return (
    <div className="beyond">
      <img
        src="/images/home-beyond-banner.webp"
        alt="A culture that goes beyond trends. It's more than just a fit — it's freedom. Oversized is for the dreamers, the creators, the doers, the traditional, the minimal, the bold. It's for everyone. It's a mindset. Same people, different stories."
        width="2172"
        height="724"
        loading="lazy"
        decoding="async"
      />
    </div>
  )
}

export default ShopCTA

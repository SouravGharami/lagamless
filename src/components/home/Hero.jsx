import Container from '../Container.jsx'
import Button from '../Button.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './Hero.css'

function Hero() {
  return (
    <section className="hero">
      <div className="hero__media">
        <EditorialImage image={HOME_IMAGES.hero} className="hero__image" />
      </div>

      <Container className="hero__content">
        <p className="text-label hero__eyebrow">Autumn / Winter Collection</p>
        <h1 className="text-hero hero__headline">Wear your attitude.</h1>
        <p className="text-lead hero__lead">
          LAGAMLESS builds oversized silhouettes with room to move — not for
          a body type, but for a state of mind. Cut loose, worn with intent.
        </p>
        <div className="hero__actions">
          <Button to="/shop" variant="primary">
            Shop the collection
          </Button>
          <Button to="/shop" variant="ghost">
            See what's new
          </Button>
        </div>
      </Container>
    </section>
  )
}

export default Hero

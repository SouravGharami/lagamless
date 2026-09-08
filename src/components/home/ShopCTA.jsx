import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Button from '../Button.jsx'
import Reveal from '../Reveal.jsx'
import './ShopCTA.css'

function ShopCTA() {
  return (
    <Section className="shop-cta">
      <Container className="shop-cta__inner">
        <Reveal>
          <h2 className="text-h1 shop-cta__headline">
            Find your fit.<br />Wear your attitude.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <Button to="/shop" variant="primary" className="shop-cta__button">
            Shop the collection
          </Button>
        </Reveal>
      </Container>
    </Section>
  )
}

export default ShopCTA

import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './OversizedChoice.css'

function OversizedChoice() {
  return (
    <Section tight>
      <Container className="oversized">
        <Reveal className="oversized__image-wrap">
          <EditorialImage image={HOME_IMAGES.oversizedChoice} />
        </Reveal>
        <Reveal delay={100} className="oversized__text">
          <h2 className="text-h1 oversized__headline">Oversized is a choice.</h2>
          <p className="text-lead oversized__lead">
            Not a fallback. Not a fit for someone else's body. You don't
            wear it because you have to — you wear it because you chose it.
          </p>
        </Reveal>
      </Container>
    </Section>
  )
}

export default OversizedChoice

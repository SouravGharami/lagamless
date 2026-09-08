import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './CampaignEditorial.css'

function CampaignEditorial() {
  return (
    <Section tight className="campaign">
      <Container>
        <div className="campaign__grid">
          <Reveal className="campaign__image campaign__image--primary">
            <EditorialImage image={HOME_IMAGES.campaignPrimary} ratio="3 / 4" />
          </Reveal>
          <Reveal delay={100} className="campaign__image campaign__image--secondary">
            <EditorialImage image={HOME_IMAGES.campaignSecondary} ratio="3 / 4" />
          </Reveal>
        </div>
        <Reveal delay={150}>
          <p className="text-lead campaign__caption">
            Shot on the street, worn the same way. LAGAMLESS campaigns are
            built around real movement, not a studio backdrop.
          </p>
        </Reveal>
      </Container>
    </Section>
  )
}

export default CampaignEditorial

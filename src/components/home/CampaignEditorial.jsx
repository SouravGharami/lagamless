import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './CampaignEditorial.css'

// Real, checkable claims about the product — not decoration. This is the
// homepage's one "why should I trust this" beat, so every value here is
// something the brand can actually stand behind rather than a vague mood.
const SPECS = [
  { value: '240 GSM', label: 'Heavyweight cotton — holds shape, doesn\u2019t go sheer' },
  { value: 'Drop-shoulder', label: 'Cut wide on purpose, room to actually move' },
  { value: '8 sizes', label: 'One relaxed fit, sized for every body' },
  { value: '0 studio poses', label: 'Every campaign shot on a real street' },
]

/**
 * Rebuilt from a three-thumbnail image row into a single confident visual
 * paired with a proof strip. The old layout leaned entirely on placeholder
 * mannequin art to carry the section; this version gives the section a job
 * — make the case for the fabric and cut in plain, specific terms — so it
 * still reads as meaningful even before real campaign photography lands.
 */
function CampaignEditorial() {
  return (
    <Section tight className="campaign">
      <div className="campaign__banner">
        <Container>
          <Reveal>
            <p className="text-label campaign__label">See it. From every angle.</p>
            <h2 className="text-h1 campaign__headline">
              Shot on the street.<br />Worn the same way.
            </h2>
          </Reveal>
        </Container>
      </div>

      <Container>
        <div className="campaign__body">
          <Reveal className="campaign__visual">
            <EditorialImage image={HOME_IMAGES.campaignPrimary} ratio="4 / 5" />
            <div className="campaign__spec-card">
              <p className="text-label campaign__spec-eyebrow">On the fabric</p>
              <p className="campaign__spec-line">240 GSM &middot; reinforced, double-stitched hem</p>
            </div>
          </Reveal>

          <div className="campaign__facts">
            <Reveal>
              <p className="text-lead campaign__caption">
                No studio backdrop, no staged pose — LAGAMLESS campaigns are
                built around real movement, in real Indian streets. Here's
                what's actually holding the shape together.
              </p>
            </Reveal>

            <ul className="campaign__stats">
              {SPECS.map((spec, index) => (
                <Reveal as="li" key={spec.value} delay={90 + index * 70} className="campaign__stat">
                  <span className="campaign__stat-value">{spec.value}</span>
                  <span className="text-small campaign__stat-label">{spec.label}</span>
                </Reveal>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </Section>
  )
}

export default CampaignEditorial

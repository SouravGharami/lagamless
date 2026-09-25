import { Link } from 'react-router-dom'
import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './LookEditorial.css'

// Three concrete outfit formulas instead of a single, vague hanging-piece
// composition — this is the section's actual job: show how the pieces get
// worn together, not just that they exist. Every card still lands on the
// real /shop route (see the note in CategoryShowcase.jsx).
const LOOKS = [
  {
    name: 'Street Off-Duty',
    mood: 'Easy, unbothered, worn loose',
    formula: ['Oversized Tee', 'Cargo Pants', 'Cap'],
    image: HOME_IMAGES.lookPrimary,
  },
  {
    name: 'Layered Up',
    mood: 'Built for cooler nights out',
    formula: ['Graphic Tee', 'Shirt Jacket', 'Joggers'],
    image: HOME_IMAGES.attitudeStatement,
  },
  {
    name: 'All Black Everything',
    mood: 'No compromise, no color',
    formula: ['Black Tee', 'Black Joggers', 'Black Sneakers'],
    image: HOME_IMAGES.campaignSecondary,
  },
]

/**
 * Rebuilt from a single cropped hanging-piece composition (a primary +
 * secondary image with no real point of view) into three concrete outfit
 * formulas. This gives the section an actual job on the homepage — show
 * three different ways to build a fit — instead of just being another
 * photography slot.
 */
function LookEditorial() {
  return (
    <Section className="look">
      <Container className="look__header">
        <Reveal>
          <p className="text-label">Styled</p>
          <h2 className="text-h1 look__headline">Three ways to wear it.</h2>
          <p className="text-lead look__lede">
            Not a fit guide — a starting point. Mix it, swap it, oversize
            whatever you want.
          </p>
        </Reveal>
      </Container>

      <Container>
        <ul className="look__grid">
          {LOOKS.map((look, index) => (
            <Reveal as="li" key={look.name} delay={index * 90} className="look__cell">
              <Link to="/shop" className="look__card">
                <div className="look__image-wrap">
                  <span className="look__number">{String(index + 1).padStart(2, '0')}</span>
                  <EditorialImage image={look.image} ratio="4 / 5" className="look__image" />
                </div>
                <div className="look__info">
                  <span className="text-h3 look__name">{look.name}</span>
                  <span className="text-small look__mood">{look.mood}</span>
                  <ul className="look__formula">
                    {look.formula.map((piece) => (
                      <li key={piece} className="look__piece">{piece}</li>
                    ))}
                  </ul>
                  <span className="look__cta">
                    Shop this fit <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
      </Container>
    </Section>
  )
}

export default LookEditorial

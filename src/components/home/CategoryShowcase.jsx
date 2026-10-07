import { Link } from 'react-router-dom'
import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import EditorialImage from '../EditorialImage.jsx'
import { HOME_IMAGES } from '../../data/homeImages.js'
import './CategoryShowcase.css'

// Curated, presentation-only groupings — not database categories. Every
// tile links to the same real /shop route (see productQuery.js — the shop
// filters are local UI state today, not URL-addressable), so this stays
// purely a mood-driven discovery aid rather than a fabricated taxonomy.
const CATEGORIES = [
  { label: 'The Minimal', blurb: 'Pared-back, one tone', image: HOME_IMAGES.attitudeMinimal },
  { label: 'The Bold', blurb: 'High-contrast, loud cuts', image: HOME_IMAGES.attitudeBold },
  { label: 'The Dark', blurb: 'All-black, no compromise', image: HOME_IMAGES.attitudeDark },
  { label: 'The Statement', blurb: 'One piece, all attention', image: HOME_IMAGES.attitudeStatement },
  { label: 'The Everyday', blurb: 'Easy, on repeat', image: HOME_IMAGES.attitudeEveryday },
]

const TICKER_WORDS = ['Minimal', 'Bold', 'Dark', 'Statement', 'Everyday', 'Oversized', 'Lagamless']

function CategoryShowcase() {
  return (
    <Section className="category-showcase">
      <div className="category-showcase__ticker" aria-hidden="true">
        <div className="category-showcase__ticker-track">
          {[...TICKER_WORDS, ...TICKER_WORDS, ...TICKER_WORDS].map((word, i) => (
            <span className="category-showcase__ticker-word" key={`${word}-${i}`}>
              {word} <span className="category-showcase__ticker-dot">●</span>
            </span>
          ))}
        </div>
      </div>

      <Container>
        <Reveal className="category-showcase__intro">
          <p className="text-label">Discover</p>
          <h2 className="category-showcase__headline">Shop by category.</h2>
          <p className="text-lead category-showcase__lede">
            Five moods, one shelf. Pick the attitude, we'll size it oversized.
          </p>
        </Reveal>

        <ul className="category-showcase__grid">
          {CATEGORIES.map(({ label, blurb, image }, index) => (
            <Reveal as="li" key={label} delay={index * 60} className="category-showcase__item">
              <Link to="/shop" className="category-showcase__card">
                <div className="category-showcase__image-wrap">
                  <EditorialImage image={image} ratio="4 / 5" className="category-showcase__image" />
                  <span className="category-showcase__number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="category-showcase__arrow" aria-hidden="true">→</span>
                </div>
                <div className="category-showcase__text">
                  <span className="text-h3 category-showcase__label">{label}</span>
                  <span className="text-small category-showcase__blurb">{blurb}</span>
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
      </Container>
    </Section>
  )
}

export default CategoryShowcase

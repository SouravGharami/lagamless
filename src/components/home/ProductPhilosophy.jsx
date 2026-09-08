import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import './ProductPhilosophy.css'

const JOURNEY = [
  'See it',
  'Inspect it',
  'Understand the fabric',
  'Understand the fit',
  'Check measurements',
  'Understand the design',
  'See it styled',
  'Buy',
]

function ProductPhilosophy() {
  return (
    <Section className="philosophy">
      <Container className="philosophy__grid">
        <Reveal className="philosophy__intro">
          <p className="text-label">Our philosophy</p>
          <h2 className="text-h1 philosophy__headline">Buy before experience.</h2>
          <p className="text-lead philosophy__lead">
            We'd rather you know exactly what you're getting than guess.
            Every product is built to be understood before it's bought —
            not just seen.
          </p>
        </Reveal>

        <ol className="philosophy__journey">
          {JOURNEY.map((step, index) => (
            <Reveal key={step} as="li" delay={index * 50} className="philosophy__step">
              <span className="philosophy__number">{String(index + 1).padStart(2, '0')}</span>
              <span className="philosophy__label">{step}</span>
            </Reveal>
          ))}
        </ol>
      </Container>
    </Section>
  )
}

export default ProductPhilosophy

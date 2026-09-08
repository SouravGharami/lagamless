import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import './BrandStatement.css'

const WORDS = ['Style', 'Attitude', 'Choice', 'Culture']

function BrandStatement() {
  return (
    <Section className="brand-statement">
      <Container>
        <Reveal as="ul" className="brand-statement__words">
          {WORDS.map((word) => (
            <li key={word} className="brand-statement__word text-h1">
              {word}
            </li>
          ))}
        </Reveal>
        <Reveal delay={150}>
          <p className="text-lead brand-statement__lead">
            LAGAMLESS isn't a fit. It's a decision — made in how you carry
            yourself, not the size on the label.
          </p>
        </Reveal>
      </Container>
    </Section>
  )
}

export default BrandStatement

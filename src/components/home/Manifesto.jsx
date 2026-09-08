import Container from '../Container.jsx'
import Section from '../Section.jsx'
import Reveal from '../Reveal.jsx'
import './Manifesto.css'

const LINES = ['No rules.', 'No permission.', 'No predefined way.', 'Wear what feels like you.']

function Manifesto() {
  return (
    <Section className="manifesto">
      <Container>
        <Reveal>
          <h2 className="text-hero manifesto__headline">Wear your attitude.</h2>
        </Reveal>
        <ul className="manifesto__lines">
          {LINES.map((line, index) => (
            <Reveal as="li" key={line} delay={index * 80} className="manifesto__line text-h3">
              {line}
            </Reveal>
          ))}
        </ul>
      </Container>
    </Section>
  )
}

export default Manifesto

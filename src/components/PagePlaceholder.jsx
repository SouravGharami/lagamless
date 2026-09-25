import Container from './Container.jsx'
import Section from './Section.jsx'

/**
 * Shared shell for pages not yet built. Keeps the design system applied
 * everywhere so no route feels unfinished, even before Part 2 fills it in.
 */
function PagePlaceholder({ eyebrow, title, description }) {
  return (
    <Section>
      <Container>
        {eyebrow && <p className="text-label">{eyebrow}</p>}
        <h1 className="text-h1" style={{ marginTop: eyebrow ? '1rem' : 0 }}>
          {title}
        </h1>
        {description && (
          <p className="text-lead" style={{ marginTop: '1.5rem', maxWidth: '52ch' }}>
            {description}
          </p>
        )}
      </Container>
    </Section>
  )
}

export default PagePlaceholder

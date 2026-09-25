import Reveal from '../Reveal.jsx'
import './BuyBeforeExperience.css'

/**
 * The signature LAGAMLESS product experience: an editorial, numbered walk
 * from "see it" to "buy". Each step links to the part of the page that
 * actually does that job, so the section is a guide, not decoration.
 *
 * @param {{ product: import('../../data/products.js').Product }} props
 */
function BuyBeforeExperience({ product }) {
  const steps = [
    {
      n: '01',
      label: 'See it',
      copy: `${product.name}, shot the way it's cut — full front, full back, on a body.`,
      href: '#gallery',
    },
    {
      n: '02',
      label: 'Inspect it',
      copy: 'Zoom into the construction — stitching, hardware, the details a thumbnail hides.',
      href: '#gallery',
    },
    {
      n: '03',
      label: 'Understand the fabric',
      copy: `${product.fabric}. Weight, hand-feel, and how it wears in, laid out plainly.`,
      href: '#details',
    },
    {
      n: '04',
      label: 'Understand the fit',
      copy: `${product.fit} — not a size chart guess. What the silhouette is meant to do.`,
      href: '#fit',
    },
    {
      n: '05',
      label: 'Check measurements',
      copy: 'Exact numbers by size, so choosing one is a decision, not a gamble.',
      href: '#measurements',
    },
    {
      n: '06',
      label: 'Understand the design',
      copy: product.design ?? 'The thinking behind the cut, explained rather than assumed.',
      href: '#design-story',
    },
    {
      n: '07',
      label: 'See styling',
      copy: product.stylingNote ?? 'How this piece is meant to be worn, layered, and finished.',
      href: '#styling',
    },
    {
      n: '08',
      label: 'Buy',
      copy: 'Select a size and add it to your bag — no detours, no surprises.',
      href: '#buy-box',
    },
  ]

  function handleClick(e, href) {
    e.preventDefault()
    const target = document.querySelector(href)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="buy-before" id="buy-before">
      <Reveal>
        <p className="text-label buy-before__eyebrow">The LAGAMLESS way</p>
        <h2 className="text-h2 buy-before__heading">Buy before experience.</h2>
        <p className="text-lead buy-before__intro">
          We'd rather you understand this piece completely than buy it fast. Work through it in
          order, or jump straight to what you're unsure about.
        </p>
      </Reveal>

      <ol className="buy-before__list">
        {steps.map((step, i) => (
          <Reveal key={step.n} delay={i * 60} as="li" className="buy-before__item">
            <a href={step.href} className="buy-before__link" onClick={(e) => handleClick(e, step.href)}>
              <span className="buy-before__number">{step.n}</span>
              <span className="buy-before__body">
                <span className="buy-before__label">{step.label}</span>
                <span className="buy-before__copy">{step.copy}</span>
              </span>
              <span className="buy-before__arrow" aria-hidden="true">
                →
              </span>
            </a>
          </Reveal>
        ))}
      </ol>
    </div>
  )
}

export default BuyBeforeExperience

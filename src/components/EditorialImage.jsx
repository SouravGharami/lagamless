import './EditorialImage.css'

/**
 * Renders a photograph if `src` is set, otherwise a shared placeholder
 * treatment. Keeps every "photography goes here" slot on the site visually
 * consistent until real campaign images are dropped in.
 *
 * `ratio` is optional — omit it (as Hero does) when a parent needs to
 * control sizing via CSS instead (e.g. `height: 100%` at a breakpoint).
 * Passing it sets an inline aspect-ratio, which will always win over a
 * stylesheet rule, so don't pass it if the image needs to be responsively
 * overridden later.
 *
 * @param {{ image: { src: string|null, alt: string }, ratio?: string, className?: string }} props
 */
function EditorialImage({ image, ratio, className = '' }) {
  return (
    <div
      className={`editorial-image ${className}`.trim()}
      style={ratio ? { aspectRatio: ratio } : undefined}
    >
      {image?.src ? (
        <img src={image.src} alt={image.alt} loading="lazy" />
      ) : (
        <div className="editorial-image__placeholder" role="img" aria-label={image?.alt || 'Campaign photography placeholder'}>
          <span className="editorial-image__mark">LAGAMLESS</span>
        </div>
      )}
    </div>
  )
}

export default EditorialImage

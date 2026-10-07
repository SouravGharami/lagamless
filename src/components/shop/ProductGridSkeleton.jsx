import './ProductGridSkeleton.css'

/**
 * @param {{ count?: number }} props
 */
function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="shop-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-card" key={i}>
          <div className="skeleton-card__image" />
          <div className="skeleton-card__line skeleton-card__line--name" />
          <div className="skeleton-card__line skeleton-card__line--price" />
        </div>
      ))}
    </div>
  )
}

export default ProductGridSkeleton

import Button from '../Button.jsx'
import './EmptyState.css'

/**
 * @param {{ title: string, description?: string, actionLabel?: string, onAction?: () => void }} props
 */
function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark" aria-hidden="true">
        LAGAMLESS
      </span>
      <h2 className="text-h3 empty-state__title">{title}</h2>
      {description && <p className="text-lead empty-state__description">{description}</p>}
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction} className="empty-state__action">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

export default EmptyState

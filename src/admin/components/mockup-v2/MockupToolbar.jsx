import { CloseIcon } from './icons.jsx'

/**
 * Top bar. Preview toggles a clean composition view. Saving happens through "Save to gallery" (Export panel); the pill
 * shows when a view has artwork that is not yet in this product's gallery.
 */
export default function MockupToolbar({ previewMode, onTogglePreview, onClose, closeRef, unsaved = false }) {
  return (
    <header className="mv2-toolbar">
      <div className="mv2-toolbar__brand">
        <h2 id="mv2-title" className="mv2-title">LAGAMLESS Mockup Studio</h2>
        <span className="mv2-pill" role="status">{unsaved ? 'Not saved to gallery yet' : 'Session only'}</span>
      </div>

      <div className="mv2-toolbar__actions">
        <button type="button" className={`mv2-btn${previewMode ? ' is-active' : ''}`} aria-pressed={previewMode} onClick={onTogglePreview}>
          Preview
        </button>
        <button ref={closeRef} type="button" className="mv2-btn mv2-btn--close" onClick={onClose} aria-label="Return to product form">
          <CloseIcon />
          <span className="mv2-btn__label">Return to product</span>
        </button>
      </div>
    </header>
  )
}

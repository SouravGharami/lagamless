import { MODEL_VIEW_DEFS, JOB_STATUS_LABELS } from './humanModelState.js'
import { READY_HEADLINE } from './fitReadiness.js'

/** STEP 4 view selection + STEP 3 CTA. The CTA never generates in this step: it only shows the honest notice. */
export default function HumanModelControls({ selectedViews, onToggleView, canFit, blockers = [], pending = false, checklist = [], status, notice, inputSummary, onFit, onDismissNotice, providerReady = false, supportedViews = [] }) {
  return (
    <div className="hms-controls">
      <fieldset className="hms-views">
        <legend className="hms-legend">Model views to generate later</legend>
        <div className="hms-views__grid">
          {MODEL_VIEW_DEFS.map((v) => {
            const supported = supportedViews.length === 0 || supportedViews.includes(v.id)
            const checked = selectedViews.includes(v.id)
            return (
              <label key={v.id} className={`hms-view${checked ? ' is-selected' : ''}${supported ? '' : ' is-disabled'}`} title={supported ? v.hint : 'This provider does not support this view.'}>
                <input type="checkbox" checked={checked} disabled={!supported} onChange={() => onToggleView(v.id)} />
                <span>{v.label}{!supported ? ' — unavailable' : ''}</span>
              </label>
            )
          })}
        </div>
        <p className="hms-hint">
          {selectedViews.length === 0 ? 'Select at least one view.' : `${selectedViews.length} selected. Nothing is generated yet — this only records your choice.`}
        </p>
      </fieldset>

      <div className="hms-fit">
        <button type="button" className="mv2-btn mv2-btn--primary hms-fit__btn" disabled={!canFit || pending} onClick={onFit}>
          {pending ? 'GENERATING…' : 'FIT T-SHIRT TO MODEL'}
        </button>
        {!canFit && blockers.length > 0 && (
          <ul className={`hms-needs${pending ? ' is-pending' : ''}`} role="status" aria-label="What is missing">
            {blockers.map((b) => <li key={b.code}>{b.message}</li>)}
          </ul>
        )}
        {canFit && (
          <div className="hms-ready" role="status">
            <strong className="hms-ready__title">{READY_HEADLINE}</strong>
            <ul className="hms-ready__list">
              {checklist.map((row) => <li key={row.id}><span aria-hidden="true">✓</span> {row.label}</li>)}
            </ul>
            <span className="hms-hint">{providerReady ? 'Provider connected. FIT T-SHIRT TO MODEL will generate the supported view(s).' : 'No AI provider is connected yet, so nothing is generated in this step.'}</span>
          </div>
        )}
        <p className="hms-status" role="status">Status: {JOB_STATUS_LABELS[status]}</p>
      </div>

      {notice && (
        <div className="hms-notice" role="status">
          <span>{notice}{inputSummary ? <><br /><span className="hms-hint">{inputSummary}</span></> : null}</span>
          <button type="button" className="mv2-notice__dismiss" onClick={onDismissNotice}>Dismiss</button>
        </div>
      )}
    </div>
  )
}

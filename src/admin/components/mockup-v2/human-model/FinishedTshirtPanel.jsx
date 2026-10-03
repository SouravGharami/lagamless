import { useState } from 'react'
import { SURFACES } from '../mockupStudioState.js'
import { summarizeSnapshot } from '../finishedTshirtSnapshot.js'

/**
 * STEP 2 — "Use current T-shirt": loads the finished T-shirt from Mockup Studio and previews the REAL rendered images
 * (made by the existing compositor). Display only; it is not an editor and never writes back to the studio.
 */
export default function FinishedTshirtPanel({ snapshot, status, error, stale, canUse, onUse, onClear }) {
  const [picked, setPicked] = useState(null)
  const preparing = status === 'preparing'
  const summary = snapshot ? summarizeSnapshot(snapshot) : null
  const tabs = summary ? summary.renderedViews : []
  const active = tabs.includes(picked) ? picked : tabs[0]
  const render = active ? snapshot.renderedComposition[active] : null

  return (
    <div className="hms-tshirt">
      <div className="hms-row">
        <button type="button" className="mv2-btn mv2-btn--primary" disabled={!canUse || preparing} onClick={onUse}>
          {preparing ? 'Preparing finished T-shirt…' : snapshot ? 'Refresh from Mockup Studio' : 'USE CURRENT T-SHIRT'}
        </button>
        {snapshot && !preparing && <button type="button" className="mv2-btn mv2-btn--danger" onClick={onClear}>Clear</button>}
      </div>

      {!canUse && !snapshot && (
        <p className="hms-hint">No finished T-shirt yet. In the Studio tab, upload a T-shirt photo and place at least one visible artwork on it.</p>
      )}

      {error && (
        <div className="hms-messages hms-messages--error" role="alert">
          <p>{error.message}</p>
          {error.details.length > 0 && <ul>{error.details.map((d) => <li key={d}>{d}</li>)}</ul>}
          {error.failures?.length > 0 && (
            <details className="hms-tech">
              <summary>Technical details (for developers)</summary>
              <ul>{error.failures.map((f, i) => <li key={`${f.code}-${i}`}><code>{f.code}</code>{f.view ? ` · ${f.view}` : ''} — {f.technical}</li>)}</ul>
            </details>
          )}
        </div>
      )}

      {snapshot && (
        <>
          <p className={`hms-loaded${stale ? ' is-stale' : ''}`} role="status">
            {stale
              ? '⚠ Mockup Studio has changed since this T-shirt was loaded. Click “Refresh from Mockup Studio” to use the current design.'
              : '✓ Finished design loaded'}
          </p>

          <dl className="hms-facts">
            {SURFACES.map((s) => {
              const c = summary.bySurface[s.key]
              return (
                <div key={s.key}>
                  <dt>{s.label} artwork</dt>
                  <dd>{c.rendered}{c.placed !== c.rendered ? ` (+${c.placed - c.rendered} not rendered)` : ''}</dd>
                </div>
              )
            })}
            <div><dt>Garment</dt><dd>{[snapshot.tshirt.type, snapshot.tshirt.color].filter(Boolean).join(' · ') || '—'}</dd></div>
          </dl>

          {snapshot.warnings.length > 0 && (
            <ul className="hms-messages hms-messages--warn" role="status">{snapshot.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
          )}

          {tabs.length > 1 && (
            <div className="hms-tabs" role="tablist" aria-label="Finished T-shirt views">
              {tabs.map((view) => (
                <button key={view} type="button" role="tab" aria-selected={view === active} className={`hms-tab${view === active ? ' is-active' : ''}`} onClick={() => setPicked(view)}>
                  {snapshot.views[view].label}
                </button>
              ))}
            </div>
          )}

          {render && (
            <figure className="hms-preview__frame hms-tshirt__frame">
              <img className="hms-preview__img" src={render.url} alt={`Finished T-shirt, ${snapshot.views[active].label} view`} />
              <figcaption className="hms-hint">
                {snapshot.views[active].label} · {render.width} × {render.height} px{render.downscaled ? ` (reduced from ${render.sourceWidth} × ${render.sourceHeight} to fit this device)` : ''} · rendered by the Mockup Studio compositor
              </figcaption>
            </figure>
          )}
        </>
      )}
    </div>
  )
}

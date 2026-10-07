import { ANGLE_DEFS } from './generation/mockupAngles.js'
import { viewCounts } from './mockupStudioState.js'

/** Step 5-3C — switches the view (mockup angle) being edited. Each view has its own photo, masks and artwork placements. */
export default function ViewTabs({ activeView, composition, viewPhotos, tshirt, onSelect }) {
  const counts = viewCounts(composition)
  return (
    <div className="mv2-surfaces" role="tablist" aria-label="Mockup view">
      {ANGLE_DEFS.map(({ id, label }) => {
        const active = id === activeView
        const hasPhoto = active ? !!tshirt : !!viewPhotos?.[id]?.tshirt
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`mv2-surface${active ? ' is-active' : ''}`}
            onClick={() => onSelect(id)}
            title={hasPhoto ? label : `${label} — no photo uploaded yet`}
          >
            <span>{label}{hasPhoto ? '' : ' ·'}</span>
            <span className="mv2-count" aria-label={`${counts[id]} artwork placements`}>{counts[id]}</span>
          </button>
        )
      })}
    </div>
  )
}

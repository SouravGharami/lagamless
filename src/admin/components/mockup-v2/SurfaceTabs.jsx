import { SURFACES, surfaceCounts } from './mockupStudioState.js'

/** Front / Back / Left sleeve / Right sleeve switcher with live per-surface artwork counts. */
export default function SurfaceTabs({ activeSurface, composition, onSelect }) {
  const counts = surfaceCounts(composition)
  return (
    <div className="mv2-surfaces" role="tablist" aria-label="Garment surface">
      {SURFACES.map(({ key, label }) => {
        const count = counts[key]
        const active = key === activeSurface
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`mv2-surface${active ? ' is-active' : ''}`}
            onClick={() => onSelect(key)}
          >
            <span>{label}</span>
            <span className="mv2-count" aria-label={`${count} artwork layers`}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}

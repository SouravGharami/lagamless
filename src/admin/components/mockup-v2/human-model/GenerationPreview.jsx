import { MODEL_VIEW_DEFS } from './humanModelState.js'
import { formatFileSize } from './humanModelValidation.js'

const sortViews = (views) => Object.keys(views).sort((a, b) => (a === 'FRONT' ? -1 : b === 'FRONT' ? 1 : a === 'BACK' ? -1 : b === 'BACK' ? 1 : 0))

/**
 * STEP 3 — shows the EXACT source assets that will eventually be sent to a provider. Preparation preview only:
 * the images are the verified garment renders and the uploaded model photo; nothing is generated or sent.
 */
export default function GenerationPreview({ modelImage, garment, selectedViews }) {
  const viewIds = garment ? sortViews(garment.views) : []
  return (
    <div className="hms-genprev">
      <p className="hms-hint">Preparation preview — these are the exact images that will be used for AI fitting later. Nothing is generated or sent.</p>

      <div className="hms-genprev__flow">
        <section className="hms-genprev__col" aria-label="Human model">
          <h4 className="hms-genprev__h">Human model</h4>
          {modelImage ? (
            <figure className="hms-genprev__fig">
              <img className="hms-genprev__img" src={modelImage.previewUrl} alt={`Human model: ${modelImage.fileName}`} />
              <figcaption className="hms-hint">{modelImage.width} × {modelImage.height} px · {formatFileSize(modelImage.fileSize)}</figcaption>
            </figure>
          ) : <p className="hms-hint">Human model required.</p>}
        </section>

        <span className="hms-genprev__plus" aria-hidden="true">+</span>

        <section className="hms-genprev__col hms-genprev__col--wide" aria-label="Finished T-shirt">
          <h4 className="hms-genprev__h">Finished T-shirt</h4>
          {viewIds.length > 0 ? (
            <div className="hms-genprev__garments">
              {viewIds.map((view) => {
                const g = garment.views[view]
                return (
                  <figure key={view} className="hms-genprev__fig">
                    <img className="hms-genprev__img" src={g.objectUrl} alt={`Finished T-shirt, ${g.label}`} />
                    <figcaption className="hms-hint">{g.label} · {g.width} × {g.height} px · {formatFileSize(g.bytes)}</figcaption>
                  </figure>
                )
              })}
            </div>
          ) : <p className="hms-hint">Finished T-shirt required.</p>}
          {['leftSleeve', 'rightSleeve'].filter((k) => garment?.[k]).map((k) => (
            <p key={k} className="hms-hint">{k === 'leftSleeve' ? 'Left' : 'Right'} sleeve artwork ({garment[k].layerCount}) is part of the {garment.views[garment[k].view]?.label ?? garment[k].view} image.</p>
          ))}
        </section>
      </div>

      <h4 className="hms-genprev__h">Requested views</h4>
      <ul className="hms-genprev__views">
        {MODEL_VIEW_DEFS.map((v) => (
          <li key={v.id} className={selectedViews.includes(v.id) ? 'is-on' : ''}>
            <span aria-hidden="true">{selectedViews.includes(v.id) ? '☑' : '☐'}</span> {v.label}
            <span className="hms-sr"> — {selectedViews.includes(v.id) ? 'requested' : 'not requested'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

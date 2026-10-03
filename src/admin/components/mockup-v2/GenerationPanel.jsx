import { ANGLE_DEFS } from './generation/mockupAngles.js'
import { STATUS_LABELS } from './generation/generationStatus.js'
import { availableTemplates, resolveTemplate, buildMockupProject } from './generation/mockupProject.js'
import { isTemplateUsable } from './generation/templateModel.js'
import { useTemplateLibrary } from './templates/useTemplateLibrary.js'

/**
 * Step 5-1 — minimal "Mockup generation" section. It only records the template and angle choice and
 * shows the real status. There is deliberately no Generate button: no provider is connected yet.
 */
export default function GenerationPanel({ state, dispatch }) {
  useTemplateLibrary() // re-render when library templates are added, replaced, deactivated or removed
  const { generation } = state
  const templates = availableTemplates(state)
  const current = resolveTemplate(state)
  const project = buildMockupProject(state)
  const selectedValue = generation.templateId ?? (current ? current.id : '')

  return (
    <div className="mv2-group mv2-gen">
      <h3 className="mv2-group__title">Mockup generation</h3>

      <div className="mv2-field">
        <label className="mv2-field__label" htmlFor="mv2-gen-template">Template</label>
        <select
          id="mv2-gen-template"
          className="mv2-select"
          value={selectedValue}
          disabled={templates.length === 0}
          onChange={(event) => {
            const id = event.target.value
            // The "uploaded photo" entry is the derived one (id prefixed `uploaded:`) => templateId null.
            // Any other entry is a library photo template: load its photo (reversible from its card), keeping artwork/background/settings.
            if (id.startsWith('uploaded:')) dispatch({ type: 'SET_GENERATION_TEMPLATE', id: null })
            else dispatch({ type: 'APPLY_TEMPLATE_PHOTO', id })
          }}
        >
          {templates.length === 0 && <option value="">No template available</option>}
          {templates.map((t) => (
            <option key={t.id} value={t.id} disabled={!isTemplateUsable(t)}>
              {t.name}{isTemplateUsable(t) ? '' : ' (not available yet)'}
            </option>
          ))}
        </select>
      </div>

      <div className="mv2-field">
        <label className="mv2-field__label" htmlFor="mv2-gen-angle">Angle</label>
        <select
          id="mv2-gen-angle"
          className="mv2-select"
          value={generation.angle}
          onChange={(event) => dispatch({ type: 'SET_GENERATION_ANGLE', angle: event.target.value })}
        >
          {ANGLE_DEFS.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>

      <div className="mv2-field">
        <span className="mv2-field__label">Generation status</span>
        <span className="mv2-gen__status" role="status">{STATUS_LABELS[generation.status]}</span>
      </div>

      {project.unsupportedRegions.length > 0 && (
        <p className="mv2-hint mv2-hint--accent" role="status">
          This photo template does not list {project.unsupportedRegions.map((r) => r.toLowerCase().replace('_', ' ')).join(', ')} as a print area, but artwork is placed there.
        </p>
      )}

      <p className="mv2-hint">
        {current ? 'Uses your uploaded T-shirt photo as the template base. ' : 'Upload a T-shirt photo to use it as a template. '}
        Generation isn&apos;t connected yet — this only records the template and angle for a later step.
      </p>
    </div>
  )
}

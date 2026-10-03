/**
 * Step 5-1 — the `generation` slice of the studio state (state.generation). It records CHOICES only
 * (which template, which angle, garment facts, settings) plus status/result placeholders that a later
 * step will drive. Nothing here reads or writes composition, T-shirt presentation, artwork or background.
 *
 *   templateId  null = "use the current T-shirt photo" (an uploaded_photo template derived on demand)
 */
import { DEFAULT_ANGLE } from './mockupAngles.js'
import { DEFAULT_GENERATION_SETTINGS } from './generationRequest.js'
import { GENERATION_STATUS } from './generationStatus.js'

export const DEFAULT_GARMENT = Object.freeze({ type: 'crew_neck_tee', color: null, fabric: null, size: null })

export function createInitialGenerationState() {
  return {
    templateId: null,
    angle: DEFAULT_ANGLE,
    garment: { ...DEFAULT_GARMENT },
    settings: { ...DEFAULT_GENERATION_SETTINGS },
    status: GENERATION_STATUS.IDLE,
    result: null,
  }
}

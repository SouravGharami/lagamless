/**
 * Step 5-1 — mockup ANGLES. Stable identifiers only; no images are produced here.
 * `legacyId` maps to the id the older studio (src/admin/lib/mockupTemplates.js ANGLES) uses,
 * so both systems can talk about the same shot. `regions` = artwork regions normally visible from that angle.
 */
export const MOCKUP_ANGLES = Object.freeze({
  FRONT: 'FRONT',
  THREE_QUARTER_FRONT: 'THREE_QUARTER_FRONT',
  SIDE: 'SIDE',
  BACK: 'BACK',
  THREE_QUARTER_BACK: 'THREE_QUARTER_BACK',
  DETAIL: 'DETAIL',
})

export const ANGLE_DEFS = Object.freeze([
  { id: 'FRONT', label: 'Front', legacyId: 'front', regions: ['FRONT'] },
  { id: 'THREE_QUARTER_FRONT', label: '3/4 Front', legacyId: 'three-quarter-front', regions: ['FRONT', 'LEFT_SLEEVE'] },
  { id: 'SIDE', label: 'Side', legacyId: 'side', regions: ['LEFT_SLEEVE', 'RIGHT_SLEEVE'] },
  { id: 'BACK', label: 'Back', legacyId: 'back', regions: ['BACK'] },
  { id: 'THREE_QUARTER_BACK', label: '3/4 Back', legacyId: 'three-quarter-back', regions: ['BACK', 'RIGHT_SLEEVE'] },
  { id: 'DETAIL', label: 'Detail / Sleeve', legacyId: 'detail', regions: ['FRONT', 'BACK', 'LEFT_SLEEVE', 'RIGHT_SLEEVE'] },
].map(Object.freeze))

export const DEFAULT_ANGLE = MOCKUP_ANGLES.FRONT

export const isAngle = (id) => ANGLE_DEFS.some((a) => a.id === id)
export const getAngle = (id) => ANGLE_DEFS.find((a) => a.id === id) || null
export const angleFromLegacyId = (legacyId) => ANGLE_DEFS.find((a) => a.legacyId === legacyId)?.id ?? null

/**
 * STEP 3 — FIT T-SHIRT TO MODEL readiness. Pure; no React.
 *
 * The button is enabled only when ALL hold:
 *   A. a valid human model exists
 *   B. a valid, current finished T-shirt exists
 *   C. the generation assets can actually be prepared (renders verified: present, non-empty, non-blank)
 * Otherwise `blockers` says EXACTLY what is missing. `pending` means "still checking", which is not a failure.
 *
 * Wording note: this says "Ready for AI fitting", never "AI ready" — no provider is connected yet.
 */
import { isHumanModelAssetUsable } from './humanModelAsset.js'
import { GARMENT_NOT_PREPARED_MESSAGE, headlineFor } from './exportSafety.js'

export const READY_HEADLINE = 'READY FOR AI FITTING'

const blocker = (code, message, details = []) => ({ code, message, details })

/**
 * @param garmentState { status: 'idle'|'checking'|'ready'|'failed', snapshotId, result } from useGarmentReadiness
 */
export function evaluateFitReadiness({ modelImage, snapshot, stale = false, snapshotStatus = 'idle', garmentState = null, requestedViews = [] }) {
  const blockers = []
  let pending = false

  if (!modelImage) blockers.push(blocker('HUMAN_MODEL_REQUIRED', 'Human model required'))
  else if (!isHumanModelAssetUsable(modelImage)) blockers.push(blocker('HUMAN_MODEL_INVALID', 'Human model is not usable — replace the image'))

  if (!snapshot) {
    blockers.push(snapshotStatus === 'preparing' ? blocker('TSHIRT_PREPARING', 'Finished T-shirt is being prepared…') : blocker('TSHIRT_REQUIRED', 'Finished T-shirt required'))
    if (snapshotStatus === 'preparing') pending = true
    if (snapshotStatus === 'failed') blockers.push(blocker('GARMENT_NOT_PREPARED', GARMENT_NOT_PREPARED_MESSAGE))
  } else if (stale) {
    blockers.push(blocker('TSHIRT_STALE', 'Finished T-shirt is out of date — refresh it from Mockup Studio'))
  }

  if (!requestedViews?.length) blockers.push(blocker('VIEWS_REQUIRED', 'Select at least one model view'))

  // C only matters once a current snapshot exists.
  if (snapshot && !stale) {
    const forThisSnapshot = garmentState && garmentState.snapshotId === snapshot.id
    if (!forThisSnapshot || garmentState.status === 'idle' || garmentState.status === 'checking') {
      blockers.push(blocker('GARMENT_CHECKING', 'Checking the garment images…'))
      pending = true
    } else if (garmentState.status === 'failed') {
      const failures = garmentState.result?.failures ?? []
      blockers.push(blocker('GARMENT_NOT_PREPARED', failures.length ? headlineFor(failures) : GARMENT_NOT_PREPARED_MESSAGE, failures))
    }
  }

  const ready = blockers.length === 0
  return { ready, pending: pending && !ready, blockers, missingText: blockers.map((b) => b.message).join(' · ') }
}

/**
 * The checkmark rows of the ready state. Only rows that are TRUE and only surfaces that actually exist
 * are returned, so the list can never claim a back garment for a front-only design.
 */
export function buildReadyChecklist({ garment, artworkPreserved }) {
  const rows = [
    { id: 'human', label: 'Human model ready' },
    { id: 'tshirt', label: 'Finished T-shirt ready' },
  ]
  if (artworkPreserved) rows.push({ id: 'artwork', label: 'Artwork preserved' })
  if (garment?.front) rows.push({ id: 'front', label: 'Front garment prepared' })
  if (garment?.back) rows.push({ id: 'back', label: 'Back garment prepared' })
  if (garment?.leftSleeve) rows.push({ id: 'leftSleeve', label: 'Left sleeve artwork included in the render' })
  if (garment?.rightSleeve) rows.push({ id: 'rightSleeve', label: 'Right sleeve artwork included in the render' })
  return rows
}

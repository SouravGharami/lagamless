/**
 * STEP 3 — provider-neutral generation assets.
 *
 *   buildGenerationAssets({ humanModel, snapshot, requestedViews })
 *     -> { ok, assets: { humanModel, garment, composition, requestedViews }, problems }
 *
 * Nothing provider-specific lives here: no endpoints, no keys, no payload formats. Images are BLOBS / Files
 * (plus session object URLs for previews) — never base64. A future provider turns these into whatever it needs
 * through assetAdapters.js.
 */
import { buildHumanModelGenerationInput } from './buildHumanModelGenerationInput.js'
import { isHumanModelAssetUsable } from './humanModelAsset.js'
import { GARMENT_NOT_PREPARED_MESSAGE, headlineFor } from './exportSafety.js'
import { prepareGarmentAssets } from './garmentAssets.js'

export const GENERATION_ASSETS_VERSION = 2

const problem = (code, message, details = []) => ({ code, message, details })

/**
 * Synchronous assembly from an ALREADY VERIFIED garment (output of prepareGarmentAssets). The UI uses this so toggling a
 * requested view doesn't re-decode every render.
 */
export function assembleGenerationAssets({ humanModel, snapshot, garmentResult, requestedViews }) {
  const problems = []
  if (!humanModel) problems.push(problem('HUMAN_MODEL_REQUIRED', 'Human model required'))
  else if (!isHumanModelAssetUsable(humanModel)) problems.push(problem('HUMAN_MODEL_INVALID', 'The human model image is not usable. Replace it with a valid PNG, JPG or WEBP.'))
  if (!snapshot) problems.push(problem('TSHIRT_REQUIRED', 'Finished T-shirt required'))
  if (!requestedViews?.length) problems.push(problem('VIEWS_REQUIRED', 'Select at least one model view'))
  if (snapshot && !garmentResult?.ok) {
    const failures = garmentResult?.failures ?? []
    problems.push(problem('GARMENT_NOT_PREPARED', failures.length ? headlineFor(failures) : GARMENT_NOT_PREPARED_MESSAGE, failures))
  }
  if (problems.length > 0) return { ok: false, assets: null, problems }

  // Reuse the Step 2 input builder for the composition + requested views so there is one definition of both.
  const base = buildHumanModelGenerationInput({ modelImage: humanModel, snapshot, requestedViews })
  if (!base.ok) return { ok: false, assets: null, problems: base.problems.map((m) => problem('INPUT_INVALID', m)) }
  const { composition, requestedViews: views } = base.input

  return {
    ok: true,
    problems: [],
    assets: {
      schemaVersion: GENERATION_ASSETS_VERSION,
      humanModel: {
        id: humanModel.id,
        sourceType: humanModel.sourceType,
        fileName: humanModel.fileName,
        mimeType: humanModel.mimeType,
        width: humanModel.width,
        height: humanModel.height,
        fileSize: humanModel.fileSize,
        blob: humanModel.file, // the uploaded File, untouched
        objectUrl: humanModel.sourceUrl, // session preview only
      },
      garment: garmentResult.garment,
      composition: {
        ...composition,
        snapshotId: snapshot.id,
        compositionId: snapshot.compositionSignature,
        artworkPreserved: garmentResult.artworkPreserved,
        warnings: snapshot.warnings,
      },
      requestedViews: views,
    },
  }
}

/** Full path: verify the garment renders, then assemble. `garmentResult` may be passed to skip re-verification. */
export async function buildGenerationAssets({ humanModel, snapshot, requestedViews, garmentResult, inspect }) {
  const verified = garmentResult ?? (snapshot ? await prepareGarmentAssets(snapshot, { inspect }) : null)
  return assembleGenerationAssets({ humanModel, snapshot, garmentResult: verified, requestedViews })
}

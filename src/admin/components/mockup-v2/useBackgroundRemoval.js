import { useCallback } from 'react'
import { removeBackground } from '../../lib/backgroundStudio.js'

const FAIL_MESSAGE = 'Background removal failed. Please try again.'

/**
 * Runs the project's existing in-browser background remover
 * (lib/backgroundStudio.js -> @imgly/background-removal) on the CURRENT
 * T-shirt's original image and stores the transparent result as
 * `processedUrl`. The original is never modified; a failure leaves it
 * visible and records an error the panel can show.
 *
 * State lives in the studio reducer (not the component) so closing the
 * studio mid-run can't lose the result.
 */
export function useBackgroundRemoval(tshirt, dispatch) {
  const run = useCallback(async () => {
    if (!tshirt || tshirt.bgStatus === 'processing') return
    const id = tshirt.id
    dispatch({ type: 'BG_START', id })
    try {
      // The remover takes any image URL; the blob: URL of the untouched upload works.
      const cutoutDataUrl = await removeBackground(tshirt.originalUrl)
      const blob = await (await fetch(cutoutDataUrl)).blob()
      dispatch({ type: 'BG_SUCCESS', id, url: URL.createObjectURL(blob) })
    } catch (err) {
      console.error('Mockup Studio: background removal failed', err)
      dispatch({ type: 'BG_FAIL', id, message: FAIL_MESSAGE })
    }
  }, [tshirt, dispatch])

  return run
}

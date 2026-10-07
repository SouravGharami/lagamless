import { useEffect, useState } from 'react'
import { prepareGarmentAssets } from './garmentAssets.js'

const IDLE = Object.freeze({ status: 'idle', snapshotId: null, result: null })

/**
 * Verifies the garment renders of the current finished-T-shirt snapshot (present, non-empty, decodable, not blank).
 * Runs once per snapshot — toggling requested views doesn't re-decode anything. A result that arrives after the
 * snapshot changed is dropped. Failures are logged for developers with their technical cause.
 */
export function useGarmentReadiness(snapshot) {
  const [state, setState] = useState(IDLE)

  useEffect(() => {
    if (!snapshot) {
      setState(IDLE)
      return undefined
    }
    let cancelled = false
    setState({ status: 'checking', snapshotId: snapshot.id, result: null })
    prepareGarmentAssets(snapshot)
      .then((result) => {
        if (cancelled) return
        if (!result.ok) console.error('[garment export] garment assets not ready:', result.failures)
        setState({ status: result.ok ? 'ready' : 'failed', snapshotId: snapshot.id, result })
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[garment export] unexpected error while verifying garment assets:', err)
        setState({ status: 'failed', snapshotId: snapshot.id, result: { ok: false, garment: null, failures: [{ view: null, code: 'RENDER_FAILED', message: err?.message || 'Unexpected error', technical: err?.stack || String(err) }], artworkPreserved: false, unrenderedArtwork: [] } })
      })
    return () => { cancelled = true }
  }, [snapshot])

  return state
}

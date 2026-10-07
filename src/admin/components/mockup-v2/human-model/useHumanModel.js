import { useCallback, useEffect, useReducer, useRef } from 'react'
import { createInitialHumanModelState, humanModelReducer, snapshotRenderUrls } from './humanModelState.js'
import { releaseHumanModelAsset } from './humanModelAsset.js'

/**
 * Owns the Human Model Studio state and the lifetime of its blob: URL. Called by the launcher (next to
 * the Mockup Studio reducer) so the model image survives closing/reopening the studio, like the rest of
 * the session. The asset's object URLs are freed AFTER the commit that stops showing them (so the <img> never
 * points at a revoked URL), whenever the image is replaced or removed, and on unmount.
 */
export function useHumanModel() {
  const [state, rawDispatch] = useReducer(humanModelReducer, undefined, createInitialHumanModelState)
  const stateRef = useRef(state)
  const liveSnapshotRef = useRef(null)

  useEffect(() => {
    stateRef.current = state
    liveSnapshotRef.current = state.tshirtSnapshot
  }, [state])

  const revokeAll = (urls) => urls.forEach((url) => URL.revokeObjectURL(url))

  const dispatch = useCallback((action) => {
    // A picked asset the reducer will not accept would otherwise leak its object URL.
    if (action.type === 'SET_MODEL_IMAGE' && !action.asset?.sourceUrl) return releaseHumanModelAsset(action.asset)
    // Rendered T-shirt images are blob: URLs owned here: free them when replaced / cleared, and drop a result that arrives out of date.
    if (action.type === 'SNAPSHOT_READY') {
      if (action.requestId !== stateRef.current.snapshotRequestId) return revokeAll(snapshotRenderUrls(action.snapshot))
      revokeAll(snapshotRenderUrls(stateRef.current.tshirtSnapshot))
    }
    if (action.type === 'CLEAR_SNAPSHOT') revokeAll(snapshotRenderUrls(stateRef.current.tshirtSnapshot))
    rawDispatch(action)
  }, [])

  // Cleanup of an effect keyed on the asset runs when it is replaced / removed (after the new render) and on unmount.
  useEffect(() => {
    const asset = state.modelImage
    return () => releaseHumanModelAsset(asset)
  }, [state.modelImage])

  useEffect(() => () => revokeAll(snapshotRenderUrls(liveSnapshotRef.current)), [])

  return { state, dispatch }
}

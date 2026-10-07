import { useCallback, useRef } from 'react'
import { SOLID_DEFAULTS, cutoutArtworkAI, cutoutSolidBackground } from './artworkBackground.js'

const FAIL_AI = 'Background removal failed. Please try again, or use "Remove solid background".'

/**
 * Runs artwork background removal on a source's ORIGINAL upload and stores the transparent result beside it.
 * State lives in the studio reducer (like the T-shirt remover), so closing the studio mid-run loses nothing, and a
 * result arriving after the artwork was deleted is discarded by the launcher.
 *
 * runSolid() calls made while a run is in flight are coalesced: the newest options run as soon as the current one ends,
 * so dragging the tolerance slider never stacks work.
 */
export function useArtworkBackgroundRemoval(source, dispatch) {
  const sourceRef = useRef(source)
  const queued = useRef(null)
  const running = useRef(false)
  sourceRef.current = source

  const execute = useCallback(
    async (job) => {
      const src = sourceRef.current
      if (!src) return
      if (running.current) {
        if (job.method === 'solid') queued.current = job
        return
      }
      running.current = true
      dispatch({ type: 'ART_BG_START', sourceId: src.id })
      try {
        const url = job.method === 'ai' ? await cutoutArtworkAI(src.url) : await cutoutSolidBackground(src.url, job.options)
        dispatch({ type: 'ART_BG_SUCCESS', sourceId: src.id, url, method: job.method, options: job.options ?? null })
      } catch (err) {
        console.error('Mockup Studio: artwork background removal failed', err)
        dispatch({ type: 'ART_BG_FAIL', sourceId: src.id, message: job.method === 'ai' ? FAIL_AI : err?.message || 'Background removal failed.' })
      } finally {
        running.current = false
        const next = queued.current
        queued.current = null
        if (next) execute(next)
      }
    },
    [dispatch],
  )

  const runAI = useCallback(() => execute({ method: 'ai' }), [execute])
  const runSolid = useCallback((options) => execute({ method: 'solid', options: { ...SOLID_DEFAULTS, ...options } }), [execute])
  const restore = useCallback(() => source && dispatch({ type: 'ART_BG_RESTORE', sourceId: source.id }), [source, dispatch])
  const useCutout = useCallback(() => source && dispatch({ type: 'ART_BG_USE_CUTOUT', sourceId: source.id }), [source, dispatch])

  return { runAI, runSolid, restore, useCutout }
}

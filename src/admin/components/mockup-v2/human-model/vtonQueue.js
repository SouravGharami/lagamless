/**
 * Lightweight provider-neutral VTON queue used by the self-test and future batch orchestration.
 * It deliberately exposes states, never percentages, and leaves batch jobs QUEUED until imported.
 */
export function createVtonQueue({ getProvider } = {}) {
  const jobs = new Map()
  const listeners = new Set()
  const notify = () => listeners.forEach((fn) => { try { fn() } catch {} })
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
  const getJobs = () => [...jobs.values()].map((j) => ({ ...j }))
  const enqueue = (spec = {}) => {
    const jobId = spec.jobId || `vton-job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const provider = getProvider?.(spec.providerId)
    const mode = provider?.mode || 'live'
    const job = { jobId, providerId: spec.providerId, view: spec.view, status: mode === 'batch' ? 'QUEUED' : 'SUBMITTING', result: null, error: null }
    jobs.set(jobId, job); notify()
    if (mode === 'batch') return { jobId }
    queueMicrotask(async () => {
      try {
        if (!provider?.generate) throw new Error('Provider not available')
        const result = await provider.generate({
          personImage: spec.personBlob, garmentImage: spec.garmentBlob, view: spec.view,
          options: {
            signal: spec.signal,
            onStatus: (status) => { job.status = status === 'PROCESSING' ? 'PROCESSING' : 'SUBMITTING'; notify() },
          },
        })
        if (result?.success) { job.status = 'COMPLETED'; job.result = result }
        else { job.status = result?.status === 'batch_prepared' ? 'QUEUED' : 'FAILED'; job.result = result }
      } catch (err) { job.status = 'FAILED'; job.error = err?.message || 'Provider failed.' }
      notify()
    })
    return { jobId }
  }
  return { enqueue, getJobs, subscribe, clear: () => { jobs.clear(); notify() } }
}

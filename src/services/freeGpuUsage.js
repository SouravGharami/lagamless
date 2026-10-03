/**
 * Free GPU usage service (Step 4, Parts E–G).
 *
 * RULE: a number is shown as quota ONLY if a provider actually reported it. Otherwise the record says so.
 *   kind: 'real'      — authoritative figure reported by the provider (e.g. a ZeroGPU quota error that states the time left)
 *   kind: 'estimated' — computed locally from this browser's own records (never presented as provider quota)
 *   kind: 'unknown'   — no figure available; the UI says "Check the provider"
 *
 * Snapshot (normalized):
 *   { provider, period, allowanceHours, usedHours, remainingHours, resetAt, status, source, lastUpdated, kind, estimate, note }
 * `allowanceHours` for Kaggle is a CONFIGURED allowance (labelled as such); `usedHours`/`remainingHours` stay null unless real.
 *
 * Cached (in memory + sessionStorage, non-sensitive) so the panel never hammers a provider endpoint.
 */

export const USAGE_STATUS = Object.freeze({ AVAILABLE: 'available', LIMITED: 'limited', EXHAUSTED: 'exhausted', UNKNOWN: 'unknown' })
export const USAGE_KIND = Object.freeze({ REAL: 'real', ESTIMATED: 'estimated', UNKNOWN: 'unknown' })

export const CACHE_TTL_MS = 5 * 60 * 1000 // a probe result is reused for 5 minutes
export const MIN_REFRESH_INTERVAL_MS = 15 * 1000 // "Refresh usage" is rate-limited
const STORAGE_KEY = 'lagamless.freeGpu.v1'
const LOG_KEY = 'lagamless.freeGpu.log.v1'
const WEEK_MS = 7 * 24 * 3600 * 1000

const PROVIDER_KEYS = { huggingface_zerogpu: 'huggingface', kaggle_batch: 'kaggle' }
export const usageProviderKey = (providerId) => PROVIDER_KEYS[providerId] ?? 'unknown'

const store = (() => { try { return window.sessionStorage } catch { return null } })()
const listeners = new Set()
let cache = load(STORAGE_KEY, {})
let log = load(LOG_KEY, [])
const lastRefresh = {}

function load(key, fallback) {
  try { return JSON.parse(store?.getItem(key) ?? 'null') ?? fallback } catch { return fallback }
}
function persist() {
  try { store?.setItem(STORAGE_KEY, JSON.stringify(cache)); store?.setItem(LOG_KEY, JSON.stringify(log)) } catch { /* ignore */ }
  listeners.forEach((fn) => fn())
}

export function normalizeUsage(fields = {}) {
  const num = (v) => (Number.isFinite(v) ? v : null)
  return {
    provider: ['kaggle', 'huggingface'].includes(fields.provider) ? fields.provider : 'unknown',
    period: fields.period ?? null,
    allowanceHours: num(fields.allowanceHours),
    usedHours: num(fields.usedHours),
    remainingHours: num(fields.remainingHours),
    resetAt: fields.resetAt ?? null,
    status: Object.values(USAGE_STATUS).includes(fields.status) ? fields.status : USAGE_STATUS.UNKNOWN,
    source: fields.source ?? null,
    lastUpdated: fields.lastUpdated ?? new Date().toISOString(),
    kind: Object.values(USAGE_KIND).includes(fields.kind) ? fields.kind : USAGE_KIND.UNKNOWN,
    estimate: fields.estimate ?? null,
    note: fields.note ?? null,
  }
}

/** Local, clearly-estimated usage over the last 7 days: { runs, hours } from what THIS browser recorded. */
export function estimateLocalUsage(providerKey, now = Date.now()) {
  const recent = log.filter((e) => e.provider === providerKey && now - e.at < WEEK_MS)
  const seconds = recent.reduce((n, e) => n + (e.seconds ?? 0), 0)
  return { runs: recent.length, hours: seconds / 3600, basedOn: providerKey === 'kaggle' ? 'GPU hours you entered when importing results' : 'wall-clock time of generations started in this browser' }
}

function baseSnapshot(providerId, { kaggleAllowanceHours = 30 } = {}) {
  const key = usageProviderKey(providerId)
  const estimate = estimateLocalUsage(key)
  if (key === 'kaggle') {
    return normalizeUsage({
      provider: 'kaggle', period: 'weekly', allowanceHours: kaggleAllowanceHours, status: USAGE_STATUS.UNKNOWN, kind: USAGE_KIND.UNKNOWN,
      source: 'configured-allowance', estimate, note: 'Configured free allowance — not a live quota reading. Check Kaggle for the real remaining GPU time.',
    })
  }
  return normalizeUsage({
    provider: key, period: null, status: USAGE_STATUS.UNKNOWN, kind: USAGE_KIND.UNKNOWN, source: null, estimate,
    note: 'Hugging Face does not expose ZeroGPU quota to this app. A number appears only if the Space reports one.',
  })
}

/** Returns the cached snapshot (or a fresh base one). Never calls a provider. */
export function getUsageSnapshot(providerId, options) {
  const key = usageProviderKey(providerId)
  const stored = cache[key]
  const base = baseSnapshot(providerId, options)
  // Keep authoritative fields from the cache, but always recompute the local estimate and configured allowance.
  return stored ? normalizeUsage({ ...stored, estimate: base.estimate, allowanceHours: stored.allowanceHours ?? base.allowanceHours }) : base
}

export function isCacheFresh(providerId, now = Date.now()) {
  const s = cache[usageProviderKey(providerId)]
  return !!s && now - Date.parse(s.lastUpdated) < CACHE_TTL_MS
}

/**
 * Applies what a generation attempt actually revealed. `result` is a normalized provider result.
 *  - success            -> status 'available' (the provider accepted and completed the request); no quota number.
 *  - quota error        -> status 'exhausted'; if the provider stated time left, it is recorded as REAL.
 *  - provider down      -> status 'unknown'.
 */
export function recordGenerationOutcome(providerId, result, { seconds = null, kaggleAllowanceHours } = {}) {
  const key = usageProviderKey(providerId)
  const prev = getUsageSnapshot(providerId, { kaggleAllowanceHours })
  const u = result?.usage
  let next = { ...prev, lastUpdated: new Date().toISOString() }

  if (result?.errorCode === 'QUOTA_EXHAUSTED') {
    const reported = u?.available && u.unit === 'seconds' && Number.isFinite(u.remaining)
    next = { ...next, status: USAGE_STATUS.EXHAUSTED, kind: USAGE_KIND.REAL, source: u?.source ?? 'provider-error', remainingHours: reported ? u.remaining / 3600 : null, period: u?.period ?? next.period }
  } else if (result?.success) {
    next = { ...next, status: USAGE_STATUS.AVAILABLE, source: 'last-request-succeeded' }
    if (u?.available && Number.isFinite(u.remaining) && u.unit === 'seconds') {
      next = { ...next, kind: USAGE_KIND.REAL, remainingHours: u.remaining / 3600, source: u.source ?? next.source, period: u.period ?? next.period }
    }
  } else if (result?.errorCode === 'PROVIDER_UNAVAILABLE') {
    next = { ...next, status: USAGE_STATUS.UNKNOWN, source: 'provider-unreachable' }
  }
  if (Number.isFinite(seconds) && seconds > 0 && key === 'huggingface') log.push({ provider: key, at: Date.now(), seconds })
  log = log.filter((e) => Date.now() - e.at < WEEK_MS)
  cache = { ...cache, [key]: next }
  persist()
  return getUsageSnapshot(providerId, { kaggleAllowanceHours })
}

/** Admin-entered Kaggle GPU time for an imported batch. Stored as a local ESTIMATE only. */
export function recordKaggleBatch({ gpuSeconds }) {
  if (Number.isFinite(gpuSeconds) && gpuSeconds > 0) log.push({ provider: 'kaggle', at: Date.now(), seconds: gpuSeconds })
  persist()
}

/**
 * Refresh: rate-limited and cached. `probe` (optional) is a cheap reachability check supplied by the provider; it can only
 * change status to 'unknown' when the provider is unreachable — it never produces a quota number.
 */
export async function refreshUsage(providerId, { probe, force = false, kaggleAllowanceHours } = {}) {
  const now = Date.now()
  if (now - (lastRefresh[providerId] ?? 0) < MIN_REFRESH_INTERVAL_MS) return getUsageSnapshot(providerId, { kaggleAllowanceHours })
  if (!force && isCacheFresh(providerId, now)) return getUsageSnapshot(providerId, { kaggleAllowanceHours })
  lastRefresh[providerId] = now
  const key = usageProviderKey(providerId)
  if (typeof probe === 'function') {
    const res = await probe().catch(() => ({ reachable: false }))
    const prev = getUsageSnapshot(providerId, { kaggleAllowanceHours })
    cache = { ...cache, [key]: { ...prev, lastUpdated: new Date().toISOString(), ...(res.reachable ? {} : { status: USAGE_STATUS.UNKNOWN, source: 'provider-unreachable' }) } }
  } else {
    cache = { ...cache, [key]: { ...getUsageSnapshot(providerId, { kaggleAllowanceHours }), lastUpdated: new Date().toISOString() } }
  }
  persist()
  return getUsageSnapshot(providerId, { kaggleAllowanceHours })
}

export const subscribeUsage = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
export const getUsageVersion = () => JSON.stringify([cache, log.length])

/* ---- display helpers (pure) ---- */

export function formatHours(hours) {
  if (!Number.isFinite(hours)) return null
  const totalMin = Math.max(0, Math.round(hours * 60))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`
}

export function formatAgo(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 'never'
  const s = Math.max(0, Math.round((now - t) / 1000))
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

/** The badge that separates REAL QUOTA / ESTIMATED USAGE / UNKNOWN QUOTA (Part E). */
export function quotaBadge(snapshot) {
  if (snapshot.kind === USAGE_KIND.REAL && snapshot.remainingHours != null) return 'REAL QUOTA'
  if (snapshot.estimate && snapshot.estimate.runs > 0) return 'ESTIMATED USAGE'
  return 'UNKNOWN QUOTA'
}

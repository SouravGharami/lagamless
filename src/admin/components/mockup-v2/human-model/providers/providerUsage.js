/**
 * Usage information a provider can HONESTLY report. Nothing is invented: if a response carries no quota figure,
 * the usage block stays `available: false`.
 */
import { NO_USAGE } from './providerTypes.js'

/**
 * ZeroGPU quota errors look like:
 *   "You have exceeded your GPU quota (60s requested vs. 12s left). Try again in 3:10:05"
 *   "... (requested: 0:01:00, left: 0:00:00) ..."
 * Only a figure actually present in the text is returned; otherwise `leftSeconds` is null.
 * @returns {{ leftSeconds: number|null, retryAfterSeconds: number|null }}
 */
export function parseZeroGpuQuotaMessage(text) {
  const s = String(text ?? '')
  let leftSeconds = null
  let m = s.match(/(\d+)\s*s\s*left/i)
  if (m) leftSeconds = Number(m[1])
  if (leftSeconds == null) {
    m = s.match(/left:?\s*(\d+):(\d{2}):(\d{2})/i)
    if (m) leftSeconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  }
  let retryAfterSeconds = null
  m = s.match(/try again in\s*(\d+):(\d{2}):(\d{2})/i)
  if (m) retryAfterSeconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  return { leftSeconds, retryAfterSeconds }
}

/** Usage block for a ZeroGPU quota error. "Quota exhausted" is what the provider said; a number is only set if it was in the text. */
export function usageFromQuotaError(text) {
  const { leftSeconds } = parseZeroGpuQuotaMessage(text)
  return { available: true, remaining: leftSeconds ?? 0, unit: 'seconds', period: 'daily', source: 'zerogpu-error-message' }
}

export const unavailableUsage = () => ({ ...NO_USAGE })

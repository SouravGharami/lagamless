/** Step 5-1 — generation RESULT (application-level only; no database table). */
import { GENERATION_STATUS, isStatus } from './generationStatus.js'

export function newGenerationId() {
  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `gen-${rand}`
}

/**
 * @typedef {Object} GenerationResult
 * @property {string} id
 * @property {string} status                 a GENERATION_STATUS value
 * @property {string|null} outputImage       URL / blob ref of the final image (null until a provider returns one)
 * @property {string|null} thumbnail
 * @property {string|null} angle
 * @property {string|null} templateId
 * @property {string} createdAt              ISO time
 * @property {string|null} completedAt
 * @property {{code:string, message:string}|null} error
 */
export function createGenerationResult(input = {}) {
  const status = isStatus(input.status) ? input.status : GENERATION_STATUS.IDLE
  return {
    id: input.id ?? newGenerationId(),
    status,
    outputImage: input.outputImage ?? null,
    thumbnail: input.thumbnail ?? null,
    angle: input.angle ?? null,
    templateId: input.templateId ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    completedAt: input.completedAt ?? null,
    error: input.error ?? null,
  }
}

export const failedResult = (base, code, message) =>
  createGenerationResult({ ...base, status: GENERATION_STATUS.FAILED, completedAt: new Date().toISOString(), error: { code, message } })

export function validateGenerationResult(r) {
  const errors = []
  if (!r || typeof r !== 'object') return ['Result must be an object.']
  if (!isStatus(r.status)) errors.push('status is invalid.')
  if (r.status === GENERATION_STATUS.COMPLETED && !r.outputImage) errors.push('A COMPLETED result needs an outputImage.')
  if (r.status === GENERATION_STATUS.FAILED && !r.error) errors.push('A FAILED result needs error information.')
  return errors
}

/** Step 5-1 — generation status. Real states only: nothing here animates or pretends work is happening. */
export const GENERATION_STATUS = Object.freeze({
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  GENERATING: 'GENERATING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
})

export const STATUS_LABELS = Object.freeze({
  IDLE: 'Ready',
  PREPARING: 'Preparing',
  GENERATING: 'Generating',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
})

const TRANSITIONS = Object.freeze({
  IDLE: ['PREPARING'],
  PREPARING: ['GENERATING', 'FAILED', 'CANCELLED'],
  GENERATING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: ['IDLE', 'PREPARING'],
  FAILED: ['IDLE', 'PREPARING'],
  CANCELLED: ['IDLE', 'PREPARING'],
})

export const isStatus = (s) => Object.prototype.hasOwnProperty.call(GENERATION_STATUS, s)
export const canTransition = (from, to) => (TRANSITIONS[from] ?? []).includes(to)
export const isBusy = (s) => s === 'PREPARING' || s === 'GENERATING'
export const isTerminal = (s) => s === 'COMPLETED' || s === 'FAILED' || s === 'CANCELLED'

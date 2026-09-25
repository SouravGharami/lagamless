/**
 * Replacement workflow constants, shared by the customer dialog/timeline and
 * the admin page. Replacement is its own workflow — none of this touches the
 * return/refund statuses in ReturnTimeline.jsx.
 *
 * Full lifecycle (see supabase/part-28-replacements-lifecycle.sql):
 *
 *   requested -> awaiting_return -> return_received -> replacement_processing
 *             -> replacement_shipped -> replacement_completed
 *   requested -> rejected                          (Reject, at the request stage)
 *   return_received -> rejected                    (Verification Failed)
 */

/** Fixed reason list per spec — order matters, shown as-is in the dropdown.
 * Mirrors REPLACEMENT_REASONS in supabase/functions/_shared/replacements.ts
 * and the `reason` check on public.replacements (kept in sync by hand). */
export const REPLACEMENT_REASONS = [
  'Wrong size',
  'Wrong color',
  'Damaged product',
  'Defective product',
  'Wrong item received',
  'Other',
]

/** Customer-facing label for every `replacements.status`. */
export const REPLACEMENT_STATUS_LABELS = {
  requested: 'Replacement Request Initiated',
  // Approval reserves stock, but the new item doesn't ship until the
  // original is back with us — "Awaiting Return" is the accurate next step,
  // not "ready to ship".
  awaiting_return: 'Approved - Awaiting Return',
  return_received: 'Return Received',
  replacement_processing: 'Replacement Processing',
  replacement_shipped: 'Replacement Shipped',
  replacement_completed: 'Replacement Completed',
  rejected: 'Replacement Rejected',
}

/** The sentence shown under the badge for each status. */
export const REPLACEMENT_STATUS_MESSAGES = {
  requested: "We've received your replacement request and it's being reviewed.",
  awaiting_return:
    'Your replacement has been approved. Please send back the original item — once it reaches us, we’ll check it and get your replacement moving.',
  return_received: "We've received the original item and are checking it over.",
  replacement_processing: 'The original item checked out fine — your replacement is being prepared to ship.',
  replacement_shipped: 'Your replacement is on its way.',
  replacement_completed: 'Your replacement has been delivered. Thank you for shopping with LAGAMLESS.',
  rejected: "Your replacement request wasn't approved. See the reason below, or contact us if you have questions.",
}

/** The forward-moving stages the customer timeline draws. */
export const REPLACEMENT_STEPS = [
  { key: 'requested', label: 'Requested' },
  { key: 'awaiting_return', label: 'Approved' },
  { key: 'return_received', label: 'Return received' },
  { key: 'replacement_processing', label: 'Processing' },
  { key: 'replacement_shipped', label: 'Shipped' },
  { key: 'replacement_completed', label: 'Delivered' },
]

/** A replacement that still counts against the item (i.e. not rejected). */
export function isLiveReplacement(replacement) {
  return Boolean(replacement) && replacement.status !== 'rejected'
}

/** "Size M → L · Color Olive" — what the customer asked to receive. */
export function describeReplacementChange(replacement) {
  const parts = []
  if (replacement.originalSize && replacement.originalSize !== replacement.requestedSize) {
    parts.push(`Size ${replacement.originalSize} → ${replacement.requestedSize}`)
  } else {
    parts.push(`Size ${replacement.requestedSize}`)
  }
  parts.push(replacement.requestedColor ? `Color ${replacement.requestedColor}` : 'Same color')
  return parts.join(' · ')
}

/** True once tracking details exist worth showing on the customer timeline. */
export function hasReplacementTracking(replacement) {
  return Boolean(replacement?.trackingCourier || replacement?.trackingId || replacement?.trackingUrl)
}

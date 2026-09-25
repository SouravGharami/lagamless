const VARIANTS = {
  published: { label: 'Published', className: 'admin-badge--positive' },
  draft: { label: 'Draft', className: 'admin-badge--neutral' },
  'in-stock': { label: 'In stock', className: 'admin-badge--positive' },
  'low-stock': { label: 'Low stock', className: 'admin-badge--warning' },
  'sold-out': { label: 'Out of stock', className: 'admin-badge--negative' },
  'out-of-stock': { label: 'Out of stock', className: 'admin-badge--negative' },
  pending: { label: 'Pending', className: 'admin-badge--warning' },
  payment_failed: { label: 'Payment failed', className: 'admin-badge--negative' },
  requested: { label: 'Requested', className: 'admin-badge--warning' },
  approved: { label: 'Approved', className: 'admin-badge--positive' },
  rejected: { label: 'Rejected', className: 'admin-badge--negative' },
  pickup: { label: 'Pickup', className: 'admin-badge--neutral' },
  received: { label: 'Received', className: 'admin-badge--positive' },
  inspection: { label: 'Inspection', className: 'admin-badge--warning' },
  refund_pending: { label: 'Refund Pending', className: 'admin-badge--warning' },
  confirmed: { label: 'Confirmed', className: 'admin-badge--neutral' },
  processing: { label: 'Processing', className: 'admin-badge--neutral' },
  shipped: { label: 'Shipped', className: 'admin-badge--neutral' },
  delivered: { label: 'Delivered', className: 'admin-badge--positive' },
  cancelled: { label: 'Cancelled', className: 'admin-badge--negative' },
  authorized: { label: 'Authorized', className: 'admin-badge--warning' },
  paid: { label: 'Paid', className: 'admin-badge--positive' },
  failed: { label: 'Failed', className: 'admin-badge--negative' },
  refunded: { label: 'Refunded', className: 'admin-badge--neutral' },
  admin: { label: 'Admin', className: 'admin-badge--positive' },
  customer: { label: 'Customer', className: 'admin-badge--neutral' },
}

/**
 * A small text+icon badge for statuses. Never uses color alone — every
 * variant carries its own explicit label so it reads correctly without
 * color perception (Part 07 brief §23).
 * @param {{ status: string }} props
 */
function StatusBadge({ status }) {
  const config = VARIANTS[status] || { label: status, className: 'admin-badge--neutral' }
  return <span className={'admin-badge ' + config.className}>{config.label}</span>
}

export default StatusBadge

import { jsPDF } from 'jspdf'
import { formatPrice } from './formatPrice.js'
import { formatDate } from './formatDate.js'

/**
 * Renders a branded, receipt-styled PDF for a confirmed order (online
 * payment or COD) and triggers a browser download. Pure client-side —
 * no server round trip, nothing beyond what the confirmation page
 * already has in memory.
 *
 * @param {{
 *   orderId: string,
 *   paymentMethod: 'razorpay' | 'cod' | string | null,
 *   items: Array<{product_name: string, size: string, quantity: number, line_total: number}>,
 *   subtotal: number,
 *   shippingTotal: number,
 *   discountTotal?: number,
 *   total: number,
 *   shippingAddress: {addressLine1: string, addressLine2?: string, city: string, state: string, postalCode: string, country: string},
 *   customerName?: string,
 *   createdAt?: string,
 *   paidAt?: string,
 * }} order
 */
export function downloadReceipt(order) {
  const {
    orderId,
    paymentMethod,
    items = [],
    subtotal = 0,
    shippingTotal = 0,
    discountTotal = 0,
    total = 0,
    shippingAddress,
    customerName,
    createdAt,
    paidAt,
  } = order

  const isCod = paymentMethod === 'cod'

  // ---- palette (matches src/styles/global.css) ----
  const ink = [12, 12, 11]
  const charcoal = [32, 31, 29]
  const paper = [241, 239, 233]
  const silver = [183, 179, 169]
  const graphite = [140, 137, 128]
  const white = [255, 255, 255]

  const doc = new jsPDF({ unit: 'pt', format: [420, 700] })
  const pageW = 420
  const marginX = 40
  let y = 0

  // ---- full-bleed black surface ----
  doc.setFillColor(...ink)
  doc.rect(0, 0, 420, 700, 'F')

  // subtle top accent bar
  doc.setFillColor(...(isCod ? silver : white))
  doc.rect(0, 0, 420, 4, 'F')

  // ---- wordmark ----
  y = 56
  doc.setTextColor(...white)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('LAGAMLESS', pageW / 2, y, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...graphite)
  doc.text('P R E M I U M   S T R E E T W E A R', pageW / 2, y + 16, { align: 'center' })

  // ---- status stamp ----
  y += 46
  doc.setDrawColor(...(isCod ? silver : white))
  doc.setLineWidth(1)
  doc.circle(pageW / 2, y + 6, 20, 'S')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...(isCod ? silver : white))
  doc.text(isCod ? '$' : '\u2713', pageW / 2, y + 12, { align: 'center' })

  y += 42
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...white)
  doc.text(isCod ? 'CASH ON DELIVERY' : 'PAYMENT CONFIRMED', pageW / 2, y, { align: 'center' })

  y += 16
  doc.setFont('courier', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...silver)
  doc.text(`ORDER #${orderId}`, pageW / 2, y, { align: 'center' })

  const dateStr = formatDate(paidAt || createdAt)
  if (dateStr) {
    y += 14
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...graphite)
    doc.text(dateStr, pageW / 2, y, { align: 'center' })
  }

  // ---- perforated divider ----
  y += 22
  drawPerforation(doc, y, pageW)

  // ---- items ----
  y += 26
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...graphite)
  doc.text('ITEMS', marginX, y)
  y += 16

  doc.setFont('helvetica', 'normal')
  items.forEach((item) => {
    doc.setFontSize(9.5)
    doc.setTextColor(...paper)
    doc.text(String(item.product_name || ''), marginX, y)
    doc.setFontSize(8)
    doc.setTextColor(...graphite)
    doc.text(`Size ${item.size} \u00b7 Qty ${item.quantity}`, marginX, y + 12)
    doc.setFontSize(9.5)
    doc.setTextColor(...paper)
    doc.text(formatPrice(item.line_total), pageW - marginX, y, { align: 'right' })
    y += 30
  })

  // ---- totals ----
  doc.setDrawColor(...charcoal)
  doc.setLineWidth(0.75)
  doc.line(marginX, y, pageW - marginX, y)
  y += 18

  const row = (label, value, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.bold ? 11 : 9)
    doc.setTextColor(...(opts.bold ? white : graphite))
    doc.text(label, marginX, y)
    doc.setTextColor(...(opts.bold ? white : paper))
    doc.text(value, pageW - marginX, y, { align: 'right' })
    y += opts.bold ? 20 : 16
  }

  row('Subtotal', formatPrice(subtotal))
  if (discountTotal > 0) row('Discount', `\u2212${formatPrice(discountTotal)}`)
  row('Shipping', shippingTotal === 0 ? 'Free' : formatPrice(shippingTotal))

  doc.setDrawColor(...charcoal)
  doc.line(marginX, y - 4, pageW - marginX, y - 4)
  y += 10
  row(isCod ? 'Total to pay on delivery' : 'Total paid', formatPrice(total), { bold: true })

  // ---- delivery address ----
  if (shippingAddress) {
    y += 14
    drawPerforation(doc, y, pageW)
    y += 24
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...graphite)
    doc.text('DELIVERING TO', marginX, y)
    y += 15
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...paper)
    if (customerName) {
      doc.text(customerName, marginX, y)
      y += 13
    }
    doc.text(shippingAddress.addressLine1 || '', marginX, y)
    y += 13
    if (shippingAddress.addressLine2) {
      doc.text(shippingAddress.addressLine2, marginX, y)
      y += 13
    }
    doc.text(
      `${shippingAddress.city || ''}, ${shippingAddress.state || ''} ${shippingAddress.postalCode || ''}`,
      marginX,
      y,
    )
    y += 13
    doc.text(shippingAddress.country || '', marginX, y)
  }

  // ---- footer ----
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...graphite)
  doc.text('Thank you for shopping with LAGAMLESS.', pageW / 2, 668, { align: 'center' })
  doc.text('This is a computer-generated receipt.', pageW / 2, 680, { align: 'center' })

  doc.save(`lagamless-receipt-${orderId}.pdf`)
}

function drawPerforation(doc, y, pageW) {
  doc.setDrawColor(85, 83, 76)
  doc.setLineWidth(1)
  const dash = 4
  const gap = 3
  let x = 40
  while (x < pageW - 40) {
    doc.line(x, y, Math.min(x + dash, pageW - 40), y)
    x += dash + gap
  }
}

// Small Razorpay helpers shared by create-razorpay-order,
// verify-razorpay-payment, and razorpay-webhook. No SDK dependency — the
// Orders/Payments REST API is tiny enough that a fetch wrapper is simpler
// to audit than pulling in razorpay's Node SDK (which isn't published for
// Deno anyway).

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1'

function keys() {
  const keyId = Deno.env.get('RAZORPAY_KEY_ID')
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET')
  if (!keyId || !keySecret) {
    throw new Error(
      'RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set. Run: supabase secrets set RAZORPAY_KEY_ID=... RAZORPAY_KEY_SECRET=...',
    )
  }
  return { keyId, keySecret }
}

function basicAuthHeader(): string {
  const { keyId, keySecret } = keys()
  return 'Basic ' + btoa(`${keyId}:${keySecret}`)
}

export function getRazorpayKeyId(): string {
  return keys().keyId
}

/** Creates a Razorpay Order. `amountPaise` is the integer amount in paise (smallest INR unit). */
export async function createRazorpayOrder(params: {
  amountPaise: number
  receipt: string
  notes?: Record<string, string>
}): Promise<{ id: string; amount: number; currency: string }> {
  const res = await fetch(`${RAZORPAY_API_BASE}/orders`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: 'INR',
      receipt: params.receipt,
      notes: params.notes ?? {},
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Razorpay order creation failed: ${body?.error?.description ?? res.statusText}`)
  }
  return body
}

/** Fetches a Payment by id — used by verify-razorpay-payment to double-check amount/status server-side rather than trusting the client's word for it. */
export async function fetchRazorpayPayment(paymentId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${paymentId}`, {
    headers: { Authorization: basicAuthHeader() },
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Fetching Razorpay payment failed: ${body?.error?.description ?? res.statusText}`)
  }
  return body
}

/**
 * Creates a Refund against an already-captured Razorpay Payment —
 * https://razorpay.com/docs/api/refunds/create. `amountPaise` is the
 * integer amount to refund, in paise; omit it (or pass the full captured
 * amount) for a full refund. Used by `initiate-return-refund` for the
 * Return Inspection → Refund stage — reuses the same
 * RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET Test Mode credentials as every
 * other call in this file (see keys() above), so this hits Razorpay's
 * Test Mode refund endpoint, never live, exactly as long as those
 * secrets stay set to the Test Mode key pair — no separate "test vs
 * live" branch exists in this code, by design (see this project's
 * supabase/SETUP.md and functions/README.md).
 */
export async function createRazorpayRefund(params: {
  paymentId: string
  amountPaise: number
  notes?: Record<string, string>
}): Promise<{ id: string; amount: number; status: string; payment_id: string }> {
  const res = await fetch(`${RAZORPAY_API_BASE}/payments/${params.paymentId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      speed: 'normal',
      notes: params.notes ?? {},
    }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(`Razorpay refund failed: ${body?.error?.description ?? res.statusText}`)
  }
  return body
}

/** HMAC-SHA256(payload, secret) as lowercase hex — the scheme Razorpay uses for both checkout-handler signatures and webhook signatures. */
export async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(payload))
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Verifies the signature Razorpay Checkout's handler returns: HMAC(order_id + "|" + payment_id, key_secret). */
export async function verifyPaymentSignature(params: {
  razorpayOrderId: string
  razorpayPaymentId: string
  razorpaySignature: string
}): Promise<boolean> {
  const { keySecret } = keys()
  const expected = await hmacSha256Hex(`${params.razorpayOrderId}|${params.razorpayPaymentId}`, keySecret)
  return timingSafeEqual(expected, params.razorpaySignature)
}

/** Verifies an incoming webhook's `x-razorpay-signature` header against the raw request body. */
export async function verifyWebhookSignature(rawBody: string, signatureHeader: string): Promise<boolean> {
  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET')
  if (!webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not set. Run: supabase secrets set RAZORPAY_WEBHOOK_SECRET=...')
  }
  const expected = await hmacSha256Hex(rawBody, webhookSecret)
  return timingSafeEqual(expected, signatureHeader)
}

/** Constant-time string compare — signature checks must never short-circuit on the first differing byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

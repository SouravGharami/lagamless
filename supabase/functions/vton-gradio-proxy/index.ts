// vton-gradio-proxy — ADMIN-ONLY pass-through to ONE configured Hugging Face Gradio Space.
//
// Why it exists: a Space that needs authentication (private Space, or a logged-in ZeroGPU quota) requires a Hugging Face
// token. That token must never reach the browser, so the browser calls THIS function with its Supabase admin session, and
// the function adds `Authorization: Bearer <HF_TOKEN>` server-side.
//
// Secrets (set with `supabase secrets set`, never in the repo, never VITE_*):
//   HF_VTON_SPACE_URL   https://<owner>-<space>.hf.space     (the ONLY upstream this function will ever call)
//   HF_TOKEN            optional; a fine-grained, read-only Hugging Face token
//
// Safety:
//  * caller must be a signed-in admin (same check as initiate-return-refund)
//  * the upstream host is fixed by the secret — the browser can only choose a PATH, from an allow-list (no SSRF)
//  * the token is never echoed in any response, header or log
import { CORS_HEADERS, handleOptions, jsonResponse } from '../_shared/cors.ts'
import { getAdminUserIdFromRequest } from '../_shared/supabaseAdmin.ts'

const ALLOWED_PATHS = [
  /^\/config$/,
  /^(\/gradio_api)?\/info$/,
  /^(\/gradio_api)?\/upload$/,
  /^(\/gradio_api)?\/call\/[A-Za-z0-9_-]+$/,
  /^(\/gradio_api)?\/call\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/,
  /^(\/gradio_api)?\/file=[A-Za-z0-9_\-./]+$/,
]
const MAX_BODY_BYTES = 30 * 1024 * 1024

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST' && req.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405)

  const adminId = await getAdminUserIdFromRequest(req)
  if (!adminId) return jsonResponse({ error: 'Admin sign-in required' }, 401)

  const space = (Deno.env.get('HF_VTON_SPACE_URL') ?? '').replace(/\/+$/, '')
  if (!/^https:\/\/[^/\s]+$/i.test(space)) return jsonResponse({ error: 'Provider configuration is missing.' }, 500)

  const path = new URL(req.url).searchParams.get('path') ?? ''
  if (!path.startsWith('/') || path.includes('..') || !ALLOWED_PATHS.some((re) => re.test(path.split('?')[0]))) {
    return jsonResponse({ error: 'Path not allowed' }, 400)
  }
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return jsonResponse({ error: 'Payload too large' }, 413)

  const headers = new Headers()
  const type = req.headers.get('content-type')
  if (type) headers.set('content-type', type)
  const token = Deno.env.get('HF_TOKEN')
  if (token) headers.set('authorization', `Bearer ${token}`)

  let upstream: Response
  try {
    upstream = await fetch(`${space}${path}`, { method: req.method, headers, body: req.method === 'POST' ? req.body : undefined })
  } catch {
    return jsonResponse({ error: 'Free GPU provider is currently unavailable.' }, 502)
  }

  const out = new Headers(CORS_HEADERS)
  const ct = upstream.headers.get('content-type')
  if (ct) out.set('content-type', ct)
  return new Response(upstream.body, { status: upstream.status, headers: out })
})

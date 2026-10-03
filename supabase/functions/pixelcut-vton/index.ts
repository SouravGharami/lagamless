// Secure Pixelcut Try-On proxy. ADMIN ONLY.
// PIXELCUT_API_KEY is a Supabase secret; it must never be exposed to React/VITE_ variables.
import { supabaseAdmin, getAdminUserIdFromRequest } from '../_shared/supabaseAdmin.ts'
import { CORS_HEADERS, handleOptions, jsonResponse } from '../_shared/cors.ts'

const BUCKET = 'product-images'
const MAX_BYTES = 25 * 1024 * 1024
const UPSTREAM = 'https://api.developer.pixelcut.ai/v1/try-on'
function safeExt(type: string) { return type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png' }

Deno.serve(async (req: Request) => {
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!await getAdminUserIdFromRequest(req)) return jsonResponse({ error: 'Admin sign-in required' }, 401)
  const apiKey = Deno.env.get('PIXELCUT_API_KEY') ?? ''
  if (!apiKey) return jsonResponse({ error: 'Pixelcut provider is not configured on the server.' }, 500)

  let personPath = '', garmentPath = ''
  try {
    const form = await req.formData()
    const person = form.get('person'), garment = form.get('garment')
    if (!(person instanceof File) || !(garment instanceof File)) return jsonResponse({ error: 'Person and garment images are required.' }, 400)
    if (!person.size || !garment.size || person.size > MAX_BYTES || garment.size > MAX_BYTES) return jsonResponse({ error: 'Input image is missing or larger than 25 MB.' }, 413)
    const token = crypto.randomUUID()
    personPath = `vton-temp/${token}-person.${safeExt(person.type)}`
    garmentPath = `vton-temp/${token}-garment.${safeExt(garment.type)}`
    const [p, g] = await Promise.all([
      supabaseAdmin.storage.from(BUCKET).upload(personPath, person, { upsert: false, contentType: person.type || 'image/png' }),
      supabaseAdmin.storage.from(BUCKET).upload(garmentPath, garment, { upsert: false, contentType: garment.type || 'image/png' }),
    ])
    if (p.error) throw p.error
    if (g.error) throw g.error
    // Use short-lived signed URLs rather than public URLs. Pixelcut needs to fetch the inputs, but the model/person
    // photos should not become publicly addressable objects in the permanent product bucket.
    const [{ data: pSigned, error: pSignError }, { data: gSigned, error: gSignError }] = await Promise.all([
      supabaseAdmin.storage.from(BUCKET).createSignedUrl(personPath, 10 * 60),
      supabaseAdmin.storage.from(BUCKET).createSignedUrl(garmentPath, 10 * 60),
    ])
    if (pSignError || gSignError || !pSigned?.signedUrl || !gSigned?.signedUrl) {
      throw new Error('Could not create temporary signed image URLs.')
    }

    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({
        person_image_url: pSigned.signedUrl,
        garment_image_url: gSigned.signedUrl,
        garment_mode: 'auto',
        preprocess_garment: 'false',
        remove_background: 'false',
        wait_for_result: 'true',
      }),
    })
    const bodyText = await upstream.text()
    if (!upstream.ok && upstream.status !== 202) {
      let message = `Pixelcut returned HTTP ${upstream.status}.`
      try {
        const parsed = JSON.parse(bodyText)
        message = parsed?.error?.message || parsed?.error || message
      } catch {}
      return jsonResponse({ error: message }, upstream.status)
    }

    let payload
    try { payload = JSON.parse(bodyText) } catch { return jsonResponse({ error: 'Pixelcut returned an invalid JSON response.' }, 502) }

    // Normally wait_for_result=true returns 200 + result_url. If the API chooses asynchronous processing,
    // handle the documented 202 + job_id path here instead of treating it as a broken response.
    if (!payload?.result_url && payload?.job_id) {
      const deadline = Date.now() + 110000
      let statusPayload = payload
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 2500))
        const statusResponse = await fetch(`https://api.developer.pixelcut.ai/v1/try-on/job/${encodeURIComponent(payload.job_id)}`, {
          headers: { 'Accept': 'application/json', 'X-API-KEY': apiKey },
        })
        const statusText = await statusResponse.text()
        if (!statusResponse.ok) {
          let message = `Pixelcut job status returned HTTP ${statusResponse.status}.`
          try {
            const parsed = JSON.parse(statusText)
            message = parsed?.error?.message || parsed?.error || message
          } catch {}
          return jsonResponse({ error: message }, statusResponse.status)
        }
        try { statusPayload = JSON.parse(statusText) } catch { return jsonResponse({ error: 'Pixelcut returned an invalid job-status response.' }, 502) }
        if (statusPayload?.status === 'completed' && statusPayload?.result_url) break
        if (statusPayload?.status === 'failed') return jsonResponse({ error: statusPayload?.error?.message || 'Pixelcut try-on job failed.' }, 502)
      }
      payload = statusPayload
    }

    if (!payload?.result_url) return jsonResponse({ error: 'Pixelcut returned no result image.' }, 502)
    const result = await fetch(payload.result_url)
    if (!result.ok) return jsonResponse({ error: 'Pixelcut result could not be downloaded.' }, 502)
    const bytes = await result.arrayBuffer()
    const headers = new Headers(CORS_HEADERS)
    headers.set('Content-Type', result.headers.get('content-type') || 'image/jpeg')
    headers.set('Cache-Control', 'no-store')
    return new Response(bytes, { status: 200, headers })
  } catch (err) {
    console.error('[pixelcut-vton]', err?.message || err)
    return jsonResponse({ error: 'Pixelcut generation failed.' }, 502)
  } finally {
    const paths = [personPath, garmentPath].filter(Boolean)
    if (paths.length) await supabaseAdmin.storage.from(BUCKET).remove(paths).catch(() => {})
  }
})

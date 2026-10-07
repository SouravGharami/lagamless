// Shared CORS headers for the checkout edge functions. The storefront is a
// browser SPA calling these via `supabase.functions.invoke(...)`, which
// needs a permissive-but-explicit CORS response (Supabase's own dashboard
// "Invoke" tester and any other origin also rely on this).
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }
  return null
}

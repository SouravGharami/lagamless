/**
 * Share-link engine — turns /p/<slug> into a rich, luxury link preview.
 *
 * WHY THIS EXISTS: the storefront is a single-page app. When a link is pasted into WhatsApp / Telegram /
 * Facebook / iMessage, their crawler downloads the HTML once and does NOT run JavaScript, so it only ever saw
 * the generic index.html (and, on localhost, nothing at all). This module answers /p/<slug> with a tiny HTML
 * page that carries the product's Open Graph tags (title, price, description, a branded 1200x630 image) and
 * then instantly sends real visitors on to /product/<slug>.
 *
 * Pure Web-standard code (Request -> Response), no framework: the Vite dev plugin, the Vercel functions and the
 * Netlify function are all thin wrappers around `handleShare`.
 */

const BUCKET = 'product-images'
const IMAGE_PREFERENCE = ['main', 'front', 'model', 'back', 'side', 'three_quarter_back', 'detail', 'fabric']
const BRAND = 'LAGAMLESS'
const FALLBACK_SITE = 'https://lagamless.com'
const OG_W = 1200
const OG_H = 630
const MAX_JPEG_BYTES = 280 * 1024 // WhatsApp silently drops big preview images; stay well under ~300 KB

export function readConfig(env = {}) {
  const pick = (...keys) => keys.map((k) => env[k]).find((v) => typeof v === 'string' && v.trim() !== '')?.trim() ?? ''
  return {
    supabaseUrl: pick('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, ''),
    anonKey: pick('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
    siteUrl: pick('SITE_URL', 'VITE_SITE_URL').replace(/\/+$/, ''),
  }
}

/** The public origin the visitor/crawler used (proxy headers first), or SITE_URL when it is set. */
export function originOf(request, config) {
  if (config.siteUrl) return config.siteUrl
  const h = request.headers
  const host = h.get('x-forwarded-host') || h.get('host')
  const proto = (h.get('x-forwarded-proto') || '').split(',')[0].trim()
  if (host) {
    const isLocal = /^(localhost|127\.|\[::1\])/.test(host)
    return `${proto || (isLocal ? 'http' : 'https')}://${host.split(',')[0].trim()}`
  }
  return new URL(request.url).origin
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const rupees = (n) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`

// ---------------------------------------------------------------------------------------------- data

/** Reads one published product through Supabase's REST API with the public anon key (same access as the storefront). */
export async function loadProductFromSupabase(slug, config) {
  if (!config.supabaseUrl || !config.anonKey) return null
  const select =
    'name,slug,sku,product_number,price,compare_at_price,description,fabric,gsm,fit,category,product_images(image_type,image_url,storage_path,sort_order)'
  const url = `${config.supabaseUrl}/rest/v1/products?select=${encodeURIComponent(select)}&slug=eq.${encodeURIComponent(slug)}&status=eq.published&limit=1`
  const res = await fetch(url, {
    headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) return null
  const [row] = await res.json()
  if (!row) return null
  const images = {}
  for (const r of row.product_images || []) {
    const src = r.image_url || (r.storage_path ? `${config.supabaseUrl}/storage/v1/object/public/${BUCKET}/${r.storage_path}` : null)
    if (src) images[r.image_type] = src
  }
  return {
    slug: row.slug,
    name: row.name,
    price: Number(row.price),
    compareAtPrice: row.compare_at_price == null ? null : Number(row.compare_at_price),
    description: row.description || '',
    fabric: row.fabric || '',
    gsm: row.gsm || 0,
    fit: row.fit || '',
    category: row.category || '',
    images,
  }
}

/** Normalises the app's own Product shape (src/data/products.js) — used by the dev server's offline fallback. */
export function fromAppProduct(p) {
  const images = {}
  for (const [k, v] of Object.entries(p.images || {})) if (v?.src) images[k] = v.src
  return { ...p, images }
}

export function pickImage(product) {
  const key = IMAGE_PREFERENCE.find((k) => product.images?.[k])
  return key ? product.images[key] : null
}

// ---------------------------------------------------------------------------------------------- html

function firstSentence(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const s = t.match(/^.+?[.!?](\s|$)/)?.[0].trim() || t
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

function describe(product) {
  const onSale = product.compareAtPrice && product.compareAtPrice > product.price
  const pct = onSale ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100) : 0
  const spec = [product.gsm > 0 ? `${product.gsm} GSM` : '', product.fit ? `${product.fit} fit` : ''].filter(Boolean).join(' · ')
  return [onSale ? `${pct}% off` : '', spec, 'Free shipping over ₹999', 'COD available'].filter(Boolean).join(' • ')
}

export function renderSharePage({ product, origin }) {
  const found = Boolean(product)
  const slug = product?.slug
  const target = found ? `${origin}/product/${encodeURIComponent(slug)}` : `${origin}/shop`
  const shareUrl = found ? `${origin}/p/${encodeURIComponent(slug)}` : `${origin}/`
  const title = found ? `${product.name} — ${rupees(product.price)}` : `${BRAND} — Oversized Streetwear, Without Restraint`
  const description = found
    ? describe(product)
    : 'One relaxed, oversized fit. Heavyweight cotton, drop-shoulder cuts, shot on real Indian streets.'
  const image = found ? `${origin}/p/${encodeURIComponent(slug)}/og.jpg` : `${origin}/og-cover.jpg`
  const alt = found ? `${product.name} on ${BRAND}` : `${BRAND} — Oversized is a culture`

  const meta = [
    ['name', 'description', description],
    ['property', 'og:site_name', BRAND],
    ['property', 'og:type', found ? 'product' : 'website'],
    ['property', 'og:title', title],
    ['property', 'og:description', description],
    ['property', 'og:url', shareUrl],
    ['property', 'og:image', image],
    ['property', 'og:image:secure_url', image],
    ['property', 'og:image:type', found ? 'image/jpeg' : 'image/jpeg'],
    ['property', 'og:image:width', String(OG_W)],
    ['property', 'og:image:height', String(OG_H)],
    ['property', 'og:image:alt', alt],
    ['property', 'og:locale', 'en_IN'],
    ...(found
      ? [
          ['property', 'product:price:amount', String(product.price)],
          ['property', 'product:price:currency', 'INR'],
          ['property', 'product:availability', 'in stock'],
          ['property', 'product:brand', BRAND],
        ]
      : []),
    ['name', 'twitter:card', 'summary_large_image'],
    ['name', 'twitter:title', title],
    ['name', 'twitter:description', description],
    ['name', 'twitter:image', image],
    ['name', 'twitter:image:alt', alt],
    ['name', 'theme-color', '#0c0c0b'],
  ]
    .map(([k, n, v]) => `    <meta ${k}="${n}" content="${esc(v)}" />`)
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <link rel="canonical" href="${esc(target)}" />
${meta}
    <meta http-equiv="refresh" content="0;url=${esc(target)}" />
    <style>
      html,body{margin:0;height:100%;background:#0c0c0b;color:#fff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
      main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:24px}
      b{letter-spacing:.42em;font-size:13px;font-weight:600}
      i{display:block;width:44px;height:1px;background:#c85c50}
      a{color:#fff;font-size:12px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;border-bottom:1px solid #c85c50;padding-bottom:3px}
    </style>
  </head>
  <body>
    <main>
      <b>${BRAND}</b><i></i>
      <a href="${esc(target)}">${found ? 'View product' : 'Enter the store'} &rarr;</a>
    </main>
    <script>location.replace(${JSON.stringify(target)})</script>
  </body>
</html>
`
}

// ---------------------------------------------------------------------------------------------- image

async function fetchBuffer(url, ms = 8000) {
  const res = await fetch(url, { signal: AbortSignal.timeout(ms), headers: { 'user-agent': 'LagamlessShareBot/1.0' } })
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * 1200x630 "invitation card": the photo blurred and darkened as the room, the brand mark on the left, the
 * product photo in a hairline gallery frame on the right. Deliberately contains NO rendered text — serverless
 * runtimes often have no fonts, and the title/price are shown by the chat app itself right under the image.
 */
export async function renderOgJpeg({ imageUrl, logoUrl }) {
  const { default: sharp } = await import('sharp')
  const photo = await fetchBuffer(imageUrl)
  const logo = logoUrl ? await fetchBuffer(logoUrl, 4000).catch(() => null) : null

  const FRAME_W = 504
  const FRAME_X = 636
  const room = await sharp(photo)
    .resize(OG_W, OG_H, { fit: 'cover', position: 'centre' })
    .blur(36)
    .modulate({ brightness: 0.34, saturation: 1.08 })
    .toBuffer()

  const framed = await sharp(photo).resize(FRAME_W, OG_H, { fit: 'cover', position: 'attention' }).toBuffer()

  const markBuf = logo ? await sharp(logo).resize({ width: 420, height: 290, fit: 'inside' }).png().toBuffer() : null
  const markMeta = markBuf ? await sharp(markBuf).metadata() : null
  const markW = markMeta?.width ?? 0
  const markH = markMeta?.height ?? 0
  const cx = Math.round(FRAME_X / 2) // centre of the left "room"
  const markTop = Math.round(OG_H / 2 - markH / 2 - 14)

  // 1) darkening gradients over the blurred room
  const shade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#0c0c0b" stop-opacity="0.96"/>
      <stop offset="0.5" stop-color="#0c0c0b" stop-opacity="0.78"/>
      <stop offset="1" stop-color="#0c0c0b" stop-opacity="0.15"/>
    </linearGradient>
    <linearGradient id="v" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.25"/>
      <stop offset="0.25" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.75" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#g)"/>
  <rect width="${OG_W}" height="${OG_H}" fill="url(#v)"/>
</svg>`)

  // 2) hairline gallery frame + corner brackets + the small signal-red rule under the mark (drawn last, on top)
  const lineY = markTop + markH + 34
  const trim = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${OG_W}" height="${OG_H}">
  <rect x="${FRAME_X - 14}" y="14" width="${FRAME_W + 28}" height="${OG_H - 28}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1"/>
  <g stroke="#ffffff" stroke-opacity="0.85" stroke-width="2" fill="none">
    <path d="M${FRAME_X - 14} 46 V14 H${FRAME_X + 18}"/>
    <path d="M${FRAME_X + FRAME_W + 14} ${OG_H - 46} V${OG_H - 14} H${FRAME_X + FRAME_W - 18}"/>
  </g>
  ${logo ? `<rect x="${cx - 30}" y="${lineY}" width="60" height="2" fill="#c85c50"/>` : ''}
</svg>`)

  const layers = [
    { input: shade, top: 0, left: 0 },
    { input: framed, top: 0, left: FRAME_X },
  ]
  if (markBuf) layers.push({ input: markBuf, left: Math.round(cx - markW / 2), top: markTop })
  layers.push({ input: trim, top: 0, left: 0 })
  const base = sharp(room).composite(layers)

  for (const quality of [84, 76, 68, 60, 50]) {
    const out = await base.clone().jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer()
    if (out.length <= MAX_JPEG_BYTES || quality === 50) return out
  }
}

// ---------------------------------------------------------------------------------------------- handler

const htmlHeaders = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=900, stale-while-revalidate=86400' }

/**
 * @param {Request} request
 * @param {{ env?: Record<string,string|undefined>, mode?: 'page'|'image', slug?: string,
 *           loadProduct?: (slug: string, config: ReturnType<typeof readConfig>) => Promise<object|null> }} opts
 */
export async function handleShare(request, opts = {}) {
  const config = readConfig(opts.env)
  const url = new URL(request.url)
  const origin = originOf(request, config)
  const m = url.pathname.match(/^\/p\/([^/]+?)(\/og\.jpg)?\/?$/)
  const slug = decodeURIComponent(opts.slug || url.searchParams.get('slug') || m?.[1] || '').trim()
  const mode = opts.mode || (m?.[2] ? 'image' : 'page')

  let product = null
  if (slug) {
    try {
      product = (await (opts.loadProduct ?? loadProductFromSupabase)(slug, config)) ?? null
    } catch (err) {
      console.error('share: product lookup failed', err)
    }
  }

  if (mode === 'image') {
    const src = product && pickImage(product)
    const abs = (u) => (u ? new URL(u, origin).href : null)
    try {
      if (!src) throw new Error('no product image')
      const jpg = await renderOgJpeg({ imageUrl: abs(src), logoUrl: `${origin}/brand/logo-mark.webp` })
      return new Response(jpg, {
        headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
      })
    } catch (err) {
      console.error('share: og image failed, using brand cover', err)
      return Response.redirect(`${origin}/og-cover.jpg`, 302)
    }
  }

  const html = renderSharePage({ product, origin })
  return new Response(html, { status: product ? 200 : 404, headers: htmlHeaders })
}

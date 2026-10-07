import { loadEnv } from 'vite'
import { fromAppProduct, handleShare, loadProductFromSupabase } from './core.js'

/**
 * Dev-server twin of the production share functions, so `npm run dev` serves
 *   /p/<slug>          -> product Open Graph page (then redirects to /product/<slug>)
 *   /p/<slug>/og.jpg   -> the 1200x630 preview image
 * Falls back to the bundled local catalogue when Supabase isn't configured.
 */
export default function sharePreview() {
  let env = {}
  return {
    name: 'lagamless-share-preview',
    configResolved(config) {
      env = { ...loadEnv(config.mode, config.root, ''), ...process.env }
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!/^\/p\/[^/?#]+(\/og\.jpg)?(\?|#|$)/.test(req.url || '')) return next()
        try {
          const headers = new Headers(Object.entries(req.headers).filter(([, v]) => typeof v === 'string'))
          const request = new Request(`http://${req.headers.host}${req.url}`, { headers })
          const loadProduct = async (slug, config) => {
            const remote = await loadProductFromSupabase(slug, config).catch(() => null)
            if (remote) return remote
            const mod = await server.ssrLoadModule('/src/data/products.js')
            const local = mod.getPublishedProducts().find((p) => p.slug === slug)
            return local ? fromAppProduct(local) : null
          }
          const response = await handleShare(request, { env, loadProduct })
          res.statusCode = response.status
          response.headers.forEach((value, key) => res.setHeader(key, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (err) {
          next(err)
        }
      })
    },
  }
}

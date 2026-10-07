// Vercel function: /p/<slug>  (see vercel.json for the rewrite)  ->  product-specific Open Graph page
import { handleShare } from '../share/core.js'

export function GET(request) {
  return handleShare(request, { env: process.env, mode: 'page' })
}
